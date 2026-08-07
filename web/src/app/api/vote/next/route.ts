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

    if (voteType === "model_vs_model" && readyClips.length >= 2) {
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
    const pool = clips || [];
    if (pool.length < 2) return NextResponse.json({ error: "Not enough clips" }, { status: 404 });
    let ca = pick(pool);
    let cb = pick(pool);
    let tries = 0;
    while (ca.model_id === cb.model_id && tries++ < 20) cb = pick(pool);
    if (ca.model_id === cb.model_id) return NextResponse.json({ error: "Need 2 models" }, { status: 404 });

    [ca, cb] = shufflePair(ca, cb);

    const pair: VotePair = {
      vote_type: voteType,
      script,
      run_id: runId,
      clip_a: {
        type: "model",
        model_id: ca.model_id,
        audio_url: ca.public_url || publicStorageUrl(ca.storage_path, "model-clips"),
      },
      clip_b: {
        type: "model",
        model_id: cb.model_id,
        audio_url: cb.public_url || publicStorageUrl(cb.storage_path, "model-clips"),
      },
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
