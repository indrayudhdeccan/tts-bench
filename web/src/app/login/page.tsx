import { Suspense } from "react";
import { LoadingPanel } from "@/components/LoadingBar";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingPanel label="Loading sign in…" skeletonRows={3} />}>
      <LoginForm />
    </Suspense>
  );
}
