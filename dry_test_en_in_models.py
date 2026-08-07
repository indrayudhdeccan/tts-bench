#!/usr/bin/env python3
"""Synthesize one English (IN) clip per locked model-voice pair into 12_En-In_dry_run/."""

from __future__ import annotations

import base64
import io
import json
import os
import wave
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "12_En-In_dry_run"
OPENROUTER_SPEECH = "https://openrouter.ai/api/v1/audio/speech"
ELEVENLABS_SPEECH = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_SPEECH = "https://api.cartesia.ai/tts/bytes"
SARVAM_SPEECH = "https://api.sarvam.ai/text-to-speech"

SAMPLE_TEXT = (
    "Bollywood actress Deepika Padukone's compelling portrayal of complex, "
    "emotionally layered characters has earned her international critical acclaim."
)

# Locked English (IN) matrix — 11 model-voice pairs
# Gemini: same 30 global personas; Indian English via language_code en-IN (no separate Indian voice IDs).
MODELS: list[dict] = [
    {
        "slug": "01_google_gemini_kore",
        "provider": "Google",
        "backend": "openrouter",
        "model": "google/gemini-3.1-flash-tts-preview",
        "voice": "Kore",
        "voice_label": "Kore — firm (en-IN locale, not a separate Indian voice ID)",
        "response_format": "pcm",
        "ext": "wav",
        "provider_options": {"google": {"language_code": "en-IN"}},
    },
    {
        "slug": "02_google_gemini_charon",
        "provider": "Google",
        "backend": "openrouter",
        "model": "google/gemini-3.1-flash-tts-preview",
        "voice": "Charon",
        "voice_label": "Charon — informative/deeper (en-IN locale)",
        "response_format": "pcm",
        "ext": "wav",
        "provider_options": {"google": {"language_code": "en-IN"}},
    },
    {
        "slug": "03_sarvam_ishita",
        "provider": "Sarvam",
        "backend": "sarvam",
        "model": "bulbul:v3",
        "voice": "ishita",
        "voice_label": "Ishita — en-IN female",
        "target_language_code": "en-IN",
        "ext": "mp3",
    },
    {
        "slug": "04_sarvam_ratan",
        "provider": "Sarvam",
        "backend": "sarvam",
        "model": "bulbul:v3",
        "voice": "ratan",
        "voice_label": "Ratan — en-IN male",
        "target_language_code": "en-IN",
        "ext": "mp3",
    },
    {
        "slug": "05_mai_swara",
        "provider": "Microsoft",
        "backend": "openrouter",
        "model": "microsoft/mai-voice-2",
        "voice": "hi-IN-SwaraNeural",
        "voice_label": "Swara — Hindi female (Hinglish)",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "06_mai_aarav",
        "provider": "Microsoft",
        "backend": "openrouter",
        "model": "microsoft/mai-voice-2",
        "voice": "hi-IN-AaravNeural",
        "voice_label": "Aarav — Hindi male (Hinglish)",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "07_fish_indian_lady",
        "provider": "Fish Audio",
        "backend": "openrouter",
        "model": "fish-audio/s2.1-pro-free:free",
        "voice": "b1a1d760d9604bdb957a56eec3460f1b",
        "voice_label": "Indian Lady — female, Indian accent",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "08_fish_anurag",
        "provider": "Fish Audio",
        "backend": "openrouter",
        "model": "fish-audio/s2.1-pro-free:free",
        "voice": "5b7d0c126b37409197f570a61a18b927",
        "voice_label": "Anurag — male narration, calm/deep",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "09_elevenlabs_raju",
        "provider": "ElevenLabs",
        "backend": "elevenlabs",
        "model": "eleven_v3",
        "voice": "pzxut4zZz4GImZNlqQ3H",
        "voice_label": "Raju — Natural Conversationalist male (Indian accent)",
        "ext": "mp3",
    },
    {
        "slug": "10_cartesia_arushi",
        "provider": "Cartesia",
        "backend": "cartesia",
        "model": "sonic-3.5",
        "voice": "95d51f79-c397-46f9-b49a-23763d3eaa2d",
        "voice_label": "Arushi — Hinglish female",
        "language": "hi",
        "ext": "mp3",
    },
    {
        "slug": "11_cartesia_rohan",
        "provider": "Cartesia",
        "backend": "cartesia",
        "model": "sonic-3.5",
        "voice": "4877b818-c7fe-4c89-b1cf-eadf8e23da72",
        "voice_label": "Rohan — hi-IN male",
        "language": "hi",
        "ext": "mp3",
    },
]


def load_env() -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip()


def pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def openrouter_synthesize(cfg: dict, api_key: str, text: str) -> bytes:
    body: dict = {
        "model": cfg["model"],
        "input": text,
        "response_format": cfg["response_format"],
    }
    if cfg.get("voice"):
        body["voice"] = cfg["voice"]
    opts = cfg.get("provider_options")
    if opts:
        body["provider"] = {"options": opts}
    req = Request(
        OPENROUTER_SPEECH,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urlopen(req, timeout=300) as resp:
        data = resp.read()
    if cfg["response_format"] == "pcm":
        return pcm_to_wav(data)
    return data


def elevenlabs_synthesize(cfg: dict, api_key: str, text: str) -> bytes:
    voice_id = cfg["voice"]
    url = f"{ELEVENLABS_SPEECH}/{voice_id}"
    body = {"text": text, "model_id": cfg["model"]}
    req = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
    )
    with urlopen(req, timeout=300) as resp:
        return resp.read()


def cartesia_synthesize(cfg: dict, api_key: str, text: str) -> bytes:
    body = {
        "model_id": cfg["model"],
        "transcript": text,
        "voice": {"mode": "id", "id": cfg["voice"]},
        "language": cfg.get("language", "en"),
        "output_format": {
            "container": "mp3",
            "encoding": "mp3",
            "sample_rate": 44100,
        },
    }
    req = Request(
        CARTESIA_SPEECH,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "X-API-Key": api_key,
            "Cartesia-Version": "2025-04-16",
            "Content-Type": "application/json",
        },
    )
    with urlopen(req, timeout=300) as resp:
        return resp.read()


def sarvam_synthesize(cfg: dict, api_key: str, text: str) -> bytes:
    body = {
        "text": text,
        "target_language_code": cfg["target_language_code"],
        "model": cfg["model"],
        "speaker": cfg["voice"],
        "output_audio_codec": "mp3",
    }
    req = Request(
        SARVAM_SPEECH,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "api-subscription-key": api_key,
            "Content-Type": "application/json",
        },
    )
    with urlopen(req, timeout=300) as resp:
        payload = json.loads(resp.read())
    audios = payload.get("audios") or []
    if not audios:
        raise RuntimeError(f"Sarvam returned no audio: {payload}")
    return base64.b64decode(audios[0])


def synthesize(cfg: dict, text: str) -> bytes:
    backend = cfg["backend"]
    if backend == "openrouter":
        key = os.environ.get("OPENROUTER_API_KEY")
        if not key:
            raise RuntimeError("OPENROUTER_API_KEY missing")
        return openrouter_synthesize(cfg, key, text)
    if backend == "elevenlabs":
        key = os.environ.get("ELEVEN_LABS_API_KEY") or os.environ.get("ELEVENLABS_API_KEY")
        if not key:
            raise RuntimeError("ELEVEN_LABS_API_KEY missing")
        return elevenlabs_synthesize(cfg, key, text)
    if backend == "cartesia":
        key = os.environ.get("CARTESIA_AI_API_KEY") or os.environ.get("CARTESIA_API_KEY")
        if not key:
            raise RuntimeError("CARTESIA_AI_API_KEY missing")
        return cartesia_synthesize(cfg, key, text)
    if backend == "sarvam":
        key = os.environ.get("SARVAM_AI_API_KEY") or os.environ.get("SARVAM_API_KEY")
        if not key:
            raise RuntimeError("SARVAM_AI_API_KEY missing")
        return sarvam_synthesize(cfg, key, text)
    raise RuntimeError(f"Unknown backend: {backend}")


def main() -> None:
    load_env()
    OUT.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []

    for cfg in MODELS:
        fname = f"{cfg['slug']}.{cfg['ext']}"
        dest = OUT / fname
        entry = {
            "slug": cfg["slug"],
            "provider": cfg["provider"],
            "model": cfg["model"],
            "voice": cfg.get("voice"),
            "voice_label": cfg.get("voice_label"),
            "file": fname,
            "text": SAMPLE_TEXT,
        }
        print(f"Synthesizing {fname} …")
        try:
            audio = synthesize(cfg, SAMPLE_TEXT)
            dest.write_bytes(audio)
            entry["status"] = "ok"
            entry["bytes"] = len(audio)
            print(f"  ok ({len(audio)} bytes)")
        except HTTPError as exc:
            err = exc.read().decode("utf-8", errors="replace")
            entry["status"] = "error"
            entry["error"] = err[:500]
            print(f"  FAIL HTTP {exc.code}: {err[:120]}")
        except Exception as exc:  # noqa: BLE001
            entry["status"] = "error"
            entry["error"] = str(exc)
            print(f"  FAIL: {exc}")
        results.append(entry)

    manifest = {"sample_text": SAMPLE_TEXT, "language": "en-IN", "results": results}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"\n{ok}/{len(results)} clips saved under {OUT}/")


if __name__ == "__main__":
    main()
