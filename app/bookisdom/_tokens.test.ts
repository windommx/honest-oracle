import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HEX, LEGACY_LIFEMAP_HEX, PALETTE, BG, ACCENT, ACCENT_BRIGHT, ACCENT_DEEP, SURFACE } from "./_tokens";

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
    // only, so tailwind.config kept the PRE-consolidation background (#08080e) and the
    // third gold (#d4b96a) after both were removed everywhere else. A theme config that
    // disagrees with the palette is drift with extra steps.
    const cfg = readFileSync(join(process.cwd(), "tailwind.config.ts"), "utf8");
    for (const hex of hexesIn(cfg)) {
      // The `gold` scale is the LIFEMAP app's brand (register/login/lifemap pages) and is
      // declared as such in LEGACY_LIFEMAP_HEX — allowed in the shared theme config, still
      // barred from app/bookisdom components by the scan above.
      const ok = ALLOWED_HEX.has(hex) || LEGACY_LIFEMAP_HEX.has(hex);
      expect(ok, `tailwind.config.ts has non-canonical ${hex}`).toBe(true);
    }
  });

  it("the [data-app=\"bookisdom\"] CSS block mirrors the TS tokens — the two cannot drift apart", () => {
    // NOT :root. This repo ships two products from one stylesheet: :root carries the
    // LIFEMAP palette (gold), and the bookisdom theme is scoped to its own segment. Asserting
    // :root here is what let the bookisdom theme leak product-wide in the first place —
    // a navy body behind lifemap's near-black pages, and purple focus rings on a
    // gold-branded product.
    const css = readFileSync(GLOBALS, "utf8");
    const start = css.indexOf('[data-app="bookisdom"]');
    expect(start, "globals.css has no [data-app=\"bookisdom\"] block").toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    expect(block).toContain(`--background: ${BG}`);
    expect(block).toContain(`--surface: ${SURFACE}`);
    expect(block).toContain(`--accent: ${ACCENT}`);
    expect(block).toContain(`--accent-bright: ${ACCENT_BRIGHT}`);
    expect(block).toContain(`--accent-deep: ${ACCENT_DEEP}`);
  });

  it("the bookisdom palette does not leak into :root, where the lifemap product lives", () => {
    // Each bookisdom colour must be absent from :root. A regression here is invisible in
    // the bookisdom app (it looks right) and only shows up as the WRONG product changing.
    const css = readFileSync(GLOBALS, "utf8");
    const root = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));
    for (const hex of Array.from(ALLOWED_HEX)) {
      // PAPER previews print stock and TIER colours are semantic, not theme chrome —
      // only the surfaces/accent can leak, and those are what :root defines.
      if (!/^#(0b0e17|151a27|1c2233|ab5bf7|c084fc|7c3aed)$/.test(hex)) continue;
      expect(root.includes(hex), `:root leaks the bookisdom colour ${hex} into the lifemap app`).toBe(false);
    }
  });

  it("the bookisdom segment is actually marked, or the scoped block never applies", () => {
    // The CSS above is inert unless something sets data-app="bookisdom". This asserts the
    // wiring exists, so the two halves cannot drift apart silently.
    const layout = readFileSync(join(BOOKISDOM_DIR, "layout.tsx"), "utf8");
    expect(layout).toContain('data-app="bookisdom"');
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
