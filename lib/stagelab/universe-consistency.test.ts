import { describe, it, expect } from "vitest";
import { STAGE_UNIVERSE } from "./seed-data";
import { genSeries, simContext, priceAnchor } from "./market-sim";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  One stock, one story.                                                   ║
// ║                                                                          ║
// ║  The universe table and the price simulator used to invent the same      ║
// ║  stock twice. The screener read the table; the chart, the alert engine   ║
// ║  and the backtester read the simulator; and the enrichment code compared ║
// ║  a number from one against a number from the other:                      ║
// ║                                                                          ║
// ║      breakout = s.price > ctx.highestHigh10                              ║
// ║                                                                          ║
// ║  Measured before the fix: the stage in the screener row disagreed with   ║
// ║  the stage on that symbol's own chart for 46 of 61 symbols, 48 of 61     ║
// ║  prices were more than 2x out of scale with the series, and symbol A was ║
// ║  shown at 5.20 with an ATR of 11.60 — 223% of its own price.             ║
// ║                                                                          ║
// ║  These assertions are what "one generator, one answer" means in numbers. ║
// ╚══════════════════════════════════════════════════════════════════════════╝

describe("the screener row and the chart describe the same stock", () => {
  it("has a universe to check", () => {
    expect(STAGE_UNIVERSE.length).toBeGreaterThan(50);
  });

  it("ends every series at the price the symbol is published with", () => {
    for (const s of STAGE_UNIVERSE) {
      const bars = genSeries(s.symbol).bars;
      const last = bars[bars.length - 1];
      expect(priceAnchor(s.symbol)).toBe(s.price);
      // Rounded to two decimals per bar, so an exact match is not available;
      // half a satang is.
      expect(Math.abs(last.c - s.price), `${s.symbol}: chart ends at ${last.c}, screener says ${s.price}`)
        .toBeLessThan(0.005 + s.price * 1e-9);
    }
  });

  it("keeps every derived figure on the scale of the price being shown", () => {
    for (const s of STAGE_UNIVERSE) {
      const ctx = simContext(s.symbol);
      // An ATR is a weekly range. Half the share price is already absurd; the
      // old code produced 223% for symbol A, and then compared it to a stop.
      expect(ctx.atr / s.price, `${s.symbol}: ATR is ${(ctx.atr / s.price) * 100}% of price`)
        .toBeLessThan(0.5);
      const ratio = ctx.highestHigh10 / s.price;
      expect(ratio, `${s.symbol}: 10-week high is ${ratio}x the price`).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2);
    }
  });

  it("leaves the shape of the walk untouched — only its units change", () => {
    // Anchoring is a single multiplier, so every ratio the engine reads must
    // be invariant: stage detection, relative strength, price against its MA.
    for (const s of STAGE_UNIVERSE.slice(0, 20)) {
      const bars = genSeries(s.symbol).bars;
      for (const b of bars.slice(-30)) {
        expect(b.h).toBeGreaterThanOrEqual(b.c - 1e-6);
        expect(b.l).toBeLessThanOrEqual(b.c + 1e-6);
        expect(b.stage).toBeGreaterThanOrEqual(1);
        expect(b.stage).toBeLessThanOrEqual(4);
      }
    }
  });

  it("makes the breakout rule reachable — rare, but not impossible", () => {
    // The advertised alert compares a close against a high. If the window
    // includes the current bar the comparison can never be true; if the two
    // sides are on different scales the answer is noise. Neither is a signal.
    let everFires = 0;
    for (const s of STAGE_UNIVERSE) {
      const bars = genSeries(s.symbol).bars;
      for (let i = 60; i < bars.length; i++) {
        let hh = 0;
        let v = 0;
        for (let j = i - 10; j < i; j++) {
          hh = Math.max(hh, bars[j].h);
          v += bars[j].v;
        }
        if (bars[i].c > hh && bars[i].v / (v / 10) > 1.5 && bars[i].rs > 0) {
          everFires++;
          break;
        }
      }
    }
    expect(everFires, "a rule no symbol can ever satisfy is not a rule")
      .toBeGreaterThan(STAGE_UNIVERSE.length / 2);
  });

  it("gives relative strength a range wide enough to discriminate", () => {
    // The authored column used a compressed convention (0.4 to 2.4), which
    // made scoring.ts's `mansfieldRs > 5` band — worth 2 points — very nearly
    // dead code. Read off the series, RS is a percentage deviation.
    const rs = STAGE_UNIVERSE.map((s) => {
      const bars = genSeries(s.symbol).bars;
      return bars[bars.length - 1].rs;
    });
    const above = rs.filter((r) => r > 5).length;
    expect(above, "the 2-point RS band must be attainable").toBeGreaterThan(3);
    expect(above, "and not attained by everything").toBeLessThan(STAGE_UNIVERSE.length - 3);
    expect(Math.min(...rs)).toBeLessThan(0);
    expect(Math.max(...rs)).toBeGreaterThan(0);
  });
});
