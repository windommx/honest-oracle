import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPrefixes = [
  "/history",
  "/oracle/app",
  "/oracle/history",
  "/oracle/api-keys",
  "/oracle/admin",
  // StageLab's marketing and pricing pages stay public on purpose; only the
  // app itself needs a session. Plan gating happens per-route on the server —
  // this redirect just saves a signed-out visitor from a blank shell.
  "/stagelab/app",
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

  if (pathname.startsWith("/oracle/admin")) {
    if ((token as { role?: string }).role !== "admin") {
      const url = req.nextUrl.clone();
      url.pathname = "/oracle";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

