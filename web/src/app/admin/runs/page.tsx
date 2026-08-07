"use client";

import { useState } from "react";
import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function RunsAdmin() {
  const { items, loading, reload } = useFetchList<Record<string, unknown>>("/api/admin/config/runs");
  const [form, setForm] = useState({ slug: "", name: "", prompt_policy: "text_only_input", is_default: false });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/config/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">Generation runs</h1>
        <form onSubmit={create} className="mt-4 grid gap-2 md:grid-cols-2">
          <input className="input" placeholder="slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          <input className="input" placeholder="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <textarea className="input md:col-span-2" placeholder="prompt policy" value={form.prompt_policy} onChange={(e) => setForm({ ...form, prompt_policy: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Default run for voting</label>
          <button type="submit" className="btn btn-primary md:col-span-2">Add run</button>
        </form>
      </div>
      <div className="panel overflow-x-auto">
        {loading ? (
          <LoadingTableOverlay label="Loading runs…" />
        ) : (
          <table className="data">
            <thead><tr><th>Slug</th><th>Name</th><th>Default</th><th>Policy</th></tr></thead>
            <tbody>{items.map((r) => <tr key={String(r.id)}><td>{String(r.slug)}</td><td>{String(r.name)}</td><td>{String(r.is_default)}</td><td className="max-w-md truncate">{String(r.prompt_policy)}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
