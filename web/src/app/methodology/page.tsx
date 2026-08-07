import { HUMAN_COMPARE_UI_ENABLED } from "@/lib/arena-features";

export default function MethodologyPage() {
  return (
    <div className="panel prose-arena max-w-none space-y-4">
      <h2 className="text-lg font-semibold">Methodology</h2>
      <h3 className="font-medium">Two vote tracks</h3>
      <ul className="list-disc space-y-2 pl-5">
        <li><strong>Rank models</strong> — blind A/B between two TTS models → model Elo leaderboard.</li>
        <li>
          <strong>Compare to human</strong> — TTS vs native recording → separate vs-human win rates.{" "}
          {!HUMAN_COMPARE_UI_ENABLED && <span className="pill-active normal-case">Coming soon</span>}
        </li>
      </ul>
      <h3 className="font-medium">Issue tags</h3>
      <p>Tag issues separately for clip A and clip B. Tags attach to the revealed model after voting.</p>
      <h3 className="font-medium">Generation policy</h3>
      <ul className="list-disc space-y-2 pl-5">
        <li>Input = script text only (no metadata wrapping).</li>
        <li>Voice = fixed per model via API parameter.</li>
        <li>Runs are versioned for reproducibility.</li>
      </ul>
      <h3 className="font-medium">Database</h3>
      <p>
        All votes are stored in Supabase Postgres with user attribution, RLS, and admin-managed corpus
        (scripts, models, reference recordings, model clips).
      </p>
    </div>
  );
}
