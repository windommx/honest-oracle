import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { formatExcess, excessVocabulary } from "./excess";

// "Same input → same output, byte-for-byte" is the engine's headline promise. A bare
// Number.prototype.toLocaleString() or String.prototype.localeCompare() reads the host's
// ambient locale — an environment-dependent hidden input, the same class of impurity as a
// clock read. On a server it tracks $LANG; in a browser it renders per-viewer. So a formatted
// token count came out "1,600,000" on one machine and "1.600.000" (or Arabic-Indic digits) on
// another for the SAME report. The runtime test below can't see that (both calls share one
// locale), so this scans the source: every locale-sensitive call must pin its locale.
const DIR = join(process.cwd(), "lib", "rush-engine");

function engineSources(): string[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".d.ts"))
    .map((f) => join(DIR, f));
}

describe("engine output is locale-independent (byte-stable across machines)", () => {
  it("no source file calls toLocaleString() or localeCompare() without pinning a locale", () => {
    const offenders: string[] = [];
    // toLocaleString with an empty arg list; localeCompare with a single argument (no locale).
    const bareToLocale = /\.toLocaleString\(\s*\)/;
    const bareLocaleCompare = /\.localeCompare\(\s*[^,)]+\)/;
    for (const file of engineSources()) {
      const src = readFileSync(file, "utf8");
      src.split("\n").forEach((line, i) => {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) return; // skip comments
        if (bareToLocale.test(line)) offenders.push(`${file.split("/").pop()}:${i + 1} bare toLocaleString()`);
        if (bareLocaleCompare.test(line)) offenders.push(`${file.split("/").pop()}:${i + 1} bare localeCompare()`);
      });
    }
    expect(offenders, `locale-dependent formatting (pin a locale like "en-US"):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("formatExcess renders a large token count with fixed comma grouping", () => {
    // Locks the pinned "en-US" style so a regression to the ambient locale is visible in output
    // too, not only in the source scan.
    const a = Array.from({ length: 1200 }, (_, i) => `wa${i % 3}`).join(" ");
    const b = Array.from({ length: 1200 }, (_, i) => `wb${i % 3}`).join(" ");
    const out = formatExcess(excessVocabulary(a, b, "en"), "en");
    expect(out).toContain("1,200"); // grouped with a comma, never "1.200" or "1 200"
  });
});
