import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { id } = await params;
  const body = await request.json();
  const { data, error } = await admin.from("models").update(body).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { id } = await params;
  const { error } = await admin.from("models").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
