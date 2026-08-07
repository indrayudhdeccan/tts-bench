import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/admin-api";

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  display_name: z.string().nullable().optional(),
  is_admin: z.boolean().optional(),
  is_rater: z.boolean().optional(),
  native_languages: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user: currentUser } = auth;
  const { id } = await params;

  const body = updateSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const { email, password, display_name, is_admin, is_rater, native_languages } = body.data;

  if (is_admin === false && id === currentUser.id) {
    return NextResponse.json({ error: "You cannot remove your own admin access." }, { status: 400 });
  }

  if (email || password) {
    const authPatch: { email?: string; password?: string } = {};
    if (email) authPatch.email = email;
    if (password) authPatch.password = password;
    const { error: authErr } = await admin.auth.admin.updateUserById(id, authPatch);
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  }

  const profilePatch: Record<string, unknown> = {};
  if (display_name !== undefined) profilePatch.display_name = display_name;
  if (is_admin !== undefined) profilePatch.is_admin = is_admin;
  if (is_rater !== undefined) profilePatch.is_rater = is_rater;
  if (native_languages !== undefined) profilePatch.native_languages = native_languages;

  if (Object.keys(profilePatch).length) {
    const { error: profErr } = await admin.from("profiles").update(profilePatch).eq("id", id);
    if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin, user: currentUser } = auth;
  const { id } = await params;

  if (id === currentUser.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
