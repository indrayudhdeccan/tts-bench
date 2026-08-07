"use client";

import { useCallback, useEffect, useState } from "react";
import { useArenaLanguage } from "@/hooks/useArenaLanguage";
import { arenaLanguageLabel, requestLanguageMailto } from "@/lib/arena-languages";
import { HUMAN_COMPARE_UI_ENABLED } from "@/lib/arena-features";
import { LoadingBar, LoadingPanel } from "@/components/LoadingBar";
import type { IssueTag, VotePair } from "@/lib/types";

const VOTE_TYPE = "model_vs_model" as const;

export default function VotePageClient() {
  const lang = useArenaLanguage();
  const [pair, setPair] = useState<(VotePair & { run_id?: string }) | null>(null);
  const [issueTags, setIssueTags] = useState<IssueTag[]>([]);
  const [tagsA, setTagsA] = useState<string[]>([]);
  const [tagsB, setTagsB] = useState<string[]>([]);
  const [reveal, setReveal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadPair = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReveal(null);
    setTagsA([]);
    setTagsB([]);
    setPair(null);
    try {
      const r = await fetch(
        `/api/vote/next?vote_type=${VOTE_TYPE}&language=${encodeURIComponent(lang)}`
      );
      const j = await r.json();
      if (!r.ok) {
        setError(j.error || "Failed to load pair");
        return;
      }
      setPair(j);
    } catch {
      setError("Failed to load pair — check your connection");
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    fetch("/api/issue-tags")
      .then((r) => r.json())
      .then((d) => setIssueTags(d.tags || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPair();
  }, [loadPair]);

  async function submit(result: "a" | "b" | "tie" | "both_bad") {
    if (!pair || submitting) return;
    setSubmitting(true);
    const body = {
      vote_type: pair.vote_type,
      script_id: pair.script.id,
      run_id: pair.run_id,
      clip_a_type: pair.clip_a.type,
      clip_a_model_id: pair.clip_a.model_id ?? null,
      clip_a_ref_id: pair.clip_a.ref_id ?? null,
      clip_b_type: pair.clip_b.type,
      clip_b_model_id: pair.clip_b.model_id ?? null,
      clip_b_ref_id: pair.clip_b.ref_id ?? null,
      result,
      tags_a: tagsA,
      tags_b: tagsB,
    };
    try {
      const r = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json();
        setError(j.error || "Vote failed");
        return;
      }
      setReveal(`Vote recorded (${result}). Loading next pair…`);
      setLoading(true);
      setPair(null);
      setTimeout(loadPair, 1200);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = loading || submitting;

  return (
    <>
      {busy && <LoadingBar fixed />}
      <div className="panel">
        <p className="tag-line mb-2">// Pairwise vote</p>
        <h2 className="text-lg font-semibold">Which sounds more natural?</h2>
        <p className="mb-4 text-sm text-[#6b7280]">{arenaLanguageLabel(lang)} bench</p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-primary">
            Rank models
          </button>
          {!HUMAN_COMPARE_UI_ENABLED ? (
            <button type="button" className="btn cursor-not-allowed opacity-60" disabled title="Coming soon">
              Compare to human
              <span className="pill-active ml-2 normal-case">Coming soon</span>
            </button>
          ) : (
            <button type="button" className="btn btn-human">
              Compare to human
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] p-4">
            <p className="text-[#dc2626]">{typeof error === "string" ? error : JSON.stringify(error)}</p>
            {typeof error === "string" && error.includes("No eligible") && (
              <p className="mt-2 text-sm text-[#6b7280]">
                No clips for {arenaLanguageLabel(lang)} yet.{" "}
                <a href={requestLanguageMailto()} className="text-[#2563eb] hover:underline">
                  Request this language
                </a>{" "}
                or upload data in admin.
              </p>
            )}
          </div>
        )}

        {loading && !pair && (
          <LoadingPanel
            label={`Loading ${arenaLanguageLabel(lang)} vote pair…`}
            detail="Fetching scripts, models, and audio clips"
            skeletonRows={4}
          />
        )}

        {pair && !loading && (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="pill">{pair.script.domains?.name || "General"}</span>
              <span className="pill">{pair.script.named_entity || "—"}</span>
              <span className="pill">Script #{pair.script.script_no}</span>
            </div>
            <div className="mb-5 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4 text-lg leading-relaxed">
              {pair.script.text}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {(["a", "b"] as const).map((side) => {
                const clip = side === "a" ? pair.clip_a : pair.clip_b;
                const tags = side === "a" ? tagsA : tagsB;
                const setTags = side === "a" ? setTagsA : setTagsB;
                return (
                  <div key={side} className="rounded-xl border border-[#e5e7eb] bg-white p-4 shadow-sm">
                    <div className="mb-2 font-bold uppercase tracking-wide text-[#111827]">
                      Clip {side.toUpperCase()}
                    </div>
                    <p className="mb-3 text-xs text-[#6b7280]">Blind — identity hidden</p>
                    <audio controls className="mb-4 w-full" src={clip.audio_url} />
                    <div className="border-t border-[#e5e7eb] pt-3">
                      <p className="mb-2 text-xs font-bold uppercase text-[#6b7280]">
                        Issues with clip {side.toUpperCase()}
                      </p>
                      <div className="space-y-2">
                        {issueTags.map((t) => (
                          <label key={t.id} className="flex gap-2 text-sm text-[#374151]">
                            <input
                              type="checkbox"
                              checked={tags.includes(t.id)}
                              onChange={(e) =>
                                setTags(e.target.checked ? [...tags, t.id] : tags.filter((x) => x !== t.id))
                              }
                            />
                            {t.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => submit("a")}>
                A sounds better
              </button>
              <button type="button" className="btn" disabled={submitting} onClick={() => submit("tie")}>
                Tie
              </button>
              <button type="button" className="btn btn-primary" disabled={submitting} onClick={() => submit("b")}>
                B sounds better
              </button>
              <button type="button" className="btn" disabled={submitting} onClick={() => submit("both_bad")}>
                Both bad
              </button>
            </div>
          </>
        )}

        {submitting && (
          <p className="mt-4 text-center text-sm text-[#6b7280]">Submitting vote…</p>
        )}
        {reveal && !loading && <p className="mt-4 text-center text-[#6b7280]">{reveal}</p>}
      </div>
    </>
  );
}
