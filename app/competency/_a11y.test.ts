import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "app", "competency");

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

describe("app/competency accessibility guards", () => {
  it("every icon-only <button> or <Link> carries an accessible name", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(DIR)) {
      const src = readFileSync(f, "utf8");
      for (const m of Array.from(src.matchAll(/<(button|Link)\b([^>]*)>\s*(<[A-Z][A-Za-z0-9]*\s[^>]*\/>)\s*<\/\1>/g))) {
        if (!/aria-label|aria-labelledby|title=/.test(m[2])) offenders.push(`${rel(f)}: ${m[0].slice(0, 80).replace(/\s+/g, " ")}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("every form control with an id has a matching <label htmlFor> or <Field htmlFor>", () => {
    const offenders: string[] = [];
    for (const f of tsxFiles(DIR)) {
      const src = readFileSync(f, "utf8");
      const ids = Array.from(src.matchAll(/<(?:input|select|textarea)\b[^>]*\bid="([^"]+)"/g)).map((m) => m[1]);
      for (const id of ids) {
        if (!src.includes(`htmlFor="${id}"`)) offenders.push(`${rel(f)}: #${id}`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("nothing conveys a level by colour alone: every level pip/bar sits next to a written value", () => {
    // The chart module writes each value as <text>; the per-criterion Pips are aria-hidden
    // and paired with the "x/10" number. Guard the pairing in _nurses.tsx.
    const src = readFileSync(join(DIR, "_nurses.tsx"), "utf8");
    expect(src).toMatch(/<Pips point=\{p\} \/>\s*<span[^>]*>\{p \* 2\}\/10<\/span>/);
  });

  it("the print stylesheet hides chrome and the module re-colours the focus ring for a light surface", () => {
    const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
    expect(css).toMatch(/\.competency \.no-print\s*\{\s*display:\s*none !important/);
    expect(css).toMatch(/\.competency :where\([^)]*\):focus-visible\s*\{\s*outline-color:/);
  });
});
