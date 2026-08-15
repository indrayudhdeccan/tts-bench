import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicStorageUrl } from "@/lib/auth";
import { DEFAULT_ARENA_LANGUAGE } from "@/lib/arena-languages";
import { resolveRunForLanguage } from "@/lib/arena-run";
import { publicModelName } from "@/lib/public-model-name";

function relationName(rel: unknown): string | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as { name?: string } | undefined)?.name ?? null;
  return (rel as { name?: string }).name ?? null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const languageCode = searchParams.get("language") || DEFAULT_ARENA_LANGUAGE;

  const supabase = await createClient();
  const { data: lang } = await supabase.from("languages").select("id").eq("code", languageCode).single();
  if (!lang) return NextResponse.json({ scripts: [] });

  const run = await resolveRunForLanguage(supabase, languageCode);

  const { data: scripts } = await supabase
    .from("scripts")
    .select("id, script_no, text, named_entity, domains(name), speakers(name)")
    .eq("language_id", lang.id)
    .eq("active", true)
    .order("script_no");

  const voiceLabelByKey = new Map<string, string>();
  if (run?.id) {
    const { data: voiceRows } = await supabase.from("model_voices").select("model_id, voice_key, label");
    for (const v of voiceRows || []) {
      voiceLabelByKey.set(`${v.model_id}:${v.voice_key}`, v.label as string);
    }
  }

  const out = [];
  for (const s of scripts || []) {
    const { data: refs } = await supabase
      .from("reference_recordings")
      .select("*")
      .eq("script_id", s.id)
      .eq("active", true);

    const { data: clips } = run?.id
      ? await supabase
          .from("model_clips")
          .select("*, models!inner(slug, name, color, active)")
          .eq("script_id", s.id)
          .eq("run_id", run.id)
          .eq("status", "ready")
          .eq("models.active", true)
      : { data: [] };

    out.push({
      id: s.id,
      script_no: s.script_no,
      text: s.text,
      named_entity: s.named_entity,
      domain_name: relationName(s.domains),
      speaker_name: relationName(s.speakers),
      references: (refs || []).map((r) => ({
        id: r.id,
        label: `Human · ${r.tier}`,
        tier: r.tier,
        audio_url: r.public_url || publicStorageUrl(r.storage_path, "references"),
      })),
      clips: (clips || []).map((c) => {
        const modelId = c.model_id as string;
        const voiceKey = (c.voice_key as string | null) || "";
        const voiceLabel =
          voiceLabelByKey.get(`${modelId}:${voiceKey}`) ||
          (c.metadata as { voice_label?: string } | null)?.voice_label ||
          voiceKey ||
          null;
        return {
          id: c.id,
          model_slug: (c.models as { slug: string }).slug,
          model_name: publicModelName((c.models as { name: string }).name),
          color: (c.models as { color: string }).color,
          voice_key: voiceKey || null,
          voice_label: voiceLabel,
          status: c.status,
          audio_url: c.public_url || publicStorageUrl(c.storage_path, "model-clips"),
        };
      }),
    });
  }

  return NextResponse.json({ scripts: out });
}
