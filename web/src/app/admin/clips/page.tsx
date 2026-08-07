"use client";

import { useEffect, useState } from "react";
import { adminUpload, useAdminMeta } from "@/components/admin/useAdminMeta";
import { LoadingBar, LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function AdminClipsPage() {
  const { meta, loading: metaLoading } = useAdminMeta();
  const { items, loading, reload } = useFetchList<Record<string, unknown>>("/api/admin/clips");
  const { items: scriptRows, loading: scriptsLoading } = useFetchList<Record<string, unknown>>("/api/admin/scripts");
  const scriptOptions = scriptRows.map((s) => ({
    id: String(s.id),
    script_no: Number(s.script_no),
    text: String(s.text),
  }));
  const [scriptId, setScriptId] = useState("");
  const [modelId, setModelId] = useState("");
  const [runId, setRunId] = useState("");
  const [voiceKey, setVoiceKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (meta?.runs[0] && !runId) setRunId(meta.runs.find((r) => r.slug === "demo-2026")?.id || meta.runs[0].id);
    if (meta?.models[0] && !modelId) setModelId(meta.models[0].id);
  }, [meta, runId, modelId]);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !scriptId || !modelId || !runId) return;
    setUploading(true);
    try {
      const script = scriptOptions.find((s) => s.id === scriptId);
      const model = meta?.models.find((m) => m.id === modelId);
      const ext = file.name.split(".").pop() || "mp3";
      const path = `${model?.slug || "model"}/${runId}/hi_${String(script?.script_no).padStart(2, "0")}_${voiceKey || "default"}.${ext}`;
      const up = await adminUpload("model-clips", path, file);
      if (up.error) { alert(up.error); return; }
      await fetch("/api/admin/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_id: scriptId,
          model_id: modelId,
          run_id: runId,
          voice_key: voiceKey || null,
          storage_path: path,
          public_url: up.public_url,
          mime_type: up.mime_type,
          bytes: up.bytes,
          status: "ready",
        }),
      });
      setFile(null);
      reload();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete clip record?")) return;
    await fetch(`/api/admin/clips/${id}`, { method: "DELETE" });
    reload();
  }

  const tableLoading = loading || metaLoading || scriptsLoading;

  return (
    <div className="space-y-4">
      {uploading && <LoadingBar fixed />}
      <div className="panel">
        <h1 className="text-xl font-semibold">Model clips</h1>
        <p className="text-sm text-[#8b97ad]">Upload TTS output for a script + model + run</p>
        <form onSubmit={upload} className="mt-4 grid gap-2 md:grid-cols-2">
          <select className="input" value={scriptId} onChange={(e) => setScriptId(e.target.value)} required disabled={tableLoading}>
            <option value="">Script</option>
            {scriptOptions.map((s) => <option key={s.id} value={s.id}>#{s.script_no} — {s.text.slice(0, 40)}…</option>)}
          </select>
          <select className="input" value={modelId} onChange={(e) => setModelId(e.target.value)} required disabled={metaLoading}>
            {meta?.models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className="input" value={runId} onChange={(e) => setRunId(e.target.value)} required disabled={metaLoading}>
            {meta?.runs.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <input className="input" placeholder="Voice key (optional)" value={voiceKey} onChange={(e) => setVoiceKey(e.target.value)} />
          <input className="input md:col-span-2" type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          <button type="submit" className="btn btn-primary md:col-span-2" disabled={uploading || tableLoading}>
            {uploading ? "Uploading…" : "Upload clip"}
          </button>
        </form>
      </div>
      <div className="panel overflow-x-auto">
        {tableLoading ? (
          <LoadingTableOverlay label="Loading model clips…" />
        ) : (
          <table className="data">
            <thead><tr><th>Script</th><th>Model</th><th>Run</th><th>Status</th><th>Path</th><th></th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={String(c.id)}>
                  <td>#{(c.scripts as { script_no: number })?.script_no}</td>
                  <td>{(c.models as { name: string })?.name}</td>
                  <td>{(c.runs as { slug: string })?.slug}</td>
                  <td>{String(c.status)}</td>
                  <td className="max-w-xs truncate text-xs">{String(c.storage_path)}</td>
                  <td><button type="button" className="btn text-xs text-[#fca5a5]" onClick={() => remove(String(c.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
