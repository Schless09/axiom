import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

let cached: string | null = null;

/**
 * Resolve the ffmpeg executable for frame extraction and transcoding.
 *
 * Order:
 * 1. `FFMPEG_PATH` — use on AWS Lambda (layer), Docker, or any host where
 *    `ffmpeg-static` is not shipped in the deployment bundle.
 * 2. `ffmpeg-static` — only if the file exists (install-time binary matches OS
 *    and the packager included it).
 * 3. `ffmpeg` on `PATH` — system install (brew, apt, etc.).
 */
export function resolveFfmpegPath(): string {
  if (cached) return cached;

  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && existsSync(fromEnv)) {
    cached = fromEnv;
    return cached;
  }

  let fromPkg: string | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    fromPkg = require("ffmpeg-static") as string;
  } catch {
    fromPkg = undefined;
  }
  if (fromPkg && existsSync(fromPkg)) {
    cached = fromPkg;
    return cached;
  }

  const system = trySystemFfmpeg();
  if (system) {
    cached = system;
    return cached;
  }

  throw new Error(
    "FFmpeg not found. Set FFMPEG_PATH to the ffmpeg binary (e.g. Lambda layer at " +
      "/opt/bin/ffmpeg), or install ffmpeg on PATH. On serverless, ffmpeg-static " +
      "often is omitted from the bundle or built for the wrong platform.",
  );
}

function trySystemFfmpeg(): string | null {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where", ["ffmpeg"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const line = out.trim().split(/\r?\n/)[0]?.trim();
      if (line && existsSync(line)) return line;
      return null;
    }
    const out = execFileSync("which", ["ffmpeg"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const line = out.trim().split(/\r?\n/)[0]?.trim();
    if (line && existsSync(line)) return line;
  } catch {
    /* noop */
  }
  return null;
}
