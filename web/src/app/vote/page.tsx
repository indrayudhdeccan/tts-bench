import { Suspense } from "react";
import { LoadingPanel } from "@/components/LoadingBar";
import VotePageClient from "./VotePageClient";

export default function VotePage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading vote arena…" skeletonRows={4} />}>
      <VotePageClient />
    </Suspense>
  );
}
