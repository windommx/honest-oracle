import { describe, it, expect } from "vitest";
import {
  FEATURE_LABELS,
  STAGE_PLANS,
  hasFeature,
  limitFor,
  stagePlan,
  type StageFeature,
} from "./plans";
import { NAV } from "@/app/stagelab/_nav";

const PLAN_KEYS = ["free", "pro", "team"] as const;

describe("plan matrix", () => {
  it("degrades an unknown plan string to free rather than throwing", () => {
    // A typo in a billing webhook must not lock a paying customer out of the
    // journal they already wrote.
    expect(stagePlan("enterprise").key).toBe("free");
    expect(stagePlan(null).key).toBe("free");
    expect(stagePlan(undefined).key).toBe("free");
    expect(stagePlan("").key).toBe("free");
  });

  it("recognises the plans billing can actually set", () => {
    expect(stagePlan("pro").key).toBe("pro");
    expect(stagePlan("team").key).toBe("team");
  });

  it("makes every paid plan a strict superset of free", () => {
    for (const key of ["pro", "team"] as const) {
      for (const feature of STAGE_PLANS.free.features) {
        expect(
          STAGE_PLANS[key].features.includes(feature),
          `${key} is missing the free feature ${feature}`,
        ).toBe(true);
      }
      expect(STAGE_PLANS[key].features.length).toBeGreaterThan(STAGE_PLANS.free.features.length);
    }
  });

  it("never lets a higher plan have a lower limit", () => {
    const limits = ["watchlist", "positions", "theses", "sectors", "actions", "journal", "computePerDay"] as const;
    for (const limit of limits) {
      expect(STAGE_PLANS.pro.limits[limit], limit).toBeGreaterThanOrEqual(STAGE_PLANS.free.limits[limit]);
      expect(STAGE_PLANS.team.limits[limit], limit).toBeGreaterThanOrEqual(STAGE_PLANS.pro.limits[limit]);
    }
  });

  it("gives free a usable weekly routine — the tier has to stand on its own", () => {
    const free = STAGE_PLANS.free;
    for (const feature of ["dashboard", "weekly", "screener", "watchlist", "portfolio", "journal"] as const) {
      expect(free.features.includes(feature), feature).toBe(true);
    }
    expect(free.limits.watchlist).toBeGreaterThan(0);
    expect(free.limits.positions).toBeGreaterThan(0);
  });

  it("keeps heavy compute off the free tier", () => {
    // The gate is the budget being zero, which spendCompute() rejects before
    // touching the CPU — not a feature flag that could drift out of step.
    expect(STAGE_PLANS.free.limits.computePerDay).toBe(0);
    expect(hasFeature("free", "quant")).toBe(false);
    expect(hasFeature("free", "backtest")).toBe(false);
    expect(hasFeature("pro", "quant")).toBe(true);
  });

  it("labels every feature it gates", () => {
    const labelled = new Set(Object.keys(FEATURE_LABELS) as StageFeature[]);
    const used = new Set<StageFeature>();
    for (const key of PLAN_KEYS) for (const f of STAGE_PLANS[key].features) used.add(f);
    for (const f of Array.from(used)) expect(labelled.has(f), `${f} has no label`).toBe(true);
    // and no label without a feature behind it
    for (const f of Array.from(labelled)) expect(used.has(f), `${f} is labelled but unused`).toBe(true);
  });

  it("backs every navigation item with a feature some plan grants", () => {
    for (const item of NAV) {
      const granted = PLAN_KEYS.some((k) => STAGE_PLANS[k].features.includes(item.feature));
      expect(granted, `nav item ${item.key} gates on ${item.feature}, which no plan grants`).toBe(true);
    }
  });

  it("reads limits through the same accessor the routes use", () => {
    expect(limitFor("free", "watchlist")).toBe(STAGE_PLANS.free.limits.watchlist);
    expect(limitFor("pro", "theses")).toBe(STAGE_PLANS.pro.limits.theses);
    expect(limitFor("nonsense", "positions")).toBe(STAGE_PLANS.free.limits.positions);
  });

  it("prices the paid tiers", () => {
    expect(STAGE_PLANS.free.priceThb).toBe(0);
    expect(STAGE_PLANS.pro.priceThb).toBeGreaterThan(0);
    expect(STAGE_PLANS.team.priceThb ?? 0).toBeGreaterThan(STAGE_PLANS.pro.priceThb ?? 0);
  });
});
