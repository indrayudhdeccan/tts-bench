"use client";

import { useEffect, useState } from "react";
import { useArenaLanguage } from "@/hooks/useArenaLanguage";
import {
  arenaLanguageLabel,
  requestFullDatasetMailto,
  requestLanguageMailto,
} from "@/lib/arena-languages";
import { LoadingBar, LoadingCardGrid, LoadingPanel } from "@/components/LoadingBar";

interface ExploreScript {
  id: string;
  script_no: number;
  text: string;
  named_entity: string | null;
  domain_name: string | null;
  speaker_name: string | null;
  references: { id: string; label: string; audio_url: string; tier: string }[];
  clips: {
    id: string;
    model_slug: string;
    model_name: string;
    color: string;
    voice_key?: string | null;
    voice_label?: string | null;
    audio_url: string;
    status: string;
  }[];
}

function ExploreScriptCard({ script, preview }: { script: ExploreScript; preview: boolean }) {
  return (
    <article
      className={`panel relative flex flex-col overflow-hidden ${preview ? "" : "select-none"}`}
      aria-hidden={preview ? undefined : true}
    >
      {!preview && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/40 backdrop-blur-[6px]">
          <span className="rounded-full border border-[#e5e7eb] bg-white/90 px-3 py-1 text-xs font-medium text-[#6b7280] shadow-sm">
            Preview locked
          </span>
        </div>
      )}
      <div className={preview ? "" : "pointer-events-none blur-[5px]"}>
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#dbeafe] text-sm font-bold text-[#2563eb]">
            {script.script_no}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1">
              <span className="pill">{script.domain_name || "General"}</span>
              {script.named_entity && <span className="pill">{script.named_entity}</span>}
            </div>
          </div>
        </div>
        <p className="mb-4 flex-1 text-sm leading-relaxed text-[#374151]">{script.text}</p>
        <div className="space-y-2 border-t border-[#f3f4f6] pt-3">
          {preview &&
            script.references.map((r) => (
              <div key={r.id} className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-2">
                <h4 className="mb-1 text-xs font-medium text-[#047857]">{r.label}</h4>
                <audio controls className="h-8 w-full" src={r.audio_url} />
              </div>
            ))}
          {preview &&
            script.clips.map((c) => (
              <div key={c.id} className="rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-2">
                <h4 className="mb-1 flex flex-col gap-0.5 text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.model_name}
                  </span>
                  {c.voice_label && (
                    <span className="pl-4 font-normal text-[#6b7280]">{c.voice_label}</span>
                  )}
                </h4>
                <audio controls className="h-8 w-full" src={c.audio_url} />
              </div>
            ))}
          {!preview && (
            <p className="py-6 text-center text-xs text-[#9ca3af]">
              {script.clips.length + script.references.length} audio clips
            </p>
          )}
          {preview && !script.references.length && !script.clips.length && (
            <p className="text-xs text-[#9ca3af]">No audio uploaded yet</p>
          )}
        </div>
      </div>
    </article>
  );
}

export function ExploreView() {
  const lang = useArenaLanguage();
  const [items, setItems] = useState<ExploreScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLoading(true);
    setItems([]);
    fetch(`/api/explore?language=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then((d) => setItems(d.scripts || []))
      .finally(() => setLoading(false));
  }, [lang]);

  const filtered = items.filter((s) => {
    if (!q) return true;
    const hay = `${s.text} ${s.named_entity} ${s.speaker_name}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const totalSamples = items.length;
  const lockedCount = Math.max(0, filtered.length - 1);

  return (
    <>
      {loading && <LoadingBar fixed />}
      <input
        className="input mb-4 max-w-md"
        placeholder={`Search ${arenaLanguageLabel(lang)} scripts…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        disabled={loading}
      />
      {loading && (
        <>
          <LoadingPanel
            label={`Loading ${arenaLanguageLabel(lang)} explore…`}
            detail="This can take a moment — fetching all scripts and model clips"
            skeletonRows={0}
            className="mb-4"
          />
          <LoadingCardGrid count={6} />
        </>
      )}
      {!loading && filtered.length === 0 && (
        <div className="panel text-sm text-[#6b7280]">
          No {arenaLanguageLabel(lang)} samples yet.{" "}
          <a href={requestLanguageMailto()} className="text-[#2563eb] hover:underline">
            Request this language
          </a>
        </div>
      )}
      {!loading && filtered.length > 0 && (
        <>
          <div className="panel mb-4 flex flex-wrap items-center justify-between gap-3 border-[#dbeafe] bg-[#eff6ff]">
            <div>
              <p className="text-sm font-medium text-[#1e40af]">
                Preview mode — 1 of {totalSamples} samples visible
              </p>
              <p className="text-xs text-[#3b82f6]">
                All {totalSamples} scripts are loaded; the rest are blurred until you request full access.
              </p>
            </div>
            <a
              href={requestFullDatasetMailto(lang, totalSamples)}
              className="btn btn-primary shrink-0"
            >
              Request full dataset
            </a>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s, i) => (
              <ExploreScriptCard key={s.id} script={s} preview={i === 0} />
            ))}
          </div>

          {lockedCount > 0 && (
            <div className="panel mt-6 text-center">
              <p className="mb-1 text-sm font-medium text-[#111827]">
                {lockedCount} more sample{lockedCount === 1 ? "" : "s"} in this dataset
              </p>
              <p className="mb-4 text-sm text-[#6b7280]">
                Get the complete {arenaLanguageLabel(lang)} corpus with every script and model clip.
              </p>
              <a href={requestFullDatasetMailto(lang, totalSamples)} className="btn btn-primary">
                Request full dataset
              </a>
            </div>
          )}
        </>
      )}
    </>
  );
}
