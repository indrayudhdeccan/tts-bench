"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { hrefWithLang, parseArenaLanguage } from "@/lib/arena-languages";
import { LoadingBar } from "@/components/LoadingBar";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const lang = parseArenaLanguage(searchParams.get("lang"));
  const next = hrefWithLang(searchParams.get("next") || "/vote", lang);

  async function afterAuth() {
    const access = await fetch("/api/auth/access").then((r) => r.json());
    if (access.redirect) router.push(access.redirect);
    else router.push(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const supabase = createClient();

    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const j = await res.json();
      if (!res.ok) {
        setLoading(false);
        setMsg(j.error || "Signup failed");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setLoading(false);
      if (error) setMsg("Account created but sign-in failed: " + error.message);
      else await afterAuth();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setMsg(error.message);
    else await afterAuth();
  }

  return (
    <>
      {loading && <LoadingBar fixed />}
      <div className="mx-auto max-w-md panel">
        <h2 className="mb-4 text-lg font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h2>
        <p className="mb-4 text-sm text-[#6b7280]">
          Sign up to vote — new accounts require admin approval before voting.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <button type="button" className="mt-3 text-sm text-[#2563eb] hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        {msg && <p className="mt-3 text-sm text-[#6b7280]">{msg}</p>}
      </div>
    </>
  );
}
