import { describe, it, expect } from "vitest";
import {
  DEFAULT_FILTERS,
  calcMarketScore,
  chandelier,
  kelly,
  pnlPct,
  positionSize,
  positionValue,
  rrRatio,
  runFunnel,
  suggestAction,
  weekKey,
} from "./utils";
import { genSeries, simContext } from "./market-sim";
import { DEFAULT_BACKTEST_CONFIG, runBacktest } from "./backtest";
import { hashPayload, runMonteCarlo } from "./quant";
import {
  combinedScore,
  earningsAnalysis,
  flowSignal,
  fundScore,
  riskCell,
  tech17,
} from "./scoring";
import { buildAlerts } from "./alerts";
import { STAGE_UNIVERSE } from "./seed-data";
import type { Position, Stock } from "./types";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The analytical engines.                                                 ║
// ║                                                                          ║
// ║  Two properties matter more than any individual number here:             ║
// ║                                                                          ║
// ║   1. DETERMINISM. The synthetic series, the backtest and the Monte Carlo ║
// ║      are all seeded. If the same input stopped producing the same output,║
// ║      the audit chain would report tampering on honest data and the       ║
// ║      product's central promise would be false.                           ║
// ║                                                                          ║
// ║   2. The safety rules can't be softened. A position below its stop must  ║
// ║      say CUT. Stage 4 must say CUT. Those are the two outputs a customer ║
// ║      is most tempted to argue with, which is exactly why they're pinned. ║
// ╚══════════════════════════════════════════════════════════════════════════╝

