import { NextResponse } from "next/server";
import { assertAdminApi } from "@/lib/admin-api";
import { publicStorageUrl } from "@/lib/auth";

export async function POST(request: Request) {
  const auth = await assertAdminApi();
  if ("error" in auth && auth.error) return auth.error;
  const { admin } = auth;

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const bucket = (form.get("bucket") as string) || "model-clips";
  const path = form.get("path") as string;

  if (!file || !path) {
    return NextResponse.json({ error: "file and path required" }, { status: 400 });
  }
  if (bucket !== "references" && bucket !== "model-clips") {
    return NextResponse.json({ error: "invalid bucket" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const publicUrl = publicStorageUrl(path, bucket as "references" | "model-clips");
  return NextResponse.json({ ok: true, path, public_url: publicUrl, bytes: bytes.length, mime_type: file.type });
}
