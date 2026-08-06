import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HEX, PALETTE, BG, GOLD, GOLD_BRIGHT, GOLD_DEEP, SURFACE } from "./_tokens";

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

/** Every 3- or 6-digit hex literal in a file, lower-cased. */
function hexesIn(src: string): string[] {
  return (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase());
}

describe("design tokens — consistency is enforced, not merely intended", () => {
  it("no app/rush component uses a hex outside the canonical palette", () => {
    // The drift this catches, measured before the fix:
    //   · TWO page backgrounds (#0a0a0f on 5 pages, #08080e on 4 files) — the
    //     background visibly shifted when navigating between them.
    //   · TWO "bright gold" values for the SAME button hover (#d8b45a vs #e6c86a).
    // A new colour must be added to PALETTE with a reason first, which turns it into a
    // decision instead of an accident.
    const offenders: string[] = [];
    for (const file of tsxFiles(RUSH_DIR)) {
      for (const hex of hexesIn(readFileSync(file, "utf8"))) {
        if (!ALLOWED_HEX.has(hex)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hex}`);
      }
    }
    expect(offenders, `hex outside PALETTE:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("tailwind.config.ts carries no stale palette value", () => {
    // Blind spot in this guard's first version: it scanned app/rush/*.tsx and globals.css
    // only, so tailwind.config kept the PRE-consolidation background (#08080e) and the
    // third gold (#d4b96a) after both were removed everywhere else. A theme config that
    // disagrees with the palette is drift with extra steps.
    const cfg = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    for (const hex of hexesIn(cfg)) {
      expect(ALLOWED_HEX.has(hex), `tailwind.config.ts has non-canonical ${hex}`).toBe(true);
    }
  });

  it("globals.css :root mirrors the TS tokens — the two cannot drift apart", () => {
    const css = readFileSync(GLOBALS, "utf8");
    const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
    expect(root).toContain(`--background: ${BG}`);
    expect(root).toContain(`--surface: ${SURFACE}`);
    expect(root).toContain(`--gold: ${GOLD}`);
    expect(root).toContain(`--gold-bright: ${GOLD_BRIGHT}`);
    expect(root).toContain(`--gold-deep: ${GOLD_DEEP}`);
  });

  it("exactly one page background exists", () => {
    // The specific regression that motivated the pass: two near-identical page
    // backgrounds. Any second dark surface must be a named token with a stated role.
    const dark = Array.from(ALLOWED_HEX).filter((h) => /^#0[0-9a-f]/.test(h));
    expect(dark).toEqual([BG.toLowerCase()]);
  });

  it("palette entries are unique — no two names for the same colour", () => {
    const values = Object.values(PALETTE).map((v) => v.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});