function position(over: Partial<Position> = {}): Position {
  return {
    id: 1,
    symbol: "TEST",
    sector: "ETRON",
    quantity: 100,
    entryPrice: 100,
    currentPrice: 110,
    entryStage: 2,
    currentStage: 2,
    stopLoss: 93,
    confidence: "B",
    status: "OPEN",
    openedAt: "2026-01-01T00:00:00.000Z",
    closedPrice: null,
    closedAt: null,
    notes: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("market score", () => {
  it("awards two points per check and caps at ten", () => {
    const none = calcMarketScore({
      setAboveMa: false, maRising: false, breadthOk: false, adConfirm: false, foreignBuy: false,
    });
    expect(none.score).toBe(0);
    expect(none.max).toBe(10);

    const all = calcMarketScore({
      setAboveMa: true, maRising: true, breadthOk: true, adConfirm: true, foreignBuy: true,
    });
    expect(all.score).toBe(10);
  });

  it("maps the score onto an equity band that shrinks as the market weakens", () => {
    const strong = calcMarketScore({ setAboveMa: true, maRising: true, breadthOk: true, adConfirm: true, foreignBuy: false });
    const weak = calcMarketScore({ setAboveMa: true, maRising: false, breadthOk: false, adConfirm: false, foreignBuy: false });
    expect(strong.score).toBe(8);
    expect(strong.equityPct).toBe("80–100%");
    expect(weak.score).toBe(2);
    expect(weak.equityPct).toBe("0–10%");
    expect(weak.stageNum).toBe(4);
  });
});

describe("position rules", () => {
  it("says CUT the moment price is under the stop, whatever the stage says", () => {
    const p = position({ currentPrice: 92, stopLoss: 93, currentStage: 2 });
    expect(suggestAction(p).action).toBe("CUT");
  });

  it("says CUT in Stage 4 even when the position is in profit", () => {
    const p = position({ currentPrice: 150, stopLoss: 93, currentStage: 4 });
    expect(pnlPct(p)).toBeGreaterThan(0);
    expect(suggestAction(p).action).toBe("CUT");
  });

  it("says SELL in Stage 3 and HOLD in a healthy Stage 2", () => {
    expect(suggestAction(position({ currentStage: 3 })).action).toBe("SELL");
    expect(suggestAction(position({ currentPrice: 120, currentStage: 2 })).action).toBe("HOLD");
  });

  it("measures a closed position against its exit price, not its last mark", () => {
    const p = position({ status: "CLOSED", currentPrice: 110, closedPrice: 80 });
    expect(pnlPct(p)).toBeCloseTo(-20, 6);
    expect(positionValue(p)).toBe(8000);
  });
});

describe("position sizing", () => {
  it("keeps the loss at the stop equal to the risk budget", () => {
    const { shares, riskAmount } = positionSize(1_000_000, 1.5, 100, 93);
    expect(riskAmount).toBe(15_000);
    // 7 baht of risk per share, floored so the loss can never exceed the budget
    expect(shares).toBe(2142);
    expect(shares * 7).toBeLessThanOrEqual(riskAmount);
  });

  it("refuses to size a trade with no distance to the stop", () => {
    expect(positionSize(1_000_000, 1.5, 100, 100).shares).toBe(0);
  });

  it("computes Kelly and refuses to divide by a zero edge", () => {
    const k = kelly(60, 12, 7);
    expect(k.f).toBeCloseTo(36.67, 1);
    expect(k.half).toBeCloseTo(k.f / 2, 6);
    expect(kelly(60, 0, 7)).toEqual({ f: 0, half: 0, edge: 0 });
  });

  it("places the chandelier stop below the high by a multiple of ATR", () => {
    expect(chandelier(180, 6, 3)).toBe(162);
  });

  it("returns zero R:R rather than Infinity when there is no risk", () => {
    expect(rrRatio(100, 100, 120)).toBe(0);
    expect(rrRatio(100, 90, 130)).toBeCloseTo(3, 6);
  });
});

describe("screening funnel", () => {
  const stocks = STAGE_UNIVERSE.map((r, i) => ({ ...r, id: i + 1 })) as Stock[];

  it("narrows monotonically — a later step can never return more rows", () => {
    const { steps, result } = runFunnel(stocks, DEFAULT_FILTERS);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].count, `${steps[i].key} grew after ${steps[i - 1].key}`).toBeLessThanOrEqual(
        steps[i - 1].count,
      );
    }
    expect(steps[0].count).toBe(stocks.length);
    expect(result.length).toBe(steps[steps.length - 1].count);
  });

  it("actually filters the seeded universe down to a shortlist", () => {
    const { result } = runFunnel(stocks, DEFAULT_FILTERS);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(stocks.length / 2);
    for (const s of result) {
      expect(s.weeklyVolumeM).toBeGreaterThan(DEFAULT_FILTERS.minVolume);
      expect(s.price).toBeGreaterThan(s.ma30w);
      expect(s.mansfieldRs).toBeGreaterThan(0);
      expect(s.epsGrowthPct).toBeGreaterThanOrEqual(DEFAULT_FILTERS.minEps);
    }
  });

  it("treats an empty sector list as 'do not filter by sector'", () => {
    const wide = runFunnel(stocks, { ...DEFAULT_FILTERS, strongSectors: [] });
    const narrow = runFunnel(stocks, { ...DEFAULT_FILTERS, strongSectors: ["ETRON"] });
    expect(narrow.result.length).toBeLessThanOrEqual(wide.result.length);
    for (const s of narrow.result) expect(s.sector).toBe("ETRON");
  });
});

describe("determinism", () => {
  it("regenerates an identical price series for the same symbol", () => {
    const a = genSeries("DELTA");
    const b = genSeries("DELTA");
    expect(a.bars.length).toBe(b.bars.length);
    expect(a.bars.map((x) => x.c)).toEqual(b.bars.map((x) => x.c));
  });

  it("gives different symbols different series", () => {
    expect(genSeries("DELTA").bars.map((b) => b.c)).not.toEqual(genSeries("KCE").bars.map((b) => b.c));
  });

  it("derives a stable context from the series", () => {
    const a = simContext("KBANK");
    const b = simContext("KBANK");
    expect(a.atr).toBe(b.atr);
    expect(a.volRatio).toBe(b.volRatio);
    expect(a.highestHigh10).toBe(b.highestHigh10);
  });

  it("replays the backtest byte-for-byte on identical input", () => {
    const universe = STAGE_UNIVERSE.slice(0, 20).map((r) => ({ symbol: r.symbol, sector: r.sector }));
    const a = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);
    const b = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
    expect(a.trades.length).toBe(b.trades.length);
  });

  it("replays the Monte Carlo byte-for-byte — it is seeded from the returns themselves", () => {
    const returns = [25, -7, 12, -7, 40, -7, 18, -7];
    const a = runMonteCarlo({ returns, sims: 500, capital: 1_000_000 });
    const b = runMonteCarlo({ returns, sims: 500, capital: 1_000_000 });
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
  });
});

