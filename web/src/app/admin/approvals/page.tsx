"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadingTableOverlay } from "@/components/LoadingBar";

interface ApprovalUser {
  id: string;
  email: string;
  display_name: string | null;
  approval_status: string;
  vote_count: number;
  created_at: string;
  last_sign_in_at: string | null;
}

function UserTable({
  rows,
  action,
  actionLabel,
  onAction,
  empty,
}: {
  rows: ApprovalUser[];
  action: "approve" | "revoke";
  actionLabel: string;
  onAction: (id: string, action: "approve" | "revoke") => void;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-[#6b7280]">{empty}</p>;
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Email</th>
          <th>Name</th>
          <th>Votes</th>
          <th>Signed up</th>
          <th>Last sign-in</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="font-mono text-xs">{u.email}</td>
            <td>{u.display_name || "—"}</td>
            <td>{u.vote_count}</td>
            <td className="text-xs text-[#6b7280]">{new Date(u.created_at).toLocaleDateString()}</td>
            <td className="text-xs text-[#6b7280]">
              {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : "Never"}
            </td>
            <td>
              <button
                type="button"
                className={`btn text-xs ${action === "revoke" ? "text-[#dc2626]" : "btn-primary"}`}
                onClick={() => onAction(u.id, action)}
              >
                {actionLabel}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ApprovalsAdmin() {
  const [pending, setPending] = useState<ApprovalUser[]>([]);
  const [approved, setApproved] = useState<ApprovalUser[]>([]);
  const [revoked, setRevoked] = useState<ApprovalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    const res = await fetch("/api/admin/approvals");
    const j = await res.json();
    if (res.ok) {
      setPending(j.pending || []);
      setApproved(j.approved || []);
      setRevoked(j.revoked || []);
    } else setMsg(j.error || "Failed to load");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setApproval(userId: string, action: "approve" | "revoke") {
    if (!confirm(`${action === "approve" ? "Approve" : "Revoke"} this user?`)) return;
    setMsg(null);
    const res = await fetch("/api/admin/approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action }),
    });
    const j = await res.json();
    if (!res.ok) {
      setMsg(j.error || "Update failed");
      return;
    }
    load();
  }

  return (
    <div className="space-y-6">
      <div className="panel">
        <h1 className="text-xl font-semibold">User approvals</h1>
        <p className="mt-1 text-sm text-[#6b7280]">
          New signups wait here until approved. Revoke access anytime — revoked users cannot vote.
        </p>
      </div>

      {msg && <p className="text-sm text-[#dc2626]">{msg}</p>}

      <div className="panel overflow-x-auto">
        <h2 className="mb-3 font-semibold">Pending approval ({pending.length})</h2>
        {loading ? (
          <LoadingTableOverlay label="Loading…" />
        ) : (
          <UserTable
            rows={pending}
            action="approve"
            actionLabel="Approve"
            onAction={setApproval}
            empty="No users waiting for approval."
          />
        )}
      </div>

      <div className="panel overflow-x-auto">
        <h2 className="mb-3 font-semibold">Approved raters ({approved.length})</h2>
        {loading ? (
          <LoadingTableOverlay label="Loading…" />
        ) : (
          <UserTable
            rows={approved}
            action="revoke"
            actionLabel="Revoke"
            onAction={setApproval}
            empty="No approved raters yet."
          />
        )}
      </div>

      <div className="panel overflow-x-auto">
        <h2 className="mb-3 font-semibold">Revoked ({revoked.length})</h2>
        {loading ? (
          <LoadingTableOverlay label="Loading…" />
        ) : (
          <UserTable
            rows={revoked}
            action="approve"
            actionLabel="Re-approve"
            onAction={setApproval}
            empty="No revoked users."
          />
        )}
      </div>
    </div>
  );
}
