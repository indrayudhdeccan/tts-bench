import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { accessRedirectPath, canVote } from "@/lib/access";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ authenticated: false, can_vote: false, status: null });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, is_rater, approval_status, display_name")
    .eq("id", user.id)
    .single();

  const status = profile?.approval_status ?? "pending";
  return NextResponse.json({
    authenticated: true,
    can_vote: canVote(profile),
    status,
    is_admin: profile?.is_admin ?? false,
    redirect: accessRedirectPath(profile),
    display_name: profile?.display_name ?? null,
  });
}
