import { LoadingPanel } from "@/components/LoadingBar";

export default function AdminLoading() {
  return (
    <LoadingPanel
      label="Loading admin…"
      detail="Fetching dashboard data"
      skeletonRows={4}
    />
  );
}
