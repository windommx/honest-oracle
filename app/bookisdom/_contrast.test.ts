import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BG, SURFACE, ELEVATED, ACCENT, ACCENT_BRIGHT, TEXT_FAINT, TEXT_CONTRAST } from "./_tokens";

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

/** Tailwind v3 scale values the app uses for TEXT — the neutral scale AND the semantic
 *  shades, so a "text-green-400" (1.9:1 on white) cannot slip back in. */
const TAILWIND_TEXT: Record<string, string> = {
  "gray-300": "#d1d5db", "gray-400": "#94a3b8", "gray-500": "#6b7280", "gray-600": "#4b5563", "gray-700": "#374151", "gray-800": "#1f2937",
  "slate-300": "#cbd5e1", "slate-400": "#94a3b8", "slate-500": "#64748b", "slate-600": "#475569", "slate-700": "#334155", "slate-800": "#1e293b", "slate-900": "#0f172a",
  "green-400": "#4ade80", "green-700": "#15803d", "green-800": "#166534",
  "emerald-400": "#34d399", "emerald-700": "#047857",
  "red-400": "#f87171", "red-600": "#dc2626", "red-700": "#b91c1c",
  "amber-300": "#fcd34d", "amber-400": "#fbbf24", "amber-700": "#b45309", "amber-800": "#92400e",
  "yellow-400": "#facc15", "yellow-800": "#854d0e",
  "orange-300": "#fdba74", "orange-800": "#9a3412",
  "blue-400": "#60a5fa", "blue-700": "#1d4ed8",
  "sky-300": "#7dd3fc", "sky-700": "#0369a1",
  "rose-300": "#fda4af", "rose-400": "#fb7185", "rose-700": "#be123c",
  "cyan-300": "#67e8f9", "cyan-700": "#0e7490",
  "violet-300": "#c4b5fd", "violet-400": "#a78bfa", "violet-700": "#6d28d9",
  "fuchsia-300": "#f0abfc", "fuchsia-700": "#a21caf",
  "indigo-400": "#818cf8", "indigo-700": "#4338ca",
  "teal-700": "#0f766e", "pink-700": "#be185d", "purple-700": "#7e22ce", "lime-800": "#3f6212",
  faint: TEXT_FAINT,
};

const BOOKISDOM_DIR = join(process.cwd(), "app", "bookisdom");
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
 *  uses on the LIGHT ground (bg-black/[0.015]…/10, gold tints bg-[#d9a63a]/15…/25)
 *  composited over the page. */
const SURFACES: Record<string, string> = {
  "page BG": BG,
  "card SURFACE": SURFACE,
  "ELEVATED": ELEVATED,
  "black/[0.02]": over("#000000", 0.02, BG),
  "black/[0.03]": over("#000000", 0.03, BG),
  "black/[0.04]": over("#000000", 0.04, BG),
  "black/[0.06]": over("#000000", 0.06, BG),
  "black/10": over("#000000", 0.1, BG),
  "gold/15": over(ACCENT_BRIGHT, 0.15, BG),
  "gold/25": over(ACCENT_BRIGHT, 0.25, BG),
};

describe("WCAG contrast (2.1 AA, 4.5:1 for normal text)", () => {
  it("the maths matches the published anchors", () => {
    // Sanity-check the implementation before trusting its verdicts: white on black is
    // exactly 21:1, and a colour against itself is exactly 1:1.
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#777777")).toBeCloseTo(1, 5);
  });

  it("every text colour used in app/bookisdom clears AA against the page background", () => {
    // History: on the dark theme text-slate-500 (4.09:1) was the most-used colour. On the
    // LIGHT theme the failure mode inverts — the dark theme's text-slate-400 / gray-400
    // (#94a3b8) measure 2.53:1 on this ground, and text-green-400 1.9:1 — so the migration
    // mapped every 300/400 shade to a 600–800 one. This test is what keeps them there.
    const failures: string[] = [];
    for (const file of tsxFiles(BOOKISDOM_DIR)) {
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
    expect(contrast(TEXT_FAINT, BG)).toBeLessThan(contrast("#4b5563", BG));
  });

  it("dark-on-gold buttons, gold-on-light text, and gold text on gold tints clear AA", () => {
    // The reference screen's brighter golds were refused for TEXT because they measure
    // 3.6–4.3:1 here; ACCENT (#7a5c12) is the darkest gold that still reads as gold and
    // clears 4.5 on every surface. Fills keep the bright gold with DARK text: white on the
    // fill measured 2.22:1, which is why button text is never white.
    expect(contrast("#14161c", ACCENT_BRIGHT)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast("#000000", ACCENT_BRIGHT)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(ACCENT, BG)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(ACCENT, SURFACE)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrast(ACCENT, ELEVATED)).toBeGreaterThanOrEqual(AA_NORMAL);
    for (const [name, surface] of Object.entries(SURFACES)) {
      expect(contrast(ACCENT, surface), `ACCENT on ${name}`).toBeGreaterThanOrEqual(AA_NORMAL);
    }
    expect(contrast("#ffffff", ACCENT_BRIGHT)).toBeLessThan(AA_NORMAL); // documents the refusal
    expect(contrast("#9a7418", BG)).toBeLessThan(AA_NORMAL); // the reference's eyebrow gold — refused for text
  });

  it("the recorded ratios in _tokens.ts match a fresh computation", () => {
    // TEXT_CONTRAST is documentation; documentation that drifts from the code is worse than
    // none, so it is recomputed rather than trusted.
    expect(contrast("#475569", BG)).toBeCloseTo(TEXT_CONTRAST["slate-600"], 1);
    expect(contrast("#334155", BG)).toBeCloseTo(TEXT_CONTRAST["slate-700"], 1);
    expect(contrast("#1e293b", BG)).toBeCloseTo(TEXT_CONTRAST["slate-800"], 1);
    expect(contrast(TEXT_FAINT, BG)).toBeCloseTo(TEXT_CONTRAST.TEXT_FAINT, 1);
  });
});
