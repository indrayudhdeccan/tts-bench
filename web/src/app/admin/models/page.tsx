"use client";

import { useState } from "react";
import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function AdminModelsPage() {
  const { items, loading, reload } = useFetchList<Record<string, unknown>>("/api/admin/models");
  const [form, setForm] = useState({
    slug: "", name: "", provider: "", api_slug: "", default_voice: "", voice_label: "", color: "#6ea8fe", sort_order: 0, active: true,
  });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Delete model?")) return;
    await fetch(`/api/admin/models/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">TTS models</h1>
        <form onSubmit={create} className="mt-4 grid gap-2 md:grid-cols-2">
          <input className="input" placeholder="slug (gemini)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
          <input className="input" placeholder="Display name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" placeholder="Provider" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          <input className="input" placeholder="API slug" value={form.api_slug} onChange={(e) => setForm({ ...form, api_slug: e.target.value })} />
          <input className="input" placeholder="Default voice" value={form.default_voice} onChange={(e) => setForm({ ...form, default_voice: e.target.value })} />
          <input className="input" placeholder="Voice label" value={form.voice_label} onChange={(e) => setForm({ ...form, voice_label: e.target.value })} />
          <input className="input" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
          <button type="submit" className="btn btn-primary md:col-span-2">Add model</button>
        </form>
      </div>
      <div className="panel overflow-x-auto">
        {loading ? (
          <LoadingTableOverlay label="Loading models…" />
        ) : (
          <table className="data">
            <thead><tr><th>Slug</th><th>Name</th><th>Voice</th><th>Active</th><th></th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={String(m.id)}>
                  <td>{String(m.slug)}</td>
                  <td>{String(m.name)}</td>
                  <td>{String(m.voice_label || m.default_voice)}</td>
                  <td>{String(m.active)}</td>
                  <td><button type="button" className="btn text-xs text-[#fca5a5]" onClick={() => remove(String(m.id))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
