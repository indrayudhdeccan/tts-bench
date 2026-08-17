import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canVote } from "@/lib/access";

const voteSchema = z.object({
  vote_type: z.enum(["model_vs_model", "model_vs_human"]),
  script_id: z.string().uuid(),
  run_id: z.string().uuid().optional().nullable(),
  clip_a_type: z.enum(["model", "human"]),
  clip_a_model_id: z.string().uuid().optional().nullable(),
  clip_a_ref_id: z.string().uuid().optional().nullable(),
  clip_b_type: z.enum(["model", "human"]),
  clip_b_model_id: z.string().uuid().optional().nullable(),
  clip_b_ref_id: z.string().uuid().optional().nullable(),
  result: z.enum(["a", "b", "tie", "both_bad"]),
  tags_a: z.array(z.string().uuid()).optional(),
  tags_b: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin, is_rater, approval_status")
    .eq("id", user.id)
    .single();
  if (!canVote(profile)) {
    return NextResponse.json({ error: "Account not approved to vote" }, { status: 403 });
  }

  const body = voteSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const v = body.data;
  const { data: vote, error } = await supabase
    .from("votes")
    .insert({
      user_id: user.id,
      vote_type: v.vote_type,
      script_id: v.script_id,
      run_id: v.run_id ?? null,
      clip_a_type: v.clip_a_type,
      clip_a_model_id: v.clip_a_model_id ?? null,
      clip_a_ref_id: v.clip_a_ref_id ?? null,
      clip_b_type: v.clip_b_type,
      clip_b_model_id: v.clip_b_model_id ?? null,
      clip_b_ref_id: v.clip_b_ref_id ?? null,
      result: v.result,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tagRows: { vote_id: string; side: string; issue_tag_id: string }[] = [];
  for (const id of v.tags_a || []) tagRows.push({ vote_id: vote.id, side: "a", issue_tag_id: id });
  for (const id of v.tags_b || []) tagRows.push({ vote_id: vote.id, side: "b", issue_tag_id: id });

  if (tagRows.length) {
    const { error: tagErr } = await supabase.from("vote_issue_tags").insert(tagRows);
    if (tagErr) return NextResponse.json({ error: tagErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, vote_id: vote.id });
}
