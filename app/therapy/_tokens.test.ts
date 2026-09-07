import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HEX, BG, CRISIS, GRADE_COLOR, PALETTE, SEVERITY_COLOR } from "./_tokens";
import { BASE_PALETTE } from "@/lib/design/tokens";
import { GRADE_ORDER } from "@/lib/therapy-engine/evidence";
import { BANDS } from "@/lib/therapy-engine/scoring";

const THERAPY_DIR = join(process.cwd(), "app", "therapy");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

const hexesIn = (src: string): string[] => (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase());

describe("app/therapy design tokens — consistency is enforced, not intended", () => {
  it("no component uses a hex outside the canonical palette", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(THERAPY_DIR)) {
      for (const hex of hexesIn(readFileSync(file, "utf8"))) {
        if (!ALLOWED_HEX.has(hex)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hex}`);
      }
    }
    expect(offenders, `hex outside PALETTE:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("shares the app-wide base values rather than restating them", () => {
    // The reason the tokens moved to lib/design: a second product copying the
    // hexes would recreate the drift the first pass removed.
    expect(PALETTE.BG).toBe(BASE_PALETTE.BG);
    expect(PALETTE.GOLD).toBe(BASE_PALETTE.GOLD);
    expect(PALETTE.SURFACE).toBe(BASE_PALETTE.SURFACE);
  });

  it("uses exactly one page background", () => {
    const dark = Array.from(ALLOWED_HEX).filter((h) => /^#0[0-9a-f]/.test(h));
    expect(dark).toEqual([BG.toLowerCase()]);
  });

  it("palette entries are unique — no two names for the same colour", () => {
    const values = Object.values(PALETTE).map((v) => v.toLowerCase());
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("semantic colours cover the engine's own vocabularies", () => {
  it("every evidence grade the catalog uses has a colour", () => {
    for (const g of GRADE_ORDER) expect(GRADE_COLOR[g], `no colour for grade ${g}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("every severity band either instrument can produce has a colour", () => {
    const bands = [...BANDS.gad7, ...BANDS.phq9].map((b) => b.id);
    for (const id of bands) expect(SEVERITY_COLOR[id], `no colour for band ${id}`).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("severity is a monotone ladder — five distinct steps", () => {
    const values = Object.values(SEVERITY_COLOR);
    expect(new Set(values).size).toBe(values.length);
  });

  it("crisis is not the colour that also means 'weak evidence'", () => {
    // A hotline rendered in the shade the eye has learned to skim past is a
    // safety defect dressed as a style choice.
    expect(CRISIS).not.toBe(GRADE_COLOR.emerging);
  });
});
