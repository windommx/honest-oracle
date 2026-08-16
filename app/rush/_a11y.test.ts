import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RUSH_DIR = join(process.cwd(), "app", "rush");
const GLOBALS = join(process.cwd(), "app", "globals.css");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}
const rel = (f: string) => f.replace(process.cwd() + "/", "");

describe("keyboard accessibility (WCAG 2.4.7 Focus Visible)", () => {
  it("a global :focus-visible ring exists — it did not before this pass", () => {
    // Measured: `focus-visible:` appeared ZERO times across 154 interactive elements in
    // app/rush, while `focus:outline-none` appeared 7 times, actively removing the
    // browser's ring with no replacement. A keyboard user could not see where they were.
    const css = readFileSync(GLOBALS, "utf8");
    expect(css).toMatch(/:focus-visible\s*\{/);
    expect(css).toMatch(/outline:\s*2px solid/);
  });

  it("every className=\"input\" resolves to a real style rule", () => {
    // `.input` was used 11 times across /rush and /rush/studio and was defined NOWHERE —
    // not in globals.css, not in tailwind.config. Those fields rendered with no border,
    // background or padding at all.
    const users = tsxFiles(RUSH_DIR).filter((f) => readFileSync(f, "utf8").includes('className="input"'));
    if (users.length === 0) return; // class retired — nothing to guarantee
    const css = readFileSync(GLOBALS, "utf8");
    expect(css, `.input used in ${users.map(rel).join(", ")} but never defined`).toMatch(/^\.input\s*\{/m);
  });

  it("no element removes the focus outline without the global ring covering it", () => {
    // focus:outline-none is acceptable ONLY because the :where(...):focus-visible rule
    // above repaints a ring for keyboard focus. This test ties the two together so the
    // ring cannot be deleted while the outline-none classes remain.
    const strippers = tsxFiles(RUSH_DIR).filter((f) => readFileSync(f, "utf8").includes("focus:outline-none"));
    if (strippers.length === 0) return;
    const css = readFileSync(GLOBALS, "utf8");
    expect(css, `${strippers.length} file(s) use focus:outline-none; the global ring must exist`)
      .toMatch(/:where\([^)]*\):focus-visible/);
  });
});

describe("screen-reader labelling", () => {
  it("every icon-only button carries an accessible name", () => {
    // An icon-only <button> with no aria-label is an unlabelled control to a screen
    // reader. Heuristic but concrete: a button whose body is a single self-closing
    // element (an icon) and which has no aria-label / title.
    const offenders: string[] = [];
    for (const f of tsxFiles(RUSH_DIR)) {
      const src = readFileSync(f, "utf8");
      for (const m of Array.from(src.matchAll(/<button\b([^>]*)>\s*(<[A-Z][A-Za-z]*\s[^>]*\/>)\s*<\/button>/g))) {
        const attrs = m[1];
        if (!/aria-label|aria-labelledby|title=/.test(attrs)) {
          offenders.push(`${rel(f)}: ${m[0].slice(0, 70).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(offenders, `icon-only buttons without an accessible name:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("every <img> has an alt attribute", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(RUSH_DIR)) {
      for (const m of Array.from(readFileSync(f, "utf8").matchAll(/<img\b([^>]*)>/g))) {
        if (!/\balt=/.test(m[1])) offenders.push(`${rel(f)}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("mobile layout", () => {
  it("the /rush nav wraps instead of overflowing a narrow screen", () => {
    // It carried five gold pills with no breakpoint handling, so the last actions were
    // pushed off-canvas on a phone. Many Thai writers are mobile-first.
    const nav = readFileSync(join(RUSH_DIR, "page.tsx"), "utf8");
    const navRow = nav.slice(nav.indexOf("<nav"), nav.indexOf("</nav>"));
    expect(navRow).toContain("flex-wrap");
  });
});

describe("bundle discipline", () => {
  it("the light UI primitives import no engine analyzer", () => {
    // _ui.tsx exists so that importing <Field> does not drag in every analyzer. If an
    // engine import lands here, /rush's initial bundle silently grows again and the
    // dynamic-imported modals stop being split at all — which is exactly what happened
    // while _components still owned these four helpers.
    const ui = readFileSync(join(RUSH_DIR, "_ui.tsx"), "utf8");
    const imports = Array.from(ui.matchAll(/^import .*from "([^"]+)";$/gm)).map((m) => m[1]);
    const engineImports = imports.filter((i) => i.includes("rush-engine") && !i.endsWith("/types"));
    expect(engineImports, `_ui.tsx must stay analyzer-free, found: ${engineImports.join(", ")}`).toEqual([]);
  });

  it("/rush loads the heavy modals dynamically, not statically", () => {
    const page = readFileSync(join(RUSH_DIR, "page.tsx"), "utf8");
    for (const modal of ["GuideModal", "ThaiAnalyzerModal", "ProseAnalyzerModal"]) {
      expect(page, `${modal} must be dynamic`).toMatch(new RegExp(`const ${modal} = dynamic\\(`));
    }
    // and the light helpers must NOT come from _components (that static import is what
    // pinned the whole module into the first chunk despite the dynamic imports)
    expect(page).not.toMatch(/import \{[^}]*Field[^}]*\} from "\.\/_components"/);
  });
});
