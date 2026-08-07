#!/usr/bin/env python3
"""Build a static HTML viewer: audio files + text + metadata. No runtime loading."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent
PARQUET = ROOT / "ml_tts_samples_embedded.parquet"
AUDIO_DIR = ROOT / "audio"
OUT_HTML = ROOT / "dataset_viewer.html"


def detect_ext(data: bytes, path: str) -> str:
    ext = (Path(path).suffix or "").lower().lstrip(".")
    if ext in {"wav", "mp3", "m4a", "flac", "ogg", "webm", "aac"}:
        return ext

    if len(data) >= 4 and data[:4] == b"RIFF":
        return "wav"
    if len(data) >= 3 and data[:3] == b"ID3":
        return "mp3"
    if len(data) >= 2 and data[0] == 0xFF and data[1] in {0xFB, 0xF3, 0xF2, 0xF1, 0xF9}:
        return "aac" if data[1] in {0xF1, 0xF9} else "mp3"
    if len(data) >= 8 and data[4:8] == b"ftyp":
        return "m4a"
    if len(data) >= 4 and data[:4] == b"OggS":
        return "ogg"
    return ext or "bin"


def load_rows() -> list[dict]:
    table = pq.read_table(PARQUET)
    rows = []
    audio_col = table.column("audio")
    for i in range(table.num_rows):
        audio = audio_col[i].as_py()
        blob = audio["bytes"] or b""
        path = audio["path"] or f"sample_{i}.bin"
        ext = detect_ext(blob, path)
        stem = Path(path).stem
        filename = f"{stem}.{ext}"
        rows.append(
            {
                "script_id": int(table.column("script_id")[i].as_py()),
                "language": table.column("language")[i].as_py(),
                "speaker": table.column("speaker")[i].as_py(),
                "domain": table.column("domain")[i].as_py() or "",
                "named_entity": table.column("named_entity")[i].as_py() or "",
                "text": table.column("text")[i].as_py() or "",
                "transliteration": table.column("transliteration")[i].as_py() or "",
                "meaning": table.column("meaning")[i].as_py() or "",
                "source_url": table.column("source_url")[i].as_py() or "",
                "audio_filename": filename,
                "audio_bytes": blob,
            }
        )
    rows.sort(key=lambda r: (r["language"], r["script_id"], r["speaker"]))
    return rows


def render_card(row: dict) -> str:
    lang = html.escape(row["language"])
    speaker = html.escape(row["speaker"])
    domain = html.escape(row["domain"])
    text = html.escape(row["text"])
    entity = html.escape(row["named_entity"])
    translit = html.escape(row["transliteration"])
    meaning = html.escape(row["meaning"])
    src = html.escape(row["source_url"])
    audio = html.escape(row["audio_filename"])
    q = html.escape(
        " ".join(
            filter(
                None,
                [
                    row["text"],
                    row["transliteration"],
                    row["meaning"],
                    row["speaker"],
                    row["domain"],
                    row["named_entity"],
                    str(row["script_id"]),
                ],
            )
        ).lower()
    )

    meta = []
    if row["named_entity"]:
        meta.append(f'<div class="meta-row"><div class="label">Named entity</div><div class="value">{entity}</div></div>')
    if row["transliteration"] and row["transliteration"] != "(Original is in English)":
        meta.append(f'<div class="meta-row"><div class="label">Transliteration</div><div class="value">{translit}</div></div>')
    if row["meaning"] and row["meaning"] != row["text"]:
        meta.append(f'<div class="meta-row"><div class="label">Meaning</div><div class="value">{meaning}</div></div>')
    if row["source_url"]:
        meta.append(
            f'<div class="meta-row"><div class="label">Source</div><div class="value">'
            f'<a href="{src}" target="_blank" rel="noopener">Google Drive</a></div></div>'
        )

    domain_pill = f'<span class="pill">{domain}</span>' if row["domain"] else ""

    return f"""
    <article class="card" data-lang="{lang}" data-speaker="{speaker}" data-domain="{domain}" data-search="{q}">
      <div>
        <div class="card-head">
          <span class="badge {lang}">{lang}</span>
          <span class="pill">#{row["script_id"]}</span>
          <span class="pill">{speaker}</span>
          {domain_pill}
        </div>
        <p class="script-text">{text}</p>
        <div class="meta-grid">{"".join(meta)}</div>
      </div>
      <div class="audio-box">
        <div class="filename">{audio}</div>
        <audio controls preload="metadata" src="audio/{audio}"></audio>
      </div>
    </article>"""


def render_html(rows: list[dict]) -> str:
    langs = sorted({r["language"] for r in rows})
    speakers = sorted({r["speaker"] for r in rows})
    domains = sorted({r["domain"] for r in rows if r["domain"]})
    en = sum(1 for r in rows if r["language"] == "en")
    hi = sum(1 for r in rows if r["language"] == "hi")
    cards = "\n".join(render_card(r) for r in rows)

    lang_opts = "".join(f'<option value="{html.escape(l)}">{html.escape(l)}</option>' for l in langs)
    speaker_opts = "".join(f'<option value="{html.escape(s)}">{html.escape(s)}</option>' for s in speakers)
    domain_opts = "".join(f'<option value="{html.escape(d)}">{html.escape(d)}</option>' for d in domains)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>ML-TTS Dataset Viewer</title>
  <style>
    :root {{
      --bg: #0f1117; --surface: #171a22; --surface-2: #1e2330; --border: #2a3142;
      --text: #e8ecf4; --muted: #93a0b8; --accent: #6ea8fe; --en: #3dd68c; --hi: #ff8f6b;
      --radius: 14px;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: radial-gradient(circle at top, #171d2b 0%, var(--bg) 45%);
      color: var(--text);
      min-height: 100vh;
    }}
    .wrap {{ max-width: 1200px; margin: 0 auto; padding: 24px 20px 48px; }}
    h1 {{ margin: 0; font-size: 1.75rem; }}
    .subtitle {{ color: var(--muted); margin-top: 6px; }}
    .panel {{
      background: rgba(23, 26, 34, 0.92); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 18px; margin-bottom: 18px;
    }}
    .toolbar {{
      display: grid; grid-template-columns: 1.4fr repeat(3, minmax(120px, 0.6fr)) auto;
      gap: 10px; align-items: center;
    }}
    @media (max-width: 900px) {{ .toolbar {{ grid-template-columns: 1fr 1fr; }} }}
    input, select, button {{
      font: inherit; border-radius: 10px; border: 1px solid var(--border);
      background: var(--surface-2); color: var(--text); padding: 10px 12px;
    }}
    button.secondary {{ cursor: pointer; font-weight: 500; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }}
    .stat {{
      background: var(--surface-2); border: 1px solid var(--border);
      border-radius: 999px; padding: 6px 12px; font-size: 0.85rem; color: var(--muted);
    }}
    .stat b {{ color: var(--text); }}
    .cards {{ display: grid; gap: 14px; }}
    .card {{
      background: rgba(23, 26, 34, 0.92); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px 18px;
      display: grid; grid-template-columns: 1fr 320px; gap: 16px; align-items: start;
    }}
    @media (max-width: 860px) {{ .card {{ grid-template-columns: 1fr; }} }}
    .card.hidden {{ display: none; }}
    .card-head {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }}
    .badge {{
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 4px 8px; border-radius: 999px; border: 1px solid transparent;
    }}
    .badge.en {{ color: var(--en); background: rgba(61, 214, 140, 0.12); border-color: rgba(61, 214, 140, 0.25); }}
    .badge.hi {{ color: var(--hi); background: rgba(255, 143, 107, 0.12); border-color: rgba(255, 143, 107, 0.25); }}
    .pill {{
      font-size: 0.78rem; color: var(--muted); background: var(--surface-2);
      border: 1px solid var(--border); border-radius: 999px; padding: 4px 8px;
    }}
    .script-text {{ font-size: 1.02rem; line-height: 1.55; margin: 0 0 12px; }}
    .meta-grid {{ display: grid; gap: 8px; font-size: 0.88rem; }}
    .meta-row {{ display: grid; grid-template-columns: 110px 1fr; gap: 8px; }}
    .meta-row .label {{ color: var(--muted); }}
    .meta-row .value {{ color: #d7deed; word-break: break-word; }}
    .meta-row a {{ color: var(--accent); }}
    .audio-box {{ background: var(--surface-2); border: 1px solid var(--border); border-radius: 12px; padding: 12px; }}
    .audio-box .filename {{ font-size: 0.78rem; color: var(--muted); margin-bottom: 8px; word-break: break-all; }}
    audio {{ width: 100%; height: 36px; }}
    .empty {{ text-align: center; color: var(--muted); padding: 40px 16px; display: none; }}
    .empty.show {{ display: block; }}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>ML-TTS Dataset Viewer</h1>
      <div class="subtitle">{len(rows)} samples · {en} English · {hi} Hindi · open this file locally, no loading step</div>
    </header>

    <section class="panel">
      <div class="toolbar">
        <input id="search" type="search" placeholder="Search text, speaker, entity, domain…" />
        <select id="langFilter"><option value="">All languages</option>{lang_opts}</select>
        <select id="speakerFilter"><option value="">All speakers</option>{speaker_opts}</select>
        <select id="domainFilter"><option value="">All domains</option>{domain_opts}</select>
        <button type="button" class="secondary" id="clearFilters">Clear</button>
      </div>
      <div class="stats" id="stats">
        <div class="stat"><b>{len(rows)}</b> shown / {len(rows)} total</div>
        <div class="stat"><b>{en}</b> English</div>
        <div class="stat"><b>{hi}</b> Hindi</div>
      </div>
    </section>

    <section class="cards" id="cards">{cards}</section>
    <div class="empty" id="emptyState">No samples match the current filters.</div>
  </div>

  <script>
    const cards = [...document.querySelectorAll(".card")];
    const searchEl = document.getElementById("search");
    const langFilter = document.getElementById("langFilter");
    const speakerFilter = document.getElementById("speakerFilter");
    const domainFilter = document.getElementById("domainFilter");
    const statsEl = document.getElementById("stats");
    const emptyState = document.getElementById("emptyState");

    function applyFilters() {{
      const q = searchEl.value.trim().toLowerCase();
      const lang = langFilter.value;
      const speaker = speakerFilter.value;
      const domain = domainFilter.value;
      let shown = 0;
      let en = 0;
      let hi = 0;

      for (const card of cards) {{
        const ok =
          (!lang || card.dataset.lang === lang) &&
          (!speaker || card.dataset.speaker === speaker) &&
          (!domain || card.dataset.domain === domain) &&
          (!q || card.dataset.search.includes(q));
        card.classList.toggle("hidden", !ok);
        if (ok) {{
          shown += 1;
          if (card.dataset.lang === "en") en += 1;
          if (card.dataset.lang === "hi") hi += 1;
        }}
      }}

      statsEl.innerHTML = `
        <div class="stat"><b>${{shown}}</b> shown / {len(rows)} total</div>
        <div class="stat"><b>${{en}}</b> English</div>
        <div class="stat"><b>${{hi}}</b> Hindi</div>
      `;
      emptyState.classList.toggle("show", shown === 0);
    }}

    [searchEl, langFilter, speakerFilter, domainFilter].forEach((el) => {{
      el.addEventListener("input", applyFilters);
      el.addEventListener("change", applyFilters);
    }});
    document.getElementById("clearFilters").addEventListener("click", () => {{
      searchEl.value = "";
      langFilter.value = "";
      speakerFilter.value = "";
      domainFilter.value = "";
      applyFilters();
    }});
  </script>
</body>
</html>"""


def main() -> None:
    if not PARQUET.exists():
        raise SystemExit(f"Missing {PARQUET}")

    rows = load_rows()
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)

    for row in rows:
        out = AUDIO_DIR / row["audio_filename"]
        out.write_bytes(row["audio_bytes"])

    OUT_HTML.write_text(render_html(rows), encoding="utf-8")
    print(f"Wrote {len(rows)} audio files to {AUDIO_DIR}/")
    print(f"Wrote {OUT_HTML} ({OUT_HTML.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
