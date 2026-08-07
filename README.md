# tts-bench

Blind pairwise TTS evaluation arena — **Next.js** frontend + **Supabase** backend.

## Deploy

The public site lives in [`web/`](web/). Deploy to [Vercel](https://vercel.com) with **Root Directory** set to `web`.

See [ARENA_DEPLOY.md](ARENA_DEPLOY.md) for full setup (Supabase, env vars, admin access).

## Local dev

```bash
cd web
cp .env.example .env.local   # fill Supabase keys
npm install
npm run dev
```

## Batch tooling (local only)

Python scripts in the repo root generate TTS clips and upload to Supabase (`run_english_*.py`, `load_en_*_bench.py`). Audio outputs are gitignored — clips are served from Supabase Storage.
