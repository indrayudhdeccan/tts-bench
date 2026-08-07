#!/usr/bin/env python3
"""Browser test: dataset viewer loads all 100 samples."""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
HTML = ROOT / "dataset_viewer.html"
PAYLOAD = ROOT / "dataset_payload.js"


def wait_loaded(page, timeout_ms=240_000) -> dict:
    deadline = time.time() + timeout_ms / 1000
    last = {}
    while time.time() < deadline:
        last = page.evaluate(
            """() => ({
              status: document.getElementById('loadStatus')?.textContent || '',
              hint: document.getElementById('loadHint')?.textContent || '',
              cards: document.querySelectorAll('#cards .card').length,
              audios: document.querySelectorAll('#cards audio').length,
              stats: document.getElementById('stats')?.textContent || '',
              controlsHidden: document.getElementById('controlsPanel')?.hidden ?? true,
              hasPayload: !!window.EMBEDDED_PARQUET_B64,
            })"""
        )
        if last.get("cards") == 100:
            return last
        if "failed" in last.get("status", "").lower() and last.get("cards", 0) == 0:
            break
        time.sleep(1)
    return last


def main() -> None:
    if not PAYLOAD.exists():
        raise SystemExit("Missing dataset_payload.js — run: python3 build_viewer_payload.py")

    server = subprocess.Popen(
        ["python3", "-m", "http.server", "8765"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1)

    results = {}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            for label, url in [
                ("file", HTML.as_uri()),
                ("http", "http://127.0.0.1:8765/dataset_viewer.html"),
            ]:
                page = browser.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=120_000)
                info = wait_loaded(page)
                results[label] = info
                page.close()

            browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)

    for label, info in results.items():
        print(f"\n=== {label}:// ===")
        for k, v in info.items():
            print(f"  {k}: {v}")

    ok = all(r.get("cards") == 100 and r.get("audios") == 100 for r in results.values())
    if not ok:
        raise SystemExit(1)
    print("\nPASS: 100 cards + 100 audio players on file:// and http://")


if __name__ == "__main__":
    main()
