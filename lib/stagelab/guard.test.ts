import { describe, it, expect, vi, beforeEach } from "vitest";
import { STAGE_PLANS } from "./plans";
// vi.mock is hoisted above the imports by vitest, so the static import below
// still resolves to the mocked modules. (A top-level `await import()` would
// work at runtime but fails tsc under this project's module target.)
import { computeRemaining, overRowCap, spendCompute } from "./guard";

// Prisma is mocked at the module boundary: these tests are about the quota
// arithmetic and the shape of the refusal, not about the database.
// vi.hoisted runs before the hoisted vi.mock factories, which is the only way
// the factory can close over these spies.
const { usageDay } = vi.hoisted(() => ({
  usageDay: { upsert: vi.fn(), findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: { usageDay } }));
vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn(), requireAdmin: vi.fn() }));

const ctx = (plan: keyof typeof STAGE_PLANS) => ({
  user: { id: "u1", email: "a@b.c", name: null, plan, role: "user" },
  plan: STAGE_PLANS[plan],
});

beforeEach(() => {
  usageDay.upsert.mockReset();
  usageDay.findUnique.mockReset();
});

describe("row caps", () => {
  it("allows a create while under the cap", () => {
    expect(overRowCap(STAGE_PLANS.free, "watchlist", STAGE_PLANS.free.limits.watchlist - 1)).toBeNull();
  });

  it("refuses at the cap, not one past it", () => {
    // `current` is the count BEFORE the insert, so equality means this create
    // would be the one that breaks the limit.
    expect(overRowCap(STAGE_PLANS.free, "watchlist", STAGE_PLANS.free.limits.watchlist)).not.toBeNull();
  });

  it("tells a free user to upgrade and a paid user to clean up", async () => {
    const free = overRowCap(STAGE_PLANS.free, "positions", 99);
    const pro = overRowCap(STAGE_PLANS.pro, "positions", 999);
    expect(free).not.toBeNull();
    expect(pro).not.toBeNull();
    expect((await free!.json()).code).toBe("upgrade_required");
    expect((await pro!.json()).code).toBe("limit_reached");
    // 402 Payment Required — the client turns this into an upgrade prompt.
    expect(free!.status).toBe(402);
  });
});

describe("compute metering", () => {
  it("refuses the free tier without touching the database", async () => {
    const denied = await spendCompute(ctx("free"), 1);
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(402);
    expect((await denied!.json()).code).toBe("upgrade_required");
    expect(usageDay.upsert).not.toHaveBeenCalled();
  });

  it("charges before the work runs, so a crash mid-computation still costs", async () => {
    usageDay.upsert.mockResolvedValue({ stageRuns: 5 });
    const denied = await spendCompute(ctx("pro"), 2);
    expect(denied).toBeNull();
    expect(usageDay.upsert).toHaveBeenCalledTimes(1);
    const call = usageDay.upsert.mock.calls[0][0];
    expect(call.create.stageRuns).toBe(2);
    expect(call.update.stageRuns).toEqual({ increment: 2 });
  });

  it("normalizes the usage day to UTC midnight", async () => {
    usageDay.upsert.mockResolvedValue({ stageRuns: 1 });
    await spendCompute(ctx("pro"), 1);
    const day: Date = usageDay.upsert.mock.calls[0][0].where.userId_day.day;
    expect(day.getUTCHours()).toBe(0);
    expect(day.getUTCMinutes()).toBe(0);
    expect(day.getUTCSeconds()).toBe(0);
    expect(day.getUTCMilliseconds()).toBe(0);
  });

  it("returns 429 once the day's budget is spent", async () => {
    usageDay.upsert.mockResolvedValue({ stageRuns: STAGE_PLANS.pro.limits.computePerDay + 1 });
    const denied = await spendCompute(ctx("pro"), 1);
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(429);
    const body = await denied!.json();
    expect(body.code).toBe("quota_exhausted");
    expect(body.limit).toBe(STAGE_PLANS.pro.limits.computePerDay);
  });

  it("allows the run that lands exactly on the budget", async () => {
    usageDay.upsert.mockResolvedValue({ stageRuns: STAGE_PLANS.pro.limits.computePerDay });
    expect(await spendCompute(ctx("pro"), 1)).toBeNull();
  });

  it("reports the remaining budget, never negative", async () => {
    usageDay.findUnique.mockResolvedValue({ stageRuns: STAGE_PLANS.pro.limits.computePerDay + 50 });
    expect(await computeRemaining(ctx("pro"))).toBe(0);

    usageDay.findUnique.mockResolvedValue({ stageRuns: 10 });
    expect(await computeRemaining(ctx("pro"))).toBe(STAGE_PLANS.pro.limits.computePerDay - 10);

    usageDay.findUnique.mockResolvedValue(null);
    expect(await computeRemaining(ctx("pro"))).toBe(STAGE_PLANS.pro.limits.computePerDay);
  });

  it("reports zero remaining for free without querying", async () => {
    expect(await computeRemaining(ctx("free"))).toBe(0);
    expect(usageDay.findUnique).not.toHaveBeenCalled();
  });
});
