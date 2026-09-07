import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/server/session", () => {
  const requireUser = vi.fn();
  return { requireUser, getAuth: vi.fn(async () => ({ user: await requireUser(), unavailable: null })) };
});
vi.mock("@/lib/prisma", () => ({
  prisma: { bookisdomWritingBook: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } },
}));

import { requireUser, getAuth } from "@/lib/server/session";
import { prisma } from "@/lib/prisma";
import { GET as listGET } from "./route";
import { GET as oneGET, PUT, DELETE } from "./[bookId]/route";
import { BUNDLE_FORMAT } from "@/app/bookisdom/_bundle";
import { MAX_BUNDLE_BYTES } from "./_shared";

const mUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as { bookisdomWritingBook: Record<string, ReturnType<typeof vi.fn>> };
const USER = { id: "u1", email: "a@b.c", name: null, plan: "free", role: "user" };
const bundle = (bookId = "b1") => ({
  format: BUNDLE_FORMAT, exportedAt: "2026-09-05T00:00:00Z",
  books: [{ id: bookId, title: "เงาเมืองใต้", subtitle: "", author: "", genre: "", lang: "th", status: "DRAFT", targetWords: 0, createdAt: 1, updatedAt: 2 }],
  chapters: [{ id: "c1", bookId, title: "บทที่ 1", content: "ฝนตก", order: 1, createdAt: 1, updatedAt: 2 }],
  notes: [], snapshots: [], plotLines: [], plotCards: [], writingDays: [],
});
const req = (text: string) => ({ text: async () => text }) as unknown as NextRequest;
const ctx = (bookId: string) => ({ params: { bookId } });

beforeEach(() => vi.clearAllMocks());

describe("GET /api/bookisdom/writing", () => {
  it("401 without a session; lists metadata only", async () => {
    mUser.mockResolvedValue(null);
    expect((await listGET()).status).toBe(401);
    mUser.mockResolvedValue(USER);
    db.bookisdomWritingBook.findMany.mockResolvedValue([{ bookId: "b1", title: "T", bytes: 12, updatedAt: new Date(0) }]);
    const res = await listGET();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.books).toHaveLength(1); expect(j.books[0].bundle).toBeUndefined();
  });
  it("503 when the server is not configured — the honest status", async () => {
    (getAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ user: null, unavailable: new Response(null, { status: 503 }) });
    expect((await listGET()).status).toBe(503);
  });
});

describe("PUT /api/bookisdom/writing/[bookId] — one validator, then upsert", () => {
  beforeEach(() => { mUser.mockResolvedValue(USER); db.bookisdomWritingBook.findUnique.mockResolvedValue(null); db.bookisdomWritingBook.count.mockResolvedValue(0); db.bookisdomWritingBook.upsert.mockResolvedValue({ updatedAt: new Date(0), bytes: 10 }); });

  it("rejects non-JSON, a wrong format, a mismatched id, and more than one book — nothing is stored", async () => {
    expect((await PUT(req("nope"), ctx("b1"))).status).toBe(400);
    expect((await PUT(req(JSON.stringify({ bundle: { format: "x/1" } })), ctx("b1"))).status).toBe(400);
    expect((await PUT(req(JSON.stringify({ bundle: bundle("other") })), ctx("b1"))).status).toBe(400);
    const two = bundle(); two.books.push({ ...two.books[0], id: "b2" });
    expect((await PUT(req(JSON.stringify({ bundle: two })), ctx("b1"))).status).toBe(400);
    expect(db.bookisdomWritingBook.upsert).not.toHaveBeenCalled();
  });

  it("413 over the size cap, before parsing", async () => {
    const big = "x".repeat(MAX_BUNDLE_BYTES + 1);
    expect((await PUT(req(big), ctx("b1"))).status).toBe(413);
  });

  it("403 upgrade_required when a FREE user adds a 4th NEW book, but an existing book always updates", async () => {
    db.bookisdomWritingBook.count.mockResolvedValue(3);
    const res = await PUT(req(JSON.stringify({ bundle: bundle() })), ctx("b1"));
    expect(res.status).toBe(403); expect((await res.json()).code).toBe("upgrade_required");
    db.bookisdomWritingBook.findUnique.mockResolvedValue({ id: "row" }); // exists → no cap check
    expect((await PUT(req(JSON.stringify({ bundle: bundle() })), ctx("b1"))).status).toBe(200);
  });

  it("stores title and byte size alongside the bundle, keyed by (user, client book id)", async () => {
    const res = await PUT(req(JSON.stringify({ bundle: bundle() })), ctx("b1"));
    expect(res.status).toBe(200);
    const call = db.bookisdomWritingBook.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId_bookId: { userId: "u1", bookId: "b1" } });
    expect(call.create.title).toBe("เงาเมืองใต้"); expect(call.create.bytes).toBeGreaterThan(100);
  });
});

describe("GET/DELETE /api/bookisdom/writing/[bookId]", () => {
  it("returns the caller's bundle, 404 for someone else's or a missing one; delete is scoped to the caller", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomWritingBook.findUnique.mockResolvedValue(null);
    expect((await oneGET(req(""), ctx("b1"))).status).toBe(404);
    db.bookisdomWritingBook.findUnique.mockResolvedValue({ bundle: bundle(), updatedAt: new Date(0), bytes: 5 });
    const res = await oneGET(req(""), ctx("b1"));
    expect(res.status).toBe(200); expect((await res.json()).bundle.books[0].id).toBe("b1");
    expect(db.bookisdomWritingBook.findUnique.mock.calls[1][0].where).toEqual({ userId_bookId: { userId: "u1", bookId: "b1" } });
    db.bookisdomWritingBook.deleteMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req(""), ctx("b1"))).status).toBe(404);
    db.bookisdomWritingBook.deleteMany.mockResolvedValue({ count: 1 });
    expect((await DELETE(req(""), ctx("b1"))).status).toBe(200);
    expect(db.bookisdomWritingBook.deleteMany.mock.calls[0][0].where).toEqual({ userId: "u1", bookId: "b1" });
  });
});
