import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HEX, PALETTE, BG, ACCENT, ACCENT_BRIGHT, ACCENT_DEEP, SURFACE, ELEVATED, FOREGROUND } from "./_tokens";

const BOOKISDOM_DIR = join(process.cwd(), "app", "bookisdom");
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
  it("no app/bookisdom component uses a hex outside the canonical palette", () => {
    // The drift this catches, measured before the fix:
    //   · TWO page backgrounds (#0a0a0f on 5 pages, #08080e on 4 files) — the
    //     background visibly shifted when navigating between them.
    //   · TWO "bright gold" values for the SAME button hover (#d8b45a vs #e6c86a).
    // A new colour must be added to PALETTE with a reason first, which turns it into a
    // decision instead of an accident.
    const offenders: string[] = [];
    for (const file of tsxFiles(BOOKISDOM_DIR)) {
      for (const hex of hexesIn(readFileSync(file, "utf8"))) {
        if (!ALLOWED_HEX.has(hex)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hex}`);
      }
    }
    expect(offenders, `hex outside PALETTE:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("tailwind.config.ts carries no stale palette value", () => {
    // Blind spot in this guard's first version: it scanned app/bookisdom/*.tsx and globals.css
    // only, so tailwind.config kept the PRE-consolidation background and a third gold after
    // both were removed everywhere else. A theme config that disagrees with the palette is
    // drift with extra steps. Since 2026-09 the whole platform shares ONE palette, so the
    // config may use nothing outside it — the old lifemap-only gold exemption is gone.
    const cfg = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    for (const hex of hexesIn(cfg)) {
      expect(ALLOWED_HEX.has(hex), `tailwind.config.ts has non-canonical ${hex}`).toBe(true);
    }
  });

  it(":root mirrors the TS tokens — the stylesheet and the palette cannot drift apart", () => {
    // 2026-09: one palette platform-wide. Before this, :root carried a dark gold palette for
    // the lifemap product and a scoped [data-app="bookisdom"] block carried a dark purple
    // one; both are replaced by this single light block, so :root IS the palette now.
    const css = readFileSync(GLOBALS, "utf8");
    const start = css.indexOf(":root");
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain(`--background: ${BG}`);
    expect(block).toContain(`--surface: ${SURFACE}`);
    expect(block).toContain(`--elevated: ${ELEVATED}`);
    expect(block).toContain(`--foreground: ${FOREGROUND}`);
    expect(block).toContain(`--accent: ${ACCENT}`);
    expect(block).toContain(`--accent-bright: ${ACCENT_BRIGHT}`);
    expect(block).toContain(`--accent-deep: ${ACCENT_DEEP}`);
    // No second, product-scoped palette may reappear.
    expect(css).not.toContain('[data-app=');
  });

  it("no stylesheet or component still paints the retired dark grounds", () => {
    // The regression this catches: a page root left on the old navy/near-black ground
    // after the platform went light — a black page in a white app.
    const css = readFileSync(GLOBALS, "utf8");
    const retired = ["#0b0e17", "#08080e", "#151a27", "#12121a", "#1c2233", "#ab5bf7", "#c084fc", "#c9a84c"];
    for (const hex of retired) expect(css.toLowerCase().includes(hex), `globals.css still uses retired ${hex}`).toBe(false);
    const offenders: string[] = [];
    for (const file of tsxFiles(join(process.cwd(), "app"))) {
      const src = readFileSync(file, "utf8").toLowerCase();
      for (const hex of retired) if (src.includes(hex)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hex}`);
    }
    expect(offenders, `retired dark-theme hex still in use:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("every full-height page root in app/bookisdom paints the ONE ground, not a look-alike", () => {
    // The specific regression that motivated the original pass: two near-identical page
    // backgrounds, so the ground visibly shifted between routes. Enforced structurally:
    // a `min-h-screen bg-[#…]` root must use BG and nothing else.
    const offenders: string[] = [];
    for (const file of tsxFiles(BOOKISDOM_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const m of Array.from(src.matchAll(/min-h-screen bg-\[(#[0-9a-fA-F]{6})\]/g))) {
        if (m[1].toLowerCase() !== BG.toLowerCase()) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("palette entries are unique — no two names for the same colour", () => {
    const values = Object.values(PALETTE).map((v) => v.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});
