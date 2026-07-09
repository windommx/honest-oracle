import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    rushProject: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    rushProjectVersion: { findMany: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { requireUser } from "@/lib/server/session";
import { prisma } from "@/lib/prisma";
import { GET as listGET, POST as listPOST } from "./route";
import { GET as idGET, PATCH as idPATCH, DELETE as idDELETE } from "./[id]/route";

const mUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  rushProject: Record<string, ReturnType<typeof vi.fn>>;
  rushProjectVersion: Record<string, ReturnType<typeof vi.fn>>;
};

const USER = { id: "u1", email: "a@b.c", name: null, plan: "free", role: "user" };
const cfg = { type: "novel", title: "T", subGenre: "thriller", chapters: 3, wordsPerChapter: 1000 };
const req = (body?: unknown) => ({ json: async () => body }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/rush/projects", () => {
  it("401 when unauthenticated", async () => {
    mUser.mockResolvedValue(null);
    expect((await listGET()).status).toBe(401);
  });
  it("returns the user's projects", async () => {
    mUser.mockResolvedValue(USER);
    db.rushProject.findMany.mockResolvedValue([{ id: "p1", title: "T" }]);
    const res = await listGET();
    expect(res.status).toBe(200);
    expect((await res.json()).projects).toHaveLength(1);
  });
});

describe("POST /api/rush/projects", () => {
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
    db.rushProject.count.mockResolvedValue(50);
    expect((await listPOST(req({ config: cfg }))).status).toBe(403);
  });
  it("Free plan caps at 3 cloud projects with an upgrade prompt", async () => {
    mUser.mockResolvedValue({ ...USER, plan: "free" });
    db.rushProject.count.mockResolvedValue(3);
    const res = await listPOST(req({ config: cfg }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("upgrade_required");
  });
  it("Pro plan can save past the free cap", async () => {
    mUser.mockResolvedValue({ ...USER, plan: "pro" });
    db.rushProject.count.mockResolvedValue(3);
    db.rushProject.create.mockResolvedValue({ id: "pX" });
    expect((await listPOST(req({ config: cfg }))).status).toBe(200);
  });
  it("Pro plan still hits the hard cap at 50", async () => {
    mUser.mockResolvedValue({ ...USER, plan: "pro" });
    db.rushProject.count.mockResolvedValue(50);
    const res = await listPOST(req({ config: cfg }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("limit_reached");
  });
  it("creates a project (with an initial version) and returns its id", async () => {
    mUser.mockResolvedValue(USER);
    db.rushProject.count.mockResolvedValue(2);
    db.rushProject.create.mockResolvedValue({ id: "p9" });
    const res = await listPOST(req({ config: cfg }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe("p9");
    expect(db.rushProject.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ versions: { create: { config: expect.anything() } } }) })
    );
  });
});

describe("/api/rush/projects/[id]", () => {
  const params = { params: { id: "p1" } };

  it("GET 404 when the project belongs to another user", async () => {
    mUser.mockResolvedValue(USER);
    db.rushProject.findUnique.mockResolvedValue({ id: "p1", userId: "someone-else" });
    expect((await idGET(req(), params)).status).toBe(404);
  });

  it("PATCH visibility=public mints a share token", async () => {
    mUser.mockResolvedValue(USER);
    db.rushProject.findUnique
      .mockResolvedValueOnce({ id: "p1", userId: "u1" }) // ownership
      .mockResolvedValueOnce({ shareToken: null }); // current token
    db.rushProject.update.mockResolvedValue({});
    const res = await idPATCH(req({ visibility: "public" }), params);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(typeof data.shareToken).toBe("string");
    expect(data.shareToken.length).toBeGreaterThan(10);
  });

  it("DELETE 404 when not the owner", async () => {
    mUser.mockResolvedValue(USER);
    db.rushProject.findUnique.mockResolvedValue({ id: "p1", userId: "x" });
    expect((await idDELETE(req(), params)).status).toBe(404);
  });

  it("DELETE removes an owned project", async () => {
    mUser.mockResolvedValue(USER);
    db.rushProject.findUnique.mockResolvedValue({ id: "p1", userId: "u1" });
    db.rushProject.delete.mockResolvedValue({});
    expect((await idDELETE(req(), params)).status).toBe(200);
    expect(db.rushProject.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });
});
