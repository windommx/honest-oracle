// Regression test for the gap live-probing found before deploy (2026-09): the oracle→lifemap
// rebrand moved authenticated pages to /lifemap/* but this file's protectedPrefixes still
// named only /oracle/*, so /lifemap/admin and /lifemap/api-keys served 200 to ANYONE with no
// session. This test pins every route this app currently ships as protected or public, so a
// future rename cannot silently repeat it — a route that stops matching any prefix here fails
// the "still protected" assertion instead of failing silently in production.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mGetToken = vi.fn();
vi.mock("next-auth/jwt", () => ({ getToken: (...a: unknown[]) => mGetToken(...a) }));

import { middleware } from "./middleware";

// A minimal NextURL-like stand-in: real URL parsing/searchParams, plus the clone() the
// middleware calls to build a redirect target without mutating the incoming request.
function fakeNextUrl(href: string): URL & { clone: () => ReturnType<typeof fakeNextUrl> } {
  const url = new URL(href) as URL & { clone: () => ReturnType<typeof fakeNextUrl> };
  url.clone = () => fakeNextUrl(url.href);
  return url;
}
function reqFor(pathname: string): NextRequest {
  const nextUrl = fakeNextUrl(`http://localhost:3000${pathname}`);
  return {
    nextUrl,
    url: nextUrl.href,
    headers: new Headers(),
  } as unknown as NextRequest;
}

beforeEach(() => { mGetToken.mockReset(); });

describe("middleware — every currently-shipped protected route actually gates, by its LIVE path", () => {
  const PROTECTED_NO_SESSION_REDIRECTS = [
    "/history",
    "/lifemap/app",
    "/lifemap/history",
    "/lifemap/api-keys",
    "/lifemap/admin",
  ];

  it.each(PROTECTED_NO_SESSION_REDIRECTS)("%s redirects to /login when there is no session", async (path) => {
    mGetToken.mockResolvedValue(null);
    const res = await middleware(reqFor(path));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("/lifemap/admin sends a non-admin session to /lifemap, not the retired /oracle", async () => {
    mGetToken.mockResolvedValue({ role: "user" });
    const res = await middleware(reqFor("/lifemap/admin"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/lifemap");
  });

  it("/lifemap/admin passes an admin session through", async () => {
    mGetToken.mockResolvedValue({ role: "admin" });
    const res = await middleware(reqFor("/lifemap/admin"));
    expect(res.status).toBe(200);
  });

  it("a legacy /oracle/* request is gated here too — there is no unprotected hop before next.config.js's redirect", async () => {
    mGetToken.mockResolvedValue(null);
    const res = await middleware(reqFor("/oracle/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("public routes are never gated, with or without a session", async () => {
    mGetToken.mockResolvedValue(null);
    for (const path of ["/", "/lifemap", "/login", "/bookisdom", "/bookisdom/dashboard"]) {
      const res = await middleware(reqFor(path));
      expect(res.status).toBe(200);
    }
    expect(mGetToken).not.toHaveBeenCalled();
  });

  it("every response carries the security headers regardless of auth outcome", async () => {
    mGetToken.mockResolvedValue(null);
    const res = await middleware(reqFor("/"));
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
