#!/usr/bin/env python3
"""Generate English (IN) TTS: 50 scripts × 11 voices = 550 clips.

Models are grouped by provider (6 leaderboard entities); each voice is a separate synthesis job.
Output: outputs/en_in_tts_11/{model_slug}/{voice_key}/en_{NN}.{ext}
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import subprocess
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

from en_in_bench_config import LOCALE, VOICE_CONFIGS

ROOT = Path(__file__).resolve().parent
SCRIPTS_PATH = ROOT / "english_scripts_docx.json"
OUT_DIR = ROOT / "outputs" / "en_in_tts_11"
PRICING_PATH = OUT_DIR / "pricing_verified.json"
MANIFEST_JSONL = OUT_DIR / "generations.jsonl"
SUMMARY_PATH = OUT_DIR / "run_summary.json"

OPENROUTER_SPEECH = "https://openrouter.ai/api/v1/audio/speech"
OPENROUTER_GENERATION = "https://openrouter.ai/api/v1/generation"
OPENROUTER_MODELS = "https://openrouter.ai/api/v1/models?output_modalities=speech"
ELEVENLABS_SPEECH = "https://api.elevenlabs.io/v1/text-to-speech"
CARTESIA_SPEECH = "https://api.cartesia.ai/tts/bytes"
SARVAM_SPEECH = "https://api.sarvam.ai/text-to-speech"

DIRECT_PRICING: dict[str, dict[str, Any]] = {
    "elevenlabs": {
        "usd_per_char": 0.0001,
        "source": "https://elevenlabs.io/pricing/api",
    },
    "cartesia": {
        "usd_per_char": 0.000042,
        "source": "https://cartesia.ai/pricing",
    },
    "sarvam": {
        "usd_per_char": 0.000036,
        "source": "https://www.sarvam.ai/text-to-speech (Rs 30 / 10K chars, USD est.)",
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
                f"elapsed={fmt_duration(elapsed)} eta={fmt_duration(eta_s)}",
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
    return (
        text.replace("\u2018", "'")
        .replace("\u2019", "'")
        .replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2013", "-")
        .replace("\u2014", "-")
    )


def load_scripts() -> list[dict]:
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
                rate = wf.getframerate()
                if rate:
                    return int(1000 * wf.getnframes() / rate)
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
    req = Request(OPENROUTER_MODELS, headers={"Authorization": f"Bearer {api_key}"})
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
        }
    return by_id


def verify_pricing(openrouter_key: str) -> dict[str, Any]:
    or_prices = fetch_openrouter_pricing(openrouter_key)
    verified: dict[str, Any] = {"verified_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "models": {}}
    for cfg in VOICE_CONFIGS:
        slug = cfg["rank_slug"]
        if cfg["backend"] == "openrouter":
            mid = cfg["model"]
            verified["models"][slug] = {"backend": "openrouter", "api_model": mid, **(or_prices.get(mid) or {})}
        else:
            dp = DIRECT_PRICING[cfg["backend"]]
            verified["models"][slug] = {
                "backend": cfg["backend"],
                "api_model": cfg["model"],
                "usd_per_char": dp["usd_per_char"],
                "unit": "char",
                "source": dp["source"],
            }
    return verified


def estimate_cost_usd(pricing: dict[str, Any], cfg: dict, char_count: int) -> float:
    mp = pricing["models"][cfg["rank_slug"]]
    if cfg["backend"] == "openrouter":
        prompt = float(mp.get("prompt_usd_per_unit") or 0)
        completion = float(mp.get("completion_usd_per_unit") or 0)
        return char_count * (prompt + completion)
    return char_count * float(mp.get("usd_per_char") or 0)


def fetch_generation_cost(api_key: str, generation_id: str) -> dict[str, Any] | None:
    try:
        url = f"{OPENROUTER_GENERATION}?id={quote(generation_id)}"
        req = Request(url, headers={"Authorization": f"Bearer {api_key}"})
        with urlopen(req, timeout=30) as resp:
            data = (json.loads(resp.read().decode())).get("data") or {}
        return {"generation_id": generation_id, "total_cost_usd": data.get("total_cost")}
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
    if cfg.get("provider_options"):
        body["provider"] = {"options": cfg["provider_options"]}
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
    meta = {"latency_ms": latency_ms, "generation_id": headers.get("x-generation-id")}
    if cfg["response_format"] == "pcm":
        return pcm_to_wav(data), meta
    return data, meta


def elevenlabs_synthesize(cfg: dict, api_key: str, text: str) -> tuple[bytes, dict[str, Any]]:
    url = f"{ELEVENLABS_SPEECH}/{cfg['voice']}"
    body = {"text": text, "model_id": cfg["model"]}
    req = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
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
        "language": cfg.get("language", "en"),
        "output_format": {"container": "mp3", "encoding": "mp3", "sample_rate": 44100},
    }
    req = Request(
        CARTESIA_SPEECH,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"X-API-Key": api_key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json"},
    )
    t0 = time.perf_counter()
    with urlopen(req, timeout=300) as resp:
        data = resp.read()
    return data, {"latency_ms": int((time.perf_counter() - t0) * 1000)}


def sarvam_synthesize(cfg: dict, api_key: str, text: str) -> tuple[bytes, dict[str, Any]]:
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
        headers={"api-subscription-key": api_key, "Content-Type": "application/json"},
    )
    t0 = time.perf_counter()
    with urlopen(req, timeout=300) as resp:
        payload = json.loads(resp.read())
    audios = payload.get("audios") or []
    if not audios:
        raise RuntimeError(f"Sarvam returned no audio: {payload}")
    return base64.b64decode(audios[0]), {"latency_ms": int((time.perf_counter() - t0) * 1000)}


def synthesize(cfg: dict, text: str) -> tuple[bytes, dict[str, Any]]:
    backend = cfg["backend"]
    direct_sleep = float(os.environ.get("TTS_DIRECT_API_SLEEP", "0"))
    if direct_sleep and backend in ("cartesia", "elevenlabs", "sarvam"):
        time.sleep(direct_sleep)
    if backend == "openrouter":
        return openrouter_synthesize(cfg, os.environ["OPENROUTER_API_KEY"], text)
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


def out_path(cfg: dict, script_no: int) -> Path:
    return OUT_DIR / cfg["model_slug"] / cfg["voice_key"] / f"en_{script_no:02d}.{cfg['ext']}"


def append_manifest(entry: dict) -> None:
    with manifest_lock:
        with MANIFEST_JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")


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
    group = cfg["model_slug"]

    entry: dict[str, Any] = {
        "script_no": script_no,
        "rank_slug": cfg["rank_slug"],
        "model_slug": group,
        "voice_key": cfg["voice_key"],
        "voice_label": cfg["voice_label"],
        "provider": cfg.get("provider") or group,
        "api_model": cfg["model"],
        "voice": cfg.get("voice"),
        "locale": LOCALE,
        "text": text,
        "input_chars": len(text),
        "path": str(dest.relative_to(ROOT)),
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    if resume and dest.exists() and dest.stat().st_size > 0:
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
            if cfg["backend"] == "openrouter" and meta.get("generation_id"):
                gen = fetch_generation_cost(os.environ["OPENROUTER_API_KEY"], meta["generation_id"])
                if gen and gen.get("total_cost_usd") is not None:
                    entry["actual_cost_usd"] = float(gen["total_cost_usd"])
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


def summarize_manifest() -> dict[str, Any]:
    rows: list[dict] = []
    if MANIFEST_JSONL.exists():
        for line in MANIFEST_JSONL.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    by_voice: dict[str, dict[str, Any]] = {}
    total_cost = 0.0
    for r in rows:
        slug = r.get("rank_slug", "?")
        bucket = by_voice.setdefault(slug, {"ok": 0, "failed": 0, "skipped": 0, "estimated_cost_usd": 0.0})
        st = r.get("status")
        if st == "ok":
            bucket["ok"] += 1
        elif st == "skipped_exists":
            bucket["skipped"] += 1
        elif st == "error":
            bucket["failed"] += 1
        est = float(r.get("estimated_cost_usd") or 0)
        bucket["estimated_cost_usd"] += est
        total_cost += est
    return {
        "generations_logged": len(rows),
        "estimated_total_cost_usd": round(total_cost, 4),
        "by_voice": {k: {**v, "estimated_cost_usd": round(v["estimated_cost_usd"], 4)} for k, v in sorted(by_voice.items())},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument("--models", nargs="*", help="rank_slug filters")
    parser.add_argument("--script-nos", type=int, nargs="*")
    parser.add_argument("--fresh", action="store_true")
    args = parser.parse_args()

    load_env()
    if not os.environ.get("OPENROUTER_API_KEY"):
        raise SystemExit("OPENROUTER_API_KEY missing")

    scripts = load_scripts()
    if args.script_nos:
        wanted = set(args.script_nos)
        scripts = [s for s in scripts if s["script_no"] in wanted]

    selected = VOICE_CONFIGS
    if args.models:
        allowed = set(args.models)
        selected = [v for v in VOICE_CONFIGS if v["rank_slug"] in allowed]
        if not selected:
            raise SystemExit("No matching rank_slug")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pricing = verify_pricing(os.environ["OPENROUTER_API_KEY"])
    PRICING_PATH.write_text(json.dumps(pricing, indent=2), encoding="utf-8")

    if args.fresh and MANIFEST_JSONL.exists():
        MANIFEST_JSONL.unlink()

    jobs = [Job(script=s, cfg=v, pricing=pricing, retries=args.retries) for v in selected for s in scripts]
    progress = Progress(total=len(jobs))
    print(f"Jobs: {len(jobs)} | workers: {args.workers}")

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(run_job, job, resume=args.resume): job for job in jobs}
        for fut in as_completed(futures):
            job = futures[fut]
            try:
                result = fut.result()
                progress.tick(status=result["status"])
                with print_lock:
                    print(
                        f"  {job.cfg['rank_slug']} #{job.script['script_no']:02d} -> {result['status']}",
                        flush=True,
                    )
            except Exception as exc:  # noqa: BLE001
                progress.tick(status="error")
                with print_lock:
                    print(f"  FATAL {job.cfg['rank_slug']}: {exc}", flush=True)

    summary = summarize_manifest()
    summary["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
