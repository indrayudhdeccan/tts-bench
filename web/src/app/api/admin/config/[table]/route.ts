import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";

const ALLOWED = new Set([
  "languages", "domains", "speakers", "issue_tags", "runs", "site_settings", "profiles", "votes",
]);

export async function GET(_: Request, { params }: { params: Promise<{ table: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { table } = await params;
  if (!ALLOWED.has(table)) return NextResponse.json({ error: "Forbidden table" }, { status: 400 });

  const { data, error } = await admin.from(table).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request, { params }: { params: Promise<{ table: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { table } = await params;
  if (!ALLOWED.has(table)) return NextResponse.json({ error: "Forbidden table" }, { status: 400 });

  const body = await request.json();
  const { data, error } = await admin.from(table).insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
