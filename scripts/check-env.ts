/**
 * Preflight: verify the environment before the deploy takes traffic.
 *
 *   npm run check:env
 *
 * Exits non-zero on a missing or malformed variable so a pipeline stops here,
 * where the failure is one line of output, rather than at the first request,
 * where it is a 500 and a pager.
 *
 * Warnings never fail the run. A weak session secret or half-configured
 * billing is worth shouting about, but refusing to boot over it would take a
 * working deployment down for something that was already true yesterday.
 */
import { inspectEnv } from "../lib/server/env";

const report = inspectEnv();

for (const warning of report.warnings) console.warn(`  warning  ${warning}`);

if (!report.ok) {
  console.error("\nEnvironment is not ready:\n");
  for (const error of report.errors) console.error(`  error    ${error}`);
  console.error("\nSee .env.example for the full list.\n");
  process.exit(1);
}

console.log(
  report.warnings.length > 0
    ? `\nEnvironment OK (${report.warnings.length} warning(s) above).\n`
    : "\nEnvironment OK.\n",
);
