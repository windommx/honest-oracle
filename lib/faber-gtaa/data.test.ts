import { describe, it, expect } from "vitest";
import { parseStooqCsv, parseYahooChart, resampleMonthly, buildPanel } from "./data";

describe("resampleMonthly", () => {
  it("keeps the LAST trading day of each month — the print the rules read", () => {
    const rows = [
      { date: "2026-01-05", close: 100, adj: 100 },
      { date: "2026-01-30", close: 105, adj: 104 },
      { date: "2026-02-27", close: 110, adj: 108 },
    ];
    const m = resampleMonthly(rows);
    expect(m.months).toEqual(["2026-01", "2026-02"]);
    expect(m.close).toEqual([105, 110]);
    expect(m.adj).toEqual([104, 108]);
  });

  it("sorts out-of-order rows and drops non-finite prints", () => {
    const rows = [
      { date: "2026-01-30", close: 105, adj: 105 },
      { date: "2026-01-05", close: 100, adj: 100 },
      { date: "2026-02-10", close: NaN, adj: NaN },
    ];
    const m = resampleMonthly(rows);
    expect(m.months).toEqual(["2026-01"]);
    expect(m.close).toEqual([105]);
  });
});

describe("parseStooqCsv", () => {
  it("parses the Stooq daily format and resamples to month-end", () => {
    const csv = [
      "Date,Open,High,Low,Close,Volume",
      "2026-01-05,10,11,9,10.5,1000",
      "2026-01-30,10,12,10,11.5,1000",
      "2026-02-27,11,13,11,12.5,1000",
      "not,a,row",
    ].join("\n");
    const s = parseStooqCsv("SPY", csv);
    expect(s.ticker).toBe("SPY");
    expect(s.months).toEqual(["2026-01", "2026-02"]);
    expect(s.close).toEqual([11.5, 12.5]);
    // Stooq has no adjusted column: adj falls back to close (price return),
    // which the CLI flags as a total-return understatement for yield assets.
    expect(s.adj).toEqual(s.close);
  });
});

describe("parseYahooChart", () => {
  it("reads close + adjclose out of the v8 chart envelope", () => {
    const json = JSON.stringify({
      chart: {
        result: [{
          timestamp: [1767139200, 1769817600], // 2025-12-31, 2026-01-31 (UTC)
          indicators: {
            quote: [{ close: [100, 110] }],
            adjclose: [{ adjclose: [98, 109] }],
          },
        }],
      },
    });
    const s = parseYahooChart("EFA", json);
    expect(s.months).toEqual(["2025-12", "2026-01"]);
    expect(s.close).toEqual([100, 110]);
    expect(s.adj).toEqual([98, 109]);
  });

  it("skips null prints and falls back to close when adjclose is absent", () => {
    const json = JSON.stringify({
      chart: {
        result: [{
          timestamp: [1767139200, 1769817600],
          indicators: { quote: [{ close: [100, null] }] },
        }],
      },
    });
    const s = parseYahooChart("X", json);
    expect(s.months).toEqual(["2025-12"]);
    expect(s.adj).toEqual([100]);
  });
});

describe("buildPanel", () => {
  it("aligns series on the union calendar; pre-inception months are NaN, not zero", () => {
    const p = buildPanel([
      { ticker: "OLD", months: ["2026-01", "2026-02", "2026-03"], close: [1, 2, 3], adj: [1, 2, 3] },
      { ticker: "NEW", months: ["2026-03"], close: [50], adj: [50] },
    ]);
    expect(p.months).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(p.series["NEW"].close[0]).toBeNaN();
    expect(p.series["NEW"].close[2]).toBe(50);
    expect(p.series["OLD"].adj).toEqual([1, 2, 3]);
  });
});
