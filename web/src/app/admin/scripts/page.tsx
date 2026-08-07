"use client";

import { useEffect, useState } from "react";
import { useAdminMeta } from "@/components/admin/useAdminMeta";
import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function AdminScriptsPage() {
  const { meta, loading: metaLoading } = useAdminMeta();
  const { items, loading, reload } = useFetchList<Record<string, unknown>>("/api/admin/scripts");
  const [form, setForm] = useState({
    script_no: 1,
    language_id: "",
    domain_id: "",
    speaker_id: "",
    named_entity: "",
    text: "",
    meaning: "",
    active: true,
  });

  useEffect(() => {
    if (meta?.languages[0] && !form.language_id) {
      setForm((f) => ({ ...f, language_id: meta.languages.find((l) => l.code === "hi-IN")?.id || meta.languages[0].id }));
    }
  }, [meta, form.language_id]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/scripts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        domain_id: form.domain_id || null,
        speaker_id: form.speaker_id || null,
      }),
    });
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Delete script?")) return;
    await fetch(`/api/admin/scripts/${id}`, { method: "DELETE" });
    reload();
  }

  const tableLoading = loading || metaLoading;

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">Scripts / transcripts</h1>
        <form onSubmit={create} className="mt-4 grid gap-2 md:grid-cols-2">
          <input className="input" type="number" placeholder="Script #" value={form.script_no} onChange={(e) => setForm({ ...form, script_no: +e.target.value })} />
          <select className="input" value={form.language_id} onChange={(e) => setForm({ ...form, language_id: e.target.value })}>
            {meta?.languages.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="input" value={form.domain_id} onChange={(e) => setForm({ ...form, domain_id: e.target.value })}>
            <option value="">Domain</option>
            {meta?.domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="input" value={form.speaker_id} onChange={(e) => setForm({ ...form, speaker_id: e.target.value })}>
            <option value="">Speaker</option>
            {meta?.speakers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="input md:col-span-2" placeholder="Named entity" value={form.named_entity} onChange={(e) => setForm({ ...form, named_entity: e.target.value })} />
          <textarea className="input md:col-span-2 min-h-[80px]" placeholder="Hindi/English text" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} required />
          <textarea className="input md:col-span-2 min-h-[60px]" placeholder="Meaning (optional)" value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
          <button type="submit" className="btn btn-primary md:col-span-2">Add script</button>
        </form>
      </div>

      <div className="panel overflow-x-auto">
        {tableLoading ? (
          <LoadingTableOverlay label="Loading scripts…" />
        ) : (
        <table className="data">
          <thead>
            <tr><th>#</th><th>Lang</th><th>Text</th><th>Entity</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={String(s.id)}>
                <td>{String(s.script_no)}</td>
                <td>{(s.languages as { code: string })?.code}</td>
                <td className="max-w-md truncate">{String(s.text)}</td>
                <td>{String(s.named_entity || "")}</td>
                <td><button type="button" className="btn text-xs text-[#fca5a5]" onClick={() => remove(String(s.id))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
