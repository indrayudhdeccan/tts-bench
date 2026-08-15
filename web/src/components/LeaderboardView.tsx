"use client";

import { useEffect, useState } from "react";
import { useArenaLanguage } from "@/hooks/useArenaLanguage";
import { arenaLanguageLabel } from "@/lib/arena-languages";
import { HUMAN_COMPARE_UI_ENABLED } from "@/lib/arena-features";
import { LoadingBar, LoadingPanel } from "@/components/LoadingBar";
import type { LeaderboardData } from "@/lib/types";

export function LeaderboardView() {
  const lang = useArenaLanguage();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/leaderboard?language=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [lang]);

  if (loading) {
    return (
      <>
        <LoadingBar fixed />
        <LoadingPanel
          label={`Loading ${arenaLanguageLabel(lang)} leaderboard…`}
          detail="Computing Elo rankings and head-to-head stats"
          skeletonRows={6}
        />
      </>
    );
  }

  if (!data?.models?.length) {
    return (
      <div className="panel">
        <p>No model rankings for {arenaLanguageLabel(lang)} yet. Cast votes or upload clips in admin.</p>
      </div>
    );
  }

  const maxElo = data.models[0]?.elo ?? 1100;
  const minElo = data.models[data.models.length - 1]?.elo ?? 900;

  return (
    <div className="space-y-5">
      <section className="panel">
        <h2 className="text-lg font-semibold">Model leaderboard</h2>
        <p className="mb-4 text-sm text-[#6b7280]">
          {arenaLanguageLabel(lang)} · Elo from model-vs-model votes only
        </p>
        <div className="overflow-x-auto">
          <table className="data">
            <thead>
              <tr>
                <th>#</th>
                <th>Model</th>
                <th>Elo</th>
                <th>±CI</th>
                <th>Bar</th>
                <th>Matchups</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m, i) => {
                const pct = maxElo === minElo ? 50 : ((m.elo - minElo) / (maxElo - minElo)) * 100;
                return (
                  <tr key={m.id}>
                    <td>{i + 1}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                        <div className="font-medium">{m.name}</div>
                      </div>
                    </td>
                    <td className="text-lg font-bold tabular-nums">{m.elo}</td>
                    <td className="text-[#6b7280]">±{m.ci}</td>
                    <td>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#f3f4f6]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                      </div>
                    </td>
                    <td>{m.matchups}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold">Head-to-head</h2>
        <div className="overflow-x-auto">
          <table className="data text-center">
            <thead>
              <tr>
                <th />
                {data.models.map((m) => (
                  <th key={m.id} className="max-w-[8rem] truncate" title={m.name}>
                    {m.slug.replace(/-en-in$/, "").replace(/-/g, " ")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.models.map((row) => (
                <tr key={row.id}>
                  <th className="text-left">{row.slug}</th>
                  {data.models.map((col) => {
                    const v = data.h2h[row.slug]?.[col.slug];
                    if (row.slug === col.slug) return <td key={col.id}>—</td>;
                    if (v === null || v === undefined) return <td key={col.id}>—</td>;
                    return (
                      <td key={col.id} className={v >= 50 ? "text-[#059669]" : "text-[#dc2626]"}>
                        {v}%
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold">Vs human reference</h2>
        {!HUMAN_COMPARE_UI_ENABLED ? (
          <p className="text-sm text-[#6b7280]">
            Compare-to-human voting is <span className="pill-active normal-case">Coming soon</span>. Model-vs-model
            rankings are live above.
          </p>
        ) : (
          <div className="space-y-3">
            {data.vsHuman.map((h) => (
              <div key={h.model_id} className="flex flex-wrap items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} />
                <span className="min-w-[140px] flex-1">{h.name}</span>
                <div className="h-2 max-w-xs flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${h.model_wins_pct ?? 0}%`, background: h.color }}
                  />
                </div>
                <span className="font-bold tabular-nums">{h.model_wins_pct ?? "—"}%</span>
                <span className="text-xs text-[#6b7280]">{h.total} matchups</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 className="text-lg font-semibold">Issue tags by model</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {data.models.map((m) => {
            const tags = data.issueCounts[m.slug] || {};
            const entries = Object.entries(tags).sort((a, b) => b[1] - a[1]);
            return (
              <div key={m.id} className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
                <h3 className="mb-2 flex items-center gap-2 font-medium">
                  <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </h3>
                {entries.length ? (
                  entries.map(([slug, n]) => (
                    <div key={slug} className="flex justify-between text-sm text-[#6b7280]">
                      <span>{slug}</span>
                      <span className="font-semibold text-[#111827]">{n}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[#6b7280]">No issues tagged yet</p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
