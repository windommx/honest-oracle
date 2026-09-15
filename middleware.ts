import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// 2026-09 rebrand moved Honest Oracle's authenticated pages from /oracle/* to /lifemap/*
// (next.config.js 308-redirects the old paths). This list was NOT updated at the time —
// found by live-probing /lifemap/admin and /lifemap/api-keys before deploy: both returned
// 200 with NO session, meaning the admin panel and API-key management were reachable by
// anyone once the rename shipped, while the old /oracle/admin link still worked (redirect
// only, no gate of its own). Kept both prefixes: a legacy /oracle/* request is gated HERE
// before next.config.js's redirect even matters, so there is no in-between unprotected hop.
const protectedPrefixes = [
  "/history",
  "/lifemap/app",
  "/lifemap/history",
  "/lifemap/api-keys",
  "/lifemap/admin",
  "/oracle/app",
  "/oracle/history",
  "/oracle/api-keys",
  "/oracle/admin",
];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  const pathname = req.nextUrl.pathname;
  const needsAuth = protectedPrefixes.some((p) => pathname.startsWith(p));
  if (!needsAuth) return res;

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/lifemap/admin") || pathname.startsWith("/oracle/admin")) {
    if ((token as { role?: string }).role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/lifemap";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
