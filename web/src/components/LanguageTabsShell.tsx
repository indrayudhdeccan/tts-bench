import { Suspense } from "react";
import { LanguageTabs } from "@/components/LanguageTabs";
import { LoadingBar } from "@/components/LoadingBar";

export function LanguageTabsShell() {
  return (
    <Suspense
      fallback={
        <div className="arena-tab-rail bg-white">
          <LoadingBar fixed />
          <div className="mx-auto h-14 max-w-6xl animate-pulse px-4 py-4">
            <div className="loading-skeleton h-4 w-48 rounded" />
          </div>
        </div>
      }
    >
      <LanguageTabs />
    </Suspense>
  );
}
