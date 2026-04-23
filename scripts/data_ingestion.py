#!/usr/bin/env python3
"""
Axiom VLA — offline data ingestion: sample video frames (~1 fps by default) and optionally upload to Supabase Storage.

Privacy: run face/plate redaction before uploading to any training bucket; this script does not blur by itself.

Usage:
  python scripts/data_ingestion.py --input /path/to/clip.mp4 --output-dir ./out
  python scripts/data_ingestion.py --input ./clips/ --output-dir ./out --upload --source-id kaggle-rwvc-001

Requires:
  pip install -r scripts/requirements-ingestion.txt

Env (for --upload):
  SUPABASE_URL              (same as NEXT_PUBLIC_SUPABASE_URL)
  SUPABASE_SERVICE_ROLE_KEY service role — never commit; ingestion only
  SUPABASE_TRAINING_BUCKET  optional, default: training-frames
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Union

FrameRecord = dict[str, Union[str, int, float]]

try:
    import cv2  # type: ignore[import-untyped]
except ImportError:
    print("Install deps: pip install -r scripts/requirements-ingestion.txt", file=sys.stderr)
    raise


@dataclass
class ClipManifest:
    source_id: str
    input_path: str
    input_sha256: str
    sampled_fps: float
    frame_count: int
    output_dir: str
    created_at_utc: str
    frames: list[FrameRecord]


def sha256_file(path: Path, chunk: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def iter_video_files(root: Path) -> Iterator[Path]:
    if root.is_file():
        yield root
        return
    exts = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}
    for p in sorted(root.rglob("*")):
        if p.is_file() and p.suffix.lower() in exts:
            yield p


def sample_frames(
    video_path: Path,
    out_dir: Path,
    target_fps: float,
    jpeg_quality: int,
) -> tuple[list[FrameRecord], int]:
    """
    Extract up to ~target_fps frames per second. Writes JPEGs as frame_000001.jpg, ...
    Returns (frame records, opencv frame count read).
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    native_fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
    if native_fps <= 0:
        native_fps = 30.0

    # Grab one frame every `interval` frames to approximate target_fps.
    interval = max(1, int(round(native_fps / target_fps)))
    frame_index = 0
    saved = 0
    records: list[FrameRecord] = []

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_index % interval == 0:
            saved += 1
            name = f"frame_{saved:06d}.jpg"
            dest = out_dir / name
            cv2.imwrite(
                str(dest),
                frame,
                [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality],
            )
            t_sec = frame_index / native_fps
            records.append(
                {
                    "file": name,
                    "frame_index": frame_index,
                    "timestamp_seconds": round(t_sec, 3),
                }
            )
        frame_index += 1

    cap.release()
    return records, frame_index


def upload_directory(
    local_dir: Path,
    storage_prefix: str,
    bucket: str,
) -> None:
    from supabase import create_client  # type: ignore[import-untyped]

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit(
            "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY for --upload"
        )

    client = create_client(url, key)
    for f in sorted(local_dir.glob("frame_*.jpg")):
        remote = f"{storage_prefix}/{f.name}"
        data = f.read_bytes()
        client.storage.from_(bucket).upload(
            remote,
            data,
            file_options={"content-type": "image/jpeg", "upsert": "true"},
        )
    manifest = local_dir / "manifest.json"
    if manifest.is_file():
        mremote = f"{storage_prefix}/manifest.json"
        client.storage.from_(bucket).upload(
            mremote,
            manifest.read_bytes(),
            file_options={"content-type": "application/json", "upsert": "true"},
        )


def process_one(
    video_path: Path,
    base_out: Path,
    source_id: str,
    target_fps: float,
    jpeg_quality: int,
    do_upload: bool,
    bucket: str,
) -> Path:
    stem = video_path.stem
    digest = hashlib.sha256(str(video_path.resolve()).encode()).hexdigest()[:12]
    clip_dir = base_out / source_id / f"{stem}_{digest}"
    clip_dir.mkdir(parents=True, exist_ok=True)

    input_hash = sha256_file(video_path)
    records, total_read = sample_frames(video_path, clip_dir, target_fps, jpeg_quality)

    manifest = ClipManifest(
        source_id=source_id,
        input_path=str(video_path.resolve()),
        input_sha256=input_hash,
        sampled_fps=target_fps,
        frame_count=len(records),
        output_dir=str(clip_dir.resolve()),
        created_at_utc=datetime.now(timezone.utc).isoformat(),
        frames=records,
    )
    man_path = clip_dir / "manifest.json"
    man_path.write_text(json.dumps(asdict(manifest), indent=2), encoding="utf-8")

    if do_upload:
        prefix = f"{source_id}/{stem}_{digest}"
        upload_directory(clip_dir, prefix, bucket)

    return clip_dir


def main() -> None:
    p = argparse.ArgumentParser(description="Sample frames from crash/dashcam videos for labeling or RAG.")
    p.add_argument("--input", required=True, help="Video file or directory of videos")
    p.add_argument("--output-dir", required=True, help="Base output directory for frames + manifests")
    p.add_argument("--fps", type=float, default=1.0, help="Target samples per second (default: 1)")
    p.add_argument("--jpeg-quality", type=int, default=85, help="JPEG quality 0-100 (default: 85)")
    p.add_argument("--source-id", default="local-import", help="Dataset / batch id for paths and manifest")
    p.add_argument(
        "--upload",
        action="store_true",
        help="Upload each clip folder to Supabase Storage (requires service role env)",
    )
    args = p.parse_args()

    inp = Path(args.input).expanduser().resolve()
    out_base = Path(args.output_dir).expanduser().resolve()
    out_base.mkdir(parents=True, exist_ok=True)

    bucket = os.environ.get("SUPABASE_TRAINING_BUCKET", "training-frames")

    videos = list(iter_video_files(inp))
    if not videos:
        print("No video files found.", file=sys.stderr)
        sys.exit(1)

    for v in videos:
        print(f"Processing {v} …")
        clip_dir = process_one(
            v,
            out_base,
            args.source_id,
            args.fps,
            args.jpeg_quality,
            args.upload,
            bucket,
        )
        print(f"  → {clip_dir}")

    print("Done.")


if __name__ == "__main__":
    main()
