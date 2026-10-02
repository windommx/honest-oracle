/**
 * risk.ts — L5 Risk & Sizing
 * - Copula-agnostic Monte Carlo CVaR ด้วย Student-t(ν) fat tails
 * - Position sizing: size = RiskBudget / CVaR (หน่วย: % ของพอร์ต)
 * - Hard stop จาก 1-day 99% loss quantile, structural stop จาก swing low
 */

import type { DayRow } from './types';
import { quantile, mean, std } from '../stats';
import { mulberry32, studentTFactory } from '../rng';

export interface RiskResult {
  volAnn: number;
  muDaily: number;
  var95: number;
  var99: number;
  cvar975: number;
  hardStop: number;
  structStop: number;
  maxSizePct: number;
  nu: number;
  paths: number;
  lossHistogram: Array<{ x: number; n: number }>;
}

export function riskAssessment(
  rows: DayRow[],
  riskBudgetPct = 1.0,
  nu = 4,
  paths = 20000,
  seed = 424242,
): RiskResult {
  const last = rows[rows.length - 1];
  const rets = rows.slice(-60).map((r) => r.ret1).filter(Number.isFinite);
  const sigmaDaily = Math.max(1e-5, std(rets));
  const muDaily = mean(rows.slice(-20).map((r) => r.ret1));

  const rand = mulberry32(seed);
  const tSample = studentTFactory(rand, nu);
  const losses: number[] = new Array(paths);
  for (let i = 0; i < paths; i++) {
    const t = tSample();
    const scale = sigmaDaily * Math.sqrt(nu / (nu - 2)); // unit variance
    losses[i] = -(muDaily + scale * t); // loss = −return
  }
  losses.sort((a, b) => a - b);
  const var95 = quantile(losses, 0.95);
  const var99 = quantile(losses, 0.99);
  // CVaR 97.5% = mean of losses beyond the 97.5th percentile (worst 2.5% at array end)
  const cvar = mean(losses.slice(Math.floor(paths * 0.975)));

  const hardStop = last.close * (1 - Math.min(0.25, Math.max(var99, 0.004)));
  // structural stop: lowest low of last 15 days × 0.997 buffer
  const lows = rows.slice(-15).map((r) => r.close * 0.985);
  const structStop = Math.min(...lows, last.close * 0.93);
  // size = RiskBudget(%) / CVaR(fraction) → % of portfolio
  // เช่น budget 1%/วัน, CVaR 3.8% → 26.3% (cap 100%)
  const maxSizePct = Math.min(100, riskBudgetPct / Math.max(0.001, cvar));

  // histogram for viz
  const hist: number[] = new Array(30).fill(0);
  const lo = quantile(losses, 0.002);
  const hi = quantile(losses, 0.998);
  const w = (hi - lo) / 30 || 1e-9;
  for (const l of losses) {
    const b = Math.min(29, Math.max(0, Math.floor((l - lo) / w)));
    hist[b]++;
  }
  const lossHistogram = hist.map((n, i) => ({
    x: +(lo + w * (i + 0.5)).toFixed(5),
    n,
  }));

  return {
    volAnn: sigmaDaily * Math.sqrt(252),
    muDaily,
    var95,
    var99,
    cvar975: cvar,
    hardStop,
    structStop,
    maxSizePct,
    nu,
    paths,
    lossHistogram,
  };
}
