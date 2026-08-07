import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("issue_tags")
    .select("*")
    .eq("active", true)
    .order("sort_order");
  return NextResponse.json({ tags: data || [] });
}
