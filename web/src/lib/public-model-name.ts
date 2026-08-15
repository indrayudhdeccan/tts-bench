/** Voices stay in admin (`voice_label` / model_voices). Public pages show the model only. */
const TRAILING_VOICE_NAMES = [
  "Harper",
  "Thalia",
  "Rachel",
  "Skylar",
  "Kore",
  "Bella",
  "Tara",
  "Eve",
  "Paul",
];

export function publicModelName(name: string): string {
  let out = name.replace(/\s+Free\b/gi, "").trim();
  for (const voice of TRAILING_VOICE_NAMES) {
    out = out.replace(new RegExp(`\\s+${voice}$`, "i"), "");
  }
  return out.replace(/\s+/g, " ").trim();
}
