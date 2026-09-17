// Bundles each engine's worklet processor into public/.
//
// An AudioWorklet module is fetched by URL into its own realm: it cannot import
// from the app bundle and bare specifiers do not resolve there, so the engine
// has to be flattened into a single file. Bundling it from the TypeScript
// source — rather than keeping a hand-written copy in public/ — is what makes
// the audio thread and the test suite provably the same code.
//
// Runs automatically before `dev` and `build` (see package.json), and
// worklet.test.ts fails if the committed artifact is stale.

import { build } from "esbuild";
import { join } from "node:path";

export interface WorkletTarget {
  /** Source to bundle, relative to the repo root. */
  source: string;
  /** Where the bundle is served from. */
  outfile: string;
}

export const WORKLETS: WorkletTarget[] = [
  { source: join("lib", "synth-engine", "worklet-processor.ts"), outfile: join("public", "synth-worklet.js") },
  { source: join("lib", "master-engine", "worklet-processor.ts"), outfile: join("public", "master-worklet.js") },
];

/** Kept for the synth's existing guard test. */
export const ENTRY = join(process.cwd(), WORKLETS[0].source);
export const OUTFILE = join(process.cwd(), WORKLETS[0].outfile);

const banner = (source: string) => `// GENERATED FILE — do not edit.
// Bundled from ${source.split("/").join("/")} by scripts/build-worklet.ts.
// Run \`npm run build:worklet\` after changing the engine.`;

export async function buildWorklet(write = true, target: WorkletTarget = WORKLETS[0]): Promise<string> {
  const result = await build({
    entryPoints: [join(process.cwd(), target.source)],
    bundle: true,
    // The worklet realm has no module loader, so everything must be flattened
    // into one classic script.
    format: "iife",
    target: "es2020",
    minify: false, // readable in devtools; the file is small either way
    banner: { js: banner(target.source) },
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  if (write) {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(process.cwd(), "public"), { recursive: true });
    await writeFile(join(process.cwd(), target.outfile), code, "utf8");
  }
  return code;
}

export async function buildAllWorklets(): Promise<string[]> {
  const built: string[] = [];
  for (const target of WORKLETS) {
    await buildWorklet(true, target);
    built.push(target.outfile);
  }
  return built;
}

// Only run when invoked directly, so the test can import buildWorklet().
if (process.argv[1] && process.argv[1].endsWith("build-worklet.ts")) {
  buildAllWorklets().then(
    (files) => console.log(`built ${files.join(", ")}`),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
