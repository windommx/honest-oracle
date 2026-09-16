import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Contrast, checked rather than assumed.                                  ║
// ║                                                                          ║
// ║  StageLab renders on two surfaces: the page (zinc-950) and the cards     ║
// ║  that sit on it (zinc-900 at 60% over the page, which lightens it a      ║
// ║  little — so the page is the harder of the two and every text colour is  ║
// ║  measured against both).                                                 ║
// ║                                                                          ║
// ║  The rule the whole palette follows: zinc-400 is the faintest text tone  ║
// ║  allowed. zinc-500 reads fine on a bright monitor and fails AA, which is ║
// ║  exactly the kind of thing that survives review and fails a user.        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The two backgrounds StageLab text ever sits on. */
const PAGE = "#09090b"; // zinc-950
const CARD = "#18181b"; // zinc-900

/**
 * Inverse text: dark type on a filled accent (the primary button). These are
 * checked against the fill they sit on, not the page — measuring them against
 * zinc-950 would be measuring a pairing that never appears on screen.
 */
const ON_ACCENT: Record<string, string> = {
  "zinc-950": "#10b981", // emerald-500 — the primary button fill
};

/** Tailwind v3 values for every text colour the module uses. */
const TEXT_COLORS: Record<string, string> = {
  "zinc-50": "#fafafa",
  "zinc-100": "#f4f4f5",
  "zinc-200": "#e4e4e7",
  "zinc-300": "#d4d4d8",
  "zinc-400": "#a1a1aa",
  "zinc-500": "#71717a",
  "zinc-600": "#52525b",
  "emerald-100": "#d1fae5",
  "emerald-200": "#a7f3d0",
  "emerald-300": "#6ee7b7",
  "emerald-400": "#34d399",
  "amber-100": "#fef3c7",
  "amber-200": "#fde68a",
  "amber-300": "#fcd34d",
  "amber-400": "#fbbf24",
  "orange-300": "#fdba74",
  "orange-400": "#fb923c",
  "red-100": "#fee2e2",
  "red-300": "#fca5a5",
  "red-400": "#f87171",
  "yellow-400": "#facc15",
  "sky-400": "#38bdf8",
  "violet-400": "#a78bfa",
};

const DIR = join(process.cwd(), "app", "stagelab");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if ((p.endsWith(".tsx") || p.endsWith(".ts")) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

/**
 * Decorative uses that are not text: `text-center`, `text-xs`, `text-right`
 * and friends share the prefix. Only colour tokens we know about are checked,
 * and an unknown colour token fails loudly rather than being skipped.
 */
const NON_COLOR = /^(left|center|right|justify|start|end|xs|sm|base|lg|xl|\d?xl|\[)/;

const used = new Map<string, string[]>();
for (const file of tsxFiles(DIR)) {
  const source = readFileSync(file, "utf8");
  for (const m of Array.from(source.matchAll(/text-([a-z]+-\d{2,3}|[a-z]+)/g))) {
    const token = m[1];
    if (NON_COLOR.test(token)) continue;
    if (!used.has(token)) used.set(token, []);
    const list = used.get(token)!;
    if (!list.includes(file)) list.push(file);
  }
}

describe("StageLab contrast", () => {
  it("scans the module (guards against the file walker matching nothing)", () => {
    expect(used.size).toBeGreaterThan(5);
  });

  it("knows every text colour the module uses", () => {
    const unknown = Array.from(used.keys()).filter(
      (t) => !(t in TEXT_COLORS) && !(t in ON_ACCENT) && !["transparent", "inherit", "current"].includes(t),
    );
    expect(unknown, "add these to TEXT_COLORS with their hex, then re-run").toEqual([]);
  });

  it("clears WCAG AA (4.5:1) on both surfaces for every text colour in use", () => {
    const failures: string[] = [];
    for (const token of Array.from(used.keys())) {
      const accentBg = ON_ACCENT[token];
      if (accentBg) {
        const ratio = contrast(token === "zinc-950" ? "#09090b" : TEXT_COLORS[token], accentBg);
        if (ratio < 4.5) failures.push(`text-${token} on its accent fill: ${ratio.toFixed(2)}:1`);
        continue;
      }
      const hex = TEXT_COLORS[token];
      if (!hex) continue;
      for (const [name, bg] of [["page", PAGE], ["card", CARD]] as const) {
        const ratio = contrast(hex, bg);
        if (ratio < 4.5) {
          failures.push(`text-${token} on ${name}: ${ratio.toFixed(2)}:1 (used in ${used.get(token)!.length} file(s))`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("verifies the checker itself against a colour that must fail", () => {
    // zinc-500 on zinc-950 is the exact mistake this test exists to catch.
    expect(contrast(TEXT_COLORS["zinc-500"], PAGE)).toBeLessThan(4.5);
    expect(contrast(TEXT_COLORS["zinc-400"], PAGE)).toBeGreaterThanOrEqual(4.5);
  });
});
