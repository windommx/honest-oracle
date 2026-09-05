// ╔══════════════════════════════════════════════════════════════════╗
// ║  VALIDATION — machinery, not evidence.                            ║
// ║  Walk-forward by fiscal year with an embargo (López de Prado):    ║
// ║  a fold's training years end `embargo` years before its test     ║
// ║  year, so a label that depends on year t+1 never leaks into a     ║
// ║  model scored on year t. Baselines to beat, skill as a difference ║
// ║  of balanced accuracies, and a permutation test that must NOT     ║
// ║  flag anything on shuffled labels. `adequateModelFound=false` is  ║
// ║  a legitimate result — the harness would rather say "no signal"   ║
// ║  than rank the least-bad model.                                   ║
// ╚══════════════════════════════════════════════════════════════════╝

import { mulberry32 } from "./prng";
import { assess } from "./verdict";
import { DEFAULT_POLICY, type AnnualRecord, type Verdict, type VerdictPolicy } from "./types";

/** `history` ends at fiscal year t; the label is whether DPS fell in t+1. */
export interface LabeledCase {
  history: AnnualRecord[];
  year: number;
  cutNextYear: boolean;
}

/** Build one case per (ticker, year) that has a following year. A cut is
 *  DPS_{t+1} < DPS_t — an omission (DPS→0) counts, a mere non-raise does not.
 *  Only current payers (DPS_t > 0) are cases: a firm paying nothing cannot cut. */
export function labelCases(series: AnnualRecord[], minHistory = 2): LabeledCase[] {
  const sorted = [...series].sort((a, b) => a.fiscalYear - b.fiscalYear);
  const out: LabeledCase[] = [];
  for (let i = minHistory - 1; i < sorted.length - 1; i++) {
    if (sorted[i].dps <= 0) continue;
    out.push({ history: sorted.slice(0, i + 1), year: sorted[i].fiscalYear, cutNextYear: sorted[i + 1].dps < sorted[i].dps });
  }
  return out;
}

export interface Predictor {
  name: string;
  /** optional — rule predictors have nothing to fit */
  fit?(train: LabeledCase[]): void;
  /** true = predicts a cut next year */
  predict(c: LabeledCase): boolean;
}

export interface Metrics {
  n: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number | null;
  recall: number | null;
  specificity: number | null;
  balancedAccuracy: number | null;
  mcc: number | null;
}

export function confusion(pred: boolean[], truth: boolean[]): Metrics {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < pred.length; i++) {
    if (pred[i] && truth[i]) tp++;
    else if (pred[i] && !truth[i]) fp++;
    else if (!pred[i] && truth[i]) fn++;
    else tn++;
  }
  const div = (a: number, b: number) => (b === 0 ? null : a / b);
  const recall = div(tp, tp + fn);
  const spec = div(tn, tn + fp);
  const ba = recall === null || spec === null ? null : (recall + spec) / 2;
  const mccDen = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  const mcc = mccDen === 0 ? null : (tp * tn - fp * fn) / mccDen;
  return { n: pred.length, tp, fp, fn, tn, precision: div(tp, tp + fp), recall, specificity: spec, balancedAccuracy: ba, mcc };
}

export interface WalkForwardOptions {
  /** years between the last training year and the test year */
  embargo: number;
  /** a test year needs at least this many distinct training years */
  minTrainYears: number;
}
export const DEFAULT_WALK: WalkForwardOptions = { embargo: 1, minTrainYears: 3 };

export interface WalkForwardResult {
  metrics: Metrics;
  /** one fold per test year, each with its own confusion — a model that only
   *  works in one regime shows up here, not in the pooled number */
  folds: { year: number; trainYears: number[]; n: number; metrics: Metrics }[];
  predictions: { year: number; ticker: string; pred: boolean; truth: boolean }[];
}

export function walkForward(cases: LabeledCase[], p: Predictor, opt: WalkForwardOptions = DEFAULT_WALK): WalkForwardResult {
  const years = Array.from(new Set(cases.map((c) => c.year))).sort((a, b) => a - b);
  const folds: WalkForwardResult["folds"] = [];
  const predictions: WalkForwardResult["predictions"] = [];
  for (const y of years) {
    const trainYears = years.filter((t) => t <= y - 1 - opt.embargo);
    if (trainYears.length < opt.minTrainYears) continue;
    const train = cases.filter((c) => trainYears.includes(c.year));
    const test = cases.filter((c) => c.year === y);
    p.fit?.(train);
    const fold: WalkForwardResult["predictions"] = [];
    for (const c of test) {
      fold.push({ year: y, ticker: c.history[c.history.length - 1].ticker, pred: p.predict(c), truth: c.cutNextYear });
    }
    predictions.push(...fold);
    folds.push({ year: y, trainYears, n: test.length, metrics: confusion(fold.map((x) => x.pred), fold.map((x) => x.truth)) });
  }
  return { metrics: confusion(predictions.map((x) => x.pred), predictions.map((x) => x.truth)), folds, predictions };
}

