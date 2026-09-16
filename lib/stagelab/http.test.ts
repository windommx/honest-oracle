import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  actionCreate,
  backtestBody,
  checklistReset,
  journalCreate,
  monteCarloBody,
  positionCreate,
  positionUpdate,
  page,
  pageParams,
  sectorCreate,
  thesisBody,
  versionWhere,
  watchlistCreate,
  watchlistUpdate,
} from "./http";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  The request contract.                                                   ║
// ║                                                                          ║
// ║  These schemas are the only thing standing between a hand-written POST   ║
// ║  and the database, so the cases below are the ones an attacker or a      ║
// ║  buggy client would actually send: wrong types, out-of-range numbers,    ║
// ║  enum values that look plausible, and the close-a-position payload that  ║
// ║  omits the price it closed at.                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

describe("watchlist schema", () => {
  it("fills the optional plan fields so Prisma gets a complete row", () => {
    const parsed = watchlistCreate.parse({
      symbol: "delta",
      entryPrice: 148,
      stopLoss: 138,
      targetPrice: 185,
    });
    expect(parsed.symbol).toBe("DELTA");
    expect(parsed.stage).toBe(2);
    expect(parsed.priority).toBe("B");
    expect(parsed.status).toBe("WATCHING");
    expect(parsed.notes).toBeNull();
    expect(parsed.sector).toBe("");
  });

  it("rejects a missing price rather than storing zero", () => {
    expect(watchlistCreate.safeParse({ symbol: "DELTA", stopLoss: 1, targetPrice: 2 }).success).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    expect(
      watchlistCreate.safeParse({ symbol: "X", entryPrice: Infinity, stopLoss: 1, targetPrice: 2 }).success,
    ).toBe(false);
    expect(
      watchlistCreate.safeParse({ symbol: "X", entryPrice: NaN, stopLoss: 1, targetPrice: 2 }).success,
    ).toBe(false);
  });

  it("rejects a priority outside A/B/C", () => {
    const bad = watchlistCreate.safeParse({
      symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2, priority: "S",
    });
    expect(bad.success).toBe(false);
  });

  it("treats an update as a patch — absent keys stay absent", () => {
    const parsed = watchlistUpdate.parse({ id: 7, priority: "A" });
    expect(parsed).toEqual({ id: 7, priority: "A" });
    expect("entryPrice" in parsed).toBe(false);
  });

  it("requires a positive integer id on update", () => {
    expect(watchlistUpdate.safeParse({ id: 0, priority: "A" }).success).toBe(false);
    expect(watchlistUpdate.safeParse({ id: -3 }).success).toBe(false);
    expect(watchlistUpdate.safeParse({ id: 1.5 }).success).toBe(false);
  });

  it("rejects a stage outside 1..4", () => {
    expect(watchlistUpdate.safeParse({ id: 1, stage: 5 }).success).toBe(false);
    expect(watchlistUpdate.safeParse({ id: 1, stage: 0 }).success).toBe(false);
  });
});

describe("position schema", () => {
  it("defaults the mark to the entry price when the client omits it", () => {
    const parsed = positionCreate.parse({ symbol: "kbank", quantity: 200, entryPrice: 165, stopLoss: 152 });
    expect(parsed.symbol).toBe("KBANK");
    expect(parsed.currentPrice).toBeUndefined();
    expect(parsed.confidence).toBe("B");
  });

  it("refuses a fractional or zero share count", () => {
    expect(positionCreate.safeParse({ symbol: "X", quantity: 0, entryPrice: 1, stopLoss: 1 }).success).toBe(false);
    expect(positionCreate.safeParse({ symbol: "X", quantity: 10.5, entryPrice: 1, stopLoss: 1 }).success).toBe(false);
  });

  it("will not close a position without the price it closed at", () => {
    // Otherwise the trade lands in the win-rate maths marked at its last live
    // quote, which is not what it was sold for.
    expect(positionUpdate.safeParse({ id: 1, status: "CLOSED" }).success).toBe(false);
    expect(positionUpdate.safeParse({ id: 1, status: "CLOSED", closedPrice: 80 }).success).toBe(true);
  });

  it("accepts reopening without a price", () => {
    expect(positionUpdate.safeParse({ id: 1, status: "OPEN" }).success).toBe(true);
  });

  it("requires closedAt to be a real timestamp when given", () => {
    expect(positionUpdate.safeParse({ id: 1, status: "CLOSED", closedPrice: 1, closedAt: "yesterday" }).success).toBe(false);
    expect(
      positionUpdate.safeParse({ id: 1, status: "CLOSED", closedPrice: 1, closedAt: "2026-09-16T00:00:00.000Z" }).success,
    ).toBe(true);
  });
});

