// ╔══════════════════════════════════════════════════════════════════╗
// ║  IO — filings in (CSV / JSON), a full platform run, reports out.  ║
// ║  Pure: strings and arrays only. The page, the CLI and the tests   ║
// ║  all go through these same functions, so they cannot disagree.    ║
// ╚══════════════════════════════════════════════════════════════════╝

import { selectPortfolio, DEFAULT_PORTFOLIO, type PortfolioPolicy, type Selection } from "./portfolio";
import { stabilityGate, DEFAULT_STABILITY, type StabilityPolicy, type StabilityResult } from "./stability-gate";
import { DEFAULT_POLICY, type AnnualRecord, type VerdictPolicy } from "./types";
import { benchmark, labelCases, verdictPredictor, type Benchmark, type LabeledCase, type WalkForwardOptions, DEFAULT_WALK } from "./validation";
import { byTicker } from "./fixtures";

// ── Columns ─────────────────────────────────────────────────────────────

export const REQUIRED_COLUMNS = [
  "ticker", "fiscalYear", "revenue", "ebit", "interestExpense", "netIncome", "eps",
  "cfo", "capex", "dividendsPaid", "totalAssets", "currentAssets", "currentLiabilities",
  "totalLiabilities", "longTermDebt", "cash", "retainedEarnings", "sharesOutstanding", "dps", "price",
] as const;

export const OPTIONAL_COLUMNS = [
  "sector", "grossProfit", "buybacks", "depreciationAmortization", "shortTermDebt",
  "receivables", "cogs", "ppeNet", "sga",
] as const;

export const ALL_COLUMNS: readonly string[] = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
const STRING_COLUMNS = new Set(["ticker", "sector"]);

/** Header line for a template CSV; one row per (ticker, fiscal year). */
export function csvTemplate(): string {
  return ALL_COLUMNS.join(",") + "\n";
}

// ── CSV ─────────────────────────────────────────────────────────────────

/** RFC-4180-ish line splitter: commas, double quotes, doubled quotes inside quotes. */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export interface ParseResult {
  records: AnnualRecord[];
  /** one line per rejected row or bad header; the row is dropped, never guessed */
  errors: string[];
}

export function parseCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return { records: [], errors: ["empty input"] };
  const header = splitCsvLine(lines[0]);
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) return { records: [], errors: [`missing required columns: ${missing.join(", ")}`] };
  const unknown = header.filter((h) => !ALL_COLUMNS.includes(h));
  const errors: string[] = unknown.length ? [`ignored unknown columns: ${unknown.join(", ")}`] : [];

  const records: AnnualRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ""; });
    const r = rowToRecord(row);
    if (typeof r === "string") errors.push(`line ${i + 1}: ${r}`);
    else records.push(r);
  }
  return { records, errors };
}

function rowToRecord(row: Record<string, unknown>): AnnualRecord | string {
  const out: Record<string, unknown> = {};
  for (const c of REQUIRED_COLUMNS) {
    const v = row[c];
    if (v === undefined || v === null || v === "") return `missing ${c}`;
    if (STRING_COLUMNS.has(c)) out[c] = String(v);
    else {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[,_\s]/g, ""));
      if (!Number.isFinite(n)) return `${c} is not a number: ${String(v)}`;
      out[c] = n;
    }
  }
  for (const c of OPTIONAL_COLUMNS) {
    const v = row[c];
    if (v === undefined || v === null || v === "") continue;
    if (STRING_COLUMNS.has(c)) out[c] = String(v);
    else {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[,_\s]/g, ""));
      if (!Number.isFinite(n)) return `${c} is not a number: ${String(v)}`;
      out[c] = n;
    }
  }
  out.fiscalYear = Math.trunc(out.fiscalYear as number);
  return out as unknown as AnnualRecord;
}

// ── JSON ────────────────────────────────────────────────────────────────

/** Accepts an array of records, or `{ records: [...] }`. */
export function parseJson(text: string): ParseResult {
  let data: unknown;
  try { data = JSON.parse(text); } catch (e) { return { records: [], errors: [`invalid JSON: ${(e as Error).message}`] }; }
  const arr = Array.isArray(data) ? data : data && typeof data === "object" && Array.isArray((data as { records?: unknown }).records)
    ? (data as { records: unknown[] }).records : null;
  if (!arr) return { records: [], errors: ["expected an array of records or { records: [...] }"] };
  const records: AnnualRecord[] = [];
  const errors: string[] = [];
  arr.forEach((item, i) => {
    if (!item || typeof item !== "object") { errors.push(`item ${i}: not an object`); return; }
    const r = rowToRecord(item as Record<string, unknown>);
    if (typeof r === "string") errors.push(`item ${i}: ${r}`);
    else records.push(r);
  });
  return { records, errors };
}

