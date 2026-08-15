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

/** Keep only matchups where both models are still on the public board. Votes stay in the DB. */
export function restrictWinsToModels(
  mm: { wins: Record<string, Record<string, number>>; totals: Record<string, number> },
  visibleIds: Iterable<string>
) {
  const visible = new Set(visibleIds);
  const wins: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};

  for (const [winner, losers] of Object.entries(mm.wins)) {
    if (!visible.has(winner)) continue;
    for (const [loser, n] of Object.entries(losers)) {
      if (!visible.has(loser) || !n) continue;
      wins[winner] = wins[winner] || {};
      wins[winner][loser] = n;
      totals[winner] = (totals[winner] || 0) + n;
      totals[loser] = (totals[loser] || 0) + n;
    }
  }

  return { wins, totals };
}

const BOOTSTRAP_SAMPLES = 200;

function hashWins(wins: Record<string, Record<string, number>>): number {
  let h = 2166136261;
  for (const [w, losers] of Object.entries(wins)) {
    for (const [l, n] of Object.entries(losers)) {
      const s = `${w}>${l}:${n}`;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    }
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function binomial(n: number, p: number, rng: () => number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  let x = 0;
  for (let i = 0; i < n; i++) {
    if (rng() < p) x += 1;
  }
  return x;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Voice Arena–style 95% CI half-width: 200-resample bootstrap of battles,
 * refit Bradley-Terry each time, (p97.5 − p2.5) / 2.
 * Does not change the published Elo point estimate. Votes are not written.
 */
export function bootstrapEloCi(
  ids: string[],
  wins: Record<string, Record<string, number>>,
  samples = BOOTSTRAP_SAMPLES
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const appearances: Record<string, number> = {};
  for (const id of ids) {
    out[id] = null;
    appearances[id] = 0;
  }

  const pairs: { a: string; b: string; ab: number; ba: number }[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const ab = wins[a]?.[b] || 0;
      const ba = wins[b]?.[a] || 0;
      if (ab + ba <= 0) continue;
      pairs.push({ a, b, ab, ba });
      appearances[a] += ab + ba;
      appearances[b] += ab + ba;
    }
  }
  if (!pairs.length) return out;

  const rng = mulberry32(hashWins(wins) || 1);
  const dist: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));

  for (let s = 0; s < samples; s++) {
    const boot: Record<string, Record<string, number>> = {};
    for (const pair of pairs) {
      const n = pair.ab + pair.ba;
      const ab = binomial(n, pair.ab / n, rng);
      const ba = n - ab;
      if (ab) {
        boot[pair.a] = boot[pair.a] || {};
        boot[pair.a][pair.b] = ab;
      }
      if (ba) {
        boot[pair.b] = boot[pair.b] || {};
        boot[pair.b][pair.a] = ba;
      }
    }
    const elo = computeElo(ids, boot);
    for (const id of ids) dist[id].push(elo[id] ?? 1000);
  }

  for (const id of ids) {
    if (!appearances[id]) continue;
    const xs = dist[id].slice().sort((x, y) => x - y);
    const lo = percentile(xs, 0.025);
    const hi = percentile(xs, 0.975);
    out[id] = Math.max(0, Math.round((hi - lo) / 2));
  }
  return out;
}
