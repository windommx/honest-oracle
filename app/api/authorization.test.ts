import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Every route handler must decide who is asking.                          ║
// ║                                                                          ║
// ║  lib/stagelab/tenancy.test.ts already does this, but it walks only       ║
// ║  app/api/stagelab. The routes written before StageLab existed never      ║
// ║  adopted the same discipline, and three of them — /api/child,            ║
// ║  /api/corporate, /api/rename — took the tenant id from `?userId=` and    ║
// ║  fell through to `where: {}` when it was missing, returning rows from    ║
// ║  every tenant to an unauthenticated caller.                              ║
// ║                                                                          ║
// ║  So this check covers all of app/api. A handler either performs an       ║
// ║  identity check or is named below as deliberately public. There is no    ║
// ║  third category, and adding a route does not quietly create one.         ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const API_DIR = join(__dirname);

/**
 * Deliberately reachable without a session. Each entry needs a reason, because
 * an allowlist nobody has to justify is just a way of turning the test off.
 */
const PUBLIC: Record<string, string> = {
  "health": "liveness probe for the load balancer; returns no tenant data",
  "auth/[...nextauth]": "the sign-in endpoint itself",
  "register": "account creation — there is no session yet by definition",
  "billing/webhook": "authenticated by Stripe's signature, not by a cookie",
  "oracle/share/[token]": "the share link IS the credential; token is unguessable",
  "public/rush/[token]": "share token is the credential, and visibility is re-checked on read",
  "generate": "pure computation, persists nothing",
  "compare": "pure computation, persists nothing",
};

/**
 * Public analysis tools: a signed-out visitor may POST and get a result. They
 * persist a row, so they must never take ownership from the request body —
 * asserted separately below — but they do not require a session.
 */
const PUBLIC_POST_ONLY = new Set(["child", "corporate", "rename", "analyze"]);

/** Any of these means the handler established who is asking. */
const AUTH_MARKERS = [
  "requireUser",
  "requireAdmin",
  "getServerSession",
  "gate(",
  "guarded(",
  "hashApiKey", // app/api/public/oracle authenticates by x-api-key, not a cookie
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** "app/api/stagelab/watchlist/route.ts" -> "stagelab/watchlist" */
const routeId = (file: string) =>
  relative(API_DIR, file).split(sep).slice(0, -1).join("/");

const HANDLER_RE = /export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

const routes = walk(API_DIR).map((file) => ({
  id: routeId(file),
  file,
  source: readFileSync(file, "utf8"),
}));

describe("every API route decides who is asking", () => {
  it("found the routes to check", () => {
    // Without this the regexes below could match nothing and pass vacuously.
    expect(routes.length).toBeGreaterThan(40);
    expect(routes.some((r) => r.id === "child")).toBe(true);
    expect(routes.some((r) => r.id.startsWith("stagelab/"))).toBe(true);
  });

  it("checks identity, or is on the public list with a reason", () => {
    const unguarded: string[] = [];
    for (const route of routes) {
      if (route.id in PUBLIC) continue;
      const hasAuth = AUTH_MARKERS.some((m) => route.source.includes(m));
      if (!hasAuth) unguarded.push(route.id);
    }
    expect(unguarded, "routes with neither an auth check nor a documented exemption").toEqual([]);
  });

  it("never reads the owner of a row from the caller's own request", () => {
    // `userId` arriving in a body or a query string is the caller asserting
    // which account a row belongs to. That is the server's decision.
    const offenders: string[] = [];
    for (const route of routes) {
      const code = route.source
        .split("\n")
        .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
        .join("\n");
      if (/searchParams\.get\(\s*["']userId["']\s*\)/.test(code)) {
        offenders.push(`${route.id}: reads userId from the query string`);
      }
      // `const { …, userId } = body` / `= await request.json()`
      if (/const\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*(body|await\s+req)/.test(code)) {
        offenders.push(`${route.id}: destructures userId out of the request body`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("scopes the public analysis tools' history reads to the session", () => {
    for (const id of Array.from(PUBLIC_POST_ONLY)) {
      const route = routes.find((r) => r.id === id);
      if (!route || !/export\s+async\s+function\s+GET\b/.test(route.source)) continue;
      const get = route.source.slice(route.source.indexOf("export async function GET"));
      expect(get, `${id} GET must return 401 without a session`).toContain("401");
      expect(get, `${id} GET must scope by the viewer`).toMatch(/where:\s*\{\s*userId:\s*viewer\.id\s*\}/);
    }
  });

  it("every exemption carries a reason", () => {
    for (const [id, why] of Object.entries(PUBLIC)) {
      expect(why.length, `${id} needs a real justification`).toBeGreaterThan(20);
      expect(routes.some((r) => r.id === id), `${id} is allowlisted but no such route exists`).toBe(true);
    }
  });
});

describe("handler coverage", () => {
  it("sees a realistic number of handlers", () => {
    const total = routes.reduce(
      (n, r) => n + Array.from(r.source.matchAll(HANDLER_RE)).length,
      0,
    );
    expect(total).toBeGreaterThan(60);
  });
});
