import Link from "next/link";

const links = [
  ["", "Dashboard"],
  ["scripts", "Scripts"],
  ["models", "Models"],
  ["clips", "Model clips"],
  ["references", "Human references"],
  ["runs", "Runs"],
  ["languages", "Languages"],
  ["domains", "Domains"],
  ["speakers", "Speakers"],
  ["issue-tags", "Issue tags"],
  ["approvals", "Approvals"],
  ["votes", "Votes"],
  ["users", "Users"],
  ["settings", "Site settings"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="panel h-fit w-full shrink-0 lg:w-56">
        <h2 className="mb-3 font-semibold">Admin</h2>
        <nav className="flex flex-col gap-1">
          {links.map(([path, label]) => (
            <Link
              key={path}
              href={path ? `/admin/${path}` : "/admin"}
              className="rounded-lg px-3 py-2 text-sm text-[#8b97ad] hover:bg-[#1a1f2b] hover:text-[#eef2f8]"
            >
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
