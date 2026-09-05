// Seeded synthetic universe for tests and demos. NOT market data: the
// generator plants a dividend-cut mechanism (losses, thin coverage) so the
// harness can prove it detects a correct rule and rejects a wrong one.

import { mulberry32 } from "./prng";
import type { AnnualRecord } from "./types";

export interface UniverseOptions {
  firms: number;
  years: number;
  startYear: number;
  seed: number;
  /** 0 = labels fully driven by fundamentals; 1 = pure coin-flip cuts */
  noise: number;
}

const SECTORS = ["energy", "banks", "telecom", "utilities", "consumer", "property"];

export function syntheticUniverse(o: Partial<UniverseOptions> = {}): AnnualRecord[] {
  const opt: UniverseOptions = { firms: 40, years: 12, startYear: 2010, seed: 42, noise: 0.15, ...o };
  const rng = mulberry32(opt.seed);
  const out: AnnualRecord[] = [];

  for (let f = 0; f < opt.firms; f++) {
    const ticker = `SYN${String(f + 1).padStart(3, "0")}`;
    const sector = SECTORS[f % SECTORS.length];
    const quality = rng(); // latent: high = stable earner
    let assets = 1000 + rng() * 9000;
    let revenue = assets * (0.4 + rng() * 0.8);
    let margin = 0.04 + quality * 0.12;
    let shares = 100 + Math.floor(rng() * 900);
    let dps = 0;
    let debt = assets * (0.1 + (1 - quality) * 0.4);
    let cash = assets * (0.05 + quality * 0.1);
    let retained = assets * (0.1 + quality * 0.3);
    let price = 10 + rng() * 40;
    // Dividend policy is LAGGED one year (Lintner-style stickiness): the board
    // sets FY t's dividend from FY t-1's results. So a cut in FY t+1 is a
    // function of FY t fundamentals — exactly what a screen at FY t can see.
    let prevNi = revenue * margin;
    let prevFcf = prevNi * 0.8;
    let prevCash = cash;

    for (let y = 0; y < opt.years; y++) {
      const shock = (rng() * 2 - 1) * (0.05 + (1 - quality) * 0.35);
      margin = Math.max(-0.1, Math.min(0.3, margin + shock * 0.5));
      revenue *= 1 + (rng() * 2 - 1) * 0.15 + 0.02;
      const ni = revenue * margin;
      const da = assets * 0.04;
      const ebit = ni * 1.3 + da * 0.2;
      const interest = debt * 0.05;
      const cfo = ni + da + (rng() * 2 - 1) * Math.abs(ni) * 0.3;
      const capex = assets * (0.03 + rng() * 0.03);
      const fcf = cfo - capex;

      // target 50% of last year's earnings, sticky; cut only when forced by
      // last year's loss or uncovered cash. `noise` adds random cuts.
      const target = Math.max(0, (0.5 * prevNi) / shares);
      const forced = prevNi < 0 || prevCash + prevFcf - dps * shares < 0;
      const coin = rng() < opt.noise;
      if (y === 0) dps = target;
      else if (coin) dps = rng() < 0.5 ? dps * 0.5 : dps;
      else if (forced) dps = Math.max(0, Math.min(dps * 0.5, Math.max(0, prevFcf) / shares));
      else dps = Math.max(dps, Math.min(target, (Math.max(0, prevFcf) * 0.9) / shares));
      const dividendsPaid = dps * shares;

      prevCash = cash;
      cash = Math.max(0, cash + fcf - dividendsPaid);
      retained += ni - dividendsPaid;
      debt = Math.max(0, debt * (1 + (rng() * 2 - 1) * 0.1) + (fcf < dividendsPaid ? dividendsPaid - fcf : 0));
      assets = Math.max(100, assets + ni - dividendsPaid + (rng() * 2 - 1) * assets * 0.02);
      price = Math.max(1, price * (1 + ((ni - prevNi) / Math.max(1, Math.abs(prevNi))) * 0.3 + (rng() * 2 - 1) * 0.2));
      if (rng() < 0.1) shares = Math.floor(shares * 1.05);

      const currentAssets = cash + assets * 0.25;
      const currentLiabilities = assets * 0.15 + debt * 0.2;
      out.push({
        ticker,
        fiscalYear: opt.startYear + y,
        sector,
        revenue,
        grossProfit: revenue * (0.2 + margin),
        ebit,
        interestExpense: interest,
        netIncome: ni,
        eps: ni / shares,
        cfo,
        capex,
        dividendsPaid,
        depreciationAmortization: da,
        totalAssets: assets,
        currentAssets,
        currentLiabilities,
        totalLiabilities: debt + currentLiabilities,
        longTermDebt: debt * 0.8,
        shortTermDebt: debt * 0.2,
        cash,
        retainedEarnings: retained,
        sharesOutstanding: shares,
        dps,
        price,
        receivables: revenue * 0.1,
        cogs: revenue * (0.8 - margin),
        ppeNet: assets * 0.4,
        sga: revenue * 0.1,
      });
      prevNi = ni;
      prevFcf = fcf;
    }
  }
  return out;
}

export function byTicker(records: AnnualRecord[]): Map<string, AnnualRecord[]> {
  const m = new Map<string, AnnualRecord[]>();
  for (const r of records) {
    const arr = m.get(r.ticker) ?? [];
    arr.push(r);
    m.set(r.ticker, arr);
  }
  m.forEach((arr) => arr.sort((a, b) => a.fiscalYear - b.fiscalYear));
  return m;
}
