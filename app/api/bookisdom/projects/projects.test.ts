import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/server/session", () => {
  const requireUser = vi.fn();
  return {
    requireUser,
    // getAuth mirrors production: user comes from requireUser, infra is healthy.
    // Existing tests keep driving auth through mUser; the 503 branch is tested
    // by overriding getAuth directly (see "server not configured" below).
    getAuth: vi.fn(async () => ({ user: await requireUser(), unavailable: null })),
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookisdomProject: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    bookisdomProjectVersion: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { requireUser, getAuth } from "@/lib/server/session";
import { prisma } from "@/lib/prisma";
import { GET as listGET, POST as listPOST } from "./route";
import { GET as idGET, PATCH as idPATCH, DELETE as idDELETE } from "./[id]/route";

const mUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  bookisdomProject: Record<string, ReturnType<typeof vi.fn>>;
  bookisdomProjectVersion: Record<string, ReturnType<typeof vi.fn>>;
};

const USER = { id: "u1", email: "a@b.c", name: null, plan: "free", role: "user" };
const cfg = { type: "novel", title: "T", subGenre: "thriller", chapters: 3, wordsPerChapter: 1000 };
const req = (body?: unknown) => ({ json: async () => body }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/bookisdom/projects", () => {
  it("401 when unauthenticated", async () => {
    mUser.mockResolvedValue(null);
    expect((await listGET()).status).toBe(401);
  });
  it("returns the user's projects", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.findMany.mockResolvedValue([{ id: "p1", title: "T" }]);
    const res = await listGET();
    expect(res.status).toBe(200);
    expect((await res.json()).projects).toHaveLength(1);
  });
});

describe("POST /api/bookisdom/projects", () => {
  it("401 when unauthenticated", async () => {
    mUser.mockResolvedValue(null);
    expect((await listPOST(req({ config: cfg }))).status).toBe(401);
  });
  it("400 on invalid config", async () => {
    mUser.mockResolvedValue(USER);
    expect((await listPOST(req({ config: { type: "bogus" } }))).status).toBe(400);
  });
  it("403 when the project limit is reached", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.count.mockResolvedValue(50);
    expect((await listPOST(req({ config: cfg }))).status).toBe(403);
  });
  it("Free plan caps at 3 cloud projects with an upgrade prompt", async () => {
    mUser.mockResolvedValue({ ...USER, plan: "free" });
    db.bookisdomProject.count.mockResolvedValue(3);
    const res = await listPOST(req({ config: cfg }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("upgrade_required");
  });
  it("Pro plan can save past the free cap", async () => {
    mUser.mockResolvedValue({ ...USER, plan: "pro" });
    db.bookisdomProject.count.mockResolvedValue(3);
    db.bookisdomProject.create.mockResolvedValue({ id: "pX" });
    expect((await listPOST(req({ config: cfg }))).status).toBe(200);
  });
  it("Pro plan still hits the hard cap at 50", async () => {
    mUser.mockResolvedValue({ ...USER, plan: "pro" });
    db.bookisdomProject.count.mockResolvedValue(50);
    const res = await listPOST(req({ config: cfg }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("limit_reached");
  });
  it("creates a project (with an initial version) and returns its id", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.count.mockResolvedValue(2);
    db.bookisdomProject.create.mockResolvedValue({ id: "p9" });
    const res = await listPOST(req({ config: cfg }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("p9");
    expect(db.bookisdomProject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versions: { create: { config: expect.anything() } } }) })
    );
  });
});

describe("/api/bookisdom/projects/[id]", () => {
  const params = { params: { id: "p1" } };

  it("GET 404 when the project belongs to another user", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.findUnique.mockResolvedValue({ id: "p1", userId: "someone-else" });
    expect((await idGET(req(), params)).status).toBe(404);
  });

  it("PATCH visibility=public mints a share token", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.findUnique
      .mockResolvedValueOnce({ id: "p1", userId: "u1" }) // ownership
      .mockResolvedValueOnce({ shareToken: null }); // current token
    db.bookisdomProject.update.mockResolvedValue({});
    const res = await idPATCH(req({ visibility: "public" }), params);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(typeof data.shareToken).toBe("string");
    expect(data.shareToken.length).toBeGreaterThan(10);
  });

  it("DELETE 404 when not the owner", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.findUnique.mockResolvedValue({ id: "p1", userId: "x" });
    expect((await idDELETE(req(), params)).status).toBe(404);
  });

  it("DELETE removes an owned project", async () => {
    mUser.mockResolvedValue(USER);
    db.bookisdomProject.findUnique.mockResolvedValue({ id: "p1", userId: "u1" });
    db.bookisdomProject.delete.mockResolvedValue({});
    expect((await idDELETE(req(), params)).status).toBe(200);
    expect(db.bookisdomProject.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});

describe("server not configured (NO_SECRET / DB down)", () => {
  it("returns 503 with a named-config detail, never a bare 500 or a lying 401", async () => {
    // The failure this pins: getServerSession throws MissingSecretError before
    // prisma is ever reached; the route used to crash to a body-less 500. A
    // misconfigured server must tell its operator WHAT is missing — and must not
    // send users to a login page that cannot work.
    const { NextResponse } = await import("next/server");
    (getAuth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: null,
      unavailable: NextResponse.json(
        { error: "server_not_configured", detail: "NEXTAUTH_SECRET is not set" },
        { status: 503 },
      ),
    });
    const res = await listGET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("server_not_configured");
    expect(body.detail).toContain("NEXTAUTH_SECRET");
    expect(db.bookisdomProject.findMany).not.toHaveBeenCalled(); // fails closed before any DB touch
  });
});
