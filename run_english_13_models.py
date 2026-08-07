#!/usr/bin/env python3
"""Generate en-US TTS for 50 English scripts × 13 locked models (650 clips).

Source scripts: english_scripts_docx.json (from Hindi_English_TTS_Scripts_100_updated.docx)
Models/voices: locked matrix from dry_test_13_models.py

Tracks per generation: latency, bytes, duration, char count, estimated cost, OpenRouter generation id.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
import wave
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SCRIPTS_PATH = ROOT / "english_scripts_docx.json"
OUT_DIR = ROOT / "outputs" / "en_us_tts_13"
PRICING_PATH = OUT_DIR / "pricing_verified.json"
MANIFEST_JSONL = OUT_DIR / "generations.jsonl"
SUMMARY_PATH = OUT_DIR / "run_summary.json"

OPENROUTER_SPEECH = "https://openrouter.ai/api/v1/audio/speech"
OPENROUTER_GENERATION = "https://openrouter.ai/api/v1/generation"
OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models?output_modalities=speech"
ELEVENLABS_SPEECH = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_SPEECH = "https://api.cartesia.ai/tts/bytes"

# Sesame/csm-1b on OpenRouter rejects inputs above ~200 chars (400 from provider).
SESAME_MAX_INPUT_CHARS = 194

# Locked 13-model matrix (en-US)
MODELS: list[dict[str, Any]] = [
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
        "max_input_chars": SESAME_MAX_INPUT_CHARS,
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

# Direct API pricing (USD per input character) — verified sources documented in pricing_verified.json
DIRECT_PRICING: dict[str, dict[str, Any]] = {
    "elevenlabs": {
        "model": "eleven_v3",
        "usd_per_char": 0.0001,  # $0.10 / 1K chars — elevenlabs.io/pricing/api
        "source": "https://elevenlabs.io/pricing/api",
    },
    "cartesia": {
        "model": "sonic-3.5",
        "usd_per_char": 0.000042,  # ~$42/M chars, 1 credit/char Pro — cartesia.ai/pricing
        "source": "https://cartesia.ai/pricing",
    },
}

print_lock = threading.Lock()
manifest_lock = threading.Lock()
progress_lock = threading.Lock()


@dataclass
class Progress:
    total: int
    done: int = 0
    ok: int = 0
    failed: int = 0
    skipped: int = 0
    started_at: float = field(default_factory=time.monotonic)

    def tick(self, *, status: str) -> None:
        with progress_lock:
            self.done += 1
            if status == "ok":
                self.ok += 1
            elif status == "skipped_exists":
                self.skipped += 1
            else:
                self.failed += 1
            elapsed = time.monotonic() - self.started_at
            rate = self.done / elapsed if elapsed > 0 else 0.0
            remaining = self.total - self.done
            eta_s = remaining / rate if rate > 0 else 0.0
            pct = 100.0 * self.done / self.total
            print(
                f"[{self.done:4d}/{self.total}] {pct:5.1f}% | ok={self.ok} skip={self.skipped} fail={self.failed} | "
                f"elapsed={fmt_duration(elapsed)} eta={fmt_duration(eta_s)} | {status}",
                flush=True,
            )


def fmt_duration(seconds: float) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h{m:02d}m{s:02d}s"
    if m:
        return f"{m}m{s:02d}s"
    return f"{s}s"


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


def normalize_tts_text(text: str) -> str:
    """Normalize typographic punctuation that can break some TTS providers."""
    return (
        text.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )


def split_text_chunks(text: str, max_chars: int) -> list[str]:
    """Split long text into chunks at sentence/word boundaries."""
    text = normalize_tts_text(text)
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    current = ""

    def flush() -> None:
        nonlocal current
        if current:
            chunks.append(current)
            current = ""

    for sentence in re.split(r"(?<=[.!?])\s+", text):
        if not sentence:
            continue
        if len(sentence) <= max_chars:
            candidate = f"{current} {sentence}".strip() if current else sentence
            if len(candidate) <= max_chars:
                current = candidate
            else:
                flush()
                current = sentence
            continue
        flush()
        words = sentence.split()
        for word in words:
            candidate = f"{current} {word}".strip() if current else word
            if len(candidate) <= max_chars:
                current = candidate
            else:
                flush()
                current = word
    flush()
    return chunks or [text[:max_chars]]


def load_scripts() -> list[dict]:
    if not SCRIPTS_PATH.exists():
        raise SystemExit(f"Missing {SCRIPTS_PATH} — run docx parser first")
    scripts = json.loads(SCRIPTS_PATH.read_text(encoding="utf-8"))
    if len(scripts) != 50:
        raise SystemExit(f"Expected 50 scripts, got {len(scripts)}")
    return scripts


def pcm_to_wav(pcm: bytes, rate: int = 24000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(rate)
        wf.writeframes(pcm)
    return buf.getvalue()


def audio_duration_ms(path: Path) -> int | None:
    if path.suffix.lower() == ".wav":
        try:
            with wave.open(str(path), "rb") as wf:
                frames = wf.getnframes()
                rate = wf.getframerate()
                if rate:
                    return int(1000 * frames / rate)
        except Exception:  # noqa: BLE001
            return None
    try:
        out = subprocess.check_output(["afinfo", str(path)], stderr=subprocess.STDOUT, text=True)
        m = re.search(r"estimated duration:\s*([0-9.]+)\s*sec", out)
        if m:
            return int(float(m.group(1)) * 1000)
    except Exception:  # noqa: BLE001
        return None
    return None


def fetch_openrouter_pricing(api_key: str) -> dict[str, dict[str, Any]]:
    req = Request(
        OPENROUTER_MODELS,
        headers={"Authorization": f"Bearer {api_key}"},
    )
    with urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode())
    by_id: dict[str, dict[str, Any]] = {}
    for m in payload.get("data", []):
        mid = m.get("id")
        if not mid:
            continue
        p = m.get("pricing") or {}
        by_id[mid] = {
            "prompt_usd_per_unit": float(p.get("prompt") or 0),
            "completion_usd_per_unit": float(p.get("completion") or 0),
            "unit": "char",
            "source": "https://openrouter.ai/api/v1/models?output_modalities=speech",
            "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
    return by_id


def verify_pricing(openrouter_key: str) -> dict[str, Any]:
    or_prices = fetch_openrouter_pricing(openrouter_key)
    verified: dict[str, Any] = {
        "verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "models": {},
        "notes": [
            "OpenRouter TTS: estimated_cost_usd = input_chars * prompt_usd_per_unit (+ completion if applicable).",
            "When X-Generation-Id is returned, actual_cost_usd is fetched from /api/v1/generations.",
            "ElevenLabs/Cartesia: estimated from published per-character API rates.",
        ],
    }
    missing: list[str] = []
    for cfg in MODELS:
        slug = cfg["slug"]
        if cfg["backend"] == "openrouter":
            mid = cfg["model"]
            if mid not in or_prices:
                missing.append(mid)
            verified["models"][slug] = {
                "backend": "openrouter",
                "api_model": mid,
                **(or_prices.get(mid) or {}),
            }
        else:
            dp = DIRECT_PRICING[cfg["backend"]]
            verified["models"][slug] = {
                "backend": cfg["backend"],
                "api_model": cfg["model"],
                "usd_per_char": dp["usd_per_char"],
                "unit": "char",
                "source": dp["source"],
            }
    if missing:
        raise SystemExit(f"OpenRouter pricing missing for: {', '.join(missing)}")
    return verified


def estimate_cost_usd(pricing: dict[str, Any], cfg: dict, char_count: int) -> float:
    mp = pricing["models"][cfg["slug"]]
    if cfg["backend"] == "openrouter":
        prompt = float(mp.get("prompt_usd_per_unit") or 0)
        completion = float(mp.get("completion_usd_per_unit") or 0)
        # OpenRouter TTS typically bills input text; Gemini also lists completion rate.
        return char_count * (prompt + completion)
    return char_count * float(mp.get("usd_per_char") or 0)


def fetch_generation_cost(api_key: str, generation_id: str) -> dict[str, Any] | None:
    try:
        url = f"{OPENROUTER_GENERATION}?id={quote(generation_id)}"
        req = Request(url, headers={"Authorization": f"Bearer {api_key}"})
        with urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode())
        data = payload.get("data") or {}
        return {
            "generation_id": generation_id,
            "total_cost_usd": data.get("total_cost"),
            "usage_usd": data.get("usage"),
            "latency_ms": data.get("latency"),
            "generation_time_ms": data.get("generation_time"),
            "provider_name": data.get("provider_name"),
            "tokens_prompt": data.get("tokens_prompt"),
            "tokens_completion": data.get("tokens_completion"),
        }
    except Exception:  # noqa: BLE001
        return None


def openrouter_synthesize(cfg: dict, api_key: str, text: str) -> tuple[bytes, dict[str, Any]]:
    body: dict[str, Any] = {
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
    t0 = time.perf_counter()
    with urlopen(req, timeout=300) as resp:
        data = resp.read()
        headers = {k.lower(): v for k, v in resp.headers.items()}
    latency_ms = int((time.perf_counter() - t0) * 1000)
    meta = {
        "latency_ms": latency_ms,
        "generation_id": headers.get("x-generation-id"),
        "content_type": headers.get("content-type"),
    }
    if cfg["response_format"] == "pcm":
        return pcm_to_wav(data), meta
    return data, meta


def elevenlabs_synthesize(cfg: dict, api_key: str, text: str) -> tuple[bytes, dict[str, Any]]:
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
    t0 = time.perf_counter()
    with urlopen(req, timeout=300) as resp:
        data = resp.read()
    return data, {"latency_ms": int((time.perf_counter() - t0) * 1000)}


def cartesia_synthesize(cfg: dict, api_key: str, text: str) -> tuple[bytes, dict[str, Any]]:
    body = {
        "model_id": cfg["model"],
        "transcript": text,
        "voice": {"mode": "id", "id": cfg["voice"]},
        "language": "en",
        "output_format": {"container": "mp3", "encoding": "mp3", "sample_rate": 44100},
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
    t0 = time.perf_counter()
    with urlopen(req, timeout=300) as resp:
        data = resp.read()
    return data, {"latency_ms": int((time.perf_counter() - t0) * 1000)}


def openrouter_synthesize_maybe_chunked(cfg: dict, api_key: str, text: str) -> tuple[bytes, dict[str, Any]]:
    max_chars = cfg.get("max_input_chars")
    if max_chars and len(text) > max_chars:
        chunks = split_text_chunks(text, max_chars)
        parts: list[bytes] = []
        latency_ms = 0
        generation_ids: list[str] = []
        for chunk in chunks:
            audio, meta = openrouter_synthesize(cfg, api_key, chunk)
            parts.append(audio)
            latency_ms += int(meta.get("latency_ms") or 0)
            if meta.get("generation_id"):
                generation_ids.append(meta["generation_id"])
        return b"".join(parts), {
            "latency_ms": latency_ms,
            "generation_id": generation_ids[0] if generation_ids else None,
            "generation_ids": generation_ids,
            "chunked": True,
            "chunk_count": len(chunks),
            "chunk_chars": [len(c) for c in chunks],
        }
    return openrouter_synthesize(cfg, api_key, text)


def synthesize(cfg: dict, text: str) -> tuple[bytes, dict[str, Any]]:
    backend = cfg["backend"]
    if backend == "openrouter":
        key = os.environ["OPENROUTER_API_KEY"]
        return openrouter_synthesize_maybe_chunked(cfg, key, text)
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


def out_path(cfg: dict, script_no: int) -> Path:
    return OUT_DIR / cfg["slug"] / f"en_{script_no:02d}.{cfg['ext']}"


def append_manifest(entry: dict) -> None:
    with manifest_lock:
        with MANIFEST_JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def job_exists_ok(script_no: int, cfg: dict) -> bool:
    p = out_path(cfg, script_no)
    return p.exists() and p.stat().st_size > 0


@dataclass
class Job:
    script: dict
    cfg: dict
    pricing: dict[str, Any]
    retries: int


def run_job(job: Job, *, resume: bool) -> dict[str, Any]:
    script_no = job.script["script_no"]
    text = normalize_tts_text(job.script["text"])
    cfg = job.cfg
    dest = out_path(cfg, script_no)
    dest.parent.mkdir(parents=True, exist_ok=True)

    entry: dict[str, Any] = {
        "script_no": script_no,
        "model_slug": cfg["slug"],
        "provider": cfg["provider"],
        "api_model": cfg["model"],
        "voice": cfg.get("voice"),
        "locale": "en-US",
        "text": text,
        "input_chars": len(text),
        "path": str(dest.relative_to(ROOT)),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    if resume and job_exists_ok(script_no, cfg):
        entry["status"] = "skipped_exists"
        entry["bytes"] = dest.stat().st_size
        entry["duration_ms"] = audio_duration_ms(dest)
        entry["estimated_cost_usd"] = estimate_cost_usd(job.pricing, cfg, len(text))
        append_manifest(entry)
        return entry

    last_err = ""
    for attempt in range(1, job.retries + 1):
        try:
            audio, meta = synthesize(cfg, text)
            dest.write_bytes(audio)
            entry.update(meta)
            entry["status"] = "ok"
            entry["bytes"] = len(audio)
            entry["duration_ms"] = audio_duration_ms(dest)
            entry["estimated_cost_usd"] = round(estimate_cost_usd(job.pricing, cfg, len(text)), 8)
            if cfg["backend"] == "openrouter":
                or_key = os.environ["OPENROUTER_API_KEY"]
                gen_ids = meta.get("generation_ids") or (
                    [meta["generation_id"]] if meta.get("generation_id") else []
                )
                if gen_ids:
                    gens = []
                    actual_total = 0.0
                    for gid in gen_ids:
                        gen = fetch_generation_cost(or_key, gid)
                        if gen:
                            gens.append(gen)
                            if gen.get("total_cost_usd") is not None:
                                actual_total += float(gen["total_cost_usd"])
                    if gens:
                        entry["openrouter_generations"] = gens
                    if actual_total:
                        entry["actual_cost_usd"] = actual_total
            if meta.get("chunked"):
                entry["chunked"] = True
                entry["chunk_count"] = meta.get("chunk_count")
                entry["chunk_chars"] = meta.get("chunk_chars")
            append_manifest(entry)
            return entry
        except HTTPError as exc:
            last_err = exc.read().decode("utf-8", errors="replace")[:800]
        except Exception as exc:  # noqa: BLE001
            last_err = str(exc)
        if attempt < job.retries:
            time.sleep(min(2.0 * attempt, 10.0))

    entry["status"] = "error"
    entry["error"] = last_err
    append_manifest(entry)
    return entry


def build_jobs(scripts: list[dict], pricing: dict[str, Any], retries: int) -> list[Job]:
    jobs: list[Job] = []
    for cfg in MODELS:
        for script in scripts:
            jobs.append(Job(script=script, cfg=cfg, pricing=pricing, retries=retries))
    return jobs


def summarize_manifest() -> dict[str, Any]:
    rows: list[dict] = []
    if MANIFEST_JSONL.exists():
        for line in MANIFEST_JSONL.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))

    by_model: dict[str, dict[str, Any]] = {}
    total_cost_est = 0.0
    total_cost_actual = 0.0
    latencies: list[int] = []

    for r in rows:
        slug = r.get("model_slug", "?")
        bucket = by_model.setdefault(
            slug,
            {
                "provider": r.get("provider"),
                "api_model": r.get("api_model"),
                "ok": 0,
                "failed": 0,
                "skipped": 0,
                "estimated_cost_usd": 0.0,
                "actual_cost_usd": 0.0,
                "total_bytes": 0,
                "total_duration_ms": 0,
                "latency_ms_sum": 0,
                "latency_count": 0,
            },
        )
        st = r.get("status")
        if st == "ok":
            bucket["ok"] += 1
        elif st == "skipped_exists":
            bucket["skipped"] += 1
        elif st == "error":
            bucket["failed"] += 1
        est = float(r.get("estimated_cost_usd") or 0)
        bucket["estimated_cost_usd"] += est
        total_cost_est += est
        if r.get("actual_cost_usd") is not None:
            act = float(r["actual_cost_usd"])
            bucket["actual_cost_usd"] += act
            total_cost_actual += act
        if r.get("bytes"):
            bucket["total_bytes"] += int(r["bytes"])
        if r.get("duration_ms"):
            bucket["total_duration_ms"] += int(r["duration_ms"])
        if r.get("latency_ms"):
            bucket["latency_ms_sum"] += int(r["latency_ms"])
            bucket["latency_count"] += 1
            latencies.append(int(r["latency_ms"]))

    avg_latency = sum(latencies) / len(latencies) if latencies else 0
    return {
        "generations_logged": len(rows),
        "estimated_total_cost_usd": round(total_cost_est, 4),
        "actual_total_cost_usd": round(total_cost_actual, 4) if total_cost_actual else None,
        "avg_latency_ms": round(avg_latency, 1),
        "by_model": {
            k: {
                **v,
                "estimated_cost_usd": round(v["estimated_cost_usd"], 4),
                "actual_cost_usd": round(v["actual_cost_usd"], 4),
                "avg_latency_ms": round(v["latency_ms_sum"] / v["latency_count"], 1)
                if v["latency_count"]
                else None,
            }
            for k, v in sorted(by_model.items())
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=8, help="Concurrent generations (default 8)")
    parser.add_argument("--resume", action="store_true", help="Skip existing output files")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--limit-scripts", type=int, default=0, help="Debug: only first N scripts")
    parser.add_argument("--models", nargs="*", help="Only these model slugs")
    parser.add_argument(
        "--script-nos",
        type=int,
        nargs="*",
        help="Only these script numbers (e.g. 15 22 26)",
    )
    parser.add_argument("--fresh", action="store_true", help="Clear generations.jsonl before run")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise SystemExit("OPENROUTER_API_KEY missing in .env")

    scripts = load_scripts()
    if args.limit_scripts:
        scripts = scripts[: args.limit_scripts]
    if args.script_nos:
        wanted = set(args.script_nos)
        scripts = [s for s in scripts if s["script_no"] in wanted]
        if not scripts:
            raise SystemExit("No matching script numbers")

    selected_models = MODELS
    if args.models:
        allowed = set(args.models)
        selected_models = [m for m in MODELS if m["slug"] in allowed]
        if not selected_models:
            raise SystemExit("No matching model slugs")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Verifying pricing sources …")
    pricing = verify_pricing(os.environ["OPENROUTER_API_KEY"])
    PRICING_PATH.write_text(json.dumps(pricing, indent=2), encoding="utf-8")
    print(f"Pricing saved -> {PRICING_PATH.relative_to(ROOT)}")

    # Cost preview
    total_chars = sum(len(s["text"]) for s in scripts)
    preview = 0.0
    for cfg in selected_models:
        preview += sum(estimate_cost_usd(pricing, cfg, len(s["text"])) for s in scripts)
    print(
        f"Scripts: {len(scripts)} | Models: {len(selected_models)} | Jobs: {len(scripts)*len(selected_models)} | "
        f"Est. cost preview: ${preview:.4f} USD"
    )

    if args.fresh and MANIFEST_JSONL.exists():
        MANIFEST_JSONL.unlink()

    jobs: list[Job] = []
    for cfg in selected_models:
        for script in scripts:
            jobs.append(Job(script=script, cfg=cfg, pricing=pricing, retries=args.retries))

    progress = Progress(total=len(jobs))
    print(f"Starting with {args.workers} workers …")

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(run_job, job, resume=args.resume): job for job in jobs}
        for fut in as_completed(futures):
            job = futures[fut]
            try:
                result = fut.result()
                with print_lock:
                    print(
                        f"  done {job.cfg['slug']} script {job.script['script_no']:02d} -> {result['status']}"
                        + (
                            f" ${result.get('actual_cost_usd') or result.get('estimated_cost_usd'):.6f}"
                            if result.get("status") in ("ok", "skipped_exists")
                            else f" ERR: {str(result.get('error',''))[:80]}"
                        ),
                        flush=True,
                    )
                progress.tick(status=result["status"])
            except Exception as exc:  # noqa: BLE001
                progress.tick(status="error")
                with print_lock:
                    print(f"  FATAL {job.cfg['slug']} #{job.script['script_no']}: {exc}", flush=True)

    summary = summarize_manifest()
    summary.update(
        {
            "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "scripts_source": str(SCRIPTS_PATH.relative_to(ROOT)),
            "output_dir": str(OUT_DIR.relative_to(ROOT)),
            "workers": args.workers,
        }
    )
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(f"\nSummary -> {SUMMARY_PATH.relative_to(ROOT)}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
