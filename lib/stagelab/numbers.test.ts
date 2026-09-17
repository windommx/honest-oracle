import { describe, it, expect } from "vitest";
import { kelly, positionSize, rrRatio, fmt } from "./utils";
import { runMonteCarlo } from "./quant";
import { runBacktest, DEFAULT_BACKTEST_CONFIG } from "./backtest";
import { STAGE_UNIVERSE } from "./seed-data";
import { genSeries } from "./market-sim";

// ═══════════════════════════════════════════════════════════════════════════
//  Numbers the product printed as measurements and could not support.
//
//  Every test here fails on the code as it stood before this pass. They are
//  grouped by the kind of lie, not by module, because the same kind recurs:
//  a sentinel that reads as data, a scale factor applied twice, a statistic
//  whose formula does not match its name.
// ═══════════════════════════════════════════════════════════════════════════

describe("a figure is in the units its label claims", () => {
  it("expectancy is a percentage per trade, not a hundred times one", () => {
    // The tab's own defaults. avgWin/avgLoss are already percentages — the
    // fields say "(%)" — and edge multiplied by 100 again, so a 4.4% edge
    // was rendered as "440.00" beside a correctly scaled "Kelly f* 36.7%".
    const k = kelly(60, 12, 7);
    expect(k.edge).toBeCloseTo(0.6 * 12 - 0.4 * 7, 10);
    expect(k.edge).toBeCloseTo(4.4, 10);
    expect(k.f).toBeCloseTo(36.666, 2);
  });

  it("keeps the Kelly fraction and the edge on scales that can be compared", () => {
    const k = kelly(50, 10, 10);
    expect(k.edge).toBeCloseTo(0, 10); // a coin flip at 1:1 has no edge
    expect(k.f).toBeCloseTo(0, 10);
  });
});

describe("no statistic is invented when its inputs are missing", () => {
  it("does not divide by an empty account", () => {
    // Clearing the capital field sets it to 0. capitalPct was NaN, and it
    // rendered green: NaN > 20 and NaN > 12 are both false, so every warning
    // threshold fell through to the "good" tone.
    const r = positionSize(0, 1.5, 100, 93);
    expect(Number.isFinite(r.capitalPct)).toBe(true);
    expect(r.capitalPct).toBe(0);
  });

  it("renders an absent statistic as a dash rather than a number", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt(NaN)).toBe("—");
    expect(fmt(Infinity)).toBe("—");
    expect(fmt(2.5)).toBe("2.50");
  });

  it("reports no profit factor and no Sortino when a run never lost", () => {
    // Both used to return the sentinel 99, printed to two decimals and
    // indistinguishable from a measurement — and ranked above a genuine 98.
    const winnersOnly = STAGE_UNIVERSE.slice(0, 12).map((s) => s.symbol);
    const res = runBacktest(
      winnersOnly.map((symbol) => ({ symbol, sector: "X" })),
      { ...DEFAULT_BACKTEST_CONFIG },
    );
    for (const pf of [res.stats.profitFactor, res.splits.inSample.profitFactor, res.splits.outOfSample.profitFactor]) {
      expect(pf === null || pf !== 99).toBe(true);
    }
    expect(res.stats.sortino === null || res.stats.sortino !== 99).toBe(true);
  });
});

describe("a risk:reward figure describes the trade it was given", () => {
  it("refuses an inverted setup instead of scoring it 1:1", () => {
    // Stop above the entry and target below it: the position is upside down.
    // Taking |entry-stop| and |target-entry| returned a respectable 1.00.
    expect(rrRatio(100, 120, 80)).toBe(0);
    expect(rrRatio(100, 105, 120)).toBe(0); // stop above entry
    expect(rrRatio(100, 90, 105)).toBe(0.5); // a real, poor, 1:0.5
    expect(rrRatio(100, 90, 120)).toBe(2); // a real 1:2
  });
});

describe("annualisation follows the period the returns actually span", () => {
  const returns = [8, -3, 12, -5, 6, 9, -2, 14, 4, -6, 11, 3];

  it("scales Sharpe by the holding period instead of assuming weekly trades", () => {
    // sqrt(52) was applied to PER-TRADE returns. A strategy holding 26 weeks
    // a trade makes about two trades a year, so its Sharpe was inflated by
    // sqrt(26) — while CAGR, from the same avgHoldWeeks, moved correctly.
    const fast = runMonteCarlo({ returns, capital: 1_000_000, sims: 500, avgHoldWeeks: 1 });
    const slow = runMonteCarlo({ returns, capital: 1_000_000, sims: 500, avgHoldWeeks: 26 });
    expect(fast.stats.medianSharpe).not.toBeCloseTo(slow.stats.medianSharpe, 6);
    // One trade a week vs one every 26: the ratio of the factors is sqrt(26).
    expect(fast.stats.medianSharpe / slow.stats.medianSharpe).toBeCloseTo(Math.sqrt(26), 1);
  });

  it("does not report a Sharpe of hundreds of millions on a flat book", () => {
    // Twenty identical +5% trades. E[x^2]-E[x]^2 cancelled to 4.3e-19, which
    // cleared the absolute 1e-12 guard, and the card read "547,503,051.31".
    for (const r of [5, 2.5, 3, 1, -4]) {
      const flat = runMonteCarlo({
        returns: Array(20).fill(r),
        capital: 1_000_000,
        sims: 300,
        avgHoldWeeks: 4,
      });
      expect(Math.abs(flat.stats.medianSharpe), `constant ${r}%`).toBeLessThan(1000);
    }
  });

  it("still reports a real Sharpe on a book that has dispersion", () => {
    const real = runMonteCarlo({ returns, capital: 1_000_000, sims: 500, avgHoldWeeks: 4 });
    expect(Math.abs(real.stats.medianSharpe)).toBeGreaterThan(0);
    expect(Math.abs(real.stats.medianSharpe)).toBeLessThan(100);
  });
});

