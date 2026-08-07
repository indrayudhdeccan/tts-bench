import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve the generation run for an arena language tab. */
export async function resolveRunForLanguage(
  supabase: SupabaseClient,
  languageCode: string
): Promise<{ id: string } | null> {
  const { data: byLang } = await supabase
    .from("runs")
    .select("id")
    .eq("metadata->>language_code", languageCode)
    .maybeSingle();

  if (byLang) return byLang;

  const { data: fallback } = await supabase
    .from("runs")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();

  return fallback;
}
