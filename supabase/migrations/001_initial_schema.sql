-- Project Beatles (TTS Bench) — full arena schema
-- Run in Supabase SQL Editor or via supabase db push

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE vote_type AS ENUM ('model_vs_model', 'model_vs_human');
CREATE TYPE clip_entity_type AS ENUM ('model', 'human');
CREATE TYPE vote_result AS ENUM ('a', 'b', 'tie', 'both_bad');
CREATE TYPE recording_tier AS ENUM ('casual', 'pro', 'studio');
CREATE TYPE clip_status AS ENUM ('pending', 'ready', 'failed', 'archived');

-- ---------------------------------------------------------------------------
-- Reference / config tables
-- ---------------------------------------------------------------------------
CREATE TABLE languages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,          -- hi-IN, en-US
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE issue_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE speakers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  notes       TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Corpus
-- ---------------------------------------------------------------------------
CREATE TABLE scripts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_no       INT NOT NULL,
  language_id     UUID NOT NULL REFERENCES languages(id) ON DELETE RESTRICT,
  domain_id       UUID REFERENCES domains(id) ON DELETE SET NULL,
  speaker_id      UUID REFERENCES speakers(id) ON DELETE SET NULL,
  named_entity    TEXT,
  text            TEXT NOT NULL,
  meaning         TEXT,
  transliteration TEXT,
  source_url      TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (language_id, script_no)
);

CREATE INDEX idx_scripts_language ON scripts(language_id);
CREATE INDEX idx_scripts_active ON scripts(active) WHERE active = true;

-- ---------------------------------------------------------------------------
-- TTS models
-- ---------------------------------------------------------------------------
CREATE TABLE models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  provider        TEXT NOT NULL,
  api_slug        TEXT,
  default_voice   TEXT,
  voice_label     TEXT,
  color           TEXT NOT NULL DEFAULT '#6ea8fe',
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE model_voices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id    UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  voice_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, voice_key)
);

-- ---------------------------------------------------------------------------
-- Generation runs (reproducibility)
-- ---------------------------------------------------------------------------
CREATE TABLE runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  prompt_policy   TEXT NOT NULL DEFAULT 'text_only_input',
  notes           TEXT,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Audio assets
-- ---------------------------------------------------------------------------
CREATE TABLE reference_recordings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id       UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  speaker_id      UUID REFERENCES speakers(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES runs(id) ON DELETE SET NULL,
  tier            recording_tier NOT NULL DEFAULT 'casual',
  storage_path    TEXT NOT NULL,
  public_url      TEXT,
  mime_type       TEXT,
  bytes           BIGINT,
  duration_ms     INT,
  active          BOOLEAN NOT NULL DEFAULT true,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ref_script ON reference_recordings(script_id);
CREATE INDEX idx_ref_primary ON reference_recordings(script_id, is_primary) WHERE is_primary = true;

CREATE TABLE model_clips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id       UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  model_id        UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  run_id          UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  voice_key       TEXT,
  storage_path    TEXT NOT NULL,
  public_url      TEXT,
  mime_type       TEXT,
  bytes           BIGINT,
  duration_ms     INT,
  status          clip_status NOT NULL DEFAULT 'pending',
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (script_id, model_id, run_id, voice_key)
);

CREATE INDEX idx_clips_script_model ON model_clips(script_id, model_id);
CREATE INDEX idx_clips_run ON model_clips(run_id);
CREATE INDEX idx_clips_ready ON model_clips(status) WHERE status = 'ready';

-- ---------------------------------------------------------------------------
-- Users / profiles
-- ---------------------------------------------------------------------------
CREATE TABLE profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name        TEXT,
  is_admin            BOOLEAN NOT NULL DEFAULT false,
  is_rater            BOOLEAN NOT NULL DEFAULT true,
  native_languages    TEXT[] NOT NULL DEFAULT '{}',
  vote_count          INT NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Votes
-- ---------------------------------------------------------------------------
CREATE TABLE votes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vote_type           vote_type NOT NULL,
  script_id           UUID NOT NULL REFERENCES scripts(id) ON DELETE CASCADE,
  run_id              UUID REFERENCES runs(id) ON DELETE SET NULL,
  clip_a_type         clip_entity_type NOT NULL,
  clip_a_model_id     UUID REFERENCES models(id) ON DELETE SET NULL,
  clip_a_ref_id       UUID REFERENCES reference_recordings(id) ON DELETE SET NULL,
  clip_b_type         clip_entity_type NOT NULL,
  clip_b_model_id     UUID REFERENCES models(id) ON DELETE SET NULL,
  clip_b_ref_id       UUID REFERENCES reference_recordings(id) ON DELETE SET NULL,
  result              vote_result NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT votes_clip_a_consistency CHECK (
    (clip_a_type = 'model' AND clip_a_model_id IS NOT NULL AND clip_a_ref_id IS NULL) OR
    (clip_a_type = 'human' AND clip_a_ref_id IS NOT NULL AND clip_a_model_id IS NULL)
  ),
  CONSTRAINT votes_clip_b_consistency CHECK (
    (clip_b_type = 'model' AND clip_b_model_id IS NOT NULL AND clip_b_ref_id IS NULL) OR
    (clip_b_type = 'human' AND clip_b_ref_id IS NOT NULL AND clip_b_model_id IS NULL)
  )
);

CREATE INDEX idx_votes_user ON votes(user_id);
CREATE INDEX idx_votes_type ON votes(vote_type);
CREATE INDEX idx_votes_script ON votes(script_id);
CREATE INDEX idx_votes_created ON votes(created_at DESC);

