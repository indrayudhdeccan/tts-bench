import { createClient } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = await createClient();
  const tables = [
    "scripts", "models", "model_clips", "reference_recordings", "votes", "profiles",
  ] as const;

  const counts: Record<string, number> = {};
  for (const t of tables) {
    const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
    counts[t] = count ?? 0;
  }

  return (
    <div className="space-y-4">
      <div className="panel">
        <h1 className="text-xl font-semibold">Admin dashboard</h1>
        <p className="text-sm text-[#8b97ad]">Full control over corpus, models, audio, and votes.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(counts).map(([k, v]) => (
          <div key={k} className="panel">
            <div className="text-2xl font-bold tabular-nums">{v}</div>
            <div className="text-sm text-[#8b97ad]">{k.replace(/_/g, " ")}</div>
          </div>
        ))}
      </div>
      <div className="panel text-sm text-[#d7deed]">
        <p><strong>First-time setup:</strong></p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Run Supabase migrations in <code>supabase/migrations/</code></li>
          <li>Set your user as admin: <code>UPDATE profiles SET is_admin = true WHERE id = &apos;YOUR_UUID&apos;;</code></li>
          <li>Add scripts (or run <code>npm run seed:manifest</code> from repo root)</li>
          <li>Upload reference + model clips under Runs → default run</li>
        </ol>
      </div>
    </div>
  );
}
