#!/usr/bin/env python3
"""Verify dataset_payload.js matches parquet and browser viewer loads all rows."""

from __future__ import annotations

import base64
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent
PARQUET = ROOT / "ml_tts_samples_embedded.parquet"
PAYLOAD = ROOT / "dataset_payload.js"
HTML = ROOT / "dataset_viewer.html"
CHROME = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")


def extract_payload_b64() -> bytes:
    text = PAYLOAD.read_text(encoding="utf-8")
    m = re.search(r'window\.EMBEDDED_PARQUET_B64\s*=\s*\[(.*?)\]\.join', text, re.S)
    if not m:
        raise SystemExit("Could not parse EMBEDDED_PARQUET_B64 from dataset_payload.js")
    parts = re.findall(r'"([^"]*)"', m.group(1))
    b64 = "".join(parts)
    return base64.b64decode(b64)


def verify_payload() -> dict:
    if not PAYLOAD.exists():
        raise SystemExit(f"Missing {PAYLOAD} — run: python3 build_viewer_payload.py")

    raw = PARQUET.read_bytes()
    decoded = extract_payload_b64()
    if raw != decoded:
        raise SystemExit(f"Payload mismatch: parquet={len(raw)} bytes, payload={len(decoded)} bytes")

    table = pq.read_table(PARQUET)
    audio_col = table.column("audio")
    with_audio = sum(1 for i in range(table.num_rows) if audio_col[i]["bytes"].as_py())
    langs = {}
    for i in range(table.num_rows):
        lang = table.column("language")[i].as_py()
        langs[lang] = langs.get(lang, 0) + 1

    return {
        "rows": table.num_rows,
        "with_audio": with_audio,
        "languages": langs,
        "payload_mb": PAYLOAD.stat().st_size / (1024 * 1024),
    }


def verify_browser() -> dict:
    if not CHROME.exists():
        return {"skipped": True, "reason": "Chrome not found"}

    script = """
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = { errors: [], logs: [] };
    window.addEventListener('error', (e) => out.errors.push(String(e.message || e)));
    const orig = console.error;
    console.error = (...args) => { out.errors.push(args.map(String).join(' ')); orig(...args); };

    for (let i = 0; i < 180; i++) {
      await sleep(1000);
      const status = document.getElementById('loadStatus')?.textContent || '';
      const cards = document.querySelectorAll('#cards .card').length;
      const stats = document.getElementById('stats')?.textContent || '';
      const controlsHidden = document.getElementById('controlsPanel')?.hidden;
      out.status = status;
      out.cards = cards;
      out.stats = stats;
      out.controlsHidden = controlsHidden;
      if (cards === 100) break;
      if (/failed|error/i.test(status) && i > 5) break;
    }
    return out;
    """

    html_url = HTML.as_uri()
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        out_path = f.name

    cmd = [
        str(CHROME),
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--allow-file-access-from-files",
        f"--virtual-time-budget=200000",
        "--run-all-compositor-stages-before-draw",
        f"--dump-dom={out_path}",
        html_url,
    ]

    # Use Chrome DevTools Protocol via a small inline runner instead — dump-dom won't run async JS long enough.
    # Fall back to a dedicated evaluate script file.
    runner = ROOT / "_viewer_check_runner.html"
    runner.write_text(
        f"""<!DOCTYPE html>
<html><body>
<script>
(async () => {{
  const iframe = document.createElement('iframe');
  iframe.src = {json.dumps(html_url)};
  iframe.style.width = '1px'; iframe.style.height = '1px';
  document.body.appendChild(iframe);
  await new Promise(r => iframe.onload = r);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const result = {{ errors: [] }};
  for (let i = 0; i < 120; i++) {{
    await sleep(1000);
    const doc = iframe.contentDocument;
    if (!doc) continue;
    result.status = doc.getElementById('loadStatus')?.textContent || '';
    result.cards = doc.querySelectorAll('#cards .card').length;
    result.stats = doc.getElementById('stats')?.textContent || '';
    result.controlsHidden = doc.getElementById('controlsPanel')?.hidden;
    result.hint = doc.getElementById('loadHint')?.textContent || '';
    if (result.cards === 100) break;
    if (/failed|error/i.test(result.status) && i > 8) break;
  }}
  document.title = 'RESULT:' + JSON.stringify(result);
}})().catch(e => {{ document.title = 'RESULT:' + JSON.stringify({{ error: String(e) }}); }});
</script>
</body></html>""",
        encoding="utf-8",
    )

    try:
        proc = subprocess.run(
            [
                str(CHROME),
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--allow-file-access-from-files",
                "--virtual-time-budget=130000",
                runner.as_uri(),
            ],
            capture_output=True,
            text=True,
            timeout=140,
        )
        title_match = re.search(r"<title>RESULT:(.*?)</title>", proc.stdout, re.S)
        if not title_match:
            return {
                "skipped": False,
                "ok": False,
                "reason": "Could not read browser result",
                "stdout_tail": proc.stdout[-500:],
                "stderr_tail": proc.stderr[-500:],
            }
        data = json.loads(title_match.group(1))
        data["ok"] = data.get("cards") == 100 and not re.search(
            r"failed|error", data.get("status", ""), re.I
        )
        return data
    finally:
        runner.unlink(missing_ok=True)
        Path(out_path).unlink(missing_ok=True)


def main() -> None:
    print("=== Payload / parquet check ===")
    info = verify_payload()
    print(f"Payload size: {info['payload_mb']:.1f} MB")
    print(f"Rows: {info['rows']}")
    print(f"Rows with audio bytes: {info['with_audio']}")
    print(f"Languages: {info['languages']}")
    assert info["rows"] == 100 and info["with_audio"] == 100

    print("\n=== Browser load check (headless Chrome) ===")
    browser = verify_browser()
    if browser.get("skipped"):
        print(f"Skipped: {browser.get('reason')}")
    else:
        print(json.dumps(browser, indent=2))
        if not browser.get("ok"):
            sys.exit(1)

    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
