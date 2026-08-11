import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, isValidSessionToken } from "@/lib/auth";

/**
 * Access gate. Next.js 16 renamed `middleware` to `proxy` (Node.js runtime by
 * default). Runs in front of every page and API route so the whole app — not
 * just the UI — requires the session cookie.
 *
 * Public paths (no cookie required):
 *   - /login and /api/auth/*  — the gate itself
 *   - /api/cron/*             — self-protected by CRON_SECRET (called by Vercel
 *                               Cron with a bearer token, never a browser cookie)
 */
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/cron/")
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (isValidSessionToken(token, Date.now())) {
    return NextResponse.next();
  }

  // API calls get a clean 401 rather than an HTML redirect.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pages redirect to /login, preserving the intended destination.
  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", pathname + search);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next's static assets and the favicon. Note: /api
  // is intentionally NOT excluded — API routes must be gated too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
