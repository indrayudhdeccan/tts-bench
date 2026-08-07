#!/usr/bin/env python3
"""Build a single-file arena HTML with demo audio embedded as data URIs."""

from __future__ import annotations

import base64
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ARENA_HTML = ROOT / "arena.html"
ARENA_DATA_JS = ROOT / "arena_data.js"
OUT_HTML = ROOT / "arena_standalone.html"

MIME = {
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "m4a": "audio/mp4",
    "aac": "audio/aac",
    "ogg": "audio/ogg",
}

AUDIO_PATH_RE = re.compile(
    r'"(?P<path>(?:audio|outputs/voice_samples)/[^"]+\.(?:mp3|wav|m4a|aac|ogg))"'
)


def collect_audio_paths(text: str) -> list[str]:
    return sorted(set(m.group("path") for m in AUDIO_PATH_RE.finditer(text)))


def to_data_uri(path: str) -> str:
    file_path = ROOT / path
    if not file_path.is_file():
        raise FileNotFoundError(path)
    ext = file_path.suffix.lower().lstrip(".")
    mime = MIME.get(ext, "application/octet-stream")
    encoded = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build_embed_map(paths: list[str]) -> dict[str, str]:
    embed: dict[str, str] = {}
    for path in paths:
        embed[path] = to_data_uri(path)
        print(f"  embedded {path} ({len(embed[path]) / 1024:.0f} KB data URI)")
    return embed


def inject_audio_embed(data_js: str, embed: dict[str, str]) -> str:
    embed_block = "  audioEmbed: " + json.dumps(embed, ensure_ascii=False, indent=2).replace("\n", "\n  ")
    if re.search(r"\baudioEmbed\s*:", data_js):
        data_js = re.sub(
            r"audioEmbed\s*:\s*\{[\s\S]*?\n  \},\n",
            embed_block + ",\n",
            data_js,
            count=1,
        )
    else:
        data_js = data_js.replace(
            "\n\n  samples:",
            f"\n\n{embed_block},\n\n  samples:",
            1,
        )
    if '"embedded": true' not in data_js:
        data_js = data_js.replace(
            '"version": "prototype-0.1",',
            '"version": "prototype-0.1",\n    "embedded": true,\n    "standalone": true,',
            1,
        )
    return data_js


def build_standalone_html(data_js: str) -> str:
    html = ARENA_HTML.read_text(encoding="utf-8")
    html = html.replace('<script src="arena_data.js"></script>', f"<script>\n{data_js}\n</script>")
    html = html.replace(
        "<strong>Prototype</strong> — Demo clips on script #1. Two separate vote tracks: model ranking vs human parity.\n      Stats update live as you vote (stored in browser).",
        "<strong>Standalone</strong> — All demo audio is embedded in this file. Two vote tracks: model ranking vs human parity.\n      Share this single HTML file — no external audio folders needed.",
    )
    return html


def main() -> None:
    print("Reading arena_data.js…")
    data_js = ARENA_DATA_JS.read_text(encoding="utf-8")
    paths = collect_audio_paths(data_js)
    print(f"Embedding {len(paths)} audio files…")
    embed = build_embed_map(paths)
    data_js = inject_audio_embed(data_js, embed)

    print(f"Writing {OUT_HTML.name}…")
    OUT_HTML.write_text(build_standalone_html(data_js), encoding="utf-8")

    size_mb = OUT_HTML.stat().st_size / (1024 * 1024)
    print(f"Done: {OUT_HTML} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
