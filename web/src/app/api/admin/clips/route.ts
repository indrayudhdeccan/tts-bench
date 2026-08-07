import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";

export async function GET(request: Request) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const runId = new URL(request.url).searchParams.get("run_id");

  let q = admin
    .from("model_clips")
    .select("*, scripts(script_no, text), models(slug, name), runs(slug)")
    .order("created_at", { ascending: false });
  if (runId) q = q.eq("run_id", runId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const body = await request.json();
  const { data, error } = await admin.from("model_clips").insert(body).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
