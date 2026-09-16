import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The tenancy guard.                                                      ║
// ║                                                                          ║
// ║  In a multi-tenant product the worst bug is not a crash — it is a query  ║
// ║  that quietly returns someone else's positions. Code review catches that ║
// ║  right up until the day it doesn't, so this is a static check over every ║
// ║  StageLab query in the repository:                                       ║
// ║                                                                          ║
// ║    every prisma.stage*  call must mention userId,                        ║
// ║    every route must open with a gate() call,                             ║
// ║                                                                          ║
// ║  with exactly two documented exemptions. A new route that forgets either ║
// ║  fails here rather than in production.                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const ROOT = join(__dirname, "..", "..");
const API_DIR = join(ROOT, "app", "api", "stagelab");
const LIB_DIR = join(ROOT, "lib", "stagelab");

/** Shared reference data, owned by nobody: the SET universe every tenant reads. */
const SHARED_MODELS = new Set(["stageStock"]);

/**
 * Reached only through its parent thesis, which is ownership-checked first.
 * Adding userId here would duplicate the truth and let the two disagree.
 */
const PARENT_SCOPED_MODELS = new Set(["stageEarningsQuarter"]);

/** Matches both handler forms: a bare export and one wrapped in guarded(). */
const HANDLER_RE = /export (?:async function|const) (GET|POST|PUT|PATCH|DELETE)\b/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Text between a bracket at `start` and its match. Works for ( ) and { }. */
function balanced(source: string, start: number, open: string, close: string): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return "";
}

const callArgs = (source: string, openParen: number) => balanced(source, openParen, "(", ")");

interface Call {
  file: string;
  model: string;
  method: string;
  args: string;
  /** True when the scoping is visible either inline or in a bound predicate. */
  scoped: boolean;
}

/**
 * Resolve `where: someName` to the object literal that name was bound to.
 *
 * A route may legitimately hoist its predicate — `const where = { userId, ... }`
 * reused by a findMany and its matching count. The checker stays SOUND rather
 * than clever: it only accepts a hoisted predicate it can actually see bound to
 * a literal containing userId in the same file. Anything it cannot prove, it
 * rejects, which is the correct default for a check whose whole job is to fail
 * loudly.
 */
export function boundPredicatesWithUserId(source: string): Set<string> {
  const names = new Set<string>();
  const re = /const\s+(\w+)\s*=\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    // The brace the match ends on, not a paren — an object literal is not a
    // call, and reusing the paren matcher here silently returned "" for every
    // binding, which made the checker accept nothing and then everything.
    const body = balanced(source, m.index + m[0].length - 1, "{", "}");
    if (/\buserId\b/.test(body)) names.add(m[1]);
  }
  return names;
}

function prismaCalls(file: string): Call[] {
  const source = readFileSync(file, "utf8");
  const scopedNames = boundPredicatesWithUserId(source);
  const calls: Call[] = [];
  const re = /prisma\.(stage[A-Za-z]*)\.(\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openParen = m.index + m[0].length - 1;
    const args = callArgs(source, openParen);
    // `where: name` or the `where,` shorthand, resolved against the bindings.
    const ref = /where:\s*(\w+)\s*[,}]/.exec(args)?.[1] ?? (/\bwhere\s*[,}]/.test(args) ? "where" : null);
    const scoped = /\buserId\b/.test(args) || (ref !== null && scopedNames.has(ref));
    calls.push({
      file: file.slice(ROOT.length + 1),
      model: m[1],
      method: m[2],
      args,
      scoped,
    });
  }
  return calls;
}

const ALL_FILES = [...walk(API_DIR), ...walk(LIB_DIR)];
const ALL_CALLS = ALL_FILES.flatMap(prismaCalls);

