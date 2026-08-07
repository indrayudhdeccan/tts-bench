"use client";

import { useEffect, useState } from "react";
import { adminUpload, useAdminMeta } from "@/components/admin/useAdminMeta";
import { LoadingBar, LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function AdminReferencesPage() {
  const { meta, loading: metaLoading } = useAdminMeta();
  const { items, loading, reload } = useFetchList<Record<string, unknown>>("/api/admin/references");
  const { items: scriptRows, loading: scriptsLoading } = useFetchList<Record<string, unknown>>("/api/admin/scripts");
  const scripts = scriptRows.map((s) => ({ id: String(s.id), script_no: Number(s.script_no) }));
  const [scriptId, setScriptId] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [tier, setTier] = useState("casual");
  const [isPrimary, setIsPrimary] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !scriptId) return;
    setUploading(true);
    try {
      const script = scripts.find((s) => s.id === scriptId);
      const ext = file.name.split(".").pop() || "mp3";
      const path = `hi-IN/${String(script?.script_no).padStart(2, "0")}_${tier}.${ext}`;
      const up = await adminUpload("references", path, file);
      if (up.error) { alert(up.error); return; }
      await fetch("/api/admin/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_id: scriptId,
          speaker_id: speakerId || null,
          tier,
          is_primary: isPrimary,
          storage_path: path,
          public_url: up.public_url,
          mime_type: up.mime_type,
          bytes: up.bytes,
          active: true,
        }),
      });
      setFile(null);
      reload();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete reference?")) return;
    await fetch(`/api/admin/references/${id}`, { method: "DELETE" });
    reload();
  }

  const tableLoading = loading || metaLoading || scriptsLoading;

  return (
    <div className="space-y-4">
      {uploading && <LoadingBar fixed />}
      <div className="panel">
        <h1 className="text-xl font-semibold">Human reference recordings</h1>
        <form onSubmit={upload} className="mt-4 grid gap-2 md:grid-cols-2">
          <select className="input" value={scriptId} onChange={(e) => setScriptId(e.target.value)} required disabled={tableLoading}>
            <option value="">Script</option>
            {scripts.map((s) => <option key={s.id} value={s.id}>#{s.script_no}</option>)}
          </select>
          <select className="input" value={speakerId} onChange={(e) => setSpeakerId(e.target.value)} disabled={metaLoading}>
            <option value="">Speaker</option>
            {meta?.speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="casual">Casual</option>
            <option value="pro">Pro</option>
            <option value="studio">Studio</option>
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isPrimary} onChange={(e) => setIsPrimary(e.target.checked)} /> Primary reference
          </label>
          <input className="input md:col-span-2" type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
          <button type="submit" className="btn btn-primary md:col-span-2" disabled={uploading || tableLoading}>
            {uploading ? "Uploading…" : "Upload reference"}
          </button>
        </form>
      </div>
      <div className="panel overflow-x-auto">
        {tableLoading ? (
          <LoadingTableOverlay label="Loading references…" />
        ) : (
          <table className="data">
            <thead><tr><th>Script</th><th>Tier</th><th>Primary</th><th>Path</th><th></th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={String(r.id)}>
                  <td>#{(r.scripts as { script_no: number })?.script_no}</td>
                  <td>{String(r.tier)}</td>
                  <td>{String(r.is_primary)}</td>
                  <td className="max-w-xs truncate text-xs">{String(r.storage_path)}</td>
                  <td><button type="button" className="btn text-xs text-[#fca5a5]" onClick={() => remove(String(r.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
