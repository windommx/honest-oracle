// ╔══════════════════════════════════════════════════════════════════╗
// ║  DIVIDEND CLI — headless access to the pure engine.               ║
// ║  runCli is pure: argv + an injected file reader → text out, so it ║
// ║  unit-tests without a shell. scripts/dividend.ts is the thin bin. ║
// ╚══════════════════════════════════════════════════════════════════╝

import { syntheticUniverse } from "./fixtures";
import { csvTemplate, formatBenchmarkMarkdown, formatScreenMarkdown, parseAny, runScreen, runValidation, type ScreenOptions } from "./io";
import { DEFAULT_PORTFOLIO } from "./portfolio";
import { DEFAULT_STABILITY } from "./stability-gate";
import { DEFAULT_POLICY } from "./types";
import type { AnnualRecord } from "./types";

export interface CliResult { stdout: string; stderr: string; code: number }
export interface CliIo { read: (path: string) => string }

function parseFlags(args: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < args.length && !args[i + 1].startsWith("--")) flags[a.slice(2)] = args[++i];
      else flags[a.slice(2)] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

const num = (v: string | true | undefined, d: number) => (typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : d);

export const HELP = `dividend — deterministic dividend-sustainability screen (no LLM, no network, no score)

USAGE
  dividend screen   <filings.csv|json> [--max n] [--sector-cap n] [--allow-watch] [--min-yield x]
                                       [--k n] [--tau x] [--seed n] [--json]
  dividend validate <filings.csv|json> [--draws n] [--seed n] [--json]
  dividend demo     [--firms n] [--years n] [--noise x] [--seed n] [--validate] [--json]
  dividend template                     (CSV header: one row per ticker per fiscal year)

Output is a Markdown report (or --json). Every verdict lists its rules, the tier of
knowing, the measurement, and the source. A refused verdict (avisaya) means the
verdict did not hold under filing-sized perturbation — it is not a low score.
`;

function screenOptions(flags: Record<string, string | true>): Partial<ScreenOptions> {
  return {
    policy: DEFAULT_POLICY,
    stability: { ...DEFAULT_STABILITY, k: num(flags.k, DEFAULT_STABILITY.k), tau: num(flags.tau, DEFAULT_STABILITY.tau), seed: num(flags.seed, DEFAULT_STABILITY.seed) },
    portfolio: {
      ...DEFAULT_PORTFOLIO,
      maxPositions: num(flags.max, DEFAULT_PORTFOLIO.maxPositions),
      maxPerSector: num(flags["sector-cap"], DEFAULT_PORTFOLIO.maxPerSector),
      allowWatch: flags["allow-watch"] === true,
      minYield: typeof flags["min-yield"] === "string" ? num(flags["min-yield"], 0) : null,
    },
  };
}

function load(path: string | undefined, io: CliIo): { records: AnnualRecord[]; warnings: string } | string {
  if (!path) return "missing input file";
  let text: string;
  try { text = io.read(path); } catch (e) { return `cannot read ${path}: ${(e as Error).message}`; }
  const { records, errors } = parseAny(text);
  if (records.length === 0) return `no usable records in ${path}${errors.length ? `: ${errors.join("; ")}` : ""}`;
  return { records, warnings: errors.length ? errors.map((e) => `warning: ${e}`).join("\n") + "\n" : "" };
}

export function runCli(argv: string[], io: CliIo): CliResult {
  const { positional, flags } = parseFlags(argv);
  const [cmd, file] = positional;
  const json = flags.json === true;

  if (!cmd || cmd === "help" || flags.help === true) return { stdout: HELP, stderr: "", code: 0 };
  if (cmd === "template") return { stdout: csvTemplate(), stderr: "", code: 0 };

  if (cmd === "screen" || cmd === "validate") {
    const loaded = load(file, io);
    if (typeof loaded === "string") return { stdout: "", stderr: loaded + "\n", code: 2 };
    if (cmd === "screen") {
      const run = runScreen(loaded.records, screenOptions(flags));
      return { stdout: json ? JSON.stringify(run, null, 2) + "\n" : formatScreenMarkdown(run) + "\n", stderr: loaded.warnings, code: 0 };
    }
    const v = runValidation(loaded.records, { draws: num(flags.draws, 200), seed: num(flags.seed, 7) });
    return { stdout: json ? JSON.stringify(v, null, 2) + "\n" : formatBenchmarkMarkdown(v) + "\n", stderr: loaded.warnings, code: 0 };
  }

  if (cmd === "demo") {
    const records = syntheticUniverse({ firms: num(flags.firms, 40), years: num(flags.years, 12), noise: num(flags.noise, 0.15), seed: num(flags.seed, 42) });
    const parts: string[] = [];
    const run = runScreen(records, screenOptions(flags));
    parts.push(json ? JSON.stringify(run, null, 2) : formatScreenMarkdown(run));
    if (flags.validate === true) {
      const v = runValidation(records, { draws: num(flags.draws, 100), seed: num(flags.seed, 7) });
      parts.push(json ? JSON.stringify(v, null, 2) : formatBenchmarkMarkdown(v));
    }
    const note = json ? "" : "\n> SYNTHETIC universe (fixtures.ts) — a planted mechanism for exercising the harness, not market data.\n";
    return { stdout: parts.join("\n\n") + "\n" + note, stderr: "", code: 0 };
  }

  return { stdout: "", stderr: `unknown command: ${cmd}\n\n${HELP}`, code: 1 };
}
