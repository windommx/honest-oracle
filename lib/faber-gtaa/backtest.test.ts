import { describe, it, expect } from "vitest";
import { runBacktest, buyAndHold, computeStats, warmupMonths } from "./backtest";
import { buildPanel } from "./data";
import { generateSynthetic } from "./synthetic";
import { GTAA_AGG_TOP6, type GtaaConfig, type Panel } from "./types";

const monthLabels = (n: number) =>
  Array.from({ length: n }, (_, i) => `${2010 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);

const panelOf = (series: Record<string, number[]>): Panel => {
  const n = Object.values(series)[0].length;
  return {
    months: monthLabels(n),
    series: Object.fromEntries(
      Object.entries(series).map(([t, xs]) => [t, { close: [...xs], adj: [...xs] }]),
    ),
  };
};

const growth = (g: number, n: number, start = 100) =>
  Array.from({ length: n }, (_, i) => start * Math.pow(1 + g, i));

const CFG1: GtaaConfig = { ...GTAA_AGG_TOP6, topN: 1 };

describe("warm-up accounting", () => {
  it("needs max(SMA, longest lookback + 1) months before the first signal", () => {
    expect(warmupMonths(GTAA_AGG_TOP6)).toBe(13); // 12M lookback + its base month
    expect(warmupMonths({ ...GTAA_AGG_TOP6, lookbacks: [1, 3], smaMonths: 10 })).toBe(10);
  });
});

describe("single dominant asset — the closed-form backtest", () => {
  // A grows exactly 1%/month, cash is flat. Held months must compound to
  // 1.01^n on the nose: any look-ahead, off-by-one, or silent cost would
  // break the twelfth decimal.
  const n = 36;
  const p = panelOf({ A: growth(0.01, n), BIL: growth(0, n) });
  const res = runBacktest(p, ["A"], CFG1);

  it("earns every post-warm-up month at exactly +1%", () => {
    expect(res.months.length).toBe(n - warmupMonths(CFG1));
    for (const r of res.returns) expect(r).toBeCloseTo(0.01, 12);
    expect(res.equity[res.equity.length - 1]).toBeCloseTo(Math.pow(1.01, res.months.length), 10);
  });

  it("stats agree with the closed form", () => {
    expect(res.stats.cagr).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
    expect(res.stats.vol).toBeCloseTo(0, 10);
    expect(res.stats.maxDrawdown).toBeCloseTo(0, 12);
    expect(res.stats.winRate).toBe(1);
    expect(res.stats.avgExposure).toBeCloseTo(1, 12);
  });

  it("trades once (entering) and never again", () => {
    expect(res.turnover[0]).toBeCloseTo(1, 12);
    for (const t of res.turnover.slice(1)) expect(t).toBeCloseTo(0, 12);
  });
});

describe("the crash: absolute-trend gate routes capital to cash", () => {
  // 16 months up at 4%/mo, then a -12%/mo grind. B&H rides it down;
  // the strategy must step aside once the price closes below its SMA.
  const up = 16;
  const down = 14;
  const xs = [...growth(0.04, up)];
  for (let i = 0; i < down; i++) xs.push(xs[xs.length - 1] * 0.88);
  const p = panelOf({ A: xs, BIL: growth(0, up + down) });
  const strat = runBacktest(p, ["A"], CFG1);
  const bh = buyAndHold(p, "A", CFG1);

  it("goes to 100% cash and stays flat while the crash continues", () => {
    const lastSnap = strat.snapshots[strat.snapshots.length - 1];
    expect(lastSnap.cashWeight).toBe(1);
    const tail = strat.returns.slice(-6);
    for (const r of tail) expect(r).toBeCloseTo(0, 12); // parked, cash yields 0 here
  });

  it("draws down far less than buy & hold on the same months", () => {
    expect(bh.stats.maxDrawdown).toBeLessThan(-0.7); // 0.88^14 ≈ -83%
    expect(strat.stats.maxDrawdown).toBeGreaterThan(-0.35);
    expect(strat.stats.maxDrawdown).toBeLessThan(0); // it does eat the first leg down
  });
});

describe("trading costs", () => {
  const n = 40;
  // Two assets that alternate leadership every few months → real turnover.
  const a: number[] = [100];
  const b: number[] = [100];
  for (let i = 1; i < n; i++) {
    const phase = Math.floor(i / 5) % 2 === 0;
    a.push(a[i - 1] * (phase ? 1.03 : 0.995));
    b.push(b[i - 1] * (phase ? 0.995 : 1.03));
  }
  const p = panelOf({ A: a, B: b, BIL: growth(0, n) });

  it("costBps drags equity by exactly turnover × cost, and is reported", () => {
    const free = runBacktest(p, ["A", "B"], CFG1);
    const paid = runBacktest(p, ["A", "B"], { ...CFG1, costBps: 50 });
    expect(paid.stats.totalCostDrag).toBeGreaterThan(0);
    expect(paid.equity[paid.equity.length - 1]).toBeLessThan(free.equity[free.equity.length - 1]);
    // Month-by-month: paid return = free return − turnover·0.5%.
    free.returns.forEach((r, i) => {
      expect(paid.returns[i]).toBeCloseTo(r - free.turnover[i] * 0.005, 10);
    });
    expect(free.stats.avgMonthlyTurnover).toBeGreaterThan(0);
  });
});

describe("computeStats on hand-checkable series", () => {
  it("drawdown, underwater length and win rate on a known path", () => {
    const returns = [0.1, -0.5, 1.0];
    const equity = [1, 1.1, 0.55, 1.1];
    const s = computeStats(returns, [0, 0, 0], equity, {
      avgExposure: 1, avgMonthlyTurnover: 0, totalCostDrag: 0,
    });
    expect(s.maxDrawdown).toBeCloseTo(-0.5, 12);
    expect(s.longestUnderwaterMonths).toBe(1);
    expect(s.winRate).toBeCloseTo(2 / 3, 12);
    expect(s.bestMonth).toBeCloseTo(1.0, 12);
    expect(s.worstMonth).toBeCloseTo(-0.5, 12);
  });

  it("sharpe uses EXCESS return over the cash series", () => {
    // Constant excess → zero excess-sd → sharpe 0 by convention
    // (division-by-zero refused, not fudged into Infinity).
    const flat = computeStats([0.02, 0.02, 0.02], [0.01, 0.01, 0.01], [1, 1.02, 1.0404, 1.0612],
      { avgExposure: 1, avgMonthlyTurnover: 0, totalCostDrag: 0 });
    expect(flat.sharpe).toBe(0);
    expect(flat.sortino).toBe(0);
    // Same portfolio, richer cash → lower sharpe: the numerator really is excess.
    const returns = [0.02, 0.05, -0.01, 0.04];
    const eq = returns.reduce((acc, r) => [...acc, acc[acc.length - 1] * (1 + r)], [1]);
    const lowCash = computeStats(returns, [0, 0, 0, 0], eq, { avgExposure: 1, avgMonthlyTurnover: 0, totalCostDrag: 0 });
    const highCash = computeStats(returns, [0.01, 0.01, 0.01, 0.01], eq, { avgExposure: 1, avgMonthlyTurnover: 0, totalCostDrag: 0 });
    expect(highCash.sharpe).toBeLessThan(lowCash.sharpe);
  });

  it("yearly compounding: a full held year of 1% months = 1.01^12 − 1", () => {
    // Warm-up eats the first 13 months, so 2011 is partial (11 held months)
    // and 2012 is the first FULL year — both facts are asserted.
    const n = 38;
    const p = panelOf({ A: growth(0.01, n), BIL: growth(0, n) });
    const res = runBacktest(p, ["A"], CFG1);
    expect(res.yearly.find((y) => y.year === "2011")!.ret).toBeCloseTo(Math.pow(1.01, 11) - 1, 10);
    expect(res.yearly.find((y) => y.year === "2012")!.ret).toBeCloseTo(Math.pow(1.01, 12) - 1, 10);
  });
});

describe("synthetic demo market (seeded — the sample used by `npm run gtaa demo`)", () => {
  it("is deterministic per seed and different across seeds", () => {
    const a = generateSynthetic(42, 60);
    const b = generateSynthetic(42, 60);
    const c = generateSynthetic(7, 60);
    expect(a).toEqual(b);
    expect(a[0].adj).not.toEqual(c[0].adj);
  });

  it("full pipeline: GTAA Top-6 sidesteps most of the scripted 2008-shaped bear", () => {
    const panel = buildPanel(generateSynthetic(1));
    const tickers = ["VTV", "MTUM", "VBR", "DWAS", "EFA", "EEM", "IEF", "IGOV", "LQD", "TLT", "DBC", "GLD", "VNQ"];
    const strat = runBacktest(panel, tickers, GTAA_AGG_TOP6);
    const spy = buyAndHold(panel, "SPY", GTAA_AGG_TOP6);
    expect(strat.months.length).toBeGreaterThan(200);
    // The claim under test is Faber's: comparable growth, far shallower hole.
    expect(strat.stats.maxDrawdown).toBeGreaterThan(spy.stats.maxDrawdown + 0.1);
    expect(strat.stats.cagr).toBeGreaterThan(0);
    // And it genuinely rotates — this is not a buy-and-hold in disguise.
    expect(strat.stats.avgMonthlyTurnover).toBeGreaterThan(0.02);
  });
});