describe("backtest accounting", () => {
  const universe = STAGE_UNIVERSE.slice(0, 20).map((r) => ({ symbol: r.symbol, sector: r.sector }));
  const result = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);

  it("never reports a drawdown above zero", () => {
    expect(result.stats.maxDdPct).toBeLessThanOrEqual(0);
    for (const point of result.equity) expect(point.drawdown).toBeLessThanOrEqual(0);
  });

  it("holds the equity curve to the configured position cap", () => {
    for (const point of result.equity) {
      expect(point.positions).toBeLessThanOrEqual(DEFAULT_BACKTEST_CONFIG.maxPositions);
    }
  });

  it("accounts for every trade in the exit breakdown", () => {
    const counted = result.exitBreakdown.reduce((sum, row) => sum + row.count, 0);
    expect(counted).toBe(result.trades.length);
    expect(result.stats.totalTrades).toBe(result.trades.length);
  });

  it("reports a win rate consistent with the trades it lists", () => {
    if (result.trades.length === 0) return;
    const wins = result.trades.filter((t) => t.pnlPct > 0).length;
    // The engine rounds the reported figure to two decimals for display.
    expect(result.stats.winRatePct).toBeCloseTo((wins / result.trades.length) * 100, 2);
  });
});

describe("monte carlo", () => {
  const returns = [25, -7, 12, -7, 40, -7, 18, -7, 30, -7];

  it("refuses a sample too small to say anything", () => {
    expect(() => runMonteCarlo({ returns: [10, -5] })).toThrow();
  });

  it("orders its percentiles", () => {
    const { stats } = runMonteCarlo({ returns, sims: 1000, capital: 1_000_000 });
    expect(stats.p5).toBeLessThanOrEqual(stats.p25);
    expect(stats.p25).toBeLessThanOrEqual(stats.median);
    expect(stats.median).toBeLessThanOrEqual(stats.p75);
    expect(stats.p75).toBeLessThanOrEqual(stats.p95);
  });

  it("keeps the fan bands ordered at every step", () => {
    const { bands } = runMonteCarlo({ returns, sims: 500, capital: 1_000_000 });
    for (const b of bands) {
      expect(b.lo).toBeLessThanOrEqual(b.med);
      expect(b.med).toBeLessThanOrEqual(b.hi);
    }
  });

  it("reports probabilities as percentages within range", () => {
    const { stats } = runMonteCarlo({ returns, sims: 500 });
    expect(stats.probProfit).toBeGreaterThanOrEqual(0);
    expect(stats.probProfit).toBeLessThanOrEqual(100);
    expect(stats.probDouble).toBeLessThanOrEqual(stats.probProfit);
  });
});

describe("audit hash chain", () => {
  const payload = { stocksAnalyzed: 61, signals: 4 };
  const ts = "2026-09-16T00:00:00.000Z";

  it("hashes deterministically", () => {
    expect(hashPayload("GENESIS", payload, ts)).toBe(hashPayload("GENESIS", payload, ts));
  });

  it("ignores key order — the same facts hash the same however they were built", () => {
    expect(hashPayload("GENESIS", { a: 1, b: 2 }, ts)).toBe(hashPayload("GENESIS", { b: 2, a: 1 }, ts));
  });

  it("changes when the data, the timestamp or the previous link changes", () => {
    const base = hashPayload("GENESIS", payload, ts);
    expect(hashPayload("GENESIS", { ...payload, signals: 5 }, ts)).not.toBe(base);
    expect(hashPayload("GENESIS", payload, "2026-09-17T00:00:00.000Z")).not.toBe(base);
    expect(hashPayload("OTHER", payload, ts)).not.toBe(base);
  });
});