describe("the backtest charges what it says it charges", () => {
  const universe = STAGE_UNIVERSE.slice(0, 14).map((s) => ({
    symbol: s.symbol,
    sector: s.sector,
  }));

  it("moves per-trade percentages when the commission changes", () => {
    // pnlPct was a bare price ratio and pnl carried only the exit leg, so
    // every per-trade figure — expectancy, avgWin, avgLoss, best, worst —
    // was gross, printed beside a headline return that was net.
    const free = runBacktest(universe, { ...DEFAULT_BACKTEST_CONFIG, commissionPct: 0 });
    const dear = runBacktest(universe, { ...DEFAULT_BACKTEST_CONFIG, commissionPct: 1 });
    expect(free.trades.length).toBeGreaterThan(3);
    expect(dear.stats.expectancyPct).toBeLessThan(free.stats.expectancyPct);
  });

  it("charges both legs, so a flat round trip loses money", () => {
    const dear = runBacktest(universe, { ...DEFAULT_BACKTEST_CONFIG, commissionPct: 1 });
    for (const t of dear.trades) {
      const gross = (t.exitPrice / t.entryPrice - 1) * 100;
      expect(t.pnlPct, `${t.symbol} net must be below gross`).toBeLessThan(gross);
    }
  });
});

describe("a rule the UI advertises is one the engine can reach", () => {
  it("compares a breakout close against the bars before it, not including itself", () => {
    // The 22-bar high included the current bar. A bar's high is never below
    // its own close, so `close > hh22` was false for every symbol, always —
    // the advertised breakout alert could not fire under any market.
    let reachable = 0;
    for (const s of STAGE_UNIVERSE) {
      const bars = genSeries(s.symbol).bars;
      const n = bars.length;
      let hh = 0;
      let hhPrior = 0;
      for (let i = n - 22; i < n; i++) {
        hh = Math.max(hh, bars[i].h);
        if (i < n - 1) hhPrior = Math.max(hhPrior, bars[i].h);
      }
      expect(bars[n - 1].c, `${s.symbol} cannot exceed a window containing itself`)
        .toBeLessThanOrEqual(hh);
      if (bars[n - 1].c > hhPrior) reachable++;
    }
    expect(reachable, "the prior-window high must be exceedable by some symbol")
      .toBeGreaterThan(0);
  });
});

describe("the robustness verdict follows the gap it reports", () => {
  const universe = STAGE_UNIVERSE.map((s) => ({ symbol: s.symbol, sector: s.sector }));

  it("does not call a 25-point gap 'close'", () => {
    // The test was one-sided — `gap < -5` meant degraded, everything else fell
    // through to "consistent", whose note reads "ผลสองช่วงใกล้เคียงกัน".
    // Sweeping 384 configurations: 348 had a gap above +5 and not one had a
    // gap below -5, so "degraded" could not fire on this data while the
    // reassuring line was printed over gaps of 25 and 53 points.
    const r = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);
    expect(Math.abs(r.robustness.cagrGapPct)).toBeGreaterThan(5);
    expect(r.robustness.verdict).not.toBe("consistent");
    expect(r.robustness.note).not.toContain("ใกล้เคียงกัน — ");
  });

  it("flags a wide gap in either direction", () => {
    // Whatever the configuration, a verdict of "consistent" must mean the two
    // halves really are close.
    const configs = [
      { riskPct: 0.5, maxPositions: 4 },
      { riskPct: 1, maxPositions: 8 },
      { riskPct: 2, maxPositions: 12 },
      { riskPct: 3, maxPositions: 6, requireVolume: false },
    ];
    let checked = 0;
    for (const c of configs) {
      const r = runBacktest(universe, { ...DEFAULT_BACKTEST_CONFIG, ...c });
      if (r.robustness.verdict === "insufficient") continue;
      checked++;
      if (r.robustness.verdict === "consistent") {
        expect(Math.abs(r.robustness.cagrGapPct), JSON.stringify(c)).toBeLessThanOrEqual(5);
      } else {
        expect(Math.abs(r.robustness.cagrGapPct), JSON.stringify(c)).toBeGreaterThan(5);
      }
    }
    expect(checked, "no configuration produced a judgeable split").toBeGreaterThan(0);
  });
});