/** Sniff the format from the first non-blank character. */
export function parseAny(text: string): ParseResult {
  const t = text.trimStart();
  return t.startsWith("[") || t.startsWith("{") ? parseJson(text) : parseCsv(text);
}

// ── Platform run ────────────────────────────────────────────────────────

export interface ScreenOptions {
  policy: VerdictPolicy;
  stability: StabilityPolicy;
  portfolio: PortfolioPolicy;
}
export const DEFAULT_SCREEN: ScreenOptions = { policy: DEFAULT_POLICY, stability: DEFAULT_STABILITY, portfolio: DEFAULT_PORTFOLIO };

export interface ScreenRun {
  results: StabilityResult[];
  selection: Selection;
  universe: { tickers: number; records: number; years: [number, number] | null };
  counts: { sustain: number; watch: number; "at-risk": number; avisaya: number };
  options: ScreenOptions;
}

/** Assess every ticker on its full history (latest year is the verdict year). */
export function runScreen(records: AnnualRecord[], o: Partial<ScreenOptions> = {}): ScreenRun {
  const options: ScreenOptions = { ...DEFAULT_SCREEN, ...o };
  const results: StabilityResult[] = [];
  byTicker(records).forEach((history) => results.push(stabilityGate(history, options.policy, options.stability)));
  results.sort((a, b) => a.base.ticker.localeCompare(b.base.ticker));
  const counts = { sustain: 0, watch: 0, "at-risk": 0, avisaya: 0 };
  for (const r of results) counts[r.final]++;
  const years = records.map((r) => r.fiscalYear);
  return {
    results,
    selection: selectPortfolio(results, options.portfolio),
    universe: { tickers: results.length, records: records.length, years: years.length ? [Math.min(...years), Math.max(...years)] : null },
    counts,
    options,
  };
}

export interface ValidationRun {
  cases: number;
  cuts: number;
  /** verdict "at-risk" → predicts a cut */
  strict: Benchmark;
  /** verdict "at-risk" or "watch" → predicts a cut */
  broad: Benchmark;
}

export function runValidation(
  records: AnnualRecord[],
  o: { policy?: VerdictPolicy; draws?: number; seed?: number; walk?: WalkForwardOptions } = {},
): ValidationRun {
  const cases: LabeledCase[] = [];
  byTicker(records).forEach((s) => cases.push(...labelCases(s)));
  const policy = o.policy ?? DEFAULT_POLICY;
  const opts = { draws: o.draws ?? 200, seed: o.seed ?? 7, walk: o.walk ?? DEFAULT_WALK };
  return {
    cases: cases.length,
    cuts: cases.filter((c) => c.cutNextYear).length,
    strict: benchmark(cases, verdictPredictor(policy, ["at-risk"]), opts),
    broad: benchmark(cases, verdictPredictor(policy, ["at-risk", "watch"]), opts),
  };
}

// ── Reports ─────────────────────────────────────────────────────────────

