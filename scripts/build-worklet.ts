// Bundles the code that runs in its own realm into public/.
//
// Two kinds of realm, one reason. An AudioWorklet module is fetched by URL
// into a realm with no module loader, where bare specifiers do not resolve
// and nothing from the app bundle is reachable. A Web Worker has a loader but
// is fetched the same way, and going through Next's own worker plumbing would
// produce a chunk with a hashed name that no test could pin. Both therefore
// get flattened into one self-contained file here.
//
// Bundling them from the TypeScript source — rather than keeping hand-written
// copies in public/ — is what makes the audio thread, the render thread and
// the test suite provably the same code. Runs automatically before `dev` and
// `build` (see package.json), and each guard test fails if its committed
// artifact is stale.

import { build } from "esbuild";
import { join, sep } from "node:path";

export interface BundleTarget {
  /** Source to bundle, relative to the repo root. */
  source: string;
  /** Where the bundle is served from. */
  outfile: string;
}

export const BUNDLES: BundleTarget[] = [
  { source: join("lib", "synth-engine", "worklet-processor.ts"), outfile: join("public", "synth-worklet.js") },
  { source: join("lib", "master-engine", "worklet-processor.ts"), outfile: join("public", "master-worklet.js") },
  { source: join("lib", "master-engine", "render-worker.ts"), outfile: join("public", "master-render-worker.js") },
];

/** Kept for the synth's existing guard test. */
export const ENTRY = join(process.cwd(), BUNDLES[0].source);
export const OUTFILE = join(process.cwd(), BUNDLES[0].outfile);

// The source path goes into the generated file, and the guard test compares
// that file byte for byte against a fresh build. join() gives backslashes on
// Windows, so the separator has to be normalised with the platform's own —
// splitting on "/" is a no-op there and bakes the platform into the artifact.
const banner = (source: string) => `// GENERATED FILE — do not edit.
// Bundled from ${source.split(sep).join("/")} by scripts/build-worklet.ts.
// Run \`npm run build:worklet\` after changing the engine.`;

export async function buildBundle(write = true, target: BundleTarget = BUNDLES[0]): Promise<string> {
  const result = await build({
    entryPoints: [join(process.cwd(), target.source)],
    bundle: true,
    // The worklet realm has no module loader, so everything must be flattened
    // into one classic script. A worker does not need this, but a classic
    // worker is the one form every browser accepts without a module-worker
    // capability check, and one build path is one fewer thing to drift.
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

export async function buildAll(): Promise<string[]> {
  const built: string[] = [];
  for (const target of BUNDLES) {
    await buildBundle(true, target);
    built.push(target.outfile);
  }
  return built;
}

// Only run when invoked directly, so the test can import buildBundle().
if (process.argv[1] && process.argv[1].endsWith("build-worklet.ts")) {
  buildAll().then(
    (files) => console.log(`built ${files.join(", ")}`),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