describe("journal schema", () => {
  it("accepts a null P/L for an open trade", () => {
    const parsed = journalCreate.parse({ symbol: "ivl", bias: "NONE", outcome: "OPEN" });
    expect(parsed.pnlPct).toBeNull();
    expect(parsed.lesson).toBe("");
  });

  it("rejects a bias it does not recognise", () => {
    expect(journalCreate.safeParse({ symbol: "X", bias: "GREED", outcome: "WIN" }).success).toBe(false);
  });

  it("caps the lesson so one entry cannot fill a row", () => {
    expect(journalCreate.safeParse({ symbol: "X", bias: "NONE", outcome: "WIN", lesson: "x".repeat(2001) }).success).toBe(false);
  });
});

describe("sector and action schemas", () => {
  it("uppercases sector names so the screener's chip matching works", () => {
    expect(sectorCreate.parse({ name: " etron " }).name).toBe("ETRON");
  });

  it("holds the sector score to 1..5", () => {
    expect(sectorCreate.safeParse({ name: "X", score: 6 }).success).toBe(false);
    expect(sectorCreate.safeParse({ name: "X", score: 0 }).success).toBe(false);
  });

  it("requires a real action type and non-empty content", () => {
    expect(actionCreate.safeParse({ type: "HOLD", content: "x" }).success).toBe(false);
    expect(actionCreate.safeParse({ type: "BUY", content: "   " }).success).toBe(false);
    expect(actionCreate.parse({ type: "BUY", content: "ซื้อ DELTA" }).done).toBe(false);
  });

  it("only accepts the four checklist cadences", () => {
    expect(checklistReset.safeParse({ category: "HOURLY" }).success).toBe(false);
    expect(checklistReset.safeParse({ category: "WEEKLY" }).success).toBe(true);
  });
});

describe("compute schemas", () => {
  it("clamps backtest inputs to a range the engine can survive", () => {
    expect(backtestBody.safeParse({ capital: 1 }).success).toBe(false);
    expect(backtestBody.safeParse({ maxPositions: 100 }).success).toBe(false);
    expect(backtestBody.safeParse({ riskPct: 50 }).success).toBe(false);
    const defaults = backtestBody.parse({});
    expect(defaults.capital).toBe(1_000_000);
    expect(defaults.requireVolume).toBe(true);
  });

  it("caps the Monte Carlo at a size that cannot hang the request", () => {
    expect(monteCarloBody.safeParse({ returns: [1], sims: 1_000_000 }).success).toBe(false);
    expect(monteCarloBody.safeParse({ returns: new Array(401).fill(1) }).success).toBe(false);
    expect(monteCarloBody.parse({ returns: [1, 2, 3, 4, 5] }).sims).toBe(2000);
  });
});

describe("thesis schema", () => {
  it("does not accept a client-supplied grade", () => {
    // The tier is derived from the evidence server-side; letting a client post
    // its own would make every idea S-tier.
    const parsed = thesisBody.parse({ symbol: "DELTA", tier: "S+", combinedScore: 99, fundScore: 20 });
    expect("tier" in parsed).toBe(false);
    expect("combinedScore" in parsed).toBe(false);
    expect("fundScore" in parsed).toBe(false);
  });

  it("holds the technical checklist to 0..17", () => {
    expect(thesisBody.safeParse({ symbol: "X", tech17: 18 }).success).toBe(false);
    expect(thesisBody.safeParse({ symbol: "X", tech17: -1 }).success).toBe(false);
  });

  it("caps quarters at twelve", () => {
    const quarters = new Array(13).fill({ label: "Q", eps: 1 });
    expect(thesisBody.safeParse({ symbol: "X", quarters }).success).toBe(false);
  });

  it("defaults a fresh thesis to an active idea with no quarters", () => {
    const parsed = thesisBody.parse({ symbol: "x" });
    expect(parsed.symbol).toBe("X");
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.quarters).toEqual([]);
    expect(parsed.foreignFlow).toBe("FLAT");
  });
});

