-- Public leaderboard aggregates (views owned by postgres bypass votes RLS for anon reads).
-- Required for Vercel where SUPABASE_SERVICE_ROLE_KEY may be unset.

CREATE OR REPLACE VIEW v_model_vs_model_wins_by_script AS
SELECT
  v.script_id,
  CASE WHEN v.result = 'a' THEN v.clip_a_model_id WHEN v.result = 'b' THEN v.clip_b_model_id END AS winner_id,
  CASE WHEN v.result = 'a' THEN v.clip_b_model_id WHEN v.result = 'b' THEN v.clip_a_model_id END AS loser_id,
  COUNT(*)::int AS n
FROM votes v
WHERE v.vote_type = 'model_vs_model'
  AND v.result IN ('a', 'b')
  AND v.clip_a_type = 'model'
  AND v.clip_b_type = 'model'
GROUP BY 1, 2, 3;

GRANT SELECT ON v_model_vs_model_wins_by_script TO anon, authenticated;