describe("techno-fundamental scoring", () => {
  it("caps the technical checklist at 17", () => {
    const perfect = tech17({
      stage: 2, maSlopePct: 2, mansfieldRs: 9, rsRising: true, volRatio: 3,
      sectorStage: 2, marketStage: 2, epsGrowthPct: 40, revenueGrowthPct: 30,
    });
    expect(perfect.score).toBe(16);
    expect(perfect.score).toBeLessThanOrEqual(17);
    expect(perfect.parts.length).toBeGreaterThan(5);
  });

  it("gives a Stage 4 name with no confirmation close to nothing", () => {
    const worst = tech17({
      stage: 4, maSlopePct: -2, mansfieldRs: -3, rsRising: false, volRatio: 0.5,
      sectorStage: 4, marketStage: 4, epsGrowthPct: -10, revenueGrowthPct: -10,
    });
    expect(worst.score).toBe(0);
  });

  it("refuses to buy a D-tier however good the chart is", () => {
    const combined = combinedScore(16, 0);
    expect(combined.tier).toBe("B");
    const bad = combinedScore(4, 2);
    expect(bad.tier).toBe("D");
    expect(bad.riskPct).toBe(0);
    expect(bad.sizeLabel).toBe("DO NOT BUY");
  });

  it("scores fundamentals within 0..20", () => {
    const strong = fundScore({
      epsGrowthPct: 40, epsAccelerating: true, cfoGeNi: true, revenueGrowthPct: 30,
      recurringRev: true, gmExpanding: true, opMarginAboveInd: true, debtEquity: 0.2,
      currentRatio: 3, fcfYieldPct: 8, foreignNetBuy: true, fundIncreasing: true, insiderBuying: true,
    });
    const weak = fundScore({
      epsGrowthPct: -10, epsAccelerating: false, cfoGeNi: false, revenueGrowthPct: -5,
      recurringRev: false, gmExpanding: false, opMarginAboveInd: false, debtEquity: 3,
      currentRatio: 0.5, fcfYieldPct: -4, foreignNetBuy: false, fundIncreasing: false, insiderBuying: false,
    });
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeLessThanOrEqual(20);
    expect(weak.score).toBeGreaterThanOrEqual(0);
  });

  it("flags foreign buying into Stage 4 as a trap, not a signal", () => {
    const trap = flowSignal("BUY_HEAVY", 4);
    expect(trap.tone).toBe("trap");
    expect(trap.action).toBe("ห้ามซื้อ");
    expect(flowSignal("BUY_HEAVY", 2).action).toBe("Strong Buy");
  });

  it("never suggests buying into Stage 4 from the risk matrix", () => {
    for (const fund of [0, 8, 14, 19]) {
      const cell = riskCell(4, fund);
      expect(cell.size.toLowerCase()).not.toContain("full");
    }
  });

  it("detects earnings acceleration across quarters", () => {
    const accelerating = earningsAnalysis([
      { label: "Q1", eps: 1 },
      { label: "Q2", eps: 1.1 },
      { label: "Q3", eps: 1.35 },
      { label: "Q4", eps: 1.8 },
    ]);
    expect(accelerating.accelerating).toBe(true);

    const flat = earningsAnalysis([
      { label: "Q1", eps: 2 },
      { label: "Q2", eps: 1.8 },
      { label: "Q3", eps: 1.5 },
      { label: "Q4", eps: 1.0 },
    ]);
    expect(flat.decelerating).toBe(true);
  });

  it("leaves the first quarter's comparisons null instead of inventing a baseline", () => {
    const { rows } = earningsAnalysis([{ label: "Q1", eps: 1 }, { label: "Q2", eps: 2 }]);
    expect(rows[0].yoy).toBeNull();
    expect(rows[0].qoq).toBeNull();
    expect(rows[1].qoq).toBeCloseTo(100, 6);
  });
});

