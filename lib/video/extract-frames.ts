import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolveFfmpegPath } from "@/lib/video/resolve-ffmpeg";

const execFileAsync = promisify(execFile);

/**
 * Extract JPEG frames from a video buffer using a two-phase strategy:
 *
 * Phase 1 — Dense (first `denseSeconds`): 1 frame per second.
 *   Captures rapid-onset events (lane changes, swerves, impacts) that happen
 *   within the first ~15 seconds of dashcam footage. A 3-second interval would
 *   miss events that occur between sample points.
 *
 * Phase 2 — Sparse (remainder): 1 frame every `sparseIntervalSeconds`.
 *   Covers longer clips without blowing up token counts.
 *
 * Total frames are capped at `maxFrames`. Uses the ffmpeg-static binary — no
 * system ffmpeg required.
 */
export async function extractVideoFrames(
  videoBuffer: Buffer,
  mimeType: string,
  maxFrames = 20,
  denseSeconds = 15, // how many seconds to sample at 1fps
  sparseIntervalSeconds = 3, // interval after the dense window
): Promise<Buffer[]> {
  const ext =
    mimeType === "video/webm"
      ? "webm"
      : mimeType === "video/quicktime"
        ? "mov"
        : "mp4";

  const workDir = join(tmpdir(), `vla-frames-${randomUUID()}`);
  const inputPath = join(workDir, `input.${ext}`);
  const outputPattern = join(workDir, "frame-%03d.jpg");

  try {
    await mkdir(workDir, { recursive: true });
    await writeFile(inputPath, videoBuffer);

    // Two-phase select filter:
    //   t < denseSeconds  → keep every frame at 1fps (floor(t) changes each second)
    //   t >= denseSeconds → keep 1 frame every sparseIntervalSeconds
    const selectExpr =
      `if(lt(t,${denseSeconds}),` +
        `gte(t-floor(t),0)*eq(floor(t),floor(t)),` +  // 1fps dense window
        `not(mod(round(t-${denseSeconds}),${sparseIntervalSeconds}))` +       // sparse after
      `)`;

    await execFileAsync(resolveFfmpegPath(), [
      "-i", inputPath,
      "-vf", `select='${selectExpr}',setpts=N/TB`,
      "-vsync", "vfr",
      "-vframes", String(maxFrames),
      "-q:v", "3",
      "-f", "image2",
      outputPattern,
    ]);

    const frames: Buffer[] = [];
    for (let i = 1; i <= maxFrames; i++) {
      const framePath = join(workDir, `frame-${String(i).padStart(3, "0")}.jpg`);
      try {
        frames.push(await readFile(framePath));
      } catch {
        break; // no more frames at this index
      }
    }

    return frames;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
