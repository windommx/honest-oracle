// ╔══════════════════════════════════════════════════════════════════╗
// ║  FABER GTAA — seeded synthetic market.                            ║
// ║                                                                    ║
// ║  This session cannot reach market-data hosts (egress policy), and  ║
// ║  this repo does not fake numbers it could not check. So the demo   ║
// ║  dataset is SYNTHETIC AND SAYS SO: a seeded, regime-scripted       ║
// ║  20-year market whose point is to exercise every code path the     ║
// ║  strategy has — a broad bull, a 2008-shaped crash where equities   ║
// ║  fall ~50% while bonds and gold rally, a whipsaw stretch, and a    ║
// ║  hard-asset boom. Deterministic per seed: same seed, same market,  ║
// ║  same backtest, to the last digit.                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { MonthlySeries } from "./types";

/** mulberry32 — tiny deterministic PRNG, good enough for scenario noise. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller from two uniforms. */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface Regime {
  /** [startMonth, endMonth) within the simulation. */
  from: number;
  to: number;
  /** Annualised drift and volatility during the regime. */
  drift: number;
  vol: number;
}

export interface SyntheticSpec {
  ticker: string;
  base: Regime; // default outside scripted regimes
  regimes: Regime[];
}

export const DEMO_MONTHS = 240; // 20 years
const CRASH = { from: 60, to: 78 }; // months 5y..6.5y — the scripted bear
const BOOM = { from: 180, to: 216 }; // hard-asset boom late in the sample

/** 13 assets + cash + a broad-equity benchmark, scripted per asset class. */
export const DEMO_SPECS: SyntheticSpec[] = [
  { ticker: "VTV",  base: { ...noRange(), drift: 0.08, vol: 0.15 }, regimes: [{ ...CRASH, drift: -0.42, vol: 0.28 }] },
  { ticker: "MTUM", base: { ...noRange(), drift: 0.11, vol: 0.17 }, regimes: [{ ...CRASH, drift: -0.50, vol: 0.32 }] },
  { ticker: "VBR",  base: { ...noRange(), drift: 0.09, vol: 0.18 }, regimes: [{ ...CRASH, drift: -0.48, vol: 0.34 }] },
  { ticker: "DWAS", base: { ...noRange(), drift: 0.10, vol: 0.20 }, regimes: [{ ...CRASH, drift: -0.52, vol: 0.36 }] },
  { ticker: "EFA",  base: { ...noRange(), drift: 0.06, vol: 0.16 }, regimes: [{ ...CRASH, drift: -0.45, vol: 0.30 }] },
  { ticker: "EEM",  base: { ...noRange(), drift: 0.07, vol: 0.21 }, regimes: [{ ...CRASH, drift: -0.55, vol: 0.38 }, { ...BOOM, drift: 0.18, vol: 0.22 }] },
  { ticker: "IEF",  base: { ...noRange(), drift: 0.035, vol: 0.06 }, regimes: [{ ...CRASH, drift: 0.10, vol: 0.07 }, { ...BOOM, drift: -0.06, vol: 0.08 }] },
  { ticker: "IGOV", base: { ...noRange(), drift: 0.03, vol: 0.07 }, regimes: [{ ...CRASH, drift: 0.06, vol: 0.08 }, { ...BOOM, drift: -0.07, vol: 0.09 }] },
  { ticker: "LQD",  base: { ...noRange(), drift: 0.045, vol: 0.07 }, regimes: [{ ...CRASH, drift: -0.08, vol: 0.12 }, { ...BOOM, drift: -0.04, vol: 0.08 }] },
  { ticker: "TLT",  base: { ...noRange(), drift: 0.04, vol: 0.11 }, regimes: [{ ...CRASH, drift: 0.18, vol: 0.13 }, { ...BOOM, drift: -0.12, vol: 0.14 }] },
  { ticker: "DBC",  base: { ...noRange(), drift: 0.02, vol: 0.18 }, regimes: [{ ...CRASH, drift: -0.35, vol: 0.30 }, { ...BOOM, drift: 0.30, vol: 0.24 }] },
  { ticker: "GLD",  base: { ...noRange(), drift: 0.05, vol: 0.15 }, regimes: [{ ...CRASH, drift: 0.12, vol: 0.18 }, { ...BOOM, drift: 0.22, vol: 0.16 }] },
  { ticker: "VNQ",  base: { ...noRange(), drift: 0.07, vol: 0.19 }, regimes: [{ ...CRASH, drift: -0.60, vol: 0.40 }] },
  { ticker: "BIL",  base: { ...noRange(), drift: 0.02, vol: 0.001 }, regimes: [] },
  { ticker: "SPY",  base: { ...noRange(), drift: 0.09, vol: 0.15 }, regimes: [{ ...CRASH, drift: -0.45, vol: 0.30 }] },
];

function noRange(): Regime {
  return { from: 0, to: 0, drift: 0, vol: 0 };
}

function regimeAt(spec: SyntheticSpec, m: number): Regime {
  for (const r of spec.regimes) if (m >= r.from && m < r.to) return r;
  return spec.base;
}

/** Month labels starting 2006-01 — fixed, so runs never depend on "now". */
export function demoMonthLabels(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = 2006 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

export function generateSynthetic(seed: number, monthCount: number = DEMO_MONTHS): MonthlySeries[] {
  const months = demoMonthLabels(monthCount);
  return DEMO_SPECS.map((spec, si) => {
    const rng = mulberry32(seed + si * 7919);
    const adj: number[] = [];
    let level = 100;
    for (let m = 0; m < monthCount; m++) {
      const rg = regimeAt(spec, m);
      const mu = rg.drift / 12;
      const sigma = rg.vol / Math.sqrt(12);
      level *= Math.exp(mu - (sigma * sigma) / 2 + sigma * gaussian(rng));
      adj.push(level);
    }
    // Synthetic assets pay no dividends: price and total return coincide.
    return { ticker: spec.ticker, months, close: [...adj], adj };
  });
}
