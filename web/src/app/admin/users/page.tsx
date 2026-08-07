"use client";

import { useState } from "react";
import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  is_rater: boolean;
  vote_count: number;
  email_confirmed: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

const emptyForm = {
  email: "",
  password: "",
  display_name: "",
  is_admin: false,
  is_rater: true,
};

export default function UsersAdmin() {
  const { items, loading, reload } = useFetchList<AdminUser>("/api/admin/users");
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ display_name: "", is_admin: false, is_rater: true, password: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || "Create failed");
      return;
    }
    setForm(emptyForm);
    reload();
  }

  function startEdit(u: AdminUser) {
    setEditing(u);
    setEditForm({
      display_name: u.display_name || "",
      is_admin: u.is_admin,
      is_rater: u.is_rater,
      password: "",
    });
    setMsg(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setMsg(null);
    const body: Record<string, unknown> = {
      display_name: editForm.display_name || null,
      is_admin: editForm.is_admin,
      is_rater: editForm.is_rater,
    };
    if (editForm.password) body.password = editForm.password;

    const res = await fetch(`/api/admin/users/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || "Update failed");
      return;
    }
    setEditing(null);
    reload();
  }

  async function removeUser(u: AdminUser) {
    if (!confirm(`Delete user ${u.email}? This removes their votes.`)) return;
    setMsg(null);
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || "Delete failed");
      return;
    }
    reload();
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-[#6b7280]">Create, edit, and remove arena accounts.</p>

        <form onSubmit={createUser} className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            className="input"
            type="password"
            placeholder="Password (min 6)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={6}
          />
          <input
            className="input"
            placeholder="Display name"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_admin} onChange={(e) => setForm({ ...form, is_admin: e.target.checked })} />
            Admin
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_rater} onChange={(e) => setForm({ ...form, is_rater: e.target.checked })} />
            Rater
          </label>
          <button type="submit" className="btn btn-primary md:col-span-2 lg:col-span-1">
            Create user
          </button>
        </form>
      </div>

      {editing && (
        <div className="panel border-[#3b82f6]">
          <h2 className="mb-3 font-semibold">Edit {editing.email}</h2>
          <form onSubmit={saveEdit} className="flex flex-wrap items-end gap-3">
            <input
              className="input max-w-xs"
              placeholder="Display name"
              value={editForm.display_name}
              onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
            />
            <input
              className="input max-w-xs"
              type="password"
              placeholder="New password (optional)"
              value={editForm.password}
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
              minLength={6}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.is_admin} onChange={(e) => setEditForm({ ...editForm, is_admin: e.target.checked })} />
              Admin
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.is_rater} onChange={(e) => setEditForm({ ...editForm, is_rater: e.target.checked })} />
              Rater
            </label>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </form>
        </div>
      )}

      {msg && <p className="text-sm text-[#dc2626]">{msg}</p>}

      <div className="panel overflow-x-auto">
        {loading ? (
          <LoadingTableOverlay label="Loading users…" />
        ) : (
        <table className="data">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Admin</th>
              <th>Rater</th>
              <th>Votes</th>
              <th>Last sign-in</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.id}>
                <td className="font-mono text-xs">{u.email}</td>
                <td>{u.display_name || "—"}</td>
                <td>{u.is_admin ? "Yes" : "No"}</td>
                <td>{u.is_rater ? "Yes" : "No"}</td>
                <td>{u.vote_count}</td>
                <td className="text-xs text-[#6b7280]">
                  {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
                </td>
                <td className="space-x-2 whitespace-nowrap">
                  <button type="button" className="btn text-xs" onClick={() => startEdit(u)}>
                    Edit
                  </button>
                  <button type="button" className="btn text-xs text-[#dc2626]" onClick={() => removeUser(u)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
        {!loading && !items.length && <p className="mt-3 text-sm text-[#6b7280]">No users yet.</p>}
      </div>
    </div>
  );
}
