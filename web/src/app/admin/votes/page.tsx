"use client";

import { LoadingTableOverlay } from "@/components/LoadingBar";
import { useFetchList } from "@/hooks/useFetchList";

export default function VotesAdmin() {
  const { items, loading } = useFetchList<Record<string, unknown>>("/api/admin/config/votes");

  return (
    <div className="panel overflow-x-auto">
      <h1 className="mb-4 text-xl font-semibold">Votes (read-only export)</h1>
      {loading ? (
        <LoadingTableOverlay label="Loading votes…" />
      ) : (
        <table className="data">
          <thead><tr><th>Type</th><th>Result</th><th>Script</th><th>User</th><th>When</th></tr></thead>
          <tbody>
            {items.slice(0, 200).map((v) => (
              <tr key={String(v.id)}>
                <td>{String(v.vote_type)}</td>
                <td>{String(v.result)}</td>
                <td className="font-mono text-xs">{String(v.script_id).slice(0, 8)}…</td>
                <td className="font-mono text-xs">{String(v.user_id).slice(0, 8)}…</td>
                <td>{String(v.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
