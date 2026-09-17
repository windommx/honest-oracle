import { describe, it, expect } from "vitest";
import {
  OPTION_STRATEGIES,
  optionPayoff,
  optionStats,
  optionStrategiesFor,
  payoffSeries,
  resolveLegs,
} from "./pro";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The Options desk is a paid feature. It had no test, and it was wrong    ║
// ║  in every visible number:                                                ║
// ║                                                                          ║
// ║    · every leg in the catalog shipped `strike: 0`, so a Bull Call        ║
// ║      Spread's payoff was a flat line — one distinct value across 61      ║
// ║      chart points — and a Protective Put's breakeven printed as -3.00,   ║
// ║      a negative share price;                                             ║
// ║    · optionStats returned maxProfit and maxLoss as unconditional null,   ║
// ║      which the UI renders "ไม่จำกัด", so every strategy was shown with   ║
// ║      unlimited profit AND unlimited loss at the same time;               ║
// ║    · Covered Call and Protective Put modelled only the option leg, so    ║
// ║      the chart drew a naked short call and a lone put;                   ║
// ║    · payoffSeries(legs, spot, span, steps) was called as                 ║
// ║      (legs, lo, hi, steps), so the caption said 70 → 130 and the chart   ║
// ║      ran 1 → 200;                                                        ║
// ║    · the suggestion filter was an OR, so a confirmed Stage 4 downtrend   ║
// ║      was answered with "ซื้อ Call เดี่ยว".                                ║
// ║                                                                          ║
// ║  Expected values below are computed by hand, not captured from the code. ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const SPOT = 100;
const byId = (id: string) => OPTION_STRATEGIES.find((s) => s.id === id)!;
const legsOf = (id: string) => resolveLegs(byId(id).legs, SPOT);
const statsOf = (id: string) => optionStats(legsOf(id), SPOT);

describe("strikes are prices, and they come from the spot", () => {
  it("has a catalog", () => {
    expect(OPTION_STRATEGIES.length).toBeGreaterThan(5);
  });

  it("never leaves a strike at zero", () => {
    for (const spot of [100, 5.2, 1250]) {
      for (const s of OPTION_STRATEGIES) {
        for (const l of resolveLegs(s.legs, spot)) {
          expect(l.strike, `${s.id} @ ${spot}`).toBeGreaterThan(0);
          expect(l.strike).toBeLessThan(spot * 3);
        }
      }
    }
  });

  it("scales premiums with the share price", () => {
    // A 4-baht premium on a 5-baht stock is not a demo value, it is nonsense.
    const cheap = resolveLegs(byId("long-call").legs, 5.2);
    expect(cheap[0].premium).toBeCloseTo(0.21, 2);
    const dear = resolveLegs(byId("long-call").legs, 100);
    expect(dear[0].premium).toBeCloseTo(4, 2);
  });
});

describe("the bounds are the strategy's real bounds", () => {
  it("Long Call: unlimited up, premium down, breakeven at strike plus premium", () => {
    const s = statsOf("long-call");
    expect(s.maxProfit).toBeNull(); // genuinely unbounded
    expect(s.maxLoss).toBeCloseTo(-4, 2); // the premium, and no more
    expect(s.breakevens).toEqual([104]);
  });

  it("Bull Call Spread: both ends capped", () => {
    // 100/110 spread, 4.00 paid and 1.50 received = 2.50 net debit.
    const s = statsOf("bull-call-spread");
    expect(s.maxProfit).toBeCloseTo(10 - 2.5, 2);
    expect(s.maxLoss).toBeCloseTo(-2.5, 2);
    expect(s.breakevens).toEqual([102.5]);
    expect(s.maxProfit).not.toBeNull();
    expect(s.maxLoss).not.toBeNull();
  });

  it("Covered Call: capped upside, and the downside of owning the shares", () => {
    // Long stock at 100 plus a short 108 call for 3.50.
    const s = statsOf("covered-call");
    expect(s.maxProfit).toBeCloseTo(8 + 3.5, 2);
    expect(s.maxLoss).toBeCloseTo(-100 + 3.5, 2); // shares to zero, premium kept
    expect(s.breakevens).toEqual([96.5]);
  });

  it("Protective Put: the share position keeps the upside open", () => {
    // Long stock at 100 plus a 95 put for 3.00.
    const s = statsOf("protective-put");
    expect(s.maxProfit).toBeNull();
    expect(s.maxLoss).toBeCloseTo(-(100 - 95) - 3, 2);
    expect(s.breakevens).toEqual([103]);
  });

  it("Long Put: bounded above, because a share cannot go below zero", () => {
    const s = statsOf("long-put");
    expect(s.maxProfit).toBeCloseTo(100 - 4.5, 2);
    expect(s.maxLoss).toBeCloseTo(-4.5, 2);
  });

  it("never reports unlimited profit and unlimited loss at once", () => {
    for (const s of OPTION_STRATEGIES) {
      const st = optionStats(resolveLegs(s.legs, SPOT), SPOT);
      expect(
        st.maxProfit === null && st.maxLoss === null,
        `${s.id} claims both ends are unbounded`,
      ).toBe(false);
    }
  });

  it("never puts a breakeven at a price a share cannot trade at", () => {
    for (const s of OPTION_STRATEGIES) {
      for (const b of optionStats(resolveLegs(s.legs, SPOT), SPOT).breakevens) {
        expect(b, `${s.id} breakeven ${b}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("the chart draws the strategy it is labelled with", () => {
  it("runs between the prices the caption names", () => {
    const series = payoffSeries(legsOf("bull-call-spread"), 70, 130, 60);
    expect(series[0].spot).toBeCloseTo(70, 6);
    expect(series[series.length - 1].spot).toBeCloseTo(130, 6);
  });

  it("is not a flat line", () => {
    for (const s of OPTION_STRATEGIES) {
      const ys = payoffSeries(resolveLegs(s.legs, SPOT), 70, 130, 60).map((p) => p.pnl);
      expect(new Set(ys).size, `${s.id} payoff has one value across the chart`)
        .toBeGreaterThan(2);
    }
  });

  it("puts the share leg in the payoff", () => {
    // Covered Call at a spot of 60: the shares have lost 40, the 3.50 premium
    // stays, so the position is 36.50 down. Without the stock leg it would
    // show +3.50, a profit, on a 40% fall.
    expect(optionPayoff(legsOf("covered-call"), 60)).toBeCloseTo(-36.5, 2);
    expect(optionPayoff(legsOf("protective-put"), 60)).toBeCloseTo(-8, 2);
  });
});

describe("the suggestion follows the stage it was given", () => {
  it("does not offer a long call in a confirmed downtrend", () => {
    const ids = optionStrategiesFor(4, 6).map((s) => s.id);
    expect(ids).not.toContain("long-call");
    expect(ids).toContain("long-put");
  });

  it("still offers bullish structures in Stage 2", () => {
    expect(optionStrategiesFor(2, 8).map((s) => s.id)).toContain("long-call");
  });

  it("returns something for every stage", () => {
    for (const stage of [1, 2, 3, 4]) {
      for (const score of [0, 5, 10]) {
        expect(optionStrategiesFor(stage, score).length, `stage ${stage} score ${score}`)
          .toBeGreaterThan(0);
      }
    }
  });
});
