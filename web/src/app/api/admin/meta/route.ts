import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const [languages, domains, speakers, runs, models, issue_tags] = await Promise.all([
    admin.from("languages").select("*").order("sort_order"),
    admin.from("domains").select("*").order("sort_order"),
    admin.from("speakers").select("*").order("name"),
    admin.from("runs").select("*").order("created_at", { ascending: false }),
    admin.from("models").select("*").order("sort_order"),
    admin.from("issue_tags").select("*").order("sort_order"),
  ]);

  return NextResponse.json({
    languages: languages.data || [],
    domains: domains.data || [],
    speakers: speakers.data || [],
    runs: runs.data || [],
    models: models.data || [],
    issue_tags: issue_tags.data || [],
  });
}
