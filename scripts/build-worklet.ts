// Bundles lib/synth-engine/worklet-processor.ts into public/synth-worklet.js.
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

export const ENTRY = join(process.cwd(), "lib", "synth-engine", "worklet-processor.ts");
export const OUTFILE = join(process.cwd(), "public", "synth-worklet.js");

const BANNER = `// GENERATED FILE — do not edit.
// Bundled from lib/synth-engine/worklet-processor.ts by scripts/build-worklet.ts.
// Run \`npm run build:worklet\` after changing the engine.`;

export async function buildWorklet(write = true): Promise<string> {
  const result = await build({
    entryPoints: [ENTRY],
    bundle: true,
    // The worklet realm has no module loader, so everything must be flattened
    // into one classic script.
    format: "iife",
    target: "es2020",
    minify: false, // readable in devtools; the file is small either way
    banner: { js: BANNER },
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  if (write) {
    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(join(process.cwd(), "public"), { recursive: true });
    await writeFile(OUTFILE, code, "utf8");
  }
  return code;
}

// Only run when invoked directly, so the test can import buildWorklet().
if (process.argv[1] && process.argv[1].endsWith("build-worklet.ts")) {
  buildWorklet().then(
    () => console.log(`built ${OUTFILE}`),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
