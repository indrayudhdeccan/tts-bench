-- Bengali and Telugu language tabs (scripts/clips can be added later)
INSERT INTO languages (code, name, sort_order) VALUES
  ('bn-IN', 'Bengali (India)', 3),
  ('te-IN', 'Telugu (India)', 4)
ON CONFLICT (code) DO NOTHING;