// ── Predictors ──────────────────────────────────────────────────────────

export function verdictPredictor(policy: VerdictPolicy = DEFAULT_POLICY, cutIf: Verdict[] = ["at-risk"]): Predictor {
  return { name: `verdict(${cutIf.join("|")})`, predict: (c) => cutIf.includes(assess(c.history, policy).verdict) };
}

export const BASELINES: Predictor[] = [
  { name: "never-cut", predict: () => false },
  { name: "loss-only", predict: (c) => c.history[c.history.length - 1].netIncome < 0 },
  {
    name: "payout>1",
    predict: (c) => {
      const r = c.history[c.history.length - 1];
      return r.eps <= 0 || r.dps / r.eps > 1;
    },
  },
];

/** Balanced-accuracy skill vs a baseline; > 0 means the model beats it. */
export function skill(model: Metrics, baseline: Metrics): number | null {
  if (model.balancedAccuracy === null || baseline.balancedAccuracy === null) return null;
  return model.balancedAccuracy - baseline.balancedAccuracy;
}

export interface PermutationResult {
  observed: number | null;
  pValue: number;
  draws: number;
}

/** Shuffle labels (seeded), re-run the whole walk-forward each time, and count
 *  how often the shuffled world scores at least as well as the real one. */
export function permutationTest(cases: LabeledCase[], p: Predictor, draws = 200, seed = 7, opt: WalkForwardOptions = DEFAULT_WALK): PermutationResult {
  const observed = walkForward(cases, p, opt).metrics.balancedAccuracy;
  if (observed === null) return { observed, pValue: 1, draws };
  const rng = mulberry32(seed);
  let atLeast = 0;
  for (let b = 0; b < draws; b++) {
    const labels = cases.map((c) => c.cutNextYear);
    for (let i = labels.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
    const shuffled = cases.map((c, i) => ({ ...c, cutNextYear: labels[i] }));
    const ba = walkForward(shuffled, p, opt).metrics.balancedAccuracy;
    if (ba !== null && ba >= observed) atLeast++;
  }
  return { observed, pValue: (atLeast + 1) / (draws + 1), draws };
}

export interface Benchmark {
  model: { name: string; metrics: Metrics };
  /** balanced accuracy per test year (null when a year has only one class) */
  byYear: { year: number; n: number; cuts: number; balancedAccuracy: number | null }[];
  /** the weakest year with a defined BA — the regime-instability check
   *  (one model rarely fits all periods; MDPI Economies 2025) */
  worstYear: { year: number; balancedAccuracy: number } | null;
  baselines: { name: string; metrics: Metrics; skill: number | null }[];
  permutation: PermutationResult;
  alpha: number;
  /** beats EVERY baseline on balanced accuracy AND survives the permutation test */
  adequateModelFound: boolean;
  verdict: string;
}

export function benchmark(
  cases: LabeledCase[],
  p: Predictor,
  o: { alpha?: number; draws?: number; seed?: number; walk?: WalkForwardOptions; baselines?: Predictor[] } = {},
): Benchmark {
  const alpha = o.alpha ?? 0.05;
  const walk = o.walk ?? DEFAULT_WALK;
  const wf = walkForward(cases, p, walk);
  const model = wf.metrics;
  const byYear = wf.folds.map((f) => ({ year: f.year, n: f.n, cuts: f.metrics.tp + f.metrics.fn, balancedAccuracy: f.metrics.balancedAccuracy }));
  const defined = byYear.filter((y): y is typeof y & { balancedAccuracy: number } => y.balancedAccuracy !== null);
  const worstYear = defined.length ? defined.reduce((a, b) => (b.balancedAccuracy < a.balancedAccuracy ? b : a)) : null;
  const baselines = (o.baselines ?? BASELINES).map((b) => {
    const m = walkForward(cases, b, walk).metrics;
    return { name: b.name, metrics: m, skill: skill(model, m) };
  });
  const permutation = permutationTest(cases, p, o.draws ?? 200, o.seed ?? 7, walk);
  const beatsAll = baselines.every((b) => b.skill !== null && b.skill > 0);
  const significant = permutation.pValue < alpha;
  const adequateModelFound = beatsAll && significant;
  const verdict = adequateModelFound
    ? `${p.name} beats every baseline (min skill ${Math.min(...baselines.map((b) => b.skill ?? 0)).toFixed(3)}) with p=${permutation.pValue.toFixed(3)}`
    : !beatsAll
      ? `${p.name} does not beat ${baselines.filter((b) => b.skill === null || b.skill <= 0).map((b) => b.name).join(", ")} — no signal claimed`
      : `${p.name} beats baselines but p=${permutation.pValue.toFixed(3)} ≥ ${alpha} — not distinguishable from chance`;
  return {
    model: { name: p.name, metrics: model },
    byYear,
    worstYear: worstYear ? { year: worstYear.year, balancedAccuracy: worstYear.balancedAccuracy } : null,
    baselines,
    permutation,
    alpha,
    adequateModelFound,
    verdict,
  };
}
