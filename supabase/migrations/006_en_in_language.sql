-- English (India) tab — scripts/clips added separately from en-US bench
INSERT INTO languages (code, name, sort_order) VALUES
  ('en-IN', 'English (India)', 2)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Tag legacy Hindi demo run
UPDATE runs SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"language_code":"hi-IN"}'::jsonb
WHERE slug = 'demo-2026';
