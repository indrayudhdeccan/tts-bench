#!/usr/bin/env python3
"""Synthesize one en-US clip per locked TTS model into dry_test_13_model/."""

from __future__ import annotations

import io
import json
import os
import wave
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "dry_test_13_model"
OPENROUTER_SPEECH = "https://openrouter.ai/api/v1/audio/speech"
ELEVENLABS_SPEECH = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_SPEECH = "https://api.cartesia.ai/tts/bytes"

SAMPLE_TEXT = (
    "Bollywood actress Deepika Padukone's compelling portrayal of complex, "
    "emotionally layered characters has earned her international critical acclaim."
)

# Locked en-US matrix (1 model per provider)
MODELS: list[dict] = [
    {
        "slug": "01_google_gemini_kore",
        "provider": "Google",
        "backend": "openrouter",
        "model": "google/gemini-3.1-flash-tts-preview",
        "voice": "Kore",
        "response_format": "pcm",
        "ext": "wav",
        "provider_options": {"google": {"language_code": "en-US"}},
    },
    {
        "slug": "02_microsoft_mai_harper",
        "provider": "Microsoft",
        "backend": "openrouter",
        "model": "microsoft/mai-voice-2",
        "voice": "en-US-Harper:MAI-Voice-2",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "03_fish_s21_default",
        "provider": "Fish Audio",
        "backend": "openrouter",
        "model": "fish-audio/s2.1-pro-free:free",
        "voice": None,
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "04_deepgram_thalia",
        "provider": "Deepgram",
        "backend": "openrouter",
        "model": "deepgram/aura-2",
        "voice": "aura-2-thalia-en",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "05_mistral_paul_neutral",
        "provider": "Mistral",
        "backend": "openrouter",
        "model": "mistralai/voxtral-mini-tts-2603",
        "voice": "en_paul_neutral",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "06_kokoro_bella",
        "provider": "Kokoro",
        "backend": "openrouter",
        "model": "hexgrad/kokoro-82m",
        "voice": "af_bella",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "07_zyphra_american_female",
        "provider": "Zyphra",
        "backend": "openrouter",
        "model": "zyphra/zonos-v0.1-hybrid",
        "voice": "american_female",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "08_orpheus_tara",
        "provider": "Canopy Labs",
        "backend": "openrouter",
        "model": "canopylabs/orpheus-3b-0.1-ft",
        "voice": "tara",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "09_sesame_conversational_a",
        "provider": "Sesame",
        "backend": "openrouter",
        "model": "sesame/csm-1b",
        "voice": "conversational_a",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "10_minimax_graceful_lady",
        "provider": "MiniMax",
        "backend": "openrouter",
        "model": "minimax/speech-2.8-turbo",
        "voice": "English_Graceful_Lady",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "11_grok_eve",
        "provider": "xAI",
        "backend": "openrouter",
        "model": "x-ai/grok-voice-tts-1.0",
        "voice": "eve",
        "response_format": "mp3",
        "ext": "mp3",
    },
    {
        "slug": "12_elevenlabs_rachel",
        "provider": "ElevenLabs",
        "backend": "elevenlabs",
        "model": "eleven_v3",
        "voice": "21m00Tcm4TlvDq8ikWAM",
        "ext": "mp3",
    },
    {
        "slug": "13_cartesia_skylar",
        "provider": "Cartesia",
        "backend": "cartesia",
        "model": "sonic-3.5",
        "voice": "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
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
        "language": "en",
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

    manifest = {"sample_text": SAMPLE_TEXT, "results": results}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"\n{ok}/{len(results)} clips saved under {OUT}/")


if __name__ == "__main__":
    main()
