/** Bradley-Terry Elo from pairwise win counts */

export function computeElo(
  ids: string[],
  wins: Record<string, Record<string, number>>,
  base = 1000
): Record<string, number> {
  const strength = Object.fromEntries(ids.map((id) => [id, 1]));

  for (let iter = 0; iter < 80; iter++) {
    for (const i of ids) {
      let winSum = 0;
      let matchSum = 0;
      for (const j of ids) {
        if (i === j) continue;
        const n = (wins[i]?.[j] || 0) + (wins[j]?.[i] || 0);
        if (!n) continue;
        winSum += wins[i]?.[j] || 0;
        matchSum += n * (strength[i] / (strength[i] + strength[j]));
      }
      if (matchSum > 0) strength[i] = Math.max(0.01, strength[i] * (winSum / matchSum));
    }
  }

  const elo: Record<string, number> = {};
  ids.forEach((id) => {
    elo[id] = Math.round(base + 400 * Math.log10(strength[id] || 1));
  });
  return elo;
}

export function winRate(
  wins: Record<string, Record<string, number>>,
  a: string,
  b: string
): number | null {
  const ab = wins[a]?.[b] || 0;
  const ba = wins[b]?.[a] || 0;
  const t = ab + ba;
  return t ? Math.round((ab / t) * 100) : null;
}

export function aggregateWinsFromVotes(
  votes: Array<{
    vote_type: string;
    result: string;
    clip_a_type: string;
    clip_a_model_id: string | null;
    clip_b_type: string;
    clip_b_model_id: string | null;
  }>,
  voteType: string
) {
  const wins: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};

  const add = (w: string, l: string) => {
    if (!w || !l || w === l) return;
    wins[w] = wins[w] || {};
    wins[w][l] = (wins[w][l] || 0) + 1;
    totals[w] = (totals[w] || 0) + 1;
    totals[l] = (totals[l] || 0) + 1;
  };

  for (const v of votes) {
    if (v.vote_type !== voteType) continue;
    if (v.result !== "a" && v.result !== "b") continue;

    if (voteType === "model_vs_model") {
      const a = v.clip_a_model_id;
      const b = v.clip_b_model_id;
      if (!a || !b) continue;
      if (v.result === "a") add(a, b);
      else add(b, a);
    }

    if (voteType === "model_vs_human") {
      const modelId =
        v.clip_a_type === "model" ? v.clip_a_model_id : v.clip_b_model_id;
      if (!modelId) continue;
      const modelWins =
        (v.result === "a" && v.clip_a_type === "model") ||
        (v.result === "b" && v.clip_b_type === "model");
      if (modelWins) add(modelId, "human");
      else add("human", modelId);
    }
  }

  return { wins, totals };
}

/** Build win matrix from aggregated DB view rows (each row has n wins). */
export function aggregateWinsFromMmView(
  rows: Array<{ winner_id: string | null; loser_id: string | null; n: number }>
) {
  const wins: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};

  for (const row of rows) {
    const w = row.winner_id;
    const l = row.loser_id;
    const n = row.n || 0;
    if (!w || !l || w === l || n <= 0) continue;
    wins[w] = wins[w] || {};
    wins[w][l] = (wins[w][l] || 0) + n;
    totals[w] = (totals[w] || 0) + n;
    totals[l] = (totals[l] || 0) + n;
  }

  return { wins, totals };
}
