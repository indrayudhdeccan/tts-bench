"use client";

import { useMemo, useState } from "react";
import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

type ModelRow = {
  id: string;
  slug: string;
  name: string;
  provider: string | null;
  voice_label: string | null;
  default_voice: string | null;
  color: string;
  active: boolean;
  sort_order: number;
  metadata: { locale?: string } | null;
  model_voices?: Array<{ label: string; voice_key: string }>;
};

function localeOf(m: ModelRow): string {
  return m.metadata?.locale || "—";
}

export default function AdminModelsPage() {
  const { items, loading, error, reload } = useFetchList<ModelRow>("/api/admin/models");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [langFilter, setLangFilter] = useState("");

  const languages = useMemo(
    () => [...new Set(items.map(localeOf))].filter((c) => c !== "—").sort(),
    [items]
  );
  const filtered = langFilter ? items.filter((m) => localeOf(m) === langFilter) : items;
  const hiddenCount = filtered.filter((m) => !m.active).length;

  async function setActive(m: ModelRow, active: boolean) {
    const action = active ? "restore this model to the leaderboard" : "hide this model from the leaderboard";
    if (
      !confirm(
        active
          ? `Restore ${m.name}? All stored votes and matchups will count again. Elo will recompute immediately.`
          : `Hide ${m.name} from the public leaderboard and arena? Votes are kept. You can restore it anytime.`
      )
    ) {
      return;
    }
    setBusyId(m.id);
    setMsg(null);
    const res = await fetch(`/api/admin/models/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    const j = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setMsg(j.error ? JSON.stringify(j.error) : `Failed to ${action}`);
      return;
    }
    setMsg(
      active
        ? `${m.name} is back on the leaderboard. Elo includes its stored matchups again.`
        : `${m.name} is hidden. Votes are intact; Elo no longer uses its matchups.`
    );
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">TTS models</h1>
        <p className="mt-2 text-sm text-[#8b97ad]">
          Hide a model from the public leaderboard and voting arena without deleting anything. Stored
          votes stay in the database. Restore it later and Elo / head-to-head come back automatically.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="text-sm text-[#8b97ad]">
            Language
            <select
              className="input ml-2 inline-block w-auto"
              value={langFilter}
              onChange={(e) => setLangFilter(e.target.value)}
            >
              <option value="">All</option>
              {languages.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-[#8b97ad]">
            {filtered.length} models
            {hiddenCount ? ` · ${hiddenCount} hidden` : ""}
          </span>
        </div>
        {msg && <p className="mt-3 text-sm text-[#93c5fd]">{msg}</p>}
        {error && <p className="mt-3 text-sm text-[#fca5a5]">{error}</p>}
      </div>

      <div className="panel overflow-x-auto">
        {loading ? (
          <LoadingTableOverlay label="Loading models…" />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Language</th>
                <th>Name</th>
                <th>Slug</th>
                <th>Voices</th>
                <th>Leaderboard</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const voices =
                  m.model_voices?.map((v) => v.label || v.voice_key).filter(Boolean).join(", ") ||
                  m.voice_label ||
                  m.default_voice ||
                  "—";
                return (
                  <tr key={m.id} className={m.active ? "" : "opacity-60"}>
                    <td>
                      <span className="pill">{localeOf(m)}</span>
                    </td>
                    <td>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: m.color }}
                        />
                        {m.name}
                      </span>
                    </td>
                    <td className="font-mono text-xs">{m.slug}</td>
                    <td className="max-w-xs truncate text-xs">{voices}</td>
                    <td>
                      {m.active ? (
                        <span className="pill-active normal-case">On board</span>
                      ) : (
                        <span className="pill normal-case">Hidden</span>
                      )}
                    </td>
                    <td>
                      {m.active ? (
                        <button
                          type="button"
                          className="btn text-xs"
                          disabled={busyId === m.id}
                          onClick={() => setActive(m, false)}
                        >
                          {busyId === m.id ? "Hiding…" : "Hide from leaderboard"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary text-xs"
                          disabled={busyId === m.id}
                          onClick={() => setActive(m, true)}
                        >
                          {busyId === m.id ? "Restoring…" : "Restore to leaderboard"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
