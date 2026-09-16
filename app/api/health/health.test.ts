import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { db } = vi.hoisted(() => ({ db: { $queryRaw: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { GET } from "./route";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  it("reports 200 when the database answers", async () => {
    db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.state).toBe("ok");
    expect(typeof body.checks.database.ms).toBe("number");
  });

  it("reports 503 when the database does not", async () => {
    // A health check that only proves the process is up keeps a broken
    // instance in the rotation and makes the graph green while users get 500s.
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.$queryRaw.mockRejectedValue(new Error("connection refused at db-prod-7"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).status).toBe("degraded");
  });

  it("never returns the cause to an unauthenticated caller", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db.$queryRaw.mockRejectedValue(new Error("password authentication failed for user ci"));
    const body = JSON.stringify(await (await GET()).json());
    expect(body).not.toContain("password");
    expect(body).not.toContain("user ci");
    // …but the operator can still see it.
    expect(JSON.stringify(logged.mock.calls)).toContain("password authentication failed");
  });

  it("is never cached — a cached health check is a lie with a TTL", async () => {
    db.$queryRaw.mockResolvedValue([]);
    expect((await GET()).headers.get("cache-control")).toContain("no-store");
  });

  it("does not hang when the database hangs", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // A check that waits forever turns one slow dependency into an outage,
    // because the orchestrator never gets told to route elsewhere.
    db.$queryRaw.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const res = await GET();
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(5_000);
  }, 10_000);
});
