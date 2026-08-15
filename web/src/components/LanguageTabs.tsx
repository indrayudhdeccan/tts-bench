"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ARENA_LANGUAGES,
  parseArenaLanguage,
  requestLanguageMailto,
  requestModelMailto,
  arenaLanguageLabel,
} from "@/lib/arena-languages";

export function LanguageTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = parseArenaLanguage(searchParams.get("lang"));

  function selectLanguage(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", code);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="arena-tab-rail sticky top-0 z-20 shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-0">
        {ARENA_LANGUAGES.map((lang) => {
          const isActive = active === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => selectLanguage(lang.code)}
              className={`relative flex items-center gap-2 border-b-2 px-4 py-4 text-sm font-medium transition ${
                isActive
                  ? "border-[#3b82f6] text-[#111827]"
                  : "border-transparent text-[#9ca3af] hover:text-[#374151]"
              }`}
            >
              {lang.label}
              {isActive && <span className="pill-active">active</span>}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <a
            href={requestLanguageMailto()}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[#3b82f6] transition hover:text-[#2563eb]"
          >
            + Request language
          </a>
          <a
            href={requestModelMailto()}
            className="flex items-center gap-1 px-3 py-2 text-sm text-[#3b82f6] transition hover:text-[#2563eb]"
          >
            + Request model
          </a>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-3">
        <p className="text-xs text-[#6b7280]">
          Viewing <span className="font-medium text-[#111827]">{arenaLanguageLabel(active)}</span> bench
        </p>
      </div>
    </div>
  );
}
