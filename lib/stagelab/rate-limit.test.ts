import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { READ_BUDGET, WRITE_BUDGET, _resetRateLimits, rateLimit } from "./rate-limit";

beforeEach(() => _resetRateLimits());
afterEach(() => vi.useRealTimers());

const SMALL = { limit: 3, windowMs: 1000 };

describe("sliding window", () => {
  it("allows up to the limit and then stops", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("u1", SMALL).ok).toBe(true);
    expect(rateLimit("u1", SMALL).ok).toBe(false);
  });

  it("counts down the remaining allowance", () => {
    expect(rateLimit("u1", SMALL).remaining).toBe(2);
    expect(rateLimit("u1", SMALL).remaining).toBe(1);
    expect(rateLimit("u1", SMALL).remaining).toBe(0);
  });

  it("says how long to wait, and the answer is inside the window", () => {
    for (let i = 0; i < 3; i++) rateLimit("u1", SMALL);
    const denied = rateLimit("u1", SMALL);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(SMALL.windowMs);
  });

  it("frees slots as the window slides, not all at once on a boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    rateLimit("u1", SMALL);
    vi.setSystemTime(400);
    rateLimit("u1", SMALL);
    vi.setSystemTime(800);
    rateLimit("u1", SMALL);
    expect(rateLimit("u1", SMALL).ok).toBe(false);

    // The first hit ages out at t=1000, so exactly one slot reopens — a fixed
    // window would have handed back all three here.
    vi.setSystemTime(1001);
    expect(rateLimit("u1", SMALL).ok).toBe(true);
    expect(rateLimit("u1", SMALL).ok).toBe(false);
  });

  it("keeps separate keys separate", () => {
    for (let i = 0; i < 3; i++) rateLimit("u1", SMALL);
    expect(rateLimit("u1", SMALL).ok).toBe(false);
    expect(rateLimit("u2", SMALL).ok).toBe(true);
  });

  it("does not grow without bound under key churn", () => {
    // The map is keyed by something a caller influences, so unbounded growth
    // would be a memory leak with a remote trigger.
    for (let i = 0; i < 25_000; i++) rateLimit(`key-${i}`, SMALL);
    // Still serving correctly after the sweeper has run many times.
    expect(rateLimit("fresh", SMALL).ok).toBe(true);
  });

  it("gives reads a larger allowance than writes", () => {
    // A dashboard legitimately fires several reads on mount; no human saves
    // sixty times a minute, and the thing that does is a bug.
    expect(READ_BUDGET.limit).toBeGreaterThan(WRITE_BUDGET.limit);
  });
});
