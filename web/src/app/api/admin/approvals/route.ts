import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const [{ data: list, error: listErr }, { data: profiles, error: profErr }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 500 }),
    admin.from("profiles").select("id, display_name, is_admin, approval_status, vote_count, created_at"),
  ]);

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  type ApprovalRow = {
    id: string;
    email: string;
    display_name: string | null;
    approval_status: string;
    vote_count: number;
    created_at: string;
    last_sign_in_at: string | null;
  };

  const pending: ApprovalRow[] = [];
  const approved: ApprovalRow[] = [];
  const revoked: ApprovalRow[] = [];

  for (const u of list.users || []) {
    const profile = profileMap[u.id];
    if (profile?.is_admin) continue;
    const row = {
      id: u.id,
      email: u.email ?? "",
      display_name: profile?.display_name ?? null,
      approval_status: profile?.approval_status ?? "pending",
      vote_count: profile?.vote_count ?? 0,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
    };
    if (row.approval_status === "approved") approved.push(row);
    else if (row.approval_status === "revoked") revoked.push(row);
    else pending.push(row);
  }

  const byDate = (a: { created_at: string }, b: { created_at: string }) =>
    b.created_at.localeCompare(a.created_at);
  pending.sort(byDate);
  approved.sort(byDate);
  revoked.sort(byDate);

  return NextResponse.json({ pending, approved, revoked });
}

const patchSchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(["approve", "revoke"]),
});

export async function PATCH(request: Request) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user: adminUser } = auth;

  const body = patchSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (body.data.user_id === adminUser.id) {
    return NextResponse.json({ error: "Cannot change your own approval status" }, { status: 400 });
  }

  const { data: target } = await admin.from("profiles").select("is_admin").eq("id", body.data.user_id).single();
  if (target?.is_admin) {
    return NextResponse.json({ error: "Cannot change admin approval status" }, { status: 400 });
  }

  const approval_status = body.data.action === "approve" ? "approved" : "revoked";
  const { error } = await admin
    .from("profiles")
    .update({ approval_status })
    .eq("id", body.data.user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, approval_status });
}
