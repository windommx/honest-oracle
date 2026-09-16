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

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Extract the balanced `(...)` argument text following an index. */
function callArgs(source: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(openParen + 1, i);
    }
  }
  return "";
}

interface Call {
  file: string;
  model: string;
  method: string;
  args: string;
}

function prismaCalls(file: string): Call[] {
  const source = readFileSync(file, "utf8");
  const calls: Call[] = [];
  const re = /prisma\.(stage[A-Za-z]*)\.(\w+)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const openParen = m.index + m[0].length - 1;
    calls.push({
      file: file.slice(ROOT.length + 1),
      model: m[1],
      method: m[2],
      args: callArgs(source, openParen),
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
      return !c.args.includes("userId");
    }).map((c) => `${c.file}: prisma.${c.model}.${c.method}()`);

    expect(offenders).toEqual([]);
  });

  it("only treats the shared universe as unscoped", () => {
    const unscoped = new Set(
      ALL_CALLS.filter((c) => !c.args.includes("userId")).map((c) => c.model),
    );
    for (const model of Array.from(unscoped)) {
      expect(
        SHARED_MODELS.has(model) || PARENT_SCOPED_MODELS.has(model),
        `${model} is queried without userId but is not a documented exemption`,
      ).toBe(true);
    }
  });

  it("guards every route handler with gate() or an explicit admin check", () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const source = readFileSync(file, "utf8");
      const handlers = source.match(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? [];
      if (handlers.length === 0) continue;

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
