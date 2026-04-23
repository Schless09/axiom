import { type NextRequest, NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOrgIdForUser } from "@/lib/supabase/org";
import { resolveFfmpegPath } from "@/lib/video/resolve-ffmpeg";

const execFileAsync = promisify(execFile);

/**
 * Remuxes the input buffer to an H.264 + AAC MP4 with the moov atom at the
 * front (faststart). This ensures playback in all browsers regardless of the
 * original codec (H.265, VP9, etc.) or moov atom position.
 */
async function toH264Mp4(inputBuffer: Buffer): Promise<Buffer> {
  const workDir = join(tmpdir(), `vla-video-${randomUUID()}`);
  const inputPath = join(workDir, "input.mp4");
  const outputPath = join(workDir, "output.mp4");
  try {
    await mkdir(workDir, { recursive: true });
    await writeFile(inputPath, inputBuffer);
    await execFileAsync(resolveFfmpegPath(), [
      "-i", inputPath,
      "-c:v", "libx264",
      "-c:a", "aac",
      "-movflags", "+faststart",
      "-preset", "ultrafast",
      "-crf", "23",
      "-y",
      outputPath,
    ]);
    return await readFile(outputPath);
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orgId = await getOrgIdForUser(supabase, user.id);
  if (!orgId) {
    return NextResponse.json({ error: "No organization context." }, { status: 403 });
  }

  // Verify claim belongs to the user's org before serving any bytes
  const { data: claim } = await supabase
    .from("claims")
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!claim) {
    return NextResponse.json({ error: "Claim not found." }, { status: 404 });
  }

  const { data: evidence } = await supabase
    .from("evidence")
    .select("file_path, file_type")
    .eq("claim_id", id)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!evidence?.file_path) {
    return NextResponse.json({ error: "No evidence file found." }, { status: 404 });
  }

  // Images — just redirect to a short-lived signed URL; no transcoding needed
  if (evidence.file_type !== "video") {
    const { data: signed } = await supabase.storage
      .from("evidence")
      .createSignedUrl(evidence.file_path, 300);
    if (!signed?.signedUrl) {
      return NextResponse.json({ error: "Could not generate storage URL." }, { status: 502 });
    }
    return NextResponse.redirect(signed.signedUrl);
  }

  // Sidecar path: swap extension for `.h264.mp4`
  const cachedPath = evidence.file_path.replace(/\.[^.]+$/, "") + ".h264.mp4";

  // 1 — Try to serve the pre-transcoded sidecar (cache hit, no FFmpeg needed)
  const { data: cachedBlob } = await supabase.storage
    .from("evidence")
    .download(cachedPath);

  let videoBuffer: Buffer;

  if (cachedBlob) {
    videoBuffer = Buffer.from(await cachedBlob.arrayBuffer());
    console.log("[video-proxy] cache hit", { bytes: videoBuffer.byteLength, path: cachedPath });
  } else {
    // 2 — Cache miss: download original, transcode, store sidecar for next time
    const { data: rawBlob, error: downloadError } = await supabase.storage
      .from("evidence")
      .download(evidence.file_path);

    if (downloadError || !rawBlob) {
      console.error("[video-proxy] download error", downloadError?.message);
      return NextResponse.json({ error: "Failed to download video from storage." }, { status: 502 });
    }

    const rawBuffer = Buffer.from(await rawBlob.arrayBuffer());
    console.log("[video-proxy] cache miss — transcoding", { bytes: rawBuffer.byteLength });

    try {
      videoBuffer = await toH264Mp4(rawBuffer);
      console.log("[video-proxy] transcoded to H.264", { bytes: videoBuffer.byteLength });
    } catch (err) {
      console.error("[video-proxy] FFmpeg transcoding failed", err);
      return NextResponse.json({ error: "Failed to process video." }, { status: 500 });
    }

    // Store sidecar asynchronously — don't block the response
    supabase.storage
      .from("evidence")
      .upload(cachedPath, videoBuffer, { contentType: "video/mp4", upsert: true })
      .then(({ error }) => {
        if (error) console.error("[video-proxy] sidecar upload failed", error.message);
        else console.log("[video-proxy] sidecar stored", cachedPath);
      });
  }

  // Handle HTTP range requests so the browser can seek
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : videoBuffer.byteLength - 1;
      const chunk = videoBuffer.slice(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": `bytes ${start}-${end}/${videoBuffer.byteLength}`,
          "Content-Length": chunk.byteLength.toString(),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }

  return new Response(videoBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": videoBuffer.byteLength.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
