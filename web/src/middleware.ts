import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login?next=/admin", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (request.nextUrl.pathname === "/vote" && !user) {
    return NextResponse.redirect(new URL("/login?next=/vote", request.url));
  }

  if (user && (request.nextUrl.pathname === "/vote" || request.nextUrl.pathname.startsWith("/api/votes"))) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, approval_status, is_rater")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      if (profile?.approval_status === "pending") {
        if (request.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Account pending admin approval" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/pending-approval", request.url));
      }
      if (profile?.approval_status === "revoked" || profile?.is_rater === false) {
        if (request.nextUrl.pathname.startsWith("/api/")) {
          return NextResponse.json({ error: "Voting access revoked" }, { status: 403 });
        }
        return NextResponse.redirect(new URL("/access-revoked", request.url));
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/vote", "/api/votes", "/pending-approval", "/access-revoked"],
};
