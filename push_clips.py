#!/usr/bin/env python3
"""Push local TTS/reference audio to Supabase Storage + DB rows.

Usage:
  export NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
  export SUPABASE_SERVICE_ROLE_KEY=eyJ...
  python push_clips.py --run demo-2026 --model gemini --dir outputs/hindi_tts/gemini-3.1-flash
  python push_clips.py --references --dir audio --pattern 'hi_*.mp3'
"""

from __future__ import annotations

import argparse
import mimetypes
import os
import re
from pathlib import Path

try:
    from supabase import create_client
except ImportError:
    raise SystemExit("pip install supabase")

ROOT = Path(__file__).resolve().parent


def get_client():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def public_url(base: str, bucket: str, path: str) -> str:
    return f"{base.rstrip('/')}/storage/v1/object/public/{bucket}/{path}"


def upload_file(client, bucket: str, path: str, local: Path) -> str:
    mime, _ = mimetypes.guess_type(str(local))
    data = local.read_bytes()
    client.storage.from_(bucket).upload(
        path, data, file_options={"content-type": mime or "application/octet-stream", "upsert": "true"}
    )
    return public_url(os.environ["NEXT_PUBLIC_SUPABASE_URL"], bucket, path)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--run", default="demo-2026", help="Run slug")
    p.add_argument("--model", help="Model slug for model clips")
    p.add_argument("--dir", type=Path, required=True)
    p.add_argument("--pattern", default="*", help="Glob pattern")
    p.add_argument("--references", action="store_true", help="Upload as human references")
    p.add_argument("--voice-key", default=None)
    args = p.parse_args()

    client = get_client()
    base_url = os.environ["NEXT_PUBLIC_SUPABASE_URL"]

    run = client.table("runs").select("id").eq("slug", args.run).single().execute().data
    if not run:
        raise SystemExit(f"Run not found: {args.run}")

    model_id = None
    model_slug = args.model
    if not args.references:
        if not model_slug:
            raise SystemExit("--model required for model clips")
        model = client.table("models").select("id, slug").eq("slug", model_slug).single().execute().data
        model_id = model["id"]
        model_slug = model["slug"]

    hi_lang = client.table("languages").select("id").eq("code", "hi-IN").single().execute().data

    for fp in sorted(args.dir.glob(args.pattern)):
        if not fp.is_file():
            continue
        m = re.search(r"hi_(\d+)", fp.stem)
        script_no = int(m.group(1)) if m else None
        if not script_no:
            print("skip (no script no)", fp)
            continue

        script = (
            client.table("scripts")
            .select("id")
            .eq("language_id", hi_lang["id"])
            .eq("script_no", script_no)
            .single()
            .execute()
            .data
        )
        if not script:
            print("skip (no script row)", fp)
            continue

        ext = fp.suffix.lstrip(".")
        if args.references:
            storage_path = f"hi-IN/hi_{script_no:02d}.{ext}"
            url = upload_file(client, "references", storage_path, fp)
            client.table("reference_recordings").insert(
                {
                    "script_id": script["id"],
                    "tier": "casual",
                    "storage_path": storage_path,
                    "public_url": url,
                    "bytes": fp.stat().st_size,
                    "is_primary": True,
                    "active": True,
                }
            ).execute()
        else:
            storage_path = f"{model_slug}/{run['id']}/hi_{script_no:02d}.{ext}"
            url = upload_file(client, "model-clips", storage_path, fp)
            client.table("model_clips").upsert(
                {
                    "script_id": script["id"],
                    "model_id": model_id,
                    "run_id": run["id"],
                    "voice_key": args.voice_key,
                    "storage_path": storage_path,
                    "public_url": url,
                    "bytes": fp.stat().st_size,
                    "status": "ready",
                },
                on_conflict="script_id,model_id,run_id,voice_key",
            ).execute()
        print("ok", fp.name, "→", storage_path)


if __name__ == "__main__":
    main()
