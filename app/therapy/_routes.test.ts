import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const THERAPY_DIR = join(process.cwd(), "app", "therapy");
const GLOBALS = join(process.cwd(), "app", "globals.css");

/** Every /therapy/* route that has a page.tsx. */
function routes(): string[] {
  return readdirSync(THERAPY_DIR).filter((name) => {
    const p = join(THERAPY_DIR, name);
    if (!statSync(p).isDirectory()) return false;
    try {
      return statSync(join(p, "page.tsx")).isFile();
    } catch {
      return false;
    }
  });
}

const nav = () => readFileSync(join(THERAPY_DIR, "_nav.tsx"), "utf8");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

describe("every /therapy route is reachable", () => {
  it("no page exists that the nav cannot reach", () => {
    // A route with no link into it is a page that only its author knows about.
    const src = nav();
    const orphans = routes().filter((r) => !src.includes(`/therapy/${r}`));
    expect(orphans, `unreachable route(s): ${orphans.join(", ")}`).toEqual([]);
  });

  it("no nav link points at a route that does not exist", () => {
    const hrefs = Array.from(nav().matchAll(/href: "\/therapy\/([a-z-]+)"/g)).map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    const built = new Set(routes());
    for (const h of hrefs) expect(built.has(h), `nav links to /therapy/${h}, which has no page`).toBe(true);
  });

  it("the safety page is in the top-level nav, not behind a menu", () => {
    // On a mental-health product the crisis page is one tap from anywhere, or
    // it is not really available.
    expect(nav()).toContain("/therapy/safety");
  });
});

describe("accessibility guards for app/therapy", () => {
  it("no file strips the focus ring without the global replacement existing", () => {
    const strippers = tsxFiles(THERAPY_DIR).filter((f) => readFileSync(f, "utf8").includes("focus:outline-none"));
    if (strippers.length === 0) return;
    expect(readFileSync(GLOBALS, "utf8")).toMatch(/:where\([^)]*\):focus-visible/);
  });

  it("every className=\"input\" resolves to a real style rule", () => {
    const users = tsxFiles(THERAPY_DIR).filter((f) => readFileSync(f, "utf8").includes('className="input'));
    if (users.length === 0) return;
    expect(readFileSync(GLOBALS, "utf8")).toMatch(/^\.input\s*\{/m);
  });

  it("no page uses a native alert() — the app has a toast stack", () => {
    for (const f of tsxFiles(THERAPY_DIR)) {
      expect(readFileSync(f, "utf8"), `${f} calls window.alert`).not.toMatch(/\balert\s*\(/);
    }
  });
});

describe("the disclaimer cannot be deleted quietly", () => {
  it("the shell states that this is not diagnosis and not treatment", () => {
    // Present on every /therapy page because it is in the layout, so removing it
    // is a deliberate act that this test makes visible.
    const layout = readFileSync(join(THERAPY_DIR, "layout.tsx"), "utf8");
    expect(layout).toContain("ไม่ใช่การวินิจฉัย");
    expect(layout).toContain("ไม่ใช่การรักษา");
  });

  it("the shell carries a crisis number on every page", () => {
    expect(readFileSync(join(THERAPY_DIR, "layout.tsx"), "utf8")).toContain("1323");
  });
});

describe("the evidence ladder is shown in full, gaps included", () => {
  it("the interventions page renders an empty grade instead of hiding the tab", () => {
    // The catalog currently has no intervention at one grade. Hiding that tab
    // would hide that the ladder has the rung — and the tempting alternative,
    // re-grading something to fill it, is what the grade definitions exist to
    // prevent. So the page must handle an empty grade explicitly.
    const src = readFileSync(join(THERAPY_DIR, "interventions", "page.tsx"), "utf8");
    expect(src).toMatch(/shown\.length > 0/);
  });
});
