import { Suspense } from "react";
import { ExploreView } from "@/components/ExploreView";
import { LoadingPanel } from "@/components/LoadingBar";

export default function ExplorePage() {
  return (
    <div className="space-y-4">
      <div className="panel">
        <h2 className="text-lg font-semibold">Sample explorer</h2>
        <p className="text-sm text-[#6b7280]">Human reference + model clips per script</p>
      </div>
      <Suspense fallback={<LoadingPanel label="Loading samples…" skeletonRows={3} />}>
        <ExploreView />
      </Suspense>
    </div>
  );
}
