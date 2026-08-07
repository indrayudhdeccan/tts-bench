import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/** Sign up with email pre-confirmed (no verification step for now). */
export async function POST(request: Request) {
  const body = signupSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid email or password (min 6 chars)." }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: body.data.email,
    password: body.data.password,
    email_confirm: true,
  });

  if (error) {
    const msg = error.message.toLowerCase().includes("already")
      ? "An account with this email already exists. Try signing in."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true, user_id: data.user?.id });
}
