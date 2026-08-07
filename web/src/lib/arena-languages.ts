export const ARENA_LANGUAGES = [
  { code: "en-US", label: "English (US)" },
  { code: "en-IN", label: "English (IN)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "te-IN", label: "Telugu" },
] as const;

export type ArenaLanguageCode = (typeof ARENA_LANGUAGES)[number]["code"];

export const DEFAULT_ARENA_LANGUAGE: ArenaLanguageCode = "en-US";
export const REQUEST_LANGUAGE_EMAIL = "indrayudhmandal@teamdeccan.com";

const CODES = new Set<string>(ARENA_LANGUAGES.map((l) => l.code));

export function parseArenaLanguage(value: string | null): ArenaLanguageCode {
  if (value && CODES.has(value)) return value as ArenaLanguageCode;
  return DEFAULT_ARENA_LANGUAGE;
}

export function hrefWithLang(path: string, lang: string, extra?: Record<string, string>) {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("lang", lang);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function requestLanguageMailto() {
  const subject = encodeURIComponent("Request new language for Project Beatles TTS Bench");
  const body = encodeURIComponent(
    "Hi,\n\nI'd like to request the following language be added to the arena:\n\nLanguage:\nReason / use case:\n\nThanks!"
  );
  return `mailto:${REQUEST_LANGUAGE_EMAIL}?subject=${subject}&body=${body}`;
}

export function requestFullDatasetMailto(languageCode: string, sampleCount: number) {
  const label = arenaLanguageLabel(languageCode);
  const subject = encodeURIComponent(`Request full ${label} explore dataset — Project Beatles TTS Bench`);
  const body = encodeURIComponent(
    `Hi,\n\nI'd like access to the full explore dataset for ${label} (${sampleCount} scripts with all model clips).\n\nOrganization / use case:\n\nThanks!`
  );
  return `mailto:${REQUEST_LANGUAGE_EMAIL}?subject=${subject}&body=${body}`;
}

export function arenaLanguageLabel(code: string) {
  return ARENA_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
