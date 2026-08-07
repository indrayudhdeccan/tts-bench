import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { data, error } = await admin
    .from("reference_recordings")
    .select("*, scripts(script_no, text), speakers(name)")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const body = await request.json();
  const { data, error } = await admin.from("reference_recordings").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
