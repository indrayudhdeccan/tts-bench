"use client";

import { useEffect, useState } from "react";

interface Meta {
  languages: { id: string; code: string; name: string }[];
  domains: { id: string; name: string }[];
  speakers: { id: string; name: string }[];
  runs: { id: string; slug: string; name: string }[];
  models: { id: string; slug: string; name: string }[];
}

export function useAdminMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => setMeta(null))
      .finally(() => setLoading(false));
  }, []);

  return { meta, loading };
}

export async function adminUpload(bucket: string, path: string, file: File) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("bucket", bucket);
  fd.append("path", path);
  const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
  return r.json();
}
