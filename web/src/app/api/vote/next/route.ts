import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/auth";
import type { VotePair, VotePairClip, VoteType } from "@/lib/types";
import { DEFAULT_ARENA_LANGUAGE } from "@/lib/arena-languages";
import { resolveRunForLanguage } from "@/lib/arena-run";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shufflePair<T>(a: T, b: T): [T, T] {
  return Math.random() > 0.5 ? [a, b] : [b, a];
}

type ModelClipRow = {
  model_id: string;
  public_url: string | null;
  storage_path: string;
};

function distinctModelIds(clips: ModelClipRow[]): string[] {
  return [...new Set(clips.map((c) => c.model_id).filter(Boolean))];
}

/** Pick two clips from two uniformly random distinct models (voice chosen at random within each model). */
function pickModelVsModelClips(pool: ModelClipRow[]): [ModelClipRow, ModelClipRow] | null {
  const byModel = new Map<string, ModelClipRow[]>();
  for (const clip of pool) {
    if (!clip.model_id) continue;
    const list = byModel.get(clip.model_id) || [];
    list.push(clip);
    byModel.set(clip.model_id, list);
  }

  const modelIds = [...byModel.keys()];
  if (modelIds.length < 2) return null;

  const modelA = pick(modelIds);
  const otherModels = modelIds.filter((id) => id !== modelA);
  const modelB = pick(otherModels);

  return [pick(byModel.get(modelA)!), pick(byModel.get(modelB)!)];
}

function clipToVoteSide(clip: ModelClipRow): VotePairClip {
  return {
    type: "model",
    model_id: clip.model_id,
    audio_url: clip.public_url || publicStorageUrl(clip.storage_path, "model-clips"),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const voteType = (searchParams.get("vote_type") || "model_vs_model") as VoteType;
  const languageCode = searchParams.get("language") || DEFAULT_ARENA_LANGUAGE;

  const supabase = await createClient();

  const { data: lang } = await supabase
    .from("languages")
    .select("id")
    .eq("code", languageCode)
    .single();
  if (!lang) return NextResponse.json({ error: "Language not found" }, { status: 404 });

  const run = await resolveRunForLanguage(supabase, languageCode);
  const runId = run?.id;
  if (!runId) {
    return NextResponse.json(
      { error: `No generation run configured for ${languageCode}` },
      { status: 404 }
    );
  }

  const { data: scripts } = await supabase
    .from("scripts")
    .select("*, languages(*), domains(*), speakers(*)")
    .eq("language_id", lang.id)
    .eq("active", true);

  if (!scripts?.length) return NextResponse.json({ error: "No scripts" }, { status: 404 });

  const { data: models } = await supabase.from("models").select("*").eq("active", true);
  if (!models?.length) return NextResponse.json({ error: "No models" }, { status: 404 });

  // Scripts that have required clips for this vote type
  const eligible: typeof scripts = [];

  for (const script of scripts) {
    const { data: clips } = await supabase
      .from("model_clips")
      .select("*, models(*)")
      .eq("script_id", script.id)
      .eq("run_id", runId)
      .eq("status", "ready");

    const { data: refs } = await supabase
      .from("reference_recordings")
      .select("*")
      .eq("script_id", script.id)
      .eq("active", true)
      .order("is_primary", { ascending: false });

    const readyClips = clips || [];
    const primaryRef = refs?.[0];

    if (voteType === "model_vs_model" && distinctModelIds(readyClips).length >= 2) {
      eligible.push(script);
    }
    if (voteType === "model_vs_human" && primaryRef && readyClips.length >= 1) {
      eligible.push(script);
    }
  }

  if (!eligible.length) {
    return NextResponse.json(
      { error: "No eligible script pairs — upload clips in admin first" },
      { status: 404 }
    );
  }

  const script = pick(eligible);

  const { data: clips } = await supabase
    .from("model_clips")
    .select("*, models(*)")
    .eq("script_id", script.id)
    .eq("run_id", runId)
    .eq("status", "ready");

  const { data: refs } = await supabase
    .from("reference_recordings")
    .select("*")
    .eq("script_id", script.id)
    .eq("active", true)
    .order("is_primary", { ascending: false });

  const primaryRef = refs?.[0];

  if (voteType === "model_vs_model") {
    const pool = (clips || []) as ModelClipRow[];
    const picked = pickModelVsModelClips(pool);
    if (!picked) {
      return NextResponse.json({ error: "Need 2 models with clips on this script" }, { status: 404 });
    }

    const [ca, cb] = shufflePair(...picked);

    const pair: VotePair = {
      vote_type: voteType,
      script,
      run_id: runId,
      clip_a: clipToVoteSide(ca),
      clip_b: clipToVoteSide(cb),
    } as VotePair & { run_id: string };

    return NextResponse.json(pair);
  }

  // model_vs_human
  const mc = pick(clips || []);
  if (!primaryRef) return NextResponse.json({ error: "No reference" }, { status: 404 });

  const humanClip = {
    type: "human" as const,
    ref_id: primaryRef.id,
    audio_url: primaryRef.public_url || publicStorageUrl(primaryRef.storage_path, "references"),
  };
  const modelClip = {
    type: "model" as const,
    model_id: mc.model_id,
    audio_url: mc.public_url || publicStorageUrl(mc.storage_path, "model-clips"),
  };

  const [clip_a, clip_b] = shufflePair<VotePairClip>(humanClip, modelClip);

  return NextResponse.json({
    vote_type: voteType,
    script,
    run_id: runId,
    clip_a,
    clip_b,
  });
}
