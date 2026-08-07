-- Seed data for Project Beatles (TTS Bench)
-- Safe to re-run: uses ON CONFLICT

INSERT INTO languages (code, name, sort_order) VALUES
  ('hi-IN', 'Hindi (India)', 1),
  ('en-US', 'English (US)', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO domains (slug, name, sort_order) VALUES
  ('cinema', 'Cinema', 1),
  ('music-pop', 'Music/Pop', 2),
  ('rap', 'Rap', 3),
  ('classical-music', 'Classical Music', 4),
  ('sports', 'Sports', 5),
  ('science-acronym', 'Science (Acronym)', 6),
  ('music', 'Music', 10),
  ('business', 'Business', 11),
  ('politics', 'Politics', 12),
  ('monument', 'Monument', 13),
  ('chef', 'Chef', 14),
  ('acronym', 'Acronym', 15),
  ('pop', 'Pop', 16),
  ('literature', 'Literature', 17),
  ('science', 'Science', 18),
  ('general', 'General', 99)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO issue_tags (slug, label, sort_order) VALUES
  ('mispronunciation', 'Mispronunciation (name/entity)', 1),
  ('unnatural', 'Unnatural prosody', 2),
  ('robotic', 'Robotic / metallic', 3),
  ('codeswitch', 'Code-switch error (English bit)', 4),
  ('emotion', 'Emotion mismatch', 5),
  ('glitch', 'Cut-off / glitch', 6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO speakers (slug, name) VALUES
  ('chirag', 'Chirag'),
  ('shubh', 'Shubh'),
  ('geetesh', 'Geetesh'),
  ('vishrut', 'Vishrut'),
  ('akshat', 'Akshat')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO models (slug, name, provider, api_slug, default_voice, voice_label, color, sort_order) VALUES
  ('gemini', 'Gemini 3.1 Flash TTS', 'Google', 'google/gemini-3.1-flash-tts-preview', 'Kore', 'Kore — balanced, clear', '#4285f4', 1),
  ('fish', 'Fish S2.1 Pro Free', 'Fish Audio', 'fish-audio/s2.1-pro-free:free', 'b1a1d760d9604bdb957a56eec3460f1b', 'Indian Lady — female, clear Indian accent', '#22c55e', 2),
  ('mai', 'MAI-Voice-2', 'Microsoft', 'microsoft/mai-voice-2', 'hi-IN-SwaraNeural', 'Swara — Hindi female', '#0078d4', 3),
  ('grok', 'Grok Voice TTS 1.0', 'xAI', 'x-ai/grok-voice-tts-1.0', 'eve', 'Eve — female', '#a855f7', 4)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO runs (slug, name, prompt_policy, is_default, notes) VALUES
  ('demo-2026', 'Demo run (prototype)', 'Input = Hindi script text only (no metadata wrapping)', true, 'Initial arena demo clips')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO site_settings (key, value) VALUES
  ('branding', '{"title":"Project Beatles (TTS Bench)","subtitle":"Hindi TTS arena · blind pairwise eval","banner":"Vote to rank models or compare TTS vs human reference."}'::jsonb),
  ('voting', '{"require_auth":true,"default_run_slug":"demo-2026","default_language_code":"hi-IN"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Hindi script #1 (demo complete) — add via seed script from manifest for all 50 later
