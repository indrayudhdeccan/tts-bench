import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";

const ALLOWED = new Set([
  "languages", "domains", "speakers", "issue_tags", "runs", "site_settings", "profiles",
]);

export async function PATCH(request: Request, { params }: { params: Promise<{ table: string; id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { table, id } = await params;
  if (!ALLOWED.has(table)) return NextResponse.json({ error: "Forbidden table" }, { status: 400 });

  const body = await request.json();
  const pk = table === "site_settings" ? "key" : "id";
  const { data, error } = await admin.from(table).update(body).eq(pk, id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ table: string; id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { table, id } = await params;
  if (!ALLOWED.has(table)) return NextResponse.json({ error: "Forbidden table" }, { status: 400 });

  const pk = table === "site_settings" ? "key" : "id";
  const { error } = await admin.from(table).delete().eq(pk, id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
