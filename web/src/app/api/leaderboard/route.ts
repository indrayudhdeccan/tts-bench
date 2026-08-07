import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  aggregateWinsFromMmView,
  aggregateWinsFromVotes,
  computeElo,
  winRate,
} from "@/lib/elo";
import type { LeaderboardData } from "@/lib/types";

import { DEFAULT_ARENA_LANGUAGE } from "@/lib/arena-languages";
import { resolveRunForLanguage } from "@/lib/arena-run";

async function loadModelVsModelWins(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scriptIds: string[]
) {
  if (!scriptIds.length) {
    return { wins: {}, totals: {} };
  }

  // Preferred: public aggregate view filtered by script (migration 007).
  const { data: viewRows, error: viewErr } = await supabase
    .from("v_model_vs_model_wins_by_script")
    .select("winner_id, loser_id, n")
    .in("script_id", scriptIds);

  if (!viewErr) {
    return aggregateWinsFromMmView(viewRows || []);
  }

  // Migration 007 not applied yet — legacy global view (anon-readable, all languages combined).
  const { data: globalRows, error: globalErr } = await supabase
    .from("v_model_vs_model_wins")
    .select("winner_id, loser_id, n");

  if (!globalErr && globalRows?.length) {
    return aggregateWinsFromMmView(globalRows);
  }

  // Last resort: service role votes table.
  try {
    const admin = createServiceClient();
    const { data: votes } = await admin
      .from("votes")
      .select(
        "vote_type, result, clip_a_type, clip_a_model_id, clip_b_type, clip_b_model_id, script_id"
      )
      .in("script_id", scriptIds);
    return aggregateWinsFromVotes(votes || [], "model_vs_model");
  } catch {
    return { wins: {}, totals: {} };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get("language") || DEFAULT_ARENA_LANGUAGE;

  const supabase = await createClient();

  const { data: lang } = await supabase.from("languages").select("id").eq("code", languageCode).single();
  if (!lang) {
    return NextResponse.json({ models: [], h2h: {}, vsHuman: [], issueCounts: {} });
  }

  const { data: scripts } = await supabase.from("scripts").select("id").eq("language_id", lang.id);
  const scriptIds = (scripts || []).map((s) => s.id);

  const run = await resolveRunForLanguage(supabase, languageCode);
  let benchModelIds: string[] = [];
  if (run && scriptIds.length) {
    const { data: clipRows } = await supabase
      .from("model_clips")
      .select("model_id")
      .eq("run_id", run.id)
      .eq("status", "ready")
      .in("script_id", scriptIds);
    benchModelIds = [...new Set((clipRows || []).map((c) => c.model_id as string))];
  }

  const [{ data: allModels }, mm, { data: issueRows }] = await Promise.all([
    supabase.from("models").select("*").eq("active", true).order("sort_order"),
    loadModelVsModelWins(supabase, scriptIds),
    supabase.from("v_issue_counts_by_model").select("*"),
  ]);

  const models =
    benchModelIds.length > 0
      ? (allModels || []).filter((m) => benchModelIds.includes(m.id))
      : allModels || [];

  if (!models.length) {
    return NextResponse.json({ models: [], h2h: {}, vsHuman: [], issueCounts: {} });
  }

  const modelIds = models.map((m) => m.id);

  const { data: voiceRows } = await supabase
    .from("model_voices")
    .select("model_id, voice_key, label, is_default")
    .in("model_id", modelIds)
    .eq("active", true)
    .order("is_default", { ascending: false });

  const voicesByModel = new Map<string, Array<{ voice_key: string; label: string }>>();
  for (const v of voiceRows || []) {
    const list = voicesByModel.get(v.model_id as string) || [];
    list.push({ voice_key: v.voice_key as string, label: v.label as string });
    voicesByModel.set(v.model_id as string, list);
  }

  const mh = { wins: {} as Record<string, Record<string, number>>, totals: {} as Record<string, number> };
  const eloMap = computeElo(modelIds, mm.wins);

  const ranked = models
    .map((m) => ({
      id: m.id,
      slug: m.slug,
      name: m.name,
      color: m.color,
      voice_label: m.voice_label,
      voices: voicesByModel.get(m.id) || [],
      elo: eloMap[m.id] ?? 1000,
      ci: Math.round(40 + 120 / Math.sqrt((mm.totals[m.id] || 0) + 1)),
      matchups: mm.totals[m.id] || 0,
    }))
    .sort((a, b) => b.elo - a.elo);

  const h2h: Record<string, Record<string, number | null>> = {};
  for (const a of models) {
    h2h[a.slug] = {};
    for (const b of models) {
      h2h[a.slug][b.slug] = a.id === b.id ? null : winRate(mm.wins, a.id, b.id);
    }
  }

  const vsHuman = models.map((m) => ({
    model_id: m.id,
    slug: m.slug,
    name: m.name,
    color: m.color,
    model_wins_pct: winRate(mh.wins, m.id, "human"),
    human_wins_pct: winRate(mh.wins, "human", m.id),
    total: mh.totals[m.id] || 0,
  }));

  const issueCounts: Record<string, Record<string, number>> = {};
  for (const row of issueRows || []) {
    const slug = row.model_slug as string;
    issueCounts[slug] = issueCounts[slug] || {};
    issueCounts[slug][row.issue_slug as string] = row.n as number;
  }

  const payload: LeaderboardData = { models: ranked, h2h, vsHuman, issueCounts };
  return NextResponse.json(payload);
}
