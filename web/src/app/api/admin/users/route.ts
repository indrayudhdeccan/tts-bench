import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const { data: profiles, error: profErr } = await admin.from("profiles").select("*");
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });

  const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  const items = (list.users || []).map((u) => {
    const profile = profileMap[u.id];
    return {
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      email_confirmed: !!u.email_confirmed_at,
      display_name: profile?.display_name ?? null,
      is_admin: profile?.is_admin ?? false,
      is_rater: profile?.is_rater ?? true,
      native_languages: profile?.native_languages ?? [],
      vote_count: profile?.vote_count ?? 0,
    };
  });

  items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return NextResponse.json({ items });
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  display_name: z.string().optional(),
  is_admin: z.boolean().optional(),
  is_rater: z.boolean().optional(),
});

export async function POST(request: Request) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Valid email and password (min 6 chars) required." }, { status: 400 });
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: body.data.email,
    password: body.data.password,
    email_confirm: true,
    user_metadata: body.data.display_name ? { display_name: body.data.display_name } : undefined,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const userId = data.user?.id;
  if (!userId) return NextResponse.json({ error: "User created but id missing" }, { status: 500 });

  const profilePatch: Record<string, unknown> = {};
  if (body.data.display_name) profilePatch.display_name = body.data.display_name;
  if (body.data.is_admin !== undefined) profilePatch.is_admin = body.data.is_admin;
  if (body.data.is_rater !== undefined) profilePatch.is_rater = body.data.is_rater;

  if (Object.keys(profilePatch).length) {
    await admin.from("profiles").update(profilePatch).eq("id", userId);
  }

  return NextResponse.json({ ok: true, id: userId });
}
