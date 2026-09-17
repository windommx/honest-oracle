import { describe, it, expect } from "vitest";
import { parseCsv, parseDate } from "./parse";
import { validate } from "./validate";
import { toWeekly, deriveIndicators } from "./resample";
import { parseChart, toYahooSymbol } from "./yahoo";
import { alignUniverse } from "./align";
import type { SymbolBars } from "./types";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The import path has to be trustworthy before any result computed on it  ║
// ║  means anything. Every assertion here is about a way real price files    ║
// ║  are wrong, not about a way this code is written.                        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

describe("dates are read, never guessed", () => {
  it("accepts unambiguous formats", () => {
    expect(parseDate("2024-04-03")).toBe("2024-04-03");
    expect(parseDate("2024/04/03")).toBe("2024-04-03");
    expect(parseDate("25/12/2024")).toBe("2024-12-25"); // 25 can only be a day
    expect(parseDate("12/25/2024")).toBe("2024-12-25"); // 25 can only be a day
    expect(parseDate("1712102400")).toBe("2024-04-03");
  });

  it("refuses a date that could be either way round", () => {
    // 03/04/2024 is 3 April in Bangkok and 4 March in New York. Picking one
    // silently is wrong for a third of every year.
    expect(() => parseDate("03/04/2024")).toThrow(/Ambiguous/);
    expect(() => parseDate("not a date")).toThrow(/Unrecognised/);
  });
});

describe("the CSV importer reads what brokers actually export", () => {
  it("handles a BOM, quoted fields, thousands separators and Thai headers", () => {
    const csv =
      "﻿วันที่,ราคาเปิด,สูงสุด,ต่ำสุด,ราคาปิด,ปริมาณ\n" +
      '2024-01-05,"1,200.50","1,250.00","1,190.00","1,240.25","12,345,678"\n' +
      "2024-01-08,1240.25,1260,1235,1255,9000000\n";
    const s = parseCsv(csv, "PTT");
    expect(s.bars).toHaveLength(2);
    expect(s.bars[0].o).toBe(1200.5);
    expect(s.bars[0].v).toBe(12345678);
    expect(s.bars[1].c).toBe(1255);
  });

  it("skips a holiday row with no close rather than treating it as zero", () => {
    const csv = "date,close\n2024-01-05,100\n2024-01-08,-\n2024-01-09,102\n";
    expect(parseCsv(csv, "X").bars.map((b) => b.c)).toEqual([100, 102]);
  });

  it("sorts oldest first whatever order the file is in", () => {
    const csv = "date,close\n2024-03-01,3\n2024-01-01,1\n2024-02-01,2\n";
    expect(parseCsv(csv, "X").bars.map((b) => b.c)).toEqual([1, 2, 3]);
  });

  it("says which column it could not find instead of failing obscurely", () => {
    // It names the first required column it could not find, and echoes the
    // header it actually saw, so the fix is obvious from the message.
    expect(() => parseCsv("foo,bar\n1,2\n", "X")).toThrow(/date column.*foo, bar/);
    expect(() => parseCsv("date\n2024-01-05\n", "X")).toThrow(/close column/);
  });
});

describe("validation catches the errors that change a published result", () => {
  const series = (bars: Array<Partial<{ t: string; o: number; h: number; l: number; c: number; v: number }>>): SymbolBars => ({
    symbol: "X", source: "test", fetchedAt: "", currency: "THB",
    bars: bars.map((b) => ({ t: b.t!, o: b.o ?? b.c!, h: b.h ?? b.c!, l: b.l ?? b.c!, c: b.c!, v: b.v ?? 1000 })),
  });

  it("flags an unadjusted split as an error, not a price move", () => {
    // 100 -> 50 on a 2-for-1 reads as a -50% week and stops you out of it.
    const r = validate(series([
      { t: "2024-01-05", c: 100 }, { t: "2024-01-12", c: 100 }, { t: "2024-01-19", c: 50 },
    ]), { minBars: 1 });
    expect(r.issues.some((i) => i.code === "unadjusted_split")).toBe(true);
    expect(r.usable).toBe(false);
  });

  it("flags a duplicated date", () => {
    const r = validate(series([
      { t: "2024-01-05", c: 10 }, { t: "2024-01-05", c: 11 },
    ]), { minBars: 1 });
    expect(r.issues.some((i) => i.code === "duplicate_date")).toBe(true);
    expect(r.usable).toBe(false);
  });

  it("flags a bar that cannot have traded", () => {
    const r = validate(series([{ t: "2024-01-05", o: 10, h: 9, l: 11, c: 10 }]), { minBars: 1 });
    expect(r.issues.some((i) => i.code === "impossible_bar")).toBe(true);
  });

  it("warns about a suspension rather than reading it as a flat market", () => {
    const r = validate(series([
      { t: "2024-01-05", c: 10 }, { t: "2024-03-05", c: 10 },
    ]), { minBars: 1 });
    expect(r.issues.some((i) => i.code === "gap")).toBe(true);
    expect(r.usable).toBe(true); // a warning, not a blocker
  });

  it("refuses a series too short for a 30-week average", () => {
    expect(validate(series([{ t: "2024-01-05", c: 10 }])).usable).toBe(false);
  });

  it("passes a clean series", () => {
    const bars = Array.from({ length: 300 }, (_, i) => ({
      t: new Date(Date.UTC(2020, 0, 6) + i * 86400000).toISOString().slice(0, 10),
      c: 100 + Math.sin(i / 12) * 5,
    }));
    const r = validate(series(bars));
    expect(r.usable, JSON.stringify(r.issues.slice(0, 3))).toBe(true);
  });
});

