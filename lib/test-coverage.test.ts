import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  Every test file in the repo is actually run.                     ║
// ║                                                                    ║
// ║  components/knob.test.ts was written, committed and passed         ║
// ║  `npm run verify` without ever executing: vitest's `include` only  ║
// ║  listed lib/** and app/**. A guard nobody runs is worse than no    ║
// ║  guard, because it reads as coverage in the file tree. This checks ║
// ║  the config against what is on disk so the next directory cannot   ║
// ║  go missing the same way.                                          ║
// ╚══════════════════════════════════════════════════════════════════╝

const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", "dist", "coverage", "public", ".vercel"]);

function testFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) testFiles(full, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(full.replace(ROOT + "/", ""));
  }
  return out;
}

describe("the test runner sees every test", () => {
  it("no test file lives outside vitest's include patterns", () => {
    const config = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    const includes = Array.from(config.matchAll(/"([^"]*\*\*[^"]*)"/g)).map((m) => m[1]);
    expect(includes.length, "could not read the include list").toBeGreaterThan(0);

    const roots = includes.map((pattern) => pattern.split("/")[0]);
    const orphans = testFiles(ROOT).filter((file) => !roots.includes(file.split("/")[0]));
    expect(
      orphans,
      `these test files are never run — add their directory to vitest.config.ts:\n${orphans.join("\n")}`
    ).toEqual([]);
  });

  it("finds the tests it is checking, rather than passing on an empty list", () => {
    expect(testFiles(ROOT).length).toBeGreaterThan(50);
  });
});
