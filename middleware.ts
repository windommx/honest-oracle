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

/**
 * Content-Security-Policy, with a per-request nonce.
 *
 * Next injects inline bootstrap scripts, so the choice is between
 * `'unsafe-inline'` — which makes script-src decorative — and a nonce. Next
 * reads the nonce out of this header and stamps its own tags with it, so the
 * strict form actually works; `'strict-dynamic'` then lets those trusted
 * scripts load the chunks they need without listing every hashed filename.
 *
 * Two deliberate relaxations:
 *  · style-src keeps 'unsafe-inline'. A nonce cannot cover style ATTRIBUTES,
 *    and the charts set widths and offsets that way. Inline CSS is a far
 *    smaller risk than inline JS, and pretending otherwise by dropping the
 *    charts would be the wrong trade.
 *  · 'unsafe-eval' in development only — the dev bundler needs it, production
 *    does not, and shipping it because dev needed it is how CSPs rot.
 */
function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com data:`,
    `img-src 'self' data: blob:`,
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    // An http:// subresource on an https:// page is a downgrade; upgrade it
    // rather than letting the browser block it silently.
    ...(isDev ? [] : [`upgrade-insecure-requests`]),
  ].join("; ");
}

export async function middleware(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const nonce = crypto.randomUUID().replace(/-/g, "");

  // Next reads the nonce from the request headers to stamp its script tags.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce, isDev));
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  // Cross-origin isolation of this document from windows it opens or that open it.
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");

  // HSTS only over https, and only in production. Sending it from a local
  // http:// dev server would pin localhost to https in the developer's browser
  // — a genuinely unpleasant thing to debug. `preload` is deliberately absent:
  // it is a one-way commitment for the whole domain and is the operator's call,
  // not a default.
  if (!isDev && req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

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
  matcher: [
    // Static assets and the health check are excluded: they need no nonce, and
    // a monitor polling /api/health every few seconds should not be paying for
    // middleware on every probe.
    "/((?!_next/static|_next/image|favicon.ico|api/health).*)",
  ],
};
