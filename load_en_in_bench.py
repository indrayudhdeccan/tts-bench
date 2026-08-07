#!/usr/bin/env python3
"""Seed en-IN bench (6 models, 11 voices, 50 scripts) and upload 550 clips to Supabase."""

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
JSONL_PATH = ROOT / "outputs" / "en_in_tts_11" / "generations.jsonl"

sys.path.insert(0, str(ROOT))
from en_in_bench_config import LOCALE, MODEL_GROUPS, RUN_SLUG, VOICE_CONFIGS  # noqa: E402


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
        prefer: str | None = None,
    ) -> Any:
        url = f"{self.base}/rest/v1/{path.lstrip('/')}"
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
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
        return self._request(
            "POST",
            path,
            body=row,
            prefer="resolution=merge-duplicates,return=representation",
        ) or []

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
    if guessed and guessed != "application/octet-stream":
        return guessed
    return "application/octet-stream"


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
    print(f"Seeded {len(scripts)} en-IN scripts")


def seed_models_and_voices(db: SupabaseRest) -> dict[str, str]:
    """Returns model_slug -> models.id"""
    slug_to_id: dict[str, str] = {}

    for mg in MODEL_GROUPS:
        default_voice = next((v["voice_key"] for v in VOICE_CONFIGS if v["model_slug"] == mg["slug"] and v.get("is_default")), None)
        res = db.upsert(
            "models",
            {
                "slug": mg["slug"],
                "name": mg["name"],
                "provider": mg["provider"],
                "api_slug": mg["api_slug"],
                "default_voice": default_voice,
                "voice_label": None,
                "color": mg["color"],
                "sort_order": mg["sort_order"],
                "active": True,
                "metadata": {"locale": LOCALE, "bench": RUN_SLUG},
            },
            "slug",
        )
        slug_to_id[mg["slug"]] = res[0]["id"]
        model_id = res[0]["id"]

        for vc in VOICE_CONFIGS:
            if vc["model_slug"] != mg["slug"]:
                continue
            db.upsert(
                "model_voices",
                {
                    "model_id": model_id,
                    "voice_key": vc["voice_key"],
                    "label": vc["voice_label"],
                    "active": True,
                    "is_default": bool(vc.get("is_default")),
                    "metadata": {"rank_slug": vc["rank_slug"], "backend": vc["backend"]},
                },
                "model_id,voice_key",
            )

    print(f"Upserted {len(MODEL_GROUPS)} models and {len(VOICE_CONFIGS)} voices")
    return slug_to_id


def seed_run(db: SupabaseRest) -> str:
    res = db.upsert(
        "runs",
        {
            "slug": RUN_SLUG,
            "name": "English (IN) — 6 models × 11 voices",
            "prompt_policy": "text_only_input",
            "is_default": False,
            "notes": "50 scripts × 11 voices across 6 providers; leaderboard ranks by model not voice",
            "metadata": {
                "language_code": LOCALE,
                "scripts_source": "english_scripts_docx.json",
                "model_count": len(MODEL_GROUPS),
                "voice_count": len(VOICE_CONFIGS),
                "script_count": 50,
            },
        },
        "slug",
    )
    run_id = res[0]["id"]

    settings_rows = db.select("site_settings", "select=value&key=eq.voting")
    voting = (settings_rows[0]["value"] if settings_rows else {}) or {}
    runs_by_lang = dict(voting.get("runs_by_language") or {})
    runs_by_lang[LOCALE] = RUN_SLUG
    voting["runs_by_language"] = runs_by_lang

    db.upsert("site_settings", {"key": "voting", "value": voting}, "key")
    print(f"Run ready: {RUN_SLUG} ({run_id})")
    return run_id


def dedupe_generations() -> list[dict]:
    best: dict[tuple[str, str, int], dict] = {}
    rank = {"ok": 3, "skipped_exists": 2, "error": 1}
    for line in JSONL_PATH.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        if r.get("status") not in ("ok", "skipped_exists"):
            continue
        key = (r["model_slug"], r["voice_key"], r["script_no"])
        prev = best.get(key)
        if prev is None or rank.get(r["status"], 0) >= rank.get(prev["status"], 0):
            best[key] = r
    rows = sorted(best.values(), key=lambda x: (x["model_slug"], x["voice_key"], x["script_no"]))
    print(f"Deduplicated {len(rows)} ok generations")
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
        model_slug = r["model_slug"]
        voice_key = r["voice_key"]
        script_no = r["script_no"]
        local = ROOT / r["path"]
        if not local.exists():
            print(f"[{i}/{total}] SKIP missing {local}")
            continue

        model_id = model_ids.get(model_slug)
        script_id = script_by_no.get(script_no)
        if not model_id or not script_id:
            print(f"[{i}/{total}] SKIP missing db ids {model_slug}/{voice_key} #{script_no}")
            continue

        ext = local.suffix.lstrip(".")
        storage_path = f"{LOCALE}/{model_slug}/{voice_key}/en_{script_no:02d}.{ext}"
        mime = normalize_mime(local, mimetypes.guess_type(str(local))[0])
        data = local.read_bytes()
        db.upload("model-clips", storage_path, data, mime)
        url = db.public_url("model-clips", storage_path)

        metadata = {
            k: v
            for k, v in {
                "locale": LOCALE,
                "rank_slug": r.get("rank_slug"),
                "voice_label": r.get("voice_label"),
                "latency_ms": r.get("latency_ms"),
                "estimated_cost_usd": r.get("estimated_cost_usd"),
                "actual_cost_usd": r.get("actual_cost_usd"),
                "generation_id": r.get("generation_id"),
                "provider": r.get("provider"),
                "api_model": r.get("api_model"),
                "input_chars": r.get("input_chars"),
                "timestamp": r.get("timestamp"),
            }.items()
            if v is not None
        }

        db.upsert(
            "model_clips",
            {
                "script_id": script_id,
                "model_id": model_id,
                "run_id": run_id,
                "voice_key": voice_key,
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
        print(f"[{i:3d}/{total}] {100*i/total:5.1f}% | {model_slug}/{voice_key} en_{script_no:02d} | eta {eta:.0f}s")


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

    if not args.upload_only:
        langs = ensure_languages(db)
        seed_scripts(db, langs[LOCALE])
        model_ids = seed_models_and_voices(db)
        run_id = seed_run(db)
    else:
        model_rows = db.select("models", f"select=id,slug&metadata->>locale=eq.{LOCALE}")
        model_ids = {r["slug"]: r["id"] for r in model_rows}
        runs = db.select("runs", f"select=id&slug=eq.{RUN_SLUG}")
        if not runs:
            raise SystemExit(f"Run {RUN_SLUG} not found")
        run_id = runs[0]["id"]

    if not args.skip_upload:
        upload_clips(db, run_id, model_ids)

    print(f"\nDone. Open arena with ?lang={LOCALE}")


if __name__ == "__main__":
    main()