CREATE TABLE vote_issue_tags (
  vote_id       UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  side          TEXT NOT NULL CHECK (side IN ('a', 'b')),
  issue_tag_id  UUID NOT NULL REFERENCES issue_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (vote_id, side, issue_tag_id)
);

-- ---------------------------------------------------------------------------
-- Updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'languages','domains','issue_tags','speakers','scripts','models',
    'runs','reference_recordings','model_clips','profiles'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'user'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT ON public.profiles TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Increment vote count on profile
CREATE OR REPLACE FUNCTION increment_profile_vote_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE profiles SET vote_count = vote_count + 1 WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_vote_insert
  AFTER INSERT ON votes
  FOR EACH ROW EXECUTE FUNCTION increment_profile_vote_count();

-- ---------------------------------------------------------------------------
-- Leaderboard views (pairwise wins)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_model_vs_model_wins AS
SELECT
  v.vote_type,
  CASE WHEN v.result = 'a' THEN v.clip_a_model_id WHEN v.result = 'b' THEN v.clip_b_model_id END AS winner_id,
  CASE WHEN v.result = 'a' THEN v.clip_b_model_id WHEN v.result = 'b' THEN v.clip_a_model_id END AS loser_id,
  COUNT(*) AS n
FROM votes v
WHERE v.vote_type = 'model_vs_model'
  AND v.result IN ('a', 'b')
  AND v.clip_a_type = 'model' AND v.clip_b_type = 'model'
GROUP BY 1, 2, 3;

CREATE OR REPLACE VIEW v_model_vs_human_wins AS
SELECT
  v.clip_a_model_id AS model_id,
  SUM(CASE WHEN (v.result = 'a' AND v.clip_a_type = 'model') OR (v.result = 'b' AND v.clip_b_type = 'model') THEN 1 ELSE 0 END) AS model_wins,
  SUM(CASE WHEN (v.result = 'a' AND v.clip_a_type = 'human') OR (v.result = 'b' AND v.clip_b_type = 'human') THEN 1 ELSE 0 END) AS human_wins,
  COUNT(*) AS total
FROM votes v
WHERE v.vote_type = 'model_vs_human'
  AND v.result IN ('a', 'b')
GROUP BY v.clip_a_model_id
UNION ALL
SELECT
  v.clip_b_model_id,
  SUM(CASE WHEN (v.result = 'b' AND v.clip_b_type = 'model') OR (v.result = 'a' AND v.clip_a_type = 'model') THEN 1 ELSE 0 END),
  SUM(CASE WHEN (v.result = 'b' AND v.clip_b_type = 'human') OR (v.result = 'a' AND v.clip_a_type = 'human') THEN 1 ELSE 0 END),
  COUNT(*)
FROM votes v
WHERE v.vote_type = 'model_vs_human'
  AND v.result IN ('a', 'b')
  AND v.clip_b_model_id IS NOT NULL
GROUP BY v.clip_b_model_id;

CREATE OR REPLACE VIEW v_issue_counts_by_model AS
SELECT
  m.id AS model_id,
  m.slug AS model_slug,
  it.slug AS issue_slug,
  it.label AS issue_label,
  COUNT(*) AS n
FROM vote_issue_tags vit
JOIN votes v ON v.id = vit.vote_id
JOIN issue_tags it ON it.id = vit.issue_tag_id
JOIN models m ON m.id = CASE
  WHEN vit.side = 'a' AND v.clip_a_type = 'model' THEN v.clip_a_model_id
  WHEN vit.side = 'b' AND v.clip_b_type = 'model' THEN v.clip_b_model_id
END
WHERE m.id IS NOT NULL
GROUP BY m.id, m.slug, it.slug, it.label;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_voices ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reference_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_issue_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_admin FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Public read for arena content
CREATE POLICY "public read languages" ON languages FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read domains" ON domains FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read issue_tags" ON issue_tags FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read speakers" ON speakers FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read scripts" ON scripts FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read models" ON models FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read model_voices" ON model_voices FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read runs" ON runs FOR SELECT USING (true);
CREATE POLICY "public read references" ON reference_recordings FOR SELECT USING (active = true OR is_admin());
CREATE POLICY "public read clips" ON model_clips FOR SELECT USING (status = 'ready' OR is_admin());
CREATE POLICY "public read site_settings" ON site_settings FOR SELECT USING (true);

-- Profiles
CREATE POLICY "read own profile" ON profiles FOR SELECT USING (auth.uid() = id OR is_admin());
CREATE POLICY "update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Votes: authenticated insert own; admin read all
CREATE POLICY "insert own votes" ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "read own votes" ON votes FOR SELECT USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "insert vote tags via vote" ON vote_issue_tags FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM votes WHERE id = vote_id AND user_id = auth.uid()));
CREATE POLICY "read vote tags" ON vote_issue_tags FOR SELECT USING (is_admin() OR EXISTS (
  SELECT 1 FROM votes WHERE id = vote_id AND user_id = auth.uid()
));

-- Admin full access
CREATE POLICY "admin languages" ON languages FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin domains" ON domains FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin issue_tags" ON issue_tags FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin speakers" ON speakers FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin scripts" ON scripts FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin models" ON models FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin model_voices" ON model_voices FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin runs" ON runs FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin references" ON reference_recordings FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin clips" ON model_clips FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin profiles" ON profiles FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admin site_settings" ON site_settings FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- Storage buckets (run separately in dashboard or via API)
-- references, model-clips
-- ---------------------------------------------------------------------------
