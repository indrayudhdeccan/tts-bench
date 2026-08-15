/** Prefer models with fewer language-scoped matchups so new voices catch up. */

export function matchupWeight(n: number): number {
  const count = Number.isFinite(n) && n > 0 ? n : 0;
  return 1 / (count + 1);
}

export function pickUniform<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function weightedPick<T>(items: T[], weights: number[]): T {
  if (items.length === 0) {
    throw new Error("weightedPick requires at least one item");
  }
  if (items.length === 1) return items[0];

  let total = 0;
  const safe = weights.map((w) => {
    const v = Number.isFinite(w) && w > 0 ? w : 0;
    total += v;
    return v;
  });

  if (total <= 0) return pickUniform(items);

  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= safe[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function pickTwoDistinctModels(
  modelIds: string[],
  counts: Record<string, number> = {}
): [string, string] | null {
  if (modelIds.length < 2) return null;

  const weights = modelIds.map((id) => matchupWeight(counts[id] || 0));
  const modelA = weightedPick(modelIds, weights);
  const others = modelIds.filter((id) => id !== modelA);
  const weightsB = others.map((id) => matchupWeight(counts[id] || 0));
  const modelB = weightedPick(others, weightsB);
  return [modelA, modelB];
}

/** Two clips from two distinct models; voice/clip stays random within each model. */
export function pickModelVsModelClips<T extends { model_id: string }>(
  pool: T[],
  counts: Record<string, number> = {}
): [T, T] | null {
  const byModel = new Map<string, T[]>();
  for (const clip of pool) {
    if (!clip.model_id) continue;
    const list = byModel.get(clip.model_id) || [];
    list.push(clip);
    byModel.set(clip.model_id, list);
  }

  const picked = pickTwoDistinctModels([...byModel.keys()], counts);
  if (!picked) return null;

  const [idA, idB] = picked;
  return [pickUniform(byModel.get(idA)!), pickUniform(byModel.get(idB)!)];
}

/** One clip, preferring models with fewer matchups. Voice/clip stays random within the model. */
export function pickModelClipByMatchups<T extends { model_id: string }>(
  pool: T[],
  counts: Record<string, number> = {}
): T | null {
  const byModel = new Map<string, T[]>();
  for (const clip of pool) {
    if (!clip.model_id) continue;
    const list = byModel.get(clip.model_id) || [];
    list.push(clip);
    byModel.set(clip.model_id, list);
  }

  const modelIds = [...byModel.keys()];
  if (!modelIds.length) return null;

  const id = weightedPick(
    modelIds,
    modelIds.map((modelId) => matchupWeight(counts[modelId] || 0))
  );
  return pickUniform(byModel.get(id)!);
}
