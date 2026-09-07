import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ALLOWED_HEX, BG, GROUP_COLOR, GROUP_LABEL, PALETTE } from "./_tokens";
import { BASE_PALETTE } from "@/lib/design/tokens";
import { PANELS } from "./_panels";

const SYNTH_DIR = join(process.cwd(), "app", "synth");

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsxFiles(p));
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

const hexesIn = (src: string) => (src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase());

describe("app/synth design tokens", () => {
  it("no component uses a hex outside the canonical palette", () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(SYNTH_DIR)) {
      for (const hex of hexesIn(readFileSync(file, "utf8"))) {
        if (!ALLOWED_HEX.has(hex)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hex}`);
      }
    }
    expect(offenders, `hex outside PALETTE:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("shares the app-wide base rather than restating it", () => {
    expect(PALETTE.BG).toBe(BASE_PALETTE.BG);
    expect(PALETTE.GOLD).toBe(BASE_PALETTE.GOLD);
  });

  it("uses exactly one page background", () => {
    expect(Array.from(ALLOWED_HEX).filter((h) => /^#0[0-9a-f]/.test(h))).toEqual([BG.toLowerCase()]);
  });

  it("every panel group has a colour and a label", () => {
    for (const panel of PANELS) {
      expect(GROUP_COLOR[panel.group], `no colour for ${panel.group}`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(GROUP_LABEL[panel.group], `no label for ${panel.group}`).toBeTruthy();
    }
  });
});
