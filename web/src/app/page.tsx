import { Suspense } from "react";
import { LeaderboardView } from "@/components/LeaderboardView";
import { LoadingPanel } from "@/components/LoadingBar";

export default function HomePage() {
  return (
    <>
      <div className="panel mb-5 text-sm text-[#4b5563]">
        <strong className="text-[#2563eb]">Live arena</strong> — rankings update as users vote.
        Sign in to contribute pairwise judgments.
      </div>
      <Suspense fallback={<LoadingPanel label="Loading leaderboard…" skeletonRows={6} />}>
        <LeaderboardView />
      </Suspense>
    </>
  );
}
