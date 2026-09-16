import { describe, it, expect, vi, beforeEach } from "vitest";

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Route-level tests.                                                      ║
// ║                                                                          ║
// ║  Everything else in this module is tested a layer down: engines in       ║
// ║  isolation, schemas against payloads, the plan matrix as data, tenancy   ║
// ║  by static analysis. None of that proves a handler wires them together   ║
// ║  correctly — that the gate runs before the query, that a cap is checked  ║
// ║  against the right count, that a version mismatch becomes a 409 and not  ║
// ║  a 404. These are those tests.                                           ║
// ║                                                                          ║
// ║  Mocks follow the convention already in this repo                        ║
// ║  (app/api/rush/projects/projects.test.ts): stub the session and Prisma,  ║
// ║  import the handler, assert the response.                                ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const { db } = vi.hoisted(() => {
  const model = () => ({
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
  });
  return {
    db: {
      stageWatchlistItem: model(),
      stagePosition: model(),
      stageJournalEntry: model(),
      stageThesis: model(),
      stageStock: model(),
      stageSector: model(),
      stageMarketReview: model(),
      stageNightlySnapshot: model(),
      usageDay: model(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/session", () => ({
  requireUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

import { requireUser } from "@/lib/server/session";
import { _resetRateLimits } from "@/lib/stagelab/rate-limit";
import {
  GET as watchlistGET,
  POST as watchlistPOST,
  PUT as watchlistPUT,
  DELETE as watchlistDELETE,
} from "./watchlist/route";
import { PUT as positionPUT } from "./positions/route";
import { GET as exportGET } from "./export/route";
import { GET as trapsGET } from "./quant/traps/route";
import { GET as chainGET, POST as chainPOST } from "./quant/chain/route";

const session = requireUser as unknown as ReturnType<typeof vi.fn>;

const FREE = { id: "u1", email: "a@b.c", name: null, plan: "free", role: "user" };
const PRO = { ...FREE, plan: "pro" };

const get = (qs = "") => new Request(`https://x.test/api/stagelab${qs}`);
const send = (method: string, body: unknown) =>
  new Request("https://x.test/api/stagelab", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const ROW = {
  id: 1,
  userId: "u1",
  symbol: "DELTA",
  sector: "ETRON",
  stage: 2,
  setup: "Breakout",
  entryPrice: 148,
  stopLoss: 138,
  targetPrice: 185,
  rsScore: 9,
  fundScore: 8,
  priority: "A",
  status: "WATCHING",
  notes: null,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  vi.clearAllMocks();
  // The limiter keeps counters in module scope; without this the later suites
  // inherit whatever the earlier ones spent.
  _resetRateLimits();
  session.mockResolvedValue(PRO);
});

// ─── Authentication ──────────────────────────────────────────────────────────

describe("authentication", () => {
  it("answers 401 before touching the database", async () => {
    session.mockResolvedValue(null);
    expect((await watchlistGET(get())).status).toBe(401);
    expect(db.stageWatchlistItem.findMany).not.toHaveBeenCalled();
  });

  it("answers 401 on writes too, without parsing the body", async () => {
    session.mockResolvedValue(null);
    const res = await watchlistPOST(send("POST", { symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2 }));
    expect(res.status).toBe(401);
    expect(db.stageWatchlistItem.create).not.toHaveBeenCalled();
  });
});

// ─── Tenant scoping, at runtime rather than by static analysis ──────────────

describe("tenant scoping", () => {
  it("filters reads by the caller's own id", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([]);
    await watchlistGET(get());
    expect(db.stageWatchlistItem.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("stamps creates with the caller's id, ignoring any userId in the body", async () => {
    db.stageWatchlistItem.count.mockResolvedValue(0);
    db.stageWatchlistItem.create.mockResolvedValue(ROW);
    await watchlistPOST(
      send("POST", {
        symbol: "DELTA",
        entryPrice: 148,
        stopLoss: 138,
        targetPrice: 185,
        userId: "someone-else",
      }),
    );
    expect(db.stageWatchlistItem.create.mock.calls[0][0].data.userId).toBe("u1");
  });

  it("scopes deletes so another tenant's id cannot be removed", async () => {
    db.stageWatchlistItem.deleteMany.mockResolvedValue({ count: 0 });
    const res = await watchlistDELETE(get("?id=99"));
    expect(db.stageWatchlistItem.deleteMany.mock.calls[0][0].where).toEqual({ id: 99, userId: "u1" });
    // Not yours and does not exist answer identically — on purpose.
    expect(res.status).toBe(404);
  });
});

// ─── Plan caps ───────────────────────────────────────────────────────────────

describe("row caps", () => {
  it("refuses a create at the free cap with an upgrade code", async () => {
    session.mockResolvedValue(FREE);
    db.stageWatchlistItem.count.mockResolvedValue(10);
    const res = await watchlistPOST(
      send("POST", { symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2 }),
    );
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("upgrade_required");
    expect(db.stageWatchlistItem.create).not.toHaveBeenCalled();
  });

  it("allows the create one below the cap", async () => {
    session.mockResolvedValue(FREE);
    db.stageWatchlistItem.count.mockResolvedValue(9);
    db.stageWatchlistItem.create.mockResolvedValue(ROW);
    expect((await watchlistPOST(send("POST", { symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2 }))).status).toBe(200);
  });

  it("checks the cap before writing, not after", async () => {
    session.mockResolvedValue(FREE);
    db.stageWatchlistItem.count.mockResolvedValue(10);
    await watchlistPOST(send("POST", { symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2 }));
    expect(db.stageWatchlistItem.create).not.toHaveBeenCalled();
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe("validation", () => {
  it("rejects a malformed body with 400 and a readable reason", async () => {
    const res = await watchlistPOST(send("POST", { symbol: "X" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("invalid_request");
    expect(body.error).toContain("entryPrice");
  });

  it("rejects a body that is not JSON at all", async () => {
    const bad = new Request("https://x.test/api", { method: "POST", body: "not json" });
    expect((await watchlistPOST(bad)).status).toBe(400);
  });

  it("rejects an oversized body before parsing it", async () => {
    const huge = new Request("https://x.test/api", {
      method: "POST",
      headers: { "content-length": String(1024 * 1024) },
      body: "{}",
    });
    const res = await watchlistPOST(huge);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("payload_too_large");
  });
});

// ─── Optimistic concurrency ──────────────────────────────────────────────────

describe("write conflicts", () => {
  it("passes the version token into the WHERE clause", async () => {
    db.stagePosition.updateMany.mockResolvedValue({ count: 1 });
    db.stagePosition.findFirst.mockResolvedValue({ id: 1 });
    await positionPUT(
      send("PUT", { id: 1, currentPrice: 150, expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    expect(db.stagePosition.updateMany.mock.calls[0][0].where).toEqual({
      id: 1,
      userId: "u1",
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
  });

  it("answers 409 — not 404 — when the row exists but has moved on", async () => {
    db.stagePosition.updateMany.mockResolvedValue({ count: 0 });
    db.stagePosition.findFirst.mockResolvedValue({ updatedAt: new Date("2026-02-02") });
    const res = await positionPUT(
      send("PUT", { id: 1, currentPrice: 150, expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("conflict");
    // The fresh timestamp comes back so the client can refetch and compare.
    expect(body.currentUpdatedAt).toBe(new Date("2026-02-02").toISOString());
  });

  it("answers 404 when the row is genuinely gone", async () => {
    db.stagePosition.updateMany.mockResolvedValue({ count: 0 });
    db.stagePosition.findFirst.mockResolvedValue(null);
    const res = await positionPUT(send("PUT", { id: 1, currentPrice: 150 }));
    expect(res.status).toBe(404);
  });

  it("omits the version predicate when the caller sends no token", async () => {
    db.stagePosition.updateMany.mockResolvedValue({ count: 1 });
    db.stagePosition.findFirst.mockResolvedValue({ id: 1 });
    await positionPUT(send("PUT", { id: 1, currentPrice: 150 }));
    expect(db.stagePosition.updateMany.mock.calls[0][0].where).toEqual({ id: 1, userId: "u1" });
  });

  it("stamps a close time even when the client omits one", async () => {
    db.stagePosition.updateMany.mockResolvedValue({ count: 1 });
    db.stagePosition.findFirst.mockResolvedValue({ id: 1 });
    await positionPUT(send("PUT", { id: 1, status: "CLOSED", closedPrice: 80 }));
    expect(db.stagePosition.updateMany.mock.calls[0][0].data.closedAt).toBeInstanceOf(Date);
  });

  it("clears the close fields when a position is reopened", async () => {
    db.stagePosition.updateMany.mockResolvedValue({ count: 1 });
    db.stagePosition.findFirst.mockResolvedValue({ id: 1 });
    await positionPUT(send("PUT", { id: 1, status: "OPEN" }));
    const data = db.stagePosition.updateMany.mock.calls[0][0].data;
    expect(data.closedAt).toBeNull();
    expect(data.closedPrice).toBeNull();
  });
});

// ─── Plan feature gates ──────────────────────────────────────────────────────

describe("feature gates", () => {
  it("refuses the export to a free plan before querying anything", async () => {
    session.mockResolvedValue(FREE);
    const res = await exportGET(get("?dataset=watchlist"));
    expect(res.status).toBe(402);
    expect((await res.json()).code).toBe("upgrade_required");
    expect(db.stageWatchlistItem.findMany).not.toHaveBeenCalled();
  });

  it("refuses heavy compute to a free plan without spending a quota row", async () => {
    session.mockResolvedValue(FREE);
    const res = await trapsGET(get());
    expect(res.status).toBe(402);
    expect(db.usageDay.upsert).not.toHaveBeenCalled();
  });

  it("charges the quota before running the work", async () => {
    db.stageStock.count.mockResolvedValue(61);
    db.usageDay.upsert.mockResolvedValue({ stageRuns: 5 });
    db.stageStock.findMany.mockResolvedValue([]);
    db.stageThesis.findMany.mockResolvedValue([]);
    await trapsGET(get());
    expect(db.usageDay.upsert).toHaveBeenCalled();
  });

  it("answers 429 once the daily budget is gone", async () => {
    db.stageStock.count.mockResolvedValue(61);
    db.usageDay.upsert.mockResolvedValue({ stageRuns: 10_000 });
    const res = await trapsGET(get());
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("quota_exhausted");
  });
});

// ─── Export ──────────────────────────────────────────────────────────────────

describe("csv export", () => {
  it("returns a downloadable CSV with the right headers", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([ROW]);
    const res = await exportGET(get("?dataset=watchlist"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="stagelab-watchlist-\d{4}-\d{2}-\d{2}\.csv"/);
    // A customer's own book must never land in a shared cache.
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("writes the BOM first so Excel reads the Thai headers", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([]);
    const res = await exportGET(get("?dataset=watchlist"));
    // Asserted on the raw bytes, not on .text(): TextDecoder strips a leading
    // BOM on decode, so the string form cannot tell you whether it was ever
    // sent — and the bytes are what Excel actually opens.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain("หุ้น");
  });

  it("derives R:R with the same helper the table uses", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([ROW]);
    const body = await (await exportGET(get("?dataset=watchlist"))).text();
    // (185 - 148) / (148 - 138) = 3.7
    expect(body).toContain("3.7");
  });

  it("scopes the query to the caller", async () => {
    db.stageJournalEntry.findMany.mockResolvedValue([]);
    await exportGET(get("?dataset=journal"));
    expect(db.stageJournalEntry.findMany.mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("rejects an unknown dataset rather than guessing", async () => {
    const res = await exportGET(get("?dataset=everything"));
    expect(res.status).toBe(400);
    expect(db.stageWatchlistItem.findMany).not.toHaveBeenCalled();
  });

  it("bounds every dataset it serves", async () => {
    for (const [dataset, model] of [
      ["watchlist", db.stageWatchlistItem],
      ["positions", db.stagePosition],
      ["journal", db.stageJournalEntry],
      ["thesis", db.stageThesis],
    ] as const) {
      model.findMany.mockResolvedValue([]);
      await exportGET(get(`?dataset=${dataset}`));
      expect(model.findMany.mock.calls[0][0].take, dataset).toBeGreaterThan(0);
    }
  });
});

// ─── Unexpected failures ─────────────────────────────────────────────────────

describe("unexpected failures", () => {
  it("turns a database error into a 500 that carries no internals", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.stageWatchlistItem.findMany.mockRejectedValue(
      new Error('relation "stage_watchlist_item" does not exist on host db-prod-7'),
    );
    const res = await watchlistGET(get());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("db-prod-7");
    expect(body.requestId).toBeTruthy();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

// ─── Audit chain ─────────────────────────────────────────────────────────────

describe("audit chain", () => {
  const block = (night: number, at: Date) => ({
    night,
    userId: "u1",
    timestamp: at,
    prevHash: "GENESIS",
    hash: "abc",
    summary: JSON.stringify({
      stocksAnalyzed: 61,
      signals: 3,
      nocash: 0,
      trap: 2,
      marketScore: 8,
      universeSize: 61,
      breadthPct: 66,
    }),
  });

  beforeEach(() => {
    db.stageStock.count.mockResolvedValue(61);
    db.stageStock.findMany.mockResolvedValue([]);
    db.stageThesis.findMany.mockResolvedValue([]);
    db.stageMarketReview.findMany.mockResolvedValue([]);
    db.usageDay.upsert.mockResolvedValue({ stageRuns: 1 });
  });

  it("reads without appending — looking at evidence must not create any", async () => {
    db.stageNightlySnapshot.findMany.mockResolvedValue([]);
    const res = await chainGET(get());
    expect(res.status).toBe(200);
    expect(db.stageNightlySnapshot.create).not.toHaveBeenCalled();
  });

  it("bounds how far back it verifies", async () => {
    db.stageNightlySnapshot.findMany.mockResolvedValue([]);
    await chainGET(get());
    // Verification recomputes every block, so the read has to be bounded or the
    // cost of looking grows with how long the account has existed.
    expect(db.stageNightlySnapshot.findMany.mock.calls[0][0].take).toBeGreaterThan(0);
  });

  it("writes one block on the first append of the day", async () => {
    db.stageNightlySnapshot.findFirst.mockResolvedValue(null);
    db.stageNightlySnapshot.create.mockResolvedValue({});
    db.stageNightlySnapshot.findMany.mockResolvedValue([]);
    await chainPOST(send("POST", {}));
    expect(db.stageNightlySnapshot.create).toHaveBeenCalledTimes(1);
    expect(db.stageNightlySnapshot.create.mock.calls[0][0].data.night).toBe(1);
  });

  it("refuses a second block the same day, returning the one already written", async () => {
    // A chain that accepts five hundred "nights" in an afternoon is not a
    // nightly record, and its growth — and therefore the cost of verifying
    // it — would be set by how often someone clicks.
    const today = block(7, new Date());
    db.stageNightlySnapshot.findFirst.mockResolvedValue(today);
    db.stageNightlySnapshot.findMany.mockResolvedValue([today]);
    const res = await chainPOST(send("POST", {}));
    expect(res.status).toBe(200);
    expect(db.stageNightlySnapshot.create).not.toHaveBeenCalled();
    expect((await res.json()).entry.night).toBe(7);
  });

  it("appends again once the day rolls over", async () => {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);
    db.stageNightlySnapshot.findFirst.mockResolvedValue(block(7, yesterday));
    db.stageNightlySnapshot.create.mockResolvedValue({});
    db.stageNightlySnapshot.findMany.mockResolvedValue([]);
    await chainPOST(send("POST", {}));
    expect(db.stageNightlySnapshot.create.mock.calls[0][0].data.night).toBe(8);
  });

  it("stores the exact timestamp it hashed", async () => {
    db.stageNightlySnapshot.findFirst.mockResolvedValue(null);
    db.stageNightlySnapshot.create.mockResolvedValue({});
    db.stageNightlySnapshot.findMany.mockResolvedValue([]);
    const res = await chainPOST(send("POST", {}));
    const written = db.stageNightlySnapshot.create.mock.calls[0][0].data;
    // Prisma's default(now()) would drift a few milliseconds from the value
    // that went into the hash, and every block would then read as tampered.
    expect(written.timestamp.toISOString()).toBe((await res.json()).entry.timestamp);
  });
});

// ─── Cross-origin writes and request rate ────────────────────────────────────

describe("cross-origin writes", () => {
  const post = (headers: Record<string, string>) =>
    new Request("https://app.test/api/stagelab/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2 }),
    });

  it("refuses a write a browser reports as cross-site", async () => {
    const res = await watchlistPOST(post({ "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(db.stageWatchlistItem.create).not.toHaveBeenCalled();
  });

  it("refuses a write whose Origin is a different host", async () => {
    const res = await watchlistPOST(post({ origin: "https://evil.test" }));
    expect(res.status).toBe(403);
  });

  it("allows a same-origin write", async () => {
    db.stageWatchlistItem.count.mockResolvedValue(0);
    db.stageWatchlistItem.create.mockResolvedValue(ROW);
    expect((await watchlistPOST(post({ "sec-fetch-site": "same-origin" }))).status).toBe(200);
  });

  it("allows a write whose Origin matches the request host", async () => {
    db.stageWatchlistItem.count.mockResolvedValue(0);
    db.stageWatchlistItem.create.mockResolvedValue(ROW);
    expect((await watchlistPOST(post({ origin: "https://app.test" }))).status).toBe(200);
  });

  it("does not block a caller that sends neither header", async () => {
    // CSRF is an attack on a browser's willingness to attach a cookie it
    // holds. Something sending no browser fetch metadata is curl or a server,
    // and was never the threat.
    db.stageWatchlistItem.count.mockResolvedValue(0);
    db.stageWatchlistItem.create.mockResolvedValue(ROW);
    expect((await watchlistPOST(post({}))).status).toBe(200);
  });

  it("never blocks a read, whatever its origin", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([]);
    const res = await watchlistGET(
      new Request("https://app.test/api", { headers: { "sec-fetch-site": "cross-site" } }),
    );
    expect(res.status).toBe(200);
  });
});

describe("request rate", () => {
  it("cuts off a client that floods the write path", async () => {
    db.stageWatchlistItem.count.mockResolvedValue(0);
    db.stageWatchlistItem.create.mockResolvedValue(ROW);
    const body = { symbol: "X", entryPrice: 1, stopLoss: 1, targetPrice: 2 };

    let limited = 0;
    for (let i = 0; i < 80; i++) {
      const res = await watchlistPOST(send("POST", body));
      if (res.status === 429) limited++;
    }
    expect(limited).toBeGreaterThan(0);
  });

  it("tells the client how long to wait", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([]);
    let denied: Response | null = null;
    for (let i = 0; i < 400 && !denied; i++) {
      const res = await watchlistGET(get());
      if (res.status === 429) denied = res;
    }
    expect(denied).not.toBeNull();
    const body = await denied!.json();
    expect(body.code).toBe("quota_exhausted");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  it("limits per user, so one noisy account cannot starve another", async () => {
    db.stageWatchlistItem.findMany.mockResolvedValue([]);
    for (let i = 0; i < 400; i++) await watchlistGET(get());

    session.mockResolvedValue({ ...PRO, id: "u2" });
    expect((await watchlistGET(get())).status).toBe(200);
  });

  it("checks authentication before the limiter, so signed-out traffic cannot probe it", async () => {
    session.mockResolvedValue(null);
    for (let i = 0; i < 400; i++) await watchlistGET(get());
    // A real session is still served: the anonymous flood consumed no budget.
    session.mockResolvedValue(PRO);
    db.stageWatchlistItem.findMany.mockResolvedValue([]);
    expect((await watchlistGET(get())).status).toBe(200);
  });
});