const pct = (x: number | null | undefined, d = 1) => (x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(d)}%`);
const num = (x: number | null | undefined, d = 2) => (x === null || x === undefined ? "n/a" : x === Infinity ? "∞" : x.toFixed(d));

export function formatScreenMarkdown(run: ScreenRun): string {
  const L: string[] = [];
  const u = run.universe;
  L.push(`# Dividend screen — ${u.tickers} tickers, ${u.records} filings${u.years ? `, FY${u.years[0]}–${u.years[1]}` : ""}`);
  L.push("");
  L.push(`Counts, not a verdict: sustain ${run.counts.sustain} · watch ${run.counts.watch} · at-risk ${run.counts["at-risk"]} · refused (avisaya) ${run.counts.avisaya}`);
  L.push("");
  L.push(`Stability gate: k=${run.options.stability.k}, τ=${run.options.stability.tau}, seed=${run.options.stability.seed}. Policy: ${JSON.stringify(run.options.policy)}`);
  L.push("");
  L.push("| Ticker | FY | Final | Base | Held | DPS/EPS | Div/FCF | Runway | F | Z'' | Streak | Yield | Reasons | Flags |");
  L.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of run.results) {
    const a = r.base;
    L.push(
      `| ${a.ticker} | ${a.fiscalYear} | ${r.final} | ${a.verdict} | ${r.agree}/${r.k} | ${num(a.cells.payoutEps)} | ${num(a.cells.payoutFcf)} | ${num(a.cells.cashRunway, 1)}× | ${a.fScore ? `${a.fScore.score}/${a.fScore.computable}` : "n/a"} | ${num(a.altman.z, 1)} | ${a.cells.streak}y | ${pct(a.cells.dividendYield)} | ${a.reasons.map((x) => x.rule).join(", ") || "—"} | ${a.flags.map((x) => x.rule).join(", ") || "—"} |`,
    );
  }
  L.push("");
  L.push(`## Portfolio (${run.selection.holdings.length} names, equal weight)`);
  L.push("");
  L.push(`Ranking key: ${run.selection.rankingKey}`);
  L.push("");
  if (run.selection.holdings.length === 0) L.push("_No name passed every gate. That is a result, not an error._");
  else {
    L.push("| # | Ticker | Sector | Weight | F | Div/FCF | Streak | Yield |");
    L.push("|---|---|---|---|---|---|---|---|");
    for (const h of run.selection.holdings) {
      L.push(`| ${h.rank} | ${h.ticker} | ${h.sector} | ${pct(h.weight)} | ${num(h.key.fScore, 1)} | ${num(h.key.payoutFcf)} | ${h.key.streak}y | ${pct(h.key.dividendYield)} |`);
    }
  }
  L.push("");
  L.push("## Excluded");
  L.push("");
  for (const e of run.selection.excluded) L.push(`- **${e.ticker}** — ${e.reason}`);
  L.push("");
  L.push("## Why each verdict (rule · tier · measurement · source)");
  L.push("");
  for (const r of run.results) {
    if (r.base.reasons.length === 0 && r.base.flags.length === 0) continue;
    L.push(`### ${r.base.ticker} → ${r.final}${r.final === "avisaya" ? ` (base ${r.base.verdict} held ${r.agree}/${r.k})` : ""}`);
    for (const x of [...r.base.reasons, ...r.base.flags]) L.push(`- \`${x.rule}\` · ${x.tier} · ${x.detail} · _${x.source}_`);
    L.push("");
  }
  return L.join("\n");
}

export function formatBenchmarkMarkdown(v: ValidationRun): string {
  const one = (b: Benchmark) => {
    const m = b.model.metrics;
    const L = [
      `### ${b.model.name}`,
      "",
      `**${b.adequateModelFound ? "ADEQUATE" : "NOT ADEQUATE"}** — ${b.verdict}`,
      "",
      `n=${m.n} · TP ${m.tp} · FP ${m.fp} · FN ${m.fn} · TN ${m.tn} · precision ${num(m.precision)} · recall ${num(m.recall)} · balanced acc ${num(m.balancedAccuracy, 3)} · MCC ${num(m.mcc, 3)} · permutation p=${b.permutation.pValue.toFixed(3)} (${b.permutation.draws} draws)`,
      "",
      "| Baseline | Balanced acc | Skill (Δ BA) |",
      "|---|---|---|",
      ...b.baselines.map((x) => `| ${x.name} | ${num(x.metrics.balancedAccuracy, 3)} | ${x.skill === null ? "n/a" : (x.skill >= 0 ? "+" : "") + x.skill.toFixed(3)} |`),
      "",
      `Per year (regime check${b.worstYear ? ` — worst ${b.worstYear.year}: BA ${b.worstYear.balancedAccuracy.toFixed(3)}` : ""}): ` +
        b.byYear.map((y) => `${y.year} n=${y.n} cuts=${y.cuts} BA=${num(y.balancedAccuracy, 3)}`).join(" · "),
      "",
    ];
    return L.join("\n");
  };
  return [
    `# Validation — ${v.cases} labelled cases, ${v.cuts} cuts (${pct(v.cases ? v.cuts / v.cases : null)})`,
    "",
    "Walk-forward by fiscal year with a one-year embargo. Label = DPS fell the following year (current payers only).",
    "`adequateModelFound` requires beating EVERY baseline on balanced accuracy AND a permutation p below α. A NOT ADEQUATE result is the harness doing its job.",
    "",
    one(v.strict),
    one(v.broad),
  ].join("\n");
}
