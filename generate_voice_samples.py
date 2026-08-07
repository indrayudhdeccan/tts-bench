#!/usr/bin/env python3
"""Generate one Hindi sentence across multiple voices per TTS model."""

from __future__ import annotations

import html
import io
import json
import os
import wave
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "outputs" / "voice_samples"
SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech"

# Hindi script #1 — text-only in API `input`
SAMPLE_TEXT = (
    "बॉलीवुड के बादशाह शाहरुख़ ख़ान, जिन्हें प्रशंसक संक्षेप में एस.आर.के. पुकारते हैं, "
    "की भावप्रवण अदाकारी दर्शकों को भावुक कर देती है।"
)

# Voices chosen for Hindi: warm/clear presets per provider docs + prior probes
VOICE_MATRIX = [
    {
        "provider": "Google Gemini 3.1 Flash TTS",
        "slug": "gemini",
        "model": "google/gemini-3.1-flash-tts-preview",
        "response_format": "pcm",
        "ext": "wav",
        "voices": [
            ("Kore", "Kore — balanced, clear"),
            ("Aoede", "Aoede — warm, expressive"),
            ("Puck", "Puck — upbeat"),
            ("Charon", "Charon — deeper tone"),
        ],
    },
    {
        "provider": "Fish Audio S2.1 Pro Free",
        "slug": "fish",
        "model": "fish-audio/s2.1-pro-free:free",
        "response_format": "mp3",
        "ext": "mp3",
        "voices": [
            (None, "Default (auto multilingual)"),
            (
                "5b7d0c126b37409197f570a61a18b927",
                "Anurag (Hindi) — male narration, calm/deep",
            ),
            (
                "b1a1d760d9604bdb957a56eec3460f1b",
                "Indian Lady — female, clear Indian accent",
            ),
        ],
    },
    {
        "provider": "Microsoft MAI-Voice-2",
        "slug": "mai",
        "model": "microsoft/mai-voice-2",
        "response_format": "mp3",
        "ext": "mp3",
        "voices": [
            ("hi-IN-SwaraNeural", "Swara — Hindi female"),
            ("hi-IN-AaravNeural", "Aarav — Hindi male"),
            ("hi-IN-AnanyaNeural", "Ananya — Hindi female"),
            ("hi-IN-KunalNeural", "Kunal — Hindi male"),
        ],
    },
    {
        "provider": "Grok Voice TTS 1.0",
        "slug": "grok",
        "model": "x-ai/grok-voice-tts-1.0",
        "response_format": "mp3",
        "ext": "mp3",
        "voices": [
            ("eve", "Eve — female"),
            ("ara", "Ara — female"),
            ("rex", "Rex — male"),
            ("leo", "Leo — male"),
        ],
    },
]


def load_env() -> str:
    for line in (ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise SystemExit("OPENROUTER_API_KEY missing in .env")
    return key


def pcm_to_wav(pcm: bytes) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(24000)
        wf.writeframes(pcm)
    return buf.getvalue()


def synthesize(api_key: str, model: str, text: str, response_format: str, voice: str | None) -> bytes:
    body: dict = {"model": model, "input": text, "response_format": response_format}
    if voice:
        body["voice"] = voice
    req = Request(
        SPEECH_URL,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=180) as resp:
        data = resp.read()
    if response_format == "pcm":
        return pcm_to_wav(data)
    return data


def safe_name(voice: str | None) -> str:
    if not voice:
        return "default"
    return voice.replace(":", "_").replace(".", "_")


def render_html(results: list[dict]) -> str:
    cards = []
    for r in results:
        if r["status"] != "ok":
            cards.append(
                f'<article class="card fail"><h3>{html.escape(r["label"])}</h3>'
                f'<p class="err">{html.escape(r.get("error", "failed"))}</p></article>'
            )
            continue
        cards.append(
            f"""<article class="card">
  <div class="meta"><span class="tag">{html.escape(r["provider"])}</span></div>
  <h3>{html.escape(r["label"])}</h3>
  <audio controls src="{html.escape(r["file"])}"></audio>
  <div class="file">{html.escape(r["file"])} · {r["bytes"] // 1024} KB</div>
</article>"""
        )
    return f"""<!DOCTYPE html>
<html lang="hi"><head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Hindi TTS Voice Samples</title>
<style>
  body {{ font-family: system-ui, sans-serif; background:#0f1117; color:#e8ecf4; margin:0; padding:24px; }}
  .wrap {{ max-width:900px; margin:0 auto; }}
  h1 {{ margin:0 0 8px; }}
  .text {{ background:#171a22; border:1px solid #2a3142; border-radius:12px; padding:16px; line-height:1.6; margin:16px 0 24px; font-size:1.05rem; }}
  .cards {{ display:grid; gap:14px; }}
  .card {{ background:#171a22; border:1px solid #2a3142; border-radius:12px; padding:16px; }}
  .card.fail {{ border-color:#844; }}
  .tag {{ font-size:.75rem; color:#93a0b8; background:#1e2330; padding:4px 8px; border-radius:999px; }}
  h3 {{ margin:10px 0 8px; font-size:1rem; }}
  audio {{ width:100%; margin-top:6px; }}
  .file {{ font-size:.78rem; color:#93a0b8; margin-top:8px; }}
  .err {{ color:#ff8e8e; font-size:.9rem; }}
</style></head>
<body><div class="wrap">
<h1>Hindi TTS voice samples</h1>
<p>Same sentence, multiple voices per model. <strong>Input = Hindi text only.</strong></p>
<div class="text">{html.escape(SAMPLE_TEXT)}</div>
<section class="cards">{"".join(cards)}</section>
</div></body></html>"""


def main() -> None:
    api_key = load_env()
    OUT.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []

    for cfg in VOICE_MATRIX:
        for voice_id, label in cfg["voices"]:
            fname = f"{cfg['slug']}_{safe_name(voice_id)}.{cfg['ext']}"
            rel = f"outputs/voice_samples/{fname}"
            dest = OUT / fname
            entry = {
                "provider": cfg["provider"],
                "model": cfg["model"],
                "voice": voice_id,
                "label": f"{cfg['provider']} — {label}",
                "file": rel,
            }
            print(f"Generating {fname} …")
            try:
                audio = synthesize(api_key, cfg["model"], SAMPLE_TEXT, cfg["response_format"], voice_id)
                dest.write_bytes(audio)
                entry["status"] = "ok"
                entry["bytes"] = len(audio)
                print(f"  ok ({len(audio)} bytes)")
            except HTTPError as exc:
                err = exc.read().decode("utf-8", errors="replace")
                entry["status"] = "error"
                entry["error"] = err[:300]
                print(f"  FAIL: {err[:120]}")
            except Exception as exc:  # noqa: BLE001
                entry["status"] = "error"
                entry["error"] = str(exc)
                print(f"  FAIL: {exc}")
            results.append(entry)

    (ROOT / "voice_samples.html").write_text(render_html(results), encoding="utf-8")
    (OUT / "results.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")

    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"\n{ok}/{len(results)} clips saved under {OUT}/")
    print(f"Open {ROOT / 'voice_samples.html'}")


if __name__ == "__main__":
    main()
