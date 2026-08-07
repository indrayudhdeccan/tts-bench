#!/usr/bin/env python3
"""Generate Hindi TTS clips via OpenRouter — input text only (no metadata in prompt)."""

from __future__ import annotations

import argparse
import json
import os
import time
import wave
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "samples_manifest.json"
OUT_DIR = ROOT / "outputs" / "hindi_tts"
MANIFEST_OUT = OUT_DIR / "run_manifest.json"
SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech"

# Only model + response_format (API requirement). Voice omitted — text-only input field.
MODELS = {
    "gemini-3.1-flash": {
        "model": "google/gemini-3.1-flash-tts-preview",
        "response_format": "pcm",
        "ext": "wav",
    },
    "fish-s2.1-pro-free": {
        "model": "fish-audio/s2.1-pro-free:free",
        "response_format": "mp3",
        "ext": "mp3",
    },
    "mai-voice-2": {
        "model": "microsoft/mai-voice-2",
        "response_format": "mp3",
        "ext": "mp3",
    },
    "grok-voice-tts": {
        "model": "x-ai/grok-voice-tts-1.0",
        "response_format": "mp3",
        "ext": "mp3",
    },
}


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def load_hindi_samples() -> list[dict]:
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    hi = [r for r in rows if r.get("language") == "hi"]
    hi.sort(key=lambda r: (r["script_id"], r["speaker"]))
    return hi


def pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    import io

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def synthesize(api_key: str, model_cfg: dict, text: str) -> bytes:
    """Send only the script text in `input`. No speaker/domain/metadata."""
    body = {
        "model": model_cfg["model"],
        "input": text,
        "response_format": model_cfg["response_format"],
    }
    req = Request(
        SPEECH_URL,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urlopen(req, timeout=180) as resp:
        data = resp.read()
    if model_cfg["response_format"] == "pcm":
        return pcm_to_wav(data)
    return data


def out_path(model_key: str, sample: dict, ext: str) -> Path:
    sid = int(sample["script_id"])
    speaker = sample["speaker"].replace(" ", "_")
    return OUT_DIR / model_key / f"hi_{sid:02d}_{speaker}.{ext}"


def run(args: argparse.Namespace) -> None:
    load_env()
    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise SystemExit("Set OPENROUTER_API_KEY in .env")

    samples = load_hindi_samples()
    if args.limit:
        samples = samples[: args.limit]

    selected = args.models or list(MODELS.keys())
    for key in selected:
        if key not in MODELS:
            raise SystemExit(f"Unknown model key: {key}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    run_log: dict = {"models": selected, "results": []}

    if MANIFEST_OUT.exists() and args.resume:
        run_log = json.loads(MANIFEST_OUT.read_text(encoding="utf-8"))

    total = len(samples) * len(selected)
    done = 0

    for model_key in selected:
        cfg = MODELS[model_key]
        (OUT_DIR / model_key).mkdir(parents=True, exist_ok=True)

        for sample in samples:
            dest = out_path(model_key, sample, cfg["ext"])
            text = sample["text"]  # Hindi script only — nothing else sent to TTS

            if args.resume and dest.exists() and dest.stat().st_size > 0:
                run_log["results"].append(
                    {
                        "model": model_key,
                        "script_id": sample["script_id"],
                        "speaker": sample["speaker"],
                        "path": str(dest.relative_to(ROOT)),
                        "status": "skipped_exists",
                    }
                )
                done += 1
                print(f"[{done}/{total}] skip {dest.name} ({model_key})")
                continue

            entry = {
                "model": model_key,
                "script_id": sample["script_id"],
                "speaker": sample["speaker"],
                "text_len": len(text),
                "path": str(dest.relative_to(ROOT)),
            }

            for attempt in range(1, args.retries + 1):
                try:
                    print(f"[{done + 1}/{total}] {model_key} hi_{sample['script_id']:02d} …")
                    audio = synthesize(api_key, cfg, text)
                    dest.write_bytes(audio)
                    entry["status"] = "ok"
                    entry["bytes"] = len(audio)
                    done += 1
                    break
                except HTTPError as exc:
                    err = exc.read().decode("utf-8", errors="replace")
                    entry["status"] = "error"
                    entry["error"] = err[:500]
                    print(f"  attempt {attempt} failed: {err[:200]}")
                    if attempt < args.retries:
                        time.sleep(args.delay * attempt)
                except Exception as exc:  # noqa: BLE001
                    entry["status"] = "error"
                    entry["error"] = str(exc)
                    print(f"  attempt {attempt} failed: {exc}")
                    if attempt < args.retries:
                        time.sleep(args.delay * attempt)
            else:
                done += 1

            run_log["results"].append(entry)
            MANIFEST_OUT.write_text(json.dumps(run_log, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            time.sleep(args.delay)

    ok = sum(1 for r in run_log["results"] if r.get("status") == "ok")
    fail = sum(1 for r in run_log["results"] if r.get("status") == "error")
    print(f"\nDone: {ok} ok, {fail} failed, manifest -> {MANIFEST_OUT}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=0, help="Only first N Hindi samples")
    parser.add_argument("--models", nargs="*", choices=list(MODELS.keys()))
    parser.add_argument("--resume", action="store_true", help="Skip existing output files")
    parser.add_argument("--delay", type=float, default=0.5, help="Seconds between requests")
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args()
    if args.limit == 0:
        args.limit = None
    run(args)


if __name__ == "__main__":
    main()
