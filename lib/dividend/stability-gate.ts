// ╔══════════════════════════════════════════════════════════════════╗
// ║  STABILITY GATE — perturb → re-resolve → count.                   ║
// ║  Borrowed from the renoise-CE self-verifier of Flow Reasoning     ║
// ║  Models (Helbling et al. 2026) and re-read for a domain with no   ║
// ║  unique answer: stability here is a FRAGILITY test of the verdict,║
// ║  not a proof of correctness. The output is a count (agree/k) and  ║
// ║  a refusal when the verdict cannot hold under filing-sized noise. ║
// ║  It never "restarts" to hunt for a stable answer — in a market    ║
// ║  that would be multiple testing wearing a new coat.               ║
// ╚══════════════════════════════════════════════════════════════════╝

import { fnv1a32, mulberry32 } from "./prng";
import { assess, type Assessment } from "./verdict";
import { DEFAULT_POLICY, type AnnualRecord, type Verdict, type VerdictPolicy } from "./types";

export interface StabilityPolicy {
  /** perturbation draws */
  k: number;
  /** verdict must hold in at least this share of draws */
  tau: number;
  seed: number;
  /** earnings shock = ±(epsVolatility clamped to [floor, cap]); a fixed number overrides */
  earningsShock: number | { floor: number; cap: number };
  cfoShockMultiple: number;
  debtShock: number;
  priceShock: number;
  /** every `quarterDropEvery`-th draw replaces the random earnings/CFO shock with
   *  "one quarter missing" (×0.75) — the masking move of the source paper */
  quarterDropEvery: number;
}

export const DEFAULT_STABILITY: StabilityPolicy = {
  k: 8,
  tau: 0.75,
  seed: 369,
  earningsShock: { floor: 0.1, cap: 0.5 },
  cfoShockMultiple: 1.5,
  debtShock: 0.1,
  priceShock: 0.2,
  quarterDropEvery: 4,
};

export interface StabilityResult {
  base: Assessment;
  k: number;
  agree: number;
  /** agree / k — a ratio over counts */
  stability: number;
  pass: boolean;
  counts: Record<Verdict, number>;
  /** the verdict to act on: the base verdict if stable, otherwise a refusal */
  final: Verdict | "avisaya";
  schedule: { earningsShock: number; cfoShock: number; debtShock: number; priceShock: number; seed: number };
  draws: { i: number; verdict: Verdict; earningsFactor: number; cfoFactor: number; debtFactor: number; priceFactor: number }[];
}

export function perturbRecord(
  r: AnnualRecord,
  f: { earnings: number; cfo: number; debt: number; price: number },
): AnnualRecord {
  return {
    ...r,
    netIncome: r.netIncome * f.earnings,
    eps: r.eps * f.earnings,
    ebit: r.ebit * f.earnings,
    cfo: r.cfo * f.cfo,
    longTermDebt: r.longTermDebt * f.debt,
    shortTermDebt: (r.shortTermDebt ?? 0) * f.debt,
    price: r.price * f.price,
  };
}

export function stabilityGate(
  history: AnnualRecord[],
  policy: VerdictPolicy = DEFAULT_POLICY,
  sp: StabilityPolicy = DEFAULT_STABILITY,
): StabilityResult {
  const base = assess(history, policy);
  const last = history[history.length - 1];
  const vol = base.cells.epsVolatility;
  const earningsShock =
    typeof sp.earningsShock === "number"
      ? sp.earningsShock
      : Math.min(sp.earningsShock.cap, Math.max(sp.earningsShock.floor, vol ?? sp.earningsShock.floor));
  const cfoShock = earningsShock * sp.cfoShockMultiple;

  const rng = mulberry32((fnv1a32(`${last.ticker}:${last.fiscalYear}`) ^ sp.seed) >>> 0);
  const u = () => rng() * 2 - 1; // uniform in [-1, 1]

  const counts: Record<Verdict, number> = { sustain: 0, watch: 0, "at-risk": 0 };
  const draws: StabilityResult["draws"] = [];
  let agree = 0;
  for (let i = 1; i <= sp.k; i++) {
    const quarterDrop = sp.quarterDropEvery > 0 && i % sp.quarterDropEvery === 0;
    const f = {
      earnings: quarterDrop ? 0.75 : 1 + u() * earningsShock,
      cfo: quarterDrop ? 0.75 : 1 + u() * cfoShock,
      debt: 1 + u() * sp.debtShock,
      price: 1 + u() * sp.priceShock,
    };
    // still consume the RNG on quarter-drop draws so draw i is independent of the schedule
    if (quarterDrop) {
      u();
      u();
    }
    const perturbed = [...history.slice(0, -1), perturbRecord(last, f)];
    const v = assess(perturbed, policy).verdict;
    counts[v]++;
    if (v === base.verdict) agree++;
    draws.push({ i, verdict: v, earningsFactor: f.earnings, cfoFactor: f.cfo, debtFactor: f.debt, priceFactor: f.price });
  }

  const stability = sp.k > 0 ? agree / sp.k : 1;
  const pass = stability >= sp.tau;
  return {
    base,
    k: sp.k,
    agree,
    stability,
    pass,
    counts,
    final: pass ? base.verdict : "avisaya",
    schedule: { earningsShock, cfoShock, debtShock: sp.debtShock, priceShock: sp.priceShock, seed: sp.seed },
    draws,
  };
}
