"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useArenaLanguage } from "@/hooks/useArenaLanguage";
import { hrefWithLang } from "@/lib/arena-languages";

const links = [
  { href: "/", label: "Leaderboard" },
  { href: "/vote", label: "Vote" },
  { href: "/explore", label: "Explore" },
  { href: "/methodology", label: "Methodology" },
];

interface ArenaNavProps {
  user: { id: string } | null;
  displayName?: string | null;
  isAdmin?: boolean;
}

export function ArenaNav({ user, displayName, isAdmin }: ArenaNavProps) {
  const lang = useArenaLanguage();
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {links.map((l) => {
        const active = pathname === l.href;
        return (
          <Link
            key={l.href}
            href={hrefWithLang(l.href, lang)}
            className={`rounded-lg px-3.5 py-2 text-sm transition ${
              active
                ? "bg-white/10 text-white"
                : "text-white/70 hover:bg-white/5 hover:text-white"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
      {isAdmin && (
        <Link href="/admin" className="btn-primary rounded-lg px-3.5 py-2 text-xs">
          Admin
        </Link>
      )}
      {user ? (
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn-ghost-dark text-xs">
            Sign out ({displayName || "user"})
          </button>
        </form>
      ) : (
        <Link href={hrefWithLang("/login", lang, { next: "/vote" })} className="btn-ghost-dark text-xs">
          Sign in
        </Link>
      )}
    </nav>
  );
}