describe("risk radar", () => {
  const review = {
    setAboveMa: false, maRising: false, breadthOk: false, adConfirm: false, foreignBuy: false,
    setIndex: 1200, breadthPct: 30, weekOf: "2026-09-14", notes: null,
  };

  it("raises a critical alert for a position below its stop", () => {
    const { alerts, summary } = buildAlerts({
      review,
      positions: [position({ currentPrice: 80, stopLoss: 93 })],
      watchlist: [],
    });
    expect(summary.critical).toBeGreaterThan(0);
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
  });

  it("counts every alert exactly once in the summary", () => {
    const { alerts, summary } = buildAlerts({
      review,
      positions: [position(), position({ id: 2, currentStage: 4 })],
      watchlist: [],
    });
    const total = summary.critical + summary.warning + summary.opportunity + summary.info;
    expect(total).toBe(alerts.length);
  });

  it("raises no market alert at all when there is no reading", () => {
    // The routes pass null for a week the customer has not scored yet. A blank
    // review scores 0/10, and feeding that through would open every new
    // account with a critical "the market is in Stage 4" warning it invented.
    const { alerts } = buildAlerts({ review: null, positions: [], watchlist: [] });
    expect(alerts.filter((a) => a.category === "market")).toEqual([]);
  });

  it("gives every alert a stable, unique id so the list does not jump between scans", () => {
    const input = { review, positions: [position(), position({ id: 2, symbol: "KCE" })], watchlist: [] };
    const first = buildAlerts(input).alerts.map((a) => a.id);
    const second = buildAlerts(input).alerts.map((a) => a.id);
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
  });
});

