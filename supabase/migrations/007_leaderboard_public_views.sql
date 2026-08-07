-- Public leaderboard: anon/authenticated can read aggregate vote stats (no raw vote rows).
-- SECURITY DEFINER RPC bypasses votes RLS safely — returns counts only.

CREATE OR REPLACE FUNCTION public.leaderboard_mm_wins(p_script_ids uuid[])
RETURNS TABLE(winner_id uuid, loser_id uuid, n integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN v.result = 'a' THEN v.clip_a_model_id WHEN v.result = 'b' THEN v.clip_b_model_id END,
    CASE WHEN v.result = 'a' THEN v.clip_b_model_id WHEN v.result = 'b' THEN v.clip_a_model_id END,
    COUNT(*)::integer
  FROM votes v
  WHERE v.vote_type = 'model_vs_model'
    AND v.result IN ('a', 'b')
    AND v.clip_a_type = 'model'
    AND v.clip_b_type = 'model'
    AND v.script_id = ANY(p_script_ids)
  GROUP BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_mm_wins(uuid[]) TO anon, authenticated;

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

GRANT SELECT ON v_model_vs_model_wins TO anon, authenticated;
GRANT SELECT ON v_model_vs_model_wins_by_script TO anon, authenticated;
GRANT SELECT ON v_issue_counts_by_model TO anon, authenticated;
