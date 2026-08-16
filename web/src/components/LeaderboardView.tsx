"use client";

import { useEffect, useMemo, useState } from "react";
import { useArenaLanguage } from "@/hooks/useArenaLanguage";
import { arenaLanguageLabel } from "@/lib/arena-languages";
import { HUMAN_COMPARE_UI_ENABLED } from "@/lib/arena-features";
import { LoadingBar, LoadingPanel } from "@/components/LoadingBar";
import type { LeaderboardData } from "@/lib/types";

type Dir = "asc" | "desc";
type MainKey = "rank" | "name" | "elo" | "ci" | "matchups" | "ttfa";
type LatKey = "name" | "p50" | "range" | "span" | "silence";

function SortTh<K extends string>({
  label,
  col,
  sortKey,
  dir,
  onSort,
}: {
  label: string;
  col: K;
  sortKey: K;
  dir: Dir;
  onSort: (col: K) => void;
}) {
  const active = sortKey === col;
  return (
    <th>
      <button type="button" className="sort" data-active={active} onClick={() => onSort(col)}>
        {label}
        <span aria-hidden>{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </th>
  );
}

function cmpNum(a: number | null | undefined, b: number | null | undefined, dir: Dir) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

function ms(n: number | null | undefined) {
  return n == null ? "—" : `${n} ms`;
}

export function LeaderboardView() {
  const lang = useArenaLanguage();
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mainKey, setMainKey] = useState<MainKey>("elo");
  const [mainDir, setMainDir] = useState<Dir>("desc");
  const [latKey, setLatKey] = useState<LatKey>("p50");
  const [latDir, setLatDir] = useState<Dir>("asc");

  useEffect(() => {
    setLoading(true);
    setData(null);
    setMainKey("elo");
    setMainDir("desc");
    setLatKey("p50");
    setLatDir("asc");
    fetch(`/api/leaderboard?language=${encodeURIComponent(lang)}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [lang]);

  const ranked = useMemo(() => {
    if (!data?.models) return [];
    return data.models.map((m, i) => ({ ...m, place: i + 1 }));
  }, [data]);

  const mainRows = useMemo(() => {
    const rows = [...ranked];
    rows.sort((a, b) => {
      if (mainKey === "name") {
        const n = a.name.localeCompare(b.name);
        return mainDir === "asc" ? n : -n;
      }
      if (mainKey === "rank") return cmpNum(a.place, b.place, mainDir);
      if (mainKey === "elo") return cmpNum(a.elo, b.elo, mainDir);
      if (mainKey === "ci") {
        const aw = a.ci ? a.ci.plus + a.ci.minus : null;
        const bw = b.ci ? b.ci.plus + b.ci.minus : null;
        return cmpNum(aw, bw, mainDir);
      }
      if (mainKey === "matchups") return cmpNum(a.matchups, b.matchups, mainDir);
      return cmpNum(a.ttfa?.p50, b.ttfa?.p50, mainDir);
    });
    return rows;
  }, [ranked, mainKey, mainDir]);

  const latencyRows = useMemo(() => {
    const rows = ranked.filter((m) => m.ttfa);
    rows.sort((a, b) => {
      if (latKey === "name") {
        const n = a.name.localeCompare(b.name);
        return latDir === "asc" ? n : -n;
      }
      if (latKey === "p50") return cmpNum(a.ttfa?.p50, b.ttfa?.p50, latDir);
      if (latKey === "range") return cmpNum(a.ttfa?.range, b.ttfa?.range, latDir);
      if (latKey === "span") return cmpNum(a.ttfa?.max, b.ttfa?.max, latDir);
      return cmpNum(a.ttfa?.silence, b.ttfa?.silence, latDir);
    });
    return rows;
  }, [ranked, latKey, latDir]);

  function toggleMain(col: MainKey) {
    if (mainKey === col) setMainDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setMainKey(col);
      setMainDir(col === "name" || col === "ttfa" || col === "rank" ? "asc" : "desc");
    }
  }

  function toggleLat(col: LatKey) {
    if (latKey === col) setLatDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setLatKey(col);
      setLatDir(col === "name" ? "asc" : "asc");
    }
  }

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
                <SortTh label="#" col="rank" sortKey={mainKey} dir={mainDir} onSort={toggleMain} />
                <SortTh label="Model" col="name" sortKey={mainKey} dir={mainDir} onSort={toggleMain} />
                <SortTh label="Elo" col="elo" sortKey={mainKey} dir={mainDir} onSort={toggleMain} />
                <SortTh label="95% CI" col="ci" sortKey={mainKey} dir={mainDir} onSort={toggleMain} />
                <th>Bar</th>
                <SortTh label="Matchups" col="matchups" sortKey={mainKey} dir={mainDir} onSort={toggleMain} />
                <SortTh label="TTFA (P50)" col="ttfa" sortKey={mainKey} dir={mainDir} onSort={toggleMain} />
              </tr>
            </thead>
            <tbody>
              {mainRows.map((m) => {
                const pct = maxElo === minElo ? 50 : ((m.elo - minElo) / (maxElo - minElo)) * 100;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap tabular-nums">
                      {m.rankLo != null && m.rankHi != null && m.rankLo !== m.rankHi
                        ? `${m.place}(${m.rankLo}–${m.rankHi})`
                        : m.place}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                        <div className="font-medium">{m.name}</div>
                      </div>
                    </td>
                    <td className="text-lg font-bold tabular-nums">{m.elo}</td>
                    <td className="whitespace-nowrap text-[#6b7280] tabular-nums">
                      {m.ci == null ? "—" : `[+${m.ci.plus}, -${m.ci.minus}]`}
                    </td>
                    <td>
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#f3f4f6]">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: m.color }} />
                      </div>
                    </td>
                    <td>{m.matchups}</td>
                    <td className="whitespace-nowrap tabular-nums">{ms(m.ttfa?.p50)}</td>
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
        <h2 className="text-lg font-semibold">Latency</h2>
        <p className="mb-4 text-sm text-[#6b7280]">
          Perceived time-to-first-audio from 5 scripts. P50 is the usual wait. P25–P75 is how jumpy
          that wait is. Min–max is best vs worst. Silence is hush at the start of the clip.
        </p>
        {latencyRows.length ? (
          <div className="overflow-x-auto">
            <table className="data">
              <thead>
                <tr>
                  <SortTh label="Model" col="name" sortKey={latKey} dir={latDir} onSort={toggleLat} />
                  <SortTh label="TTFA (P50)" col="p50" sortKey={latKey} dir={latDir} onSort={toggleLat} />
                  <SortTh label="P25–P75" col="range" sortKey={latKey} dir={latDir} onSort={toggleLat} />
                  <SortTh label="Min–max" col="span" sortKey={latKey} dir={latDir} onSort={toggleLat} />
                  <SortTh label="Silence" col="silence" sortKey={latKey} dir={latDir} onSort={toggleLat} />
                </tr>
              </thead>
              <tbody>
                {latencyRows.map((m) => {
                  const t = m.ttfa!;
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                          <div className="font-medium">{m.name}</div>
                        </div>
                      </td>
                      <td className="tabular-nums font-semibold">{ms(t.p50)}</td>
                      <td className="whitespace-nowrap tabular-nums">
                        {t.p25}–{t.p75} ms
                        <span className="ml-1 text-[#6b7280]">({t.range})</span>
                      </td>
                      <td className="whitespace-nowrap tabular-nums">
                        {t.min}–{t.max} ms
                      </td>
                      <td className="tabular-nums">{ms(t.silence)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[#6b7280]">No TTFA probe for {arenaLanguageLabel(lang)} yet.</p>
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
