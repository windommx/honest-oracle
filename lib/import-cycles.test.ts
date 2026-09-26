import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  No module may import in a circle.                                ║
// ║                                                                    ║
// ║  types.ts grew an import of multiband.ts for its defaults while    ║
// ║  multiband.ts imported types.ts through dynamics.ts for a dB       ║
// ║  conversion. TypeScript is perfectly happy with that; at runtime   ║
// ║  one of the two modules evaluates with the other still undefined,  ║
// ║  and the whole engine fails to load with an error naming a         ║
// ║  property rather than the cycle. The build does not catch it       ║
// ║  either, because bundlers resolve cycles without complaint right   ║
// ║  up until the moment a top-level value is read.                    ║
// ╚══════════════════════════════════════════════════════════════════╝

const ROOT = process.cwd();
const ROOTS = ["lib", "components"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

/** Resolve a relative or @/ specifier to a file in the repo, or null. */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else if (specifier.startsWith("@/")) base = resolve(ROOT, specifier.slice(2));
  else return null;

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not this one */
    }
  }
  return null;
}

/** Comments removed, so a path quoted inside one is not read as an import.
 *  The first version of this scanner reported types.ts importing itself,
 *  because a lazy cross-line match paired an `export` keyword with a `from
 *  "./types"` several lines below it inside a comment. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^\n"'`]*\/\/.*$/gm, (line) => {
    const at = line.indexOf("//");
    return at >= 0 ? line.slice(0, at) : line;
  });
}

function importsOf(file: string): string[] {
  const src = stripComments(readFileSync(file, "utf8"));
  const found: string[] = [];
  // `import … from "x"` and `export … from "x"`. The [^;]* stops the match
  // running past the end of one statement into the next.
  //
  // exec in a loop rather than matchAll: the project's TS target predates the
  // iterator protocol on RegExpStringIterator.
  const withFrom = /\b(?:import|export)\s[^;]*?\bfrom\s*["']([^"']+)["']/g;
  for (let m = withFrom.exec(src); m !== null; m = withFrom.exec(src)) found.push(m[1]);
  // Bare `import "x"` for side effects.
  const bare = /\bimport\s+["']([^"']+)["']/g;
  for (let m = bare.exec(src); m !== null; m = bare.exec(src)) found.push(m[1]);
  return found;
}

describe("the module graph is acyclic", () => {
  it("no import cycle anywhere in lib/ or components/", () => {
    const files = ROOTS.flatMap((r) => sourceFiles(join(ROOT, r)));
    const graph = new Map<string, string[]>();
    for (const file of files) {
      graph.set(
        file,
        importsOf(file)
          .map((spec) => resolveSpecifier(file, spec))
          .filter((f): f is string => f !== null)
      );
    }

    const cycles: string[] = [];
    const state = new Map<string, 0 | 1 | 2>(); // unvisited / on stack / done
    const stack: string[] = [];

    const visit = (file: string) => {
      if (state.get(file) === 2) return;
      if (state.get(file) === 1) {
        const from = stack.indexOf(file);
        cycles.push(
          stack
            .slice(from)
            .concat(file)
            .map((f) => relative(ROOT, f))
            .join(" → ")
        );
        return;
      }
      state.set(file, 1);
      stack.push(file);
      for (const next of graph.get(file) ?? []) visit(next);
      stack.pop();
      state.set(file, 2);
    };

    for (const file of files) visit(file);
    expect(cycles, `import cycles found:\n${cycles.join("\n")}`).toEqual([]);
  });

  it("actually scanned the code it is guarding", () => {
    const files = ROOTS.flatMap((r) => sourceFiles(join(ROOT, r)));
    expect(files.length).toBeGreaterThan(40);
    // And the resolver works — a guard that resolves nothing finds no cycles.
    const withImports = files.filter((f) => importsOf(f).some((s) => resolveSpecifier(f, s)));
    expect(withImports.length).toBeGreaterThan(20);
  });
});
