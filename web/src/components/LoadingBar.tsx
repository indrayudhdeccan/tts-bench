"use client";

import { cn } from "@/lib/cn";

type LoadingBarProps = {
  /** Pin to top of viewport (page-level loads) */
  fixed?: boolean;
  className?: string;
};

/** Indeterminate progress bar — use while async work is in flight. */
export function LoadingBar({ fixed = false, className }: LoadingBarProps) {
  return (
    <div
      className={cn(
        "loading-bar-track overflow-hidden",
        fixed && "loading-bar-fixed",
        className
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading"
    >
      <div className="loading-bar-fill" />
    </div>
  );
}

type LoadingPanelProps = {
  label: string;
  detail?: string;
  /** Number of skeleton rows below the bar */
  skeletonRows?: number;
  className?: string;
};

/** Inline loading block with bar, message, and optional skeleton. */
export function LoadingPanel({ label, detail, skeletonRows = 3, className }: LoadingPanelProps) {
  return (
    <div className={cn("panel loading-panel", className)} aria-busy="true" aria-live="polite">
      <LoadingBar className="mb-4 rounded-full" />
      <p className="text-sm font-medium text-[#374151]">{label}</p>
      {detail && <p className="mt-1 text-xs text-[#6b7280]">{detail}</p>}
      {skeletonRows > 0 && (
        <div className="mt-5 space-y-3">
          {Array.from({ length: skeletonRows }).map((_, i) => (
            <div
              key={i}
              className="loading-skeleton h-10 rounded-lg"
              style={{ width: `${88 - i * 12}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Skeleton grid for explore-style cards. */
export function LoadingCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="panel space-y-3">
          <div className="loading-skeleton h-9 w-9 rounded-lg" />
          <div className="loading-skeleton h-4 w-2/3 rounded" />
          <div className="loading-skeleton h-16 w-full rounded-lg" />
          <div className="loading-skeleton h-8 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}

/** Overlay for tables while data loads. */
export function LoadingTableOverlay({ label }: { label: string }) {
  return (
    <div className="loading-table-overlay" aria-busy="true" aria-live="polite">
      <LoadingBar className="mb-3 max-w-xs rounded-full" />
      <p className="text-sm text-[#6b7280]">{label}</p>
    </div>
  );
}
