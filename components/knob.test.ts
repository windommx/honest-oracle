import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { BASE_PALETTE } from "@/lib/design/tokens";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  The hex guard follows the component out of app/synth.            ║
// ║                                                                    ║
// ║  app/synth/_tokens.test.ts walks app/synth and app/master's walks  ║
// ║  app/master; neither walks components/. The Knob used to be inside ║
// ║  app/synth and therefore covered, and moving it left a file that   ║
// ║  renders in BOTH products with no guard on it at all — so a raw    ║
// ║  hex added here would land in two panels with nothing failing.     ║
// ╚══════════════════════════════════════════════════════════════════╝

const DIR = join(process.cwd(), "components");

function componentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...componentFiles(p));
    else if ((p.endsWith(".tsx") || p.endsWith(".ts")) && !p.includes(".test.")) out.push(p);
  }
  return out;
}

const ALLOWED = new Set(Object.values(BASE_PALETTE).map((h) => String(h).toLowerCase()));

describe("shared components use the app palette", () => {
  it("no shared component hard-codes a hex outside lib/design/tokens", () => {
    const offenders: string[] = [];
    for (const file of componentFiles(DIR)) {
      const hexes = (readFileSync(file, "utf8").match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) =>
        h.toLowerCase()
      );
      for (const hex of hexes) {
        if (!ALLOWED.has(hex)) offenders.push(`${file.replace(process.cwd() + "/", "")}: ${hex}`);
      }
    }
    expect(offenders, `hex outside BASE_PALETTE:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("there is something here to guard", () => {
    // A guard over an empty directory passes forever and protects nothing.
    expect(componentFiles(DIR).length).toBeGreaterThan(0);
  });
});