describe("daily bars become the weekly bars the method needs", () => {
  const daily = (rows: Array<[string, number, number, number, number, number]>): SymbolBars => ({
    symbol: "X", source: "t", fetchedAt: "", currency: "THB",
    bars: rows.map(([t, o, h, l, c, v]) => ({ t, o, h, l, c, v })),
  });

  it("opens on the week's first trade and closes on its last", () => {
    const w = toWeekly(daily([
      ["2024-01-08", 10, 12, 9, 11, 100],  // Mon
      ["2024-01-09", 11, 15, 10, 14, 200], // Tue
      ["2024-01-12", 14, 16, 13, 15, 300], // Fri
    ]));
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ o: 10, h: 16, l: 9, c: 15, v: 600, t: "2024-01-12" });
  });

  it("dates the bar by the last day that traded, not a nominal Friday", () => {
    // Songkran, royal holidays: labelling a Wednesday close as Friday's
    // misstates the day a signal could have been acted on.
    const w = toWeekly(daily([
      ["2024-04-08", 10, 10, 10, 10, 1],
      ["2024-04-10", 11, 11, 11, 11, 1],
    ]));
    expect(w[0].t).toBe("2024-04-10");
  });

  it("uses the adjusted close so a split is not read as a crash", () => {
    const s: SymbolBars = {
      symbol: "X", source: "t", fetchedAt: "", currency: "THB",
      bars: [{ t: "2024-01-12", o: 100, h: 110, l: 90, c: 100, v: 10, adjClose: 50 }],
    };
    const w = toWeekly(s);
    expect(w[0].c).toBe(50);
    // The whole bar is scaled, so it stays internally consistent.
    expect(w[0].h).toBe(55);
    expect(w[0].l).toBe(45);
    expect(w[0].h).toBeGreaterThanOrEqual(w[0].c);
  });

  it("derives the same indicators the simulator does", () => {
    const bars = Array.from({ length: 80 }, (_, i) => ({
      i, t: `w${i}`, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 1000,
      ma30: 0, stage: 1, rs: 0,
    }));
    const out = deriveIndicators(bars, bars.map(() => 1000));
    expect(out[79].ma30).toBeGreaterThan(0);
    expect(out[79].ma30).toBeLessThan(out[79].c); // rising series: price above MA
    expect(out[79].stage).toBe(2); // above a rising MA is Stage 2
    expect(out[10].stage).toBe(1); // before the warm-up there is no reading
  });
});

describe("the Yahoo payload is parsed correctly without touching the network", () => {
  it("maps SET symbols to Yahoo's", () => {
    expect(toYahooSymbol("PTT")).toBe("PTT.BK");
    expect(toYahooSymbol("ptt")).toBe("PTT.BK");
    expect(toYahooSymbol("^SETI")).toBe("^SETI");
    expect(toYahooSymbol("PTT.BK")).toBe("PTT.BK");
  });

  it("drops non-trading days instead of reading a null close as zero", () => {
    const payload = {
      chart: { result: [{
        meta: { currency: "THB" },
        timestamp: [1704412800, 1704499200, 1704585600],
        indicators: {
          quote: [{ open: [10, null, 12], high: [11, null, 13], low: [9, null, 11], close: [10, null, 12], volume: [100, null, 300] }],
          adjclose: [{ adjclose: [10, null, 12] }],
        },
      }] },
    };
    const s = parseChart(payload, "PTT");
    expect(s.bars).toHaveLength(2);
    expect(s.bars.every((b) => b.c > 0)).toBe(true);
  });

  it("surfaces Yahoo's own error rather than reporting an empty series", () => {
    expect(() => parseChart({ chart: { error: { description: "No data found" } } }, "NOPE"))
      .toThrow(/No data found/);
  });
});

describe("the universe is put on one calendar, and says who it dropped", () => {
  const mk = (symbol: string, n: number, start = 0): SymbolBars => ({
    symbol, source: "t", fetchedAt: "", currency: "THB",
    bars: Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2020, 0, 6) + (i + start) * 7 * 86400000).toISOString().slice(0, 10);
      return { t: d, o: 100, h: 101, l: 99, c: 100 + i * 0.1, v: 1000 };
    }),
  });

  it("intersects dates so week N means the same week for every symbol", () => {
    const bench = mk("^SETI", 200);
    const { market, included } = alignUniverse([mk("A", 200), mk("B", 180, 20)], bench, { minWeeks: 100 });
    expect(included).toEqual(["A", "B"]);
    const a = market.bars.get("A")!;
    const b = market.bars.get("B")!;
    expect(a.length).toBe(b.length);
    expect(a.map((x) => x.t)).toEqual(b.map((x) => x.t));
    expect(market.benchmarkCloses).toHaveLength(a.length);
  });

  it("reports a symbol with too little history instead of dropping it silently", () => {
    // A universe that quietly shrinks is a survivorship filter in disguise.
    const { included, excluded } = alignUniverse([mk("A", 200), mk("TINY", 10)], mk("^SETI", 200), { minWeeks: 100 });
    expect(included).toEqual(["A"]);
    expect(excluded).toEqual([{ symbol: "TINY", weeks: 10 }]);
  });
});
