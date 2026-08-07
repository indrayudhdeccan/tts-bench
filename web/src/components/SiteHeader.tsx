import { Suspense } from "react";
import { ArenaNav } from "@/components/ArenaNav";
import { DeccanLogo } from "@/components/DeccanLogo";
import { getProfile, getSessionUser } from "@/lib/auth";

function NavFallback() {
  return (
    <nav className="flex flex-wrap items-center gap-2">
      <span className="rounded-lg px-3.5 py-2 text-sm text-white/50">Loading…</span>
    </nav>
  );
}

export async function SiteHeader() {
  const user = await getSessionUser();
  const profile = user ? await getProfile() : null;

  return (
    <header className="arena-hero arena-hero-grid relative">
      <div className="arena-hero-glow" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pb-8 pt-5">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <DeccanLogo variant="dark" href="https://www.deccan.ai" />
          <Suspense fallback={<NavFallback />}>
            <ArenaNav
              user={user}
              displayName={profile?.display_name}
              isAdmin={profile?.is_admin}
            />
          </Suspense>
        </div>

        <p className="tag-line-dark mb-3">// TTS Bench Arena</p>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
          Blind pairwise evaluation across{" "}
          <span className="text-[#3b82f6]">languages</span>
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/60">
          Project Beatles — model-vs-model Elo rankings, human reference anchors, and per-clip issue tagging for TTS quality.
        </p>
      </div>
    </header>
  );
}
