import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/admin-api";

const patchSchema = z
  .object({
    active: z.boolean().optional(),
    name: z.string().optional(),
    provider: z.string().optional(),
    api_slug: z.string().nullable().optional(),
    default_voice: z.string().nullable().optional(),
    voice_label: z.string().nullable().optional(),
    color: z.string().optional(),
    sort_order: z.number().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update" });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { data, error } = await admin.from("models").update(parsed.data).eq("id", id).select().single();
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
