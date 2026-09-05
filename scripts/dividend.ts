#!/usr/bin/env node
// Thin bin wrapper — wires process argv + node:fs to the pure runCli core.
// Run via: npm run dividend -- <command> [...]   (uses tsx to execute TypeScript)
import { readFileSync } from "node:fs";
import { runCli } from "../lib/dividend/cli";

const { stdout, stderr, code } = runCli(process.argv.slice(2), {
  read: (p) => readFileSync(p, "utf8"),
});
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
process.exit(code);