describe("week key", () => {
  it("returns an ISO date", () => {
    expect(weekKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  The analytical upgrades: benchmark, out-of-sample split, block bootstrap.
//  These exist because the earlier versions of both engines flattered the
//  result, so the tests assert the corrections actually bite.
// ═══════════════════════════════════════════════════════════════════════════

describe("backtest benchmark", () => {
  const universe = STAGE_UNIVERSE.slice(0, 20).map((r) => ({ symbol: r.symbol, sector: r.sector }));
  const result = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);

  it("measures the strategy against owning the same universe, equally weighted", () => {
    expect(result.benchmark.equity.length).toBe(result.equity.length);
    expect(result.benchmark.finalValue).toBeGreaterThan(0);
    expect(result.benchmark.maxDdPct).toBeLessThanOrEqual(0);
  });

  it("benchmarks against the universe it was given, not an unrelated series", () => {
    // The first version of this bought the SET index series — which genSeries
    // uses only to derive relative strength, never as a price driver. The two
    // were independent processes, so the 'excess return' was the gap between
    // two unrelated random walks. Changing the universe must move the
    // benchmark; if it does not, the benchmark is detached again.
    const a = runBacktest(
      STAGE_UNIVERSE.slice(0, 10).map((r) => ({ symbol: r.symbol, sector: r.sector })),
      DEFAULT_BACKTEST_CONFIG,
    );
    const b = runBacktest(
      STAGE_UNIVERSE.slice(30, 40).map((r) => ({ symbol: r.symbol, sector: r.sector })),
      DEFAULT_BACKTEST_CONFIG,
    );
    expect(a.benchmark.totalReturnPct).not.toBe(b.benchmark.totalReturnPct);
  });

  it("survives a universe with no tradable price at entry", () => {
    const empty = runBacktest([], DEFAULT_BACKTEST_CONFIG);
    expect(Number.isFinite(empty.benchmark.totalReturnPct)).toBe(true);
    expect(empty.benchmark.finalValue).toBeGreaterThan(0);
  });

  it("reports excess return as the actual difference, not a spin on it", () => {
    expect(result.benchmark.excessReturnPct).toBeCloseTo(
      result.stats.totalReturnPct - result.benchmark.totalReturnPct,
      1,
    );
  });

  it("charges the benchmark the same commission the strategy pays", () => {
    const free = runBacktest(universe, { ...DEFAULT_BACKTEST_CONFIG, commissionPct: 0 });
    const costly = runBacktest(universe, { ...DEFAULT_BACKTEST_CONFIG, commissionPct: 1 });
    // A benchmark that trades for free would make every strategy look worse
    // than it is; costs have to apply to both sides of the comparison.
    expect(costly.benchmark.finalValue).toBeLessThan(free.benchmark.finalValue);
  });
});

describe("backtest out-of-sample split", () => {
  const universe = STAGE_UNIVERSE.slice(0, 25).map((r) => ({ symbol: r.symbol, sector: r.sector }));
  const result = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);

  it("splits the window 70/30 with no overlap and no gap", () => {
    const { inSample, outOfSample } = result.splits;
    expect(inSample.weeks + outOfSample.weeks).toBe(result.equity.length);
    expect(inSample.weeks).toBeGreaterThan(outOfSample.weeks);
  });

  it("assigns every trade to exactly one period", () => {
    const { inSample, outOfSample } = result.splits;
    expect(inSample.trades + outOfSample.trades).toBe(result.trades.length);
  });

  it("delivers a verdict that matches the gap it reports", () => {
    const { verdict, cagrGapPct } = result.robustness;
    expect(["consistent", "degraded", "reversed", "insufficient"]).toContain(verdict);
    if (verdict === "consistent") expect(cagrGapPct).toBeGreaterThanOrEqual(-5);
    if (verdict === "degraded") expect(cagrGapPct).toBeLessThan(-5);
    expect(result.robustness.note.length).toBeGreaterThan(10);
  });

  it("refuses to judge robustness on too few trades", () => {
    // One symbol produces a handful of trades at most; claiming a strategy is
    // "consistent" on four of them would be the exact overreach this guards.
    const tiny = runBacktest(
      [{ symbol: STAGE_UNIVERSE[0].symbol, sector: STAGE_UNIVERSE[0].sector }],
      DEFAULT_BACKTEST_CONFIG,
    );
    if (tiny.splits.inSample.trades < 10 || tiny.splits.outOfSample.trades < 10) {
      expect(tiny.robustness.verdict).toBe("insufficient");
    }
  });
});

describe("backtest risk metrics", () => {
  const universe = STAGE_UNIVERSE.slice(0, 20).map((r) => ({ symbol: r.symbol, sector: r.sector }));
  const { stats, equity } = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);

  it("reports exposure as a real share of the test window", () => {
    expect(stats.exposurePct).toBeGreaterThanOrEqual(0);
    expect(stats.exposurePct).toBeLessThanOrEqual(100);
    // The weeks with a position open must match what the equity curve shows.
    const weeksHolding = equity.filter((e) => e.positions > 0).length;
    expect(stats.exposurePct).toBeCloseTo((weeksHolding / equity.length) * 100, 1);
  });

  it("derives Calmar from the CAGR and drawdown it also reports", () => {
    if (stats.maxDdPct < 0) {
      expect(stats.calmar).toBeCloseTo(stats.cagrPct / Math.abs(stats.maxDdPct), 1);
    }
  });

  it("keeps drawdown duration within the test window", () => {
    expect(stats.longestDdWeeks).toBeGreaterThanOrEqual(0);
    expect(stats.longestDdWeeks).toBeLessThanOrEqual(equity.length);
    if (stats.recoveryWeeks !== null) {
      expect(stats.recoveryWeeks).toBeGreaterThanOrEqual(0);
      expect(stats.recoveryWeeks).toBeLessThanOrEqual(equity.length);
    }
  });

  it("expectancy matches the average of the trades listed", () => {
    const { trades } = runBacktest(universe, DEFAULT_BACKTEST_CONFIG);
    if (trades.length === 0) return;
    const avg = trades.reduce((a, t) => a + t.pnlPct, 0) / trades.length;
    expect(stats.expectancyPct).toBeCloseTo(avg, 1);
  });
});

describe("monte carlo bootstrap methods", () => {
  // Four wins, then four losses, repeated: results that arrive in runs, which
  // is what a trend strategy actually produces.
  const STREAKY = [18, 22, 15, 20, -9, -11, -8, -10, 16, 19, 21, 17, -12, -9, -10, -8];

  it("block resampling reports deeper drawdowns than iid on streaky returns", () => {
    // This is the whole reason block is the default. Drawing trades
    // independently breaks the losing runs apart, and it is precisely those
    // runs that produce the drawdown a customer would actually have lived
    // through. iid is the flattering answer, so it is not the default one.
    const iid = runMonteCarlo({ returns: STREAKY, sims: 4000, method: "iid" });
    const block = runMonteCarlo({ returns: STREAKY, sims: 4000, method: "block" });
    expect(block.stats.medianDd).toBeGreaterThan(iid.stats.medianDd);
    expect(block.stats.p95Dd).toBeGreaterThan(iid.stats.p95Dd);
  });

  it("defaults to block, and says which method produced the numbers", () => {
    const result = runMonteCarlo({ returns: STREAKY, sims: 500 });
    expect(result.stats.method).toBe("block");
    expect(result.stats.blockSize).toBeGreaterThanOrEqual(2);
    expect(runMonteCarlo({ returns: STREAKY, sims: 500, method: "iid" }).stats.blockSize).toBe(1);
  });

  it("stays deterministic per method, and differs between them", () => {
    const a = runMonteCarlo({ returns: STREAKY, sims: 500, method: "block" });
    const b = runMonteCarlo({ returns: STREAKY, sims: 500, method: "block" });
    const c = runMonteCarlo({ returns: STREAKY, sims: 500, method: "iid" });
    expect(JSON.stringify(a.stats)).toBe(JSON.stringify(b.stats));
    expect(JSON.stringify(a.stats)).not.toBe(JSON.stringify(c.stats));
  });

  it("annualises against the holding period it was given, and reports it", () => {
    // CAGR from a trade list is meaningless without knowing how long a trade
    // takes. The engine used to assume two weeks silently.
    const fast = runMonteCarlo({ returns: STREAKY, sims: 500, avgHoldWeeks: 1 });
    const slow = runMonteCarlo({ returns: STREAKY, sims: 500, avgHoldWeeks: 8 });
    expect(fast.stats.avgHoldWeeks).toBe(1);
    expect(slow.stats.avgHoldWeeks).toBe(8);
    // The same total growth spread over eight times as long is a lower CAGR.
    expect(slow.stats.medianCagr).toBeLessThan(fast.stats.medianCagr);
  });

  it("clamps an absurd block size to the sample it has", () => {
    const result = runMonteCarlo({ returns: STREAKY, sims: 300, blockSize: 9999 });
    expect(result.stats.blockSize).toBeLessThanOrEqual(STREAKY.length);
  });

  it("keeps the fan ordered under both methods", () => {
    for (const method of ["iid", "block"] as const) {
      const { bands } = runMonteCarlo({ returns: STREAKY, sims: 800, method });
      for (const b of bands) {
        expect(b.lo, method).toBeLessThanOrEqual(b.med);
        expect(b.med, method).toBeLessThanOrEqual(b.hi);
      }
    }
  });

  it("starts every simulation at the initial capital", () => {
    const { bands } = runMonteCarlo({ returns: STREAKY, sims: 400, capital: 500_000 });
    expect(bands[0].lo).toBe(500_000);
    expect(bands[0].med).toBe(500_000);
    expect(bands[0].hi).toBe(500_000);
  });
});
