#!/usr/bin/env python3
"""Seed en-US bench (scripts, 13 models, run) and upload 650 clips to Supabase.

Uses Supabase REST + Storage APIs directly (no supabase-py dependency).

Usage:
  python load_en_us_bench.py
  python load_en_us_bench.py --skip-upload
  python load_en_us_bench.py --upload-only
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
SCRIPTS_PATH = ROOT / "english_scripts_docx.json"
JSONL_PATH = ROOT / "outputs" / "en_us_tts_13" / "generations.jsonl"

RUN_SLUG = "en-us-13-2026"
LOCALE = "en-US"

MODEL_UI: dict[str, dict[str, str]] = {
    "01_google_gemini_kore": {"name": "Gemini 3.1 Flash TTS", "color": "#4285f4", "voice_label": "Kore — en-US"},
    "02_microsoft_mai_harper": {"name": "MAI-Voice-2 Harper", "color": "#0078d4", "voice_label": "Harper — en-US"},
    "03_fish_s21_default": {"name": "Fish S2.1 Pro Free", "color": "#22c55e", "voice_label": "Default voice"},
    "04_deepgram_thalia": {"name": "Deepgram Aura-2 Thalia", "color": "#13ef93", "voice_label": "Thalia — en"},
    "05_mistral_paul_neutral": {"name": "Voxtral Mini TTS", "color": "#ff7000", "voice_label": "Paul — neutral"},
    "06_kokoro_bella": {"name": "Kokoro 82M", "color": "#ec4899", "voice_label": "Bella — af_bella"},
    "07_zyphra_american_female": {"name": "Zyphra Zonos v0.1", "color": "#8b5cf6", "voice_label": "American female"},
    "08_orpheus_tara": {"name": "Orpheus 3B", "color": "#06b6d4", "voice_label": "Tara"},
    "09_sesame_conversational_a": {"name": "Sesame CSM-1B", "color": "#f59e0b", "voice_label": "Conversational A"},
    "10_minimax_graceful_lady": {"name": "MiniMax Speech 2.8 Turbo", "color": "#ef4444", "voice_label": "Graceful Lady"},
    "11_grok_eve": {"name": "Grok Voice TTS 1.0", "color": "#a855f7", "voice_label": "Eve"},
    "12_elevenlabs_rachel": {"name": "ElevenLabs v3 Rachel", "color": "#111827", "voice_label": "Rachel"},
    "13_cartesia_skylar": {"name": "Cartesia Sonic 3.5 Skylar", "color": "#6366f1", "voice_label": "Skylar"},
}


class SupabaseRest:
    def __init__(self, base_url: str, service_key: str) -> None:
        self.base = base_url.rstrip("/")
        self.key = service_key
        self.headers = {
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        }

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Any | None = None,
        extra_headers: dict[str, str] | None = None,
        prefer: str | None = None,
    ) -> Any:
        url = f"{self.base}/rest/v1/{path.lstrip('/')}"
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        if extra_headers:
            headers.update(extra_headers)
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = Request(url, data=data, method=method, headers=headers)
        try:
            with urlopen(req, timeout=120) as resp:
                raw = resp.read()
                if not raw:
                    return None
                return json.loads(raw.decode())
        except HTTPError as exc:
            err = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} -> {exc.code}: {err[:500]}") from exc

    def select(self, table: str, params: str = "select=*") -> list[dict]:
        out = self._request("GET", f"{table}?{params}")
        return out or []

    def upsert(self, table: str, row: dict | list[dict], on_conflict: str) -> list[dict]:
        path = f"{table}?on_conflict={quote(on_conflict, safe='')}"
        out = self._request(
            "POST",
            path,
            body=row,
            prefer="resolution=merge-duplicates,return=representation",
        )
        return out or []

    def update(self, table: str, row: dict, match: str) -> list[dict]:
        out = self._request("PATCH", f"{table}?{match}", body=row, prefer="return=representation")
        return out or []

    def upload(self, bucket: str, storage_path: str, data: bytes, content_type: str) -> None:
        url = f"{self.base}/storage/v1/object/{bucket}/{quote(storage_path, safe='/')}"
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        req = Request(url, data=data, method="POST", headers=headers)
        try:
            with urlopen(req, timeout=300):
                return
        except HTTPError as exc:
            err = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"upload {storage_path} -> {exc.code}: {err[:500]}") from exc

    def public_url(self, bucket: str, storage_path: str) -> str:
        return f"{self.base}/storage/v1/object/public/{bucket}/{storage_path}"


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


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "general"


def normalize_mime(path: Path, guessed: str | None) -> str:
    ext = path.suffix.lower()
    if ext == ".wav":
        return "audio/wav"
    if ext == ".mp3":
        return "audio/mpeg"
    if ext in {".m4a", ".mp4"}:
        return "audio/mp4"
    if guessed and guessed != "application/octet-stream":
        return guessed
    return "application/octet-stream"
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "general"


def import_models_config() -> list[dict]:
    sys.path.insert(0, str(ROOT))
    from run_english_13_models import MODELS  # noqa: WPS433

    return MODELS


def ensure_languages(db: SupabaseRest) -> dict[str, str]:
    for code, name, order in [
        ("en-US", "English (US)", 1),
        ("en-IN", "English (India)", 2),
        ("hi-IN", "Hindi (India)", 3),
    ]:
        db.upsert("languages", {"code": code, "name": name, "sort_order": order, "active": True}, "code")
    langs = db.select("languages", "select=id,code")
    return {r["code"]: r["id"] for r in langs}


def seed_scripts(db: SupabaseRest, lang_id: str) -> None:
    scripts = json.loads(SCRIPTS_PATH.read_text(encoding="utf-8"))
    domains = {d["slug"]: d["id"] for d in db.select("domains", "select=id,slug")}

    for row in scripts:
        domain_id = None
        if row.get("domain"):
            dslug = slugify(row["domain"])
            if dslug not in domains:
                ins = db.upsert("domains", {"slug": dslug, "name": row["domain"]}, "slug")
                if ins:
                    domains[dslug] = ins[0]["id"]
            domain_id = domains.get(dslug)

        db.upsert(
            "scripts",
            {
                "script_no": row["script_no"],
                "language_id": lang_id,
                "domain_id": domain_id,
                "named_entity": row.get("named_entity"),
                "text": row["text"],
                "active": True,
                "metadata": {"source": "english_scripts_docx.json", "locale": LOCALE},
            },
            "language_id,script_no",
        )
    print(f"Seeded {len(scripts)} en-US scripts")


def seed_models(db: SupabaseRest, model_cfgs: list[dict]) -> dict[str, str]:
    slug_to_id: dict[str, str] = {}
    for i, cfg in enumerate(model_cfgs, start=1):
        slug = cfg["slug"]
        ui = MODEL_UI.get(slug, {})
        res = db.upsert(
            "models",
            {
                "slug": slug,
                "name": ui.get("name", slug),
                "provider": cfg["provider"],
                "api_slug": cfg["model"],
                "default_voice": cfg.get("voice"),
                "voice_label": ui.get("voice_label", cfg.get("voice") or "default"),
                "color": ui.get("color", "#6ea8fe"),
                "sort_order": i,
                "active": True,
                "metadata": {"locale": LOCALE, "backend": cfg["backend"]},
            },
            "slug",
        )
        slug_to_id[slug] = res[0]["id"]
    print(f"Upserted {len(model_cfgs)} en-US models")
    return slug_to_id


def seed_run(db: SupabaseRest) -> str:
    res = db.upsert(
        "runs",
        {
            "slug": RUN_SLUG,
            "name": "English US — 13 model bench",
            "prompt_policy": "text_only_input",
            "is_default": False,
            "notes": "50 scripts × 13 models from english_scripts_docx.json",
            "metadata": {
                "language_code": LOCALE,
                "scripts_source": "english_scripts_docx.json",
                "model_count": 13,
                "script_count": 50,
            },
        },
        "slug",
    )
    run_id = res[0]["id"]
    db.update("runs", {"metadata": {"language_code": "hi-IN"}, "is_default": False}, "slug=eq.demo-2026")
    db.upsert(
        "site_settings",
        {
            "key": "voting",
            "value": {
                "require_auth": True,
                "default_run_slug": RUN_SLUG,
                "default_language_code": LOCALE,
                "runs_by_language": {"en-US": RUN_SLUG, "hi-IN": "demo-2026"},
            },
        },
        "key",
    )
    print(f"Run ready: {RUN_SLUG} ({run_id})")
    return run_id


def dedupe_generations() -> list[dict]:
    best: dict[tuple[str, int], dict] = {}
    rank = {"ok": 3, "skipped_exists": 2, "error": 1}
    for line in JSONL_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("status") not in ("ok", "skipped_exists"):
            continue
        key = (r["model_slug"], r["script_no"])
        prev = best.get(key)
        if prev is None or rank.get(r["status"], 0) >= rank.get(prev["status"], 0):
            best[key] = r
    rows = sorted(best.values(), key=lambda x: (x["model_slug"], x["script_no"]))
    print(f"Deduplicated {len(rows)} ok generations from jsonl")
    return rows


def upload_clips(db: SupabaseRest, run_id: str, model_ids: dict[str, str]) -> None:
    langs = db.select("languages", f"select=id&code=eq.{LOCALE}")
    lang_id = langs[0]["id"]
    scripts = db.select("scripts", f"select=id,script_no&language_id=eq.{lang_id}")
    script_by_no = {s["script_no"]: s["id"] for s in scripts}
    rows = dedupe_generations()
    total = len(rows)
    t0 = time.monotonic()

    for i, r in enumerate(rows, start=1):
        slug = r["model_slug"]
        script_no = r["script_no"]
        local = ROOT / r["path"]
        if not local.exists():
            print(f"[{i}/{total}] SKIP missing {local}")
            continue

        model_id = model_ids.get(slug)
        script_id = script_by_no.get(script_no)
        if not model_id or not script_id:
            print(f"[{i}/{total}] SKIP missing db ids {slug} #{script_no}")
            continue

        ext = local.suffix.lstrip(".")
        storage_path = f"{slug}/{run_id}/en_{script_no:02d}.{ext}"
        mime = normalize_mime(local, mimetypes.guess_type(str(local))[0])
        data = local.read_bytes()
        db.upload("model-clips", storage_path, data, mime)
        url = db.public_url("model-clips", storage_path)

        metadata = {
            k: v
            for k, v in {
                "locale": LOCALE,
                "latency_ms": r.get("latency_ms"),
                "estimated_cost_usd": r.get("estimated_cost_usd"),
                "actual_cost_usd": r.get("actual_cost_usd"),
                "generation_id": r.get("generation_id"),
                "provider": r.get("provider"),
                "api_model": r.get("api_model"),
                "voice": r.get("voice"),
                "input_chars": r.get("input_chars"),
                "timestamp": r.get("timestamp"),
                "chunked": r.get("chunked"),
                "chunk_count": r.get("chunk_count"),
                "chunk_chars": r.get("chunk_chars"),
            }.items()
            if v is not None
        }

        db.upsert(
            "model_clips",
            {
                "script_id": script_id,
                "model_id": model_id,
                "run_id": run_id,
                "voice_key": r.get("voice"),
                "storage_path": storage_path,
                "public_url": url,
                "mime_type": mime,
                "bytes": r.get("bytes") or len(data),
                "duration_ms": r.get("duration_ms"),
                "status": "ready",
                "metadata": metadata,
            },
            "script_id,model_id,run_id,voice_key",
        )

        elapsed = time.monotonic() - t0
        rate = i / elapsed if elapsed else 0
        eta = (total - i) / rate if rate else 0
        print(f"[{i:3d}/{total}] {100*i/total:5.1f}% | {slug} en_{script_no:02d} | {elapsed:.0f}s elapsed eta {eta:.0f}s")

    print(f"Uploaded {total} clips")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--skip-upload", action="store_true")
    p.add_argument("--upload-only", action="store_true")
    args = p.parse_args()

    load_env()
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")

    db = SupabaseRest(url, key)
    model_cfgs = import_models_config()

    if not args.upload_only:
        langs = ensure_languages(db)
        seed_scripts(db, langs[LOCALE])
        model_ids = seed_models(db, model_cfgs)
        run_id = seed_run(db)
    else:
        model_rows = db.select("models", "select=id,slug")
        model_ids = {r["slug"]: r["id"] for r in model_rows}
        runs = db.select("runs", f"select=id&slug=eq.{RUN_SLUG}")
        if not runs:
            raise SystemExit(f"Run {RUN_SLUG} not found")
        run_id = runs[0]["id"]

    if not args.skip_upload:
        upload_clips(db, run_id, model_ids)

    print("\nDone. Open arena with ?lang=en-US")


if __name__ == "__main__":
    main()
