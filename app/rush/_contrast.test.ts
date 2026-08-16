import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BG, SURFACE, GOLD, TEXT_FAINT, TEXT_CONTRAST } from "./_tokens";

// ── WCAG 2.1 relative luminance + contrast ratio, computed here rather than trusted ──
const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)];
  return (hi + 0.05) / (lo + 0.05);
};

/** Tailwind v3 scale values the app uses for TEXT. */
const TAILWIND_TEXT: Record<string, string> = {
  "gray-200": "#e5e7eb", "gray-300": "#d1d5db", "gray-400": "#9ca3af",
  "gray-500": "#6b7280", "gray-600": "#4b5563", "gray-700": "#374151",
  "slate-200": "#e2e8f0", "slate-300": "#cbd5e1", "slate-400": "#94a3b8",
  "slate-500": "#64748b", "slate-600": "#475569",
  faint: TEXT_FAINT,
};

const RUSH_DIR = join(process.cwd(), "app", "rush");
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

const AA_NORMAL = 4.5;

/** Composite a translucent layer over a base into the effective solid colour a reader sees. */
function over(fg: string, alpha: number, bg: string): string {
  const parts = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = parts(fg);
  const [x, y, z] = parts(bg);
  const mix = (f: number, k: number) => Math.round(f * alpha + k * (1 - alpha));
  return "#" + [mix(r, x), mix(g, y), mix(b, z)].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Every surface a faint label can actually land on, drawn from the overlay classes the app
 *  uses (bg-white/[0.02]…/10, bg-[#c9a84c]/[0.06]…/15) composited over the page. */
const SURFACES: Record<string, string> = {
  "page BG": BG,
  "raised SURFACE": SURFACE,
  "white/[0.02]": over("#ffffff", 0.02, BG),
  "white/[0.03]": over("#ffffff", 0.03, BG),
  "white/5": over("#ffffff", 0.05, BG),
  "white/10": over("#ffffff", 0.1, BG),
  "gold/[0.06]": over(GOLD, 0.06, BG),
  "gold/10": over(GOLD, 0.1, BG),
  "gold/15": over(GOLD, 0.15, BG),
};

describe("WCAG contrast (2.1 AA, 4.5:1 for normal text)", () => {
  it("the maths matches the published anchors", () => {
    // Sanity-check the implementation before trusting its verdicts: white on black is
    // exactly 21:1, and a colour against itself is exactly 1:1.
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("every text colour used in app/rush clears AA against the page background", () => {
    // Measured before this pass, against BG #0a0a0f:
    //   text-gray-500  4.09:1  — the app's MOST-used text colour (116 uses), on 0.62-0.72rem
    //   text-slate-500 4.15:1
    //   text-gray-600  2.61:1  ] below even the 3:1 large-text floor
    //   text-slate-600 2.61:1  ]
    //   text-gray-700  1.92:1  ]
    // Secondary text at 2.61:1 on a dark page is not a nuance; it is unreadable for many
    // readers, and Thai writers reading long prose on phones are exactly who pays.
    const failures: string[] = [];
    for (const file of tsxFiles(RUSH_DIR)) {
      const src = readFileSync(file, "utf8");
      for (const [name, hex] of Object.entries(TAILWIND_TEXT)) {
        const used = new RegExp(`(?<![-\\w])(?:hover:)?text-${name}\\b`).test(src);
        if (!used) continue;
        const ratio = contrast(hex, BG);
        if (ratio < AA_NORMAL) {
          failures.push(`${file.replace(process.cwd() + "/", "")}: text-${name} ${hex} = ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(failures, `text below ${AA_NORMAL}:1 on ${BG}:\n${failures.join("\n")}`).toEqual([]);
  });

  it("the faint tier clears AA on EVERY surface, not just the page background", () => {
    // The gap this closes, found by extending the audit: the first faint value (#757d8c)
    // cleared 4.77:1 on BG and was shipped — then measured 4.35:1 on bg-white/5 and 3.78:1
    // on bg-white/10. A colour tuned against one background silently fails on every card
    // and chip drawn over it, and cards are where small print lives.
    const failures: string[] = [];
    for (const [name, surface] of Object.entries(SURFACES)) {
      const r = contrast(TEXT_FAINT, surface);
      if (r < AA_NORMAL) failures.push(`${name} (${surface}): ${r.toFixed(2)}:1`);
    }
    expect(failures, `TEXT_FAINT below AA on:\n${failures.join("\n")}`).toEqual([]);
  });

  it("the faint tier is still visibly fainter than the muted tier", () => {
    // Passing AA by simply brightening to gray-400 would collapse two levels into one.
    expect(contrast(TEXT_FAINT, BG)).toBeLessThan(contrast("#9ca3af", BG));
  });

  it("black-on-gold buttons and gold-on-dark text clear AA", () => {
    expect(contrast("#000000", GOLD)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(GOLD, BG)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(GOLD, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it("the recorded ratios in _tokens.ts match a fresh computation", () => {
    // TEXT_CONTRAST is documentation; documentation that drifts from the code is worse than
    // none, so it is recomputed rather than trusted.
    expect(contrast("#e5e7eb", BG)).toBeCloseTo(TEXT_CONTRAST["gray-200"], 1);
    expect(contrast("#d1d5db", BG)).toBeCloseTo(TEXT_CONTRAST["gray-300"], 1);
    expect(contrast("#9ca3af", BG)).toBeCloseTo(TEXT_CONTRAST["gray-400"], 1);
    expect(contrast(TEXT_FAINT, BG)).toBeCloseTo(TEXT_CONTRAST.TEXT_FAINT, 1);
  });
});
