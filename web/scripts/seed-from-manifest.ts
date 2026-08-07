/**
 * Seed scripts from ../samples_manifest.json into Supabase.
 *
 * Usage (from web/):
 *   cp .env.example .env.local  # fill in keys
 *   npm install
 *   npm run seed:manifest
 *
 * Optional: upload demo audio from repo:
 *   npm run seed:manifest -- --upload-demo
 */

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";

loadEnvConfig(resolve(__dirname, ".."));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, key);
const uploadDemo = process.argv.includes("--upload-demo");
const root = resolve(__dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "samples_manifest.json"), "utf-8"));

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

async function main() {
  const { data: langs } = await admin.from("languages").select("id, code");
  const langMap = Object.fromEntries((langs || []).map((l) => [l.code, l.id]));

  const { data: domains } = await admin.from("domains").select("id, slug, name");
  const domainMap = Object.fromEntries((domains || []).map((d) => [d.slug, d.id]));

  for (const row of manifest) {
    const langCode = row.language === "hi" ? "hi-IN" : "en-US";
    const language_id = langMap[langCode];
    if (!language_id) continue;

    let domain_id = null;
    if (row.domain) {
      const dslug = slugify(row.domain);
      if (!domainMap[dslug]) {
        const { data: nd } = await admin.from("domains").insert({ slug: dslug, name: row.domain }).select().single();
        if (nd) domainMap[dslug] = nd.id;
      }
      domain_id = domainMap[dslug] || null;
    }

    let speaker_id = null;
    if (row.speaker) {
      const sslug = slugify(row.speaker);
      const { data: sp } = await admin.from("speakers").select("id").eq("slug", sslug).maybeSingle();
      if (sp) speaker_id = sp.id;
      else {
        const { data: ns } = await admin.from("speakers").insert({ slug: sslug, name: row.speaker }).select().single();
        speaker_id = ns?.id ?? null;
      }
    }

    await admin.from("scripts").upsert(
      {
        script_no: row.script_id,
        language_id,
        domain_id,
        speaker_id,
        named_entity: row.named_entity || null,
        text: row.text,
        meaning: row.meaning || null,
        transliteration: row.transliteration || null,
        source_url: row.source_url || null,
        active: true,
      },
      { onConflict: "language_id,script_no" }
    );
  }

  console.log(`Seeded ${manifest.length} scripts from manifest`);

  if (!uploadDemo) return;

  const { data: run } = await admin.from("runs").select("id").eq("slug", "demo-2026").single();
  const { data: models } = await admin.from("models").select("id, slug");
  const modelMap = Object.fromEntries((models || []).map((m) => [m.slug, m.id]));

  const { data: hiScripts } = await admin
    .from("scripts")
    .select("id, script_no")
    .eq("language_id", langMap["hi-IN"]);

  const scriptByNo = Object.fromEntries((hiScripts || []).map((s) => [s.script_no, s.id]));

  // Demo reference + model clips for script 1
  const demoRefs: Record<number, string> = {
    1: "audio/hi_01_Chirag.mp3",
    2: "audio/hi_02_Shubh.wav",
    3: "audio/hi_03_Geetesh.m4a",
    4: "audio/hi_04_Vishrut.mp3",
    5: "audio/hi_05_Akshat.m4a",
    6: "audio/hi_06_Chirag.mp3",
  };

  for (const [no, rel] of Object.entries(demoRefs)) {
    const scriptId = scriptByNo[Number(no)];
    const local = resolve(root, rel);
    if (!scriptId || !existsSync(local)) continue;
    const ext = extname(local).slice(1);
    const storagePath = `hi-IN/hi_${String(no).padStart(2, "0")}.${ext}`;
    const bytes = readFileSync(local);
    await admin.storage.from("references").upload(storagePath, bytes, { upsert: true, contentType: `audio/${ext === "mp3" ? "mpeg" : ext}` });
    const publicUrl = `${url}/storage/v1/object/public/references/${storagePath}`;
    await admin.from("reference_recordings").delete().eq("script_id", scriptId).eq("is_primary", true);
    await admin.from("reference_recordings").insert({
      script_id: scriptId,
      tier: "casual",
      storage_path: storagePath,
      public_url: publicUrl,
      bytes: bytes.length,
      is_primary: true,
      active: true,
    });
    console.log("Uploaded reference", no);
  }

  const demoClips: Record<string, string> = {
    gemini: "outputs/voice_samples/gemini_Kore.wav",
    fish: "outputs/voice_samples/fish_b1a1d760d9604bdb957a56eec3460f1b.mp3",
    mai: "outputs/voice_samples/mai_hi-IN-SwaraNeural.mp3",
    grok: "outputs/voice_samples/grok_eve.mp3",
  };

  const script1 = scriptByNo[1];
  if (run && script1) {
    for (const [slug, rel] of Object.entries(demoClips)) {
      const modelId = modelMap[slug];
      const local = resolve(root, rel);
      if (!modelId || !existsSync(local)) continue;
      const ext = extname(local).slice(1);
      const storagePath = `${slug}/${run.id}/hi_01.${ext}`;
      const bytes = readFileSync(local);
      await admin.storage.from("model-clips").upload(storagePath, bytes, { upsert: true });
      const publicUrl = `${url}/storage/v1/object/public/model-clips/${storagePath}`;
      await admin.from("model_clips").upsert(
        {
          script_id: script1,
          model_id: modelId,
          run_id: run.id,
          storage_path: storagePath,
          public_url: publicUrl,
          bytes: bytes.length,
          status: "ready",
        },
        { onConflict: "script_id,model_id,run_id,voice_key" }
      );
      console.log("Uploaded clip", slug);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
