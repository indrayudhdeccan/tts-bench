import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AccessRevokedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/vote");

  const { data: profile } = await supabase
    .from("profiles")
    .select("approval_status, is_admin")
    .eq("id", user.id)
    .single();

  if (profile?.is_admin || profile?.approval_status === "approved") redirect("/vote");
  if (profile?.approval_status === "pending") redirect("/pending-approval");

  return (
    <div className="panel mx-auto max-w-lg text-center">
      <p className="tag-line mb-2">// Access revoked</p>
      <h1 className="mb-3 text-xl font-semibold">Voting access removed</h1>
      <p className="mb-6 text-sm text-[#6b7280]">
        Your permission to vote has been revoked by an administrator. Contact the admin if you
        believe this is a mistake.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/" className="btn btn-primary">
          View leaderboard
        </Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
