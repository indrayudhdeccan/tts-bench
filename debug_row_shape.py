#!/usr/bin/env python3
"""Inspect hyparquet row shape in browser."""

from __future__ import annotations

import subprocess
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent


def main() -> None:
    server = subprocess.Popen(
        ["python3", "-m", "http.server", "8765"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1)
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto("http://127.0.0.1:8765/dataset_viewer.html", wait_until="domcontentloaded")

            for _ in range(300):
                ready = page.evaluate("() => !!window.EMBEDDED_PARQUET_B64")
                if ready:
                    break
                time.sleep(1)

            info = page.evaluate(
                """async () => {
                  const mod = await import('https://cdn.jsdelivr.net/npm/hyparquet@1.17.0/src/index.js');
                  const b64 = window.EMBEDDED_PARQUET_B64;
                  const bin = atob(b64);
                  const bytes = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                  const rows = await mod.parquetReadObjects({ file: bytes.buffer, rowFormat: 'object' });
                  const row = rows[0];
                  const audio = row.audio;
                  return {
                    rowCount: rows.length,
                    keys: Object.keys(row),
                    audioType: typeof audio,
                    audioKeys: audio && typeof audio === 'object' ? Object.keys(audio) : null,
                    audioBytesType: audio?.bytes ? Object.prototype.toString.call(audio.bytes) : null,
                    audioBytesLen: audio?.bytes?.length ?? audio?.bytes?.byteLength ?? null,
                    flatBytes: row['audio.bytes'] ? 'yes' : 'no',
                    sample: JSON.stringify(row, (_, v) => {
                      if (v instanceof Uint8Array) return { u8: v.length };
                      if (v instanceof ArrayBuffer) return { ab: v.byteLength };
                      if (Array.isArray(v) && v.length > 20 && typeof v[0] === 'number') return { arr: v.length };
                      return v;
                    }).slice(0, 1200),
                  };
                }"""
            )
            import json

            print(json.dumps(info, indent=2))
            browser.close()
    finally:
        server.terminate()


if __name__ == "__main__":
    main()