describe("StageLab tenancy", () => {
  it("finds the StageLab query surface (guards against the walker silently matching nothing)", () => {
    expect(ALL_CALLS.length).toBeGreaterThan(25);
  });

  it("scopes every query on a tenant-owned model by userId", () => {
    const offenders = ALL_CALLS.filter((c) => {
      if (SHARED_MODELS.has(c.model)) return false;
      if (PARENT_SCOPED_MODELS.has(c.model)) return false;
      return !c.scoped;
    }).map((c) => `${c.file}: prisma.${c.model}.${c.method}()`);

    expect(offenders).toEqual([]);
  });

  it("still rejects a hoisted predicate that does NOT carry userId", () => {
    // Resolving `where: name` made the checker more permissive, so this proves
    // the permissiveness is bounded: a predicate bound without userId is still
    // an offender, and an unresolvable reference is treated as one too.
    const scoped = boundPredicatesWithUserId(`
      const where = { userId, status: 'OPEN' }
      const sneaky = { status: 'OPEN' }
    `);
    expect(scoped.has("where")).toBe(true);
    expect(scoped.has("sneaky")).toBe(false);
    expect(scoped.has("neverDeclared")).toBe(false);
  });

  it("only treats the shared universe as unscoped", () => {
    const unscoped = new Set(ALL_CALLS.filter((c) => !c.scoped).map((c) => c.model));
    for (const model of Array.from(unscoped)) {
      expect(
        SHARED_MODELS.has(model) || PARENT_SCOPED_MODELS.has(model),
        `${model} is queried without userId but is not a documented exemption`,
      ).toBe(true);
    }
  });

  it("exports a handler from every route file (guards against the matcher going vacuous)", () => {
    // This test exists because the check below used to look for
    // `export async function GET`. When the handlers were wrapped in guarded()
    // that pattern stopped matching anything, and the guard test went green by
    // examining zero files. A safety net that can silently unhook is worse than
    // no safety net, so the count is now asserted explicitly.
    const counts = walk(API_DIR).map((f) => HANDLER_RE.exec(readFileSync(f, "utf8")) !== null);
    expect(counts.length).toBeGreaterThan(15);
    expect(counts.every(Boolean)).toBe(true);
  });

  it("guards every route handler with gate() or an explicit admin check", () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const source = readFileSync(file, "utf8");
      HANDLER_RE.lastIndex = 0;
      if (!HANDLER_RE.test(source)) continue;

      // Every handler body must begin its work behind one of these. The session
      // route uses stageContext() directly because it *reports* the plan rather
      // than gating on it; the admin universe sync uses requireAdmin().
      const guarded =
        source.includes("await gate(") ||
        source.includes("await stageContext()") ||
        source.includes("await requireAdmin()");
      if (!guarded) offenders.push(file.slice(ROOT.length + 1));
    }
    expect(offenders).toEqual([]);
  });

  it("wraps every handler so an unexpected throw cannot reach the client as a stack", () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const source = readFileSync(file, "utf8");
      HANDLER_RE.lastIndex = 0;
      if (!HANDLER_RE.test(source)) continue;
      if (!source.includes("guarded(")) offenders.push(file.slice(ROOT.length + 1));
    }
    expect(offenders).toEqual([]);
  });

  it("returns a caught exception's message only when it is a typed StageInputError", () => {
    // `error.message` off a Prisma failure carries constraint names, column
    // lists, and sometimes the connection target. The one safe case is a
    // StageInputError, which by construction holds a sentence written for a
    // user — so the guard has to be visible on the same line.
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const source = readFileSync(file, "utf8");
      for (const line of source.split("\n")) {
        if (!/\b(error|cause|err)\.message\b/.test(line)) continue;
        if (line.includes("isStageInputError")) continue;
        offenders.push(`${file.slice(ROOT.length + 1)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the engines free of HTTP concerns", () => {
    // An engine that imports next/server is an engine that cannot be unit
    // tested, and a layering mistake that tends to spread.
    const offenders = walk(LIB_DIR)
      .filter((f) => !f.endsWith("guard.ts") && !f.endsWith("problem.ts") && !f.endsWith("http.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("next/server"))
      .map((f) => f.slice(ROOT.length + 1));
    expect(offenders).toEqual([]);
  });

  it("never reaches for getServerSession or the raw user table inside StageLab routes", () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const source = readFileSync(file, "utf8");
      // Auth belongs in lib/server/session.ts. A route that resolves the
      // session itself is a route that can get the resolution subtly wrong.
      if (source.includes("getServerSession")) offenders.push(`${file}: getServerSession`);
      if (/prisma\.user\./.test(source)) offenders.push(`${file}: prisma.user`);
    }
    expect(offenders).toEqual([]);
  });
});
