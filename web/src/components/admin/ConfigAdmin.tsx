"use client";

import { useState } from "react";
import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export function ConfigAdmin({
  table,
  title,
  fields,
}: {
  table: string;
  title: string;
  fields: string[];
}) {
  const { items, loading, reload } = useFetchList<Record<string, unknown>>(`/api/admin/config/${table}`);
  const [form, setForm] = useState<Record<string, string>>({});

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    fields.forEach((f) => {
      if (form[f] !== undefined && form[f] !== "") body[f] = form[f];
    });
    await fetch(`/api/admin/config/${table}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setForm({});
    reload();
  }

  async function remove(id: string) {
    if (!confirm("Delete?")) return;
    await fetch(`/api/admin/config/${table}/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">{title}</h1>
        <form onSubmit={create} className="mt-4 flex flex-wrap gap-2">
          {fields.map((f) => (
            <input
              key={f}
              className="input max-w-xs"
              placeholder={f}
              value={form[f] || ""}
              onChange={(e) => setForm({ ...form, [f]: e.target.value })}
            />
          ))}
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </form>
      </div>
      <div className="panel overflow-x-auto">
        {loading ? (
          <LoadingTableOverlay label={`Loading ${title.toLowerCase()}…`} />
        ) : (
          <table className="data">
            <thead>
              <tr>
                {fields.map((f) => (
                  <th key={f}>{f}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={String(row.id || row.key)}>
                  {fields.map((f) => (
                    <td key={f} className="max-w-xs truncate">
                      {String(row[f] ?? "")}
                    </td>
                  ))}
                  <td>
                    <button
                      type="button"
                      className="btn text-xs text-[#fca5a5]"
                      onClick={() => remove(String(row.id || row.key))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
