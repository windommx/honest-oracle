import { describe, it, expect } from "vitest";
import { sma, kMonthReturn, momentumScore, computeSignals, formatSignalTable } from "./engine";
import { GTAA_AGG_TOP6, type GtaaConfig, type Panel } from "./types";

// ── helpers ──────────────────────────────────────────────────────────
const monthLabels = (n: number) =>
  Array.from({ length: n }, (_, i) => `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`);

/** Constant-growth series: closed-form answers for every rule. */
const growth = (g: number, n: number, start = 100) =>
  Array.from({ length: n }, (_, i) => start * Math.pow(1 + g, i));

const panelOf = (series: Record<string, number[]>): Panel => {
  const n = Object.values(series)[0].length;
  return {
    months: monthLabels(n),
    series: Object.fromEntries(
      Object.entries(series).map(([t, xs]) => [t, { close: [...xs], adj: [...xs] }]),
    ),
  };
};

// ── primitives against closed forms ──────────────────────────────────
describe("sma", () => {
  it("matches the closed form on a linear ramp", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(sma(xs, 10, 9)).toBeCloseTo(5.5, 12); // mean of 1..10
    expect(sma(xs, 3, 9)).toBeCloseTo(9, 12); // mean of 8,9,10
  });

  it("refuses to average a window it does not have", () => {
    expect(sma([1, 2, 3], 10, 2)).toBeNull();
    expect(sma([1, 2, 3], 3, 1)).toBeNull(); // window would start before 0
    expect(sma([1, NaN, 3], 3, 2)).toBeNull(); // NaN inside the window
  });
});

describe("kMonthReturn / momentumScore", () => {
  it("k-month return of a constant-growth series is (1+g)^k - 1", () => {
    const xs = growth(0.01, 20);
    for (const k of [1, 3, 6, 12]) {
      expect(kMonthReturn(xs, k, 19)).toBeCloseTo(Math.pow(1.01, k) - 1, 10);
    }
  });

  it("momentum score is the arithmetic mean of the lookback returns", () => {
    const xs = growth(0.01, 20);
    const expected = ([1, 3, 6, 12].map((k) => Math.pow(1.01, k) - 1).reduce((a, b) => a + b) / 4);
    expect(momentumScore(xs, 19, [1, 3, 6, 12])).toBeCloseTo(expected, 10);
  });

  it("is null until EVERY lookback is available — no partially-warmed scores", () => {
    const xs = growth(0.01, 12); // only 11 months of history behind the last print
    expect(momentumScore(xs, 11, [1, 3, 6, 12])).toBeNull();
    const short = [1, 3, 6].map((k) => Math.pow(1.01, k) - 1).reduce((a, b) => a + b) / 3;
    expect(momentumScore(xs, 11, [1, 3, 6])).toBeCloseTo(short, 10);
  });
});

// ── the September table from the post, as a golden test ──────────────
// Flat-then-jump series: 12 flat months at 100, then 100·(1+s). All four
// lookback returns equal s exactly, so score = s; the final print sits
// above the 10M SMA iff s > 0 — which matches the table (every positive
// score is PASS, every negative is FAIL).
const SEPTEMBER: [string, number][] = [
  ["DBC", 19.59], ["VTV", 11.49], ["GLD", 10.39], ["EEM", 10.26],
  ["VBR", 9.56], ["MTUM", 8.92], ["DWAS", 8.38], ["EFA", 8.3],
  ["VNQ", 4.71], ["TLT", -2.15], ["LQD", -0.71], ["IGOV", -1.07], ["IEF", -0.69],
];

const septemberPanel = (): Panel =>
  panelOf(
    Object.fromEntries(
      SEPTEMBER.map(([t, pct]) => [t, [...Array(12).fill(100), 100 * (1 + pct / 100)]]),
    ),
  );

