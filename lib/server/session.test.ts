import { describe, it, expect, vi, beforeEach } from "vitest";

// Throw REAL error shapes from the mocked infra so getAuth's classification is
// tested against what next-auth / prisma actually produce, not a strawman.
const sessionFn = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: (...a: unknown[]) => sessionFn(...a) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));

import { getAuth, requireUser } from "./session";

beforeEach(() => { sessionFn.mockReset(); findUnique.mockReset(); });

describe("getAuth — two truths kept apart", () => {
  it("healthy server, anonymous visitor → user null, NOT unavailable (401 path)", async () => {
    sessionFn.mockResolvedValue(null);
    const r = await getAuth();
    expect(r.unavailable).toBeNull();
    expect(r.user).toBeNull();
  });

  it("healthy server, real session → the user (200 path)", async () => {
    sessionFn.mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockResolvedValue({ id: "u1", email: "a@b.c", name: null, plan: "free", role: "user" });
    const r = await getAuth();
    expect(r.unavailable).toBeNull();
    expect(r.user?.id).toBe("u1");
  });

  it("NO_SECRET → 503 naming NEXTAUTH_SECRET, and no lying 401", async () => {
    // next-auth's MissingSecretError message, verbatim from the reproduced crash.
    sessionFn.mockRejectedValue(Object.assign(
      new Error("Please define a `secret` in production."), { name: "MissingSecretError" }));
    const r = await getAuth();
    expect(r.user).toBeNull();
    expect(r.unavailable).not.toBeNull();
    expect(r.unavailable!.status).toBe(503);
    const body = await r.unavailable!.json();
    expect(body.error).toBe("server_not_configured");
    expect(body.detail).toContain("NEXTAUTH_SECRET");
    expect(body.detail).not.toMatch(/postgres|:\/\//); // a variable NAME, never a value/URL
  });

  it("next-auth's WRAPPED config error (the one callers actually see) → auth hint, not DB hint", async () => {
    // getServerSession does not rethrow MissingSecretError to callers — it throws
    // this generic wrapper and logs the detail. Verified against the live server.
    sessionFn.mockRejectedValue(new Error(
      "There is a problem with the server configuration. Check the server logs for more information."));
    const r = await getAuth();
    expect(r.unavailable!.status).toBe(503);
    const body = await r.unavailable!.json();
    expect(body.detail).toContain("NEXTAUTH_SECRET");
    expect(body.detail).not.toContain("DATABASE_URL");
  });

  it("database unreachable mid-lookup → 503 pointing at DATABASE_URL", async () => {
    sessionFn.mockResolvedValue({ user: { id: "u1" } });
    findUnique.mockRejectedValue(Object.assign(
      new Error("Can't reach database server at `localhost:5432`"),
      { name: "PrismaClientInitializationError" }));
    const r = await getAuth();
    expect(r.unavailable!.status).toBe(503);
    expect((await r.unavailable!.json()).detail).toContain("DATABASE_URL");
  });

  it("requireUser keeps its original throwing contract (lifemap/admin routes unchanged)", async () => {
    sessionFn.mockRejectedValue(new Error("boom"));
    await expect(requireUser()).rejects.toThrow("boom");
  });
});
