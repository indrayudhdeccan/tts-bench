"use client";

import { useState } from "react";
import { LoadingPanel } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function SettingsAdmin() {
  const { items, loading, reload } = useFetchList<Record<string, unknown>>("/api/admin/config/site_settings");
  const [key, setKey] = useState("branding");
  const [value, setValue] = useState('{"title":"Project Beatles (TTS Bench)"}');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      alert("Invalid JSON");
      return;
    }
    setSaving(true);
    try {
      await fetch("/api/admin/config/site_settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value: parsed }),
      });
      reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">Site settings (JSON)</h1>
        <form onSubmit={save} className="mt-4 space-y-2">
          <input className="input" placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
          <textarea className="input min-h-[120px] font-mono text-xs" value={value} onChange={(e) => setValue(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save setting"}
          </button>
        </form>
      </div>
      <div className="panel">
        {loading ? (
          <LoadingPanel label="Loading site settings…" skeletonRows={2} />
        ) : (
          <pre className="overflow-auto text-xs text-[#8b97ad]">{JSON.stringify(items, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