describe("golden: the post's September signal table", () => {
  const tickers = SEPTEMBER.map(([t]) => t);
  const snap = computeSignals(septemberPanel(), tickers, 12, GTAA_AGG_TOP6);
  const row = (t: string) => snap.table.find((r) => r.ticker === t)!;

  it("reproduces every momentum score", () => {
    for (const [t, pct] of SEPTEMBER) expect(row(t).score).toBeCloseTo(pct / 100, 10);
  });

  it("gates exactly the four bonds to cash", () => {
    for (const t of ["TLT", "LQD", "IGOV", "IEF"]) expect(row(t).aboveSma).toBe(false);
    for (const t of ["DBC", "VTV", "GLD", "EEM", "VBR", "MTUM", "DWAS", "EFA", "VNQ"]) {
      expect(row(t).aboveSma).toBe(true);
    }
  });

  it("selects the exact Top 6 at 16.67% each, nothing in cash", () => {
    const top = snap.table.filter((r) => r.selected).sort((a, b) => a.rank! - b.rank!);
    expect(top.map((r) => r.ticker)).toEqual(["DBC", "VTV", "GLD", "EEM", "VBR", "MTUM"]);
    for (const r of top) expect(r.weight).toBeCloseTo(1 / 6, 12);
    expect(snap.cashWeight).toBeCloseTo(0, 12);
  });

  it("benches DWAS/EFA/VNQ: passed the gate, ranked 7-9, unfunded", () => {
    expect(row("DWAS").rank).toBe(7);
    expect(row("EFA").rank).toBe(8);
    expect(row("VNQ").rank).toBe(9);
    for (const t of ["DWAS", "EFA", "VNQ"]) expect(row(t).selected).toBe(false);
  });

  it("renders the table with PASS / FAIL->cash markers", () => {
    const text = formatSignalTable(snap, GTAA_AGG_TOP6);
    expect(text).toContain("DBC");
    expect(text).toContain("FAIL->cash");
    expect(text).toContain("cash (BIL): 0.00%");
  });
});

// ── rule edges ───────────────────────────────────────────────────────
describe("selection edges", () => {
  it("fewer passers than slots → the empty slots sit in cash, never redistributed", () => {
    const p = panelOf({
      A: [...Array(12).fill(100), 110],
      B: [...Array(12).fill(100), 90],
      C: [...Array(12).fill(100), 80],
    });
    const snap = computeSignals(p, ["A", "B", "C"], 12, { ...GTAA_AGG_TOP6, topN: 3 });
    expect(snap.weights).toEqual({ A: 1 / 3 });
    expect(snap.cashWeight).toBeCloseTo(2 / 3, 12);
  });

  it("an asset still warming up is ineligible, not zero-scored", () => {
    const p = panelOf({ A: [...Array(12).fill(100), 110], B: [...Array(12).fill(100), 105] });
    p.series["B"].close[0] = NaN;
    p.series["B"].adj[0] = NaN; // B lacks the 12-month lookback
    const snap = computeSignals(p, ["A", "B"], 12, { ...GTAA_AGG_TOP6, topN: 2 });
    const b = snap.table.find((r) => r.ticker === "B")!;
    expect(b.eligible).toBe(false);
    expect(b.selected).toBe(false);
    expect(snap.cashWeight).toBeCloseTo(1 / 2, 12);
  });

  it("score ties break alphabetically — reruns can never disagree", () => {
    const p = panelOf({ Z: [...Array(12).fill(100), 110], A: [...Array(12).fill(100), 110] });
    const snap = computeSignals(p, ["Z", "A"], 12, { ...GTAA_AGG_TOP6, topN: 1 });
    expect(Object.keys(snap.weights)).toEqual(["A"]);
  });
});

describe("filterThenRank vs rankThenFilter — where the two readings diverge", () => {
  // HI: a big jump a year ago, then eleven months of slow fade. Its 12-month
  // leg keeps its momentum score on top (~10.2%), but the fade holds the
  // price below the 10M SMA. LO: modest steady growth, above trend (~2.8%).
  const fade = [100, 200];
  for (let i = 0; i < 11; i++) fade.push(fade[fade.length - 1] * 0.98);
  const p = panelOf({ HI: fade, LO: growth(0.005, 13) });
  const base: GtaaConfig = { ...GTAA_AGG_TOP6, topN: 1 };

  it("filterThenRank hands the slot to the survivor", () => {
    const snap = computeSignals(p, ["HI", "LO"], 12, { ...base, mode: "filterThenRank" });
    expect(Object.keys(snap.weights)).toEqual(["LO"]);
    expect(snap.cashWeight).toBeCloseTo(0, 12);
  });

  it("rankThenFilter parks the winner's slot in cash instead", () => {
    const snap = computeSignals(p, ["HI", "LO"], 12, { ...base, mode: "rankThenFilter" });
    const hi = snap.table.find((r) => r.ticker === "HI")!;
    expect(hi.rank).toBe(1);
    expect(hi.aboveSma).toBe(false);
    expect(snap.weights).toEqual({});
    expect(snap.cashWeight).toBeCloseTo(1, 12);
  });
});
