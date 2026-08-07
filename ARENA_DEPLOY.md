# Project Beatles (TTS Bench) — Production Arena

Full-stack TTS evaluation arena: **Next.js (Vercel)** + **Supabase (Auth, Postgres, Storage)**.

## What you get

| Public | Admin (`/admin`, requires `is_admin`) |
|---|---|
| Leaderboard (live Elo) | Scripts / transcripts CRUD |
| Vote (model vs model, vs human) | Models CRUD |
| Explore samples + audio | Upload human references |
| Methodology | Upload model clips per run |
| Sign up / sign in | Runs, languages, domains, speakers |
| | Issue tags, users, votes export, site settings |

## Your input required

1. **Supabase project** (free): https://supabase.com/dashboard  
2. **Vercel project** (free): https://vercel.com  
3. **Environment variables** (see `web/.env.example`)

---

## 1. Supabase setup

### Create project
- New project → note **Project URL** and **API keys**

### Run migrations (SQL Editor, in order)
```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_seed_demo.sql
supabase/migrations/003_storage.sql
```

Or use Supabase CLI:
```bash
cd supabase && supabase link && supabase db push
```

### Enable Auth
- Authentication → Providers → Email (enable)
- Optional: Google/GitHub OAuth

### Storage buckets
Migrations create `references` and `model-clips` (public read, admin write).

---

## 2. Local dev

```bash
cd web
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

npm install
npm run dev
```

Open http://localhost:3000

---

## 3. Make yourself admin

1. Sign up at `/login`
2. Supabase → Authentication → Users → copy your **User UUID**
3. SQL Editor:
```sql
UPDATE profiles SET is_admin = true WHERE id = 'YOUR-USER-UUID';
```

---

## 4. Seed corpus + demo audio

```bash
cd web
npm run seed:manifest              # 100 scripts from samples_manifest.json
npm run seed:manifest -- --upload-demo   # + upload hi_01-06 refs + 4 model clips
```

Or push clips manually:
```bash
pip install supabase
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

python push_clips.py --references --dir audio --pattern 'hi_0*.mp3'
python push_clips.py --run demo-2026 --model gemini --dir outputs/voice_samples --pattern 'gemini_*.wav'
```

---

## 5. Deploy to Vercel

```bash
cd web
npx vercel
```

Set env vars in Vercel dashboard (same as `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` → your Vercel URL

**Root directory:** set Vercel project root to `web/`

### Supabase Auth redirect URLs
Add your Vercel URL to:
- Authentication → URL Configuration → Site URL
- Redirect URLs: `https://your-app.vercel.app/**`

---

## Database design (summary)

```
languages ─┬─ scripts ─┬─ reference_recordings (human)
domains ───┘           └─ model_clips ─── models
speakers ──┘                    └── runs
issue_tags ← vote_issue_tags ← votes ← profiles ← auth.users
```

- **Two vote tracks:** `model_vs_model` → Elo; `model_vs_human` → separate win %
- **Per-clip issue tags** on votes
- **RLS:** public read corpus; users insert own votes; admin full write
- **Runs:** versioned TTS generations for reproducibility

---

## Repo layout

```
tts_bench/
  supabase/migrations/     # Postgres schema + RLS + storage
  web/                     # Next.js app (deploy this to Vercel)
  push_clips.py            # CLI upload audio → Supabase
  samples_manifest.json    # Source corpus
  arena_standalone.html    # Offline demo (legacy)
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Vote page: no pairs | Upload model clips + references for default run in admin |
| Admin 403 | Set `is_admin = true` on your profile |
| Audio 404 | Check storage bucket public + `public_url` on clip rows |
| Auth redirect loop | Add site URL in Supabase auth settings |

---

## Next steps (optional)

- Hindi batch TTS → `push_clips.py` for all 50×4 clips
- Pro human re-reads → upload as `tier = pro` references
- OAuth providers in Supabase
- Custom domain on Vercel