describe("pagination", () => {
  const req = (qs: string) => new Request(`https://example.test/api${qs}`);

  it("defaults to a bounded page rather than everything", () => {
    expect(pageParams(req(""))).toEqual({ take: DEFAULT_PAGE_SIZE, skip: 0 });
  });

  it("clamps a limit a client could otherwise use to pull the whole table", () => {
    expect(pageParams(req("?limit=100000")).take).toBe(MAX_PAGE_SIZE);
    expect(pageParams(req("?limit=0")).take).toBe(1);
    expect(pageParams(req("?limit=-5")).take).toBe(1);
  });

  it("ignores garbage instead of producing NaN in a SQL query", () => {
    expect(pageParams(req("?limit=abc&offset=xyz"))).toEqual({
      take: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
  });

  it("refuses a negative offset", () => {
    expect(pageParams(req("?offset=-40")).skip).toBe(0);
  });

  it("floors fractional input", () => {
    expect(pageParams(req("?limit=10.9&offset=3.7"))).toEqual({ take: 10, skip: 3 });
  });

  it("reports hasMore only when rows remain", () => {
    const range = { take: 10, skip: 0 };
    expect(page(new Array(10).fill(0), 25, range).hasMore).toBe(true);
    expect(page(new Array(10).fill(0), 10, range).hasMore).toBe(false);
    expect(page(new Array(5).fill(0), 25, { take: 10, skip: 20 }).hasMore).toBe(false);
  });
});

describe("optimistic concurrency", () => {
  it("turns a version token into a WHERE fragment", () => {
    const at = "2026-09-16T10:00:00.000Z";
    expect(versionWhere(at)).toEqual({ updatedAt: new Date(at) });
  });

  it("omits the predicate entirely when the caller sends no token", () => {
    // Absent means "I accept last-write-wins", which has to be explicit rather
    // than a match against undefined that would silently find nothing.
    expect(versionWhere(undefined)).toEqual({});
  });

  it("accepts a token on the shapes that carry one", () => {
    const at = "2026-09-16T10:00:00.000Z";
    expect(positionUpdate.safeParse({ id: 1, currentPrice: 10, expectedUpdatedAt: at }).success).toBe(true);
    expect(watchlistUpdate.safeParse({ id: 1, priority: "A", expectedUpdatedAt: at }).success).toBe(true);
    expect(thesisBody.safeParse({ symbol: "X", id: 1, expectedUpdatedAt: at }).success).toBe(true);
  });

  it("rejects a token that is not a timestamp", () => {
    expect(positionUpdate.safeParse({ id: 1, expectedUpdatedAt: "lunchtime" }).success).toBe(false);
  });
});

describe("monte carlo request", () => {
  it("accepts the resampler controls", () => {
    const parsed = monteCarloBody.parse({
      returns: [1, 2, 3, 4, 5],
      method: "iid",
      blockSize: 4,
      avgHoldWeeks: 3,
    });
    expect(parsed.method).toBe("iid");
    expect(parsed.blockSize).toBe(4);
    expect(parsed.avgHoldWeeks).toBe(3);
  });

  it("defaults to the honest resampler", () => {
    expect(monteCarloBody.parse({ returns: [1, 2, 3, 4, 5] }).method).toBe("block");
  });

  it("rejects a method it does not implement", () => {
    expect(monteCarloBody.safeParse({ returns: [1, 2, 3, 4, 5], method: "garch" }).success).toBe(false);
  });
});
