import { Suspense } from "react";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="text-[#6b7280]">Loading…</p>}>{children}</Suspense>;
}
