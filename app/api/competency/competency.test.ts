import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    competencyNurse: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), count: vi.fn() },
    competencyAssessment: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { requireUser } from "@/lib/server/session";
import { prisma } from "@/lib/prisma";
import { GET as nursesGET, POST as nursesPOST } from "./nurses/route";
import { GET as nurseGET, PATCH as nursePATCH, DELETE as nurseDELETE } from "./nurses/[id]/route";
import { GET as assessmentsGET, POST as assessmentsPOST } from "./assessments/route";
import { GET as assessmentGET, PATCH as assessmentPATCH, DELETE as assessmentDELETE } from "./assessments/[id]/route";
import { GET as dashboardGET } from "./dashboard/route";
import { GET as exportGET } from "./export/route";
import { POST as samplePOST } from "./sample/route";

const mUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as {
  competencyNurse: Record<string, ReturnType<typeof vi.fn>>;
  competencyAssessment: Record<string, ReturnType<typeof vi.fn>>;
};

const USER = { id: "u1", email: "head@hd.unit", name: "หัวหน้า", plan: "free", role: "user" };
const D = new Date("2019-12-20T00:00:00.000Z");
const FULL = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3])); // total 60 → L2

const req = (body?: unknown, url = "http://localhost/api/competency/x") =>
  ({ json: async () => body, nextUrl: new URL(url) }) as unknown as NextRequest;

const assessment = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "a1",
  nurseId: "n1",
  assessDate: D,
  assessor: null,
  note: null,
  scores: FULL,
  totalScore: 60,
  level: 2,
  createdAt: D,
  updatedAt: D,
  ...over,
});

const nurse = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "n1",
  userId: "u1",
  fullName: "คุณจารุวรรณ พันธ์ยาง",
  nickname: "ตั๊ก",
  position: "พยาบาลวิชาชีพ",
  mgmtLevel: null,
  createdAt: D,
  updatedAt: D,
  assessments: [assessment()],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mUser.mockResolvedValue(USER);
});

describe("auth gate", () => {
  it("every route answers 401 without a login", async () => {
    mUser.mockResolvedValue(null);
    const p = { params: { id: "n1" } };
    const statuses = await Promise.all([
      nursesGET(),
      nursesPOST(req({ fullName: "x" })),
      nurseGET(req(), p),
      nursePATCH(req({ fullName: "x" }), p),
      nurseDELETE(req(), p),
      assessmentsGET(req()),
      assessmentsPOST(req({ nurseId: "n1", scores: FULL })),
      assessmentGET(req(), p),
      assessmentPATCH(req({ note: "x" }), p),
      assessmentDELETE(req(), p),
      dashboardGET(),
      exportGET(),
      samplePOST(),
    ]);
    expect(statuses.map((r) => r.status)).toEqual(Array(13).fill(401));
    expect(db.competencyNurse.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/competency/nurses", () => {
  it("returns the caller's roster as DTOs with the latest assessment", async () => {
    db.competencyNurse.findMany.mockResolvedValue([nurse(), nurse({ id: "n2", fullName: "คุณใหม่", assessments: [] })]);
    const res = await nursesGET();
    expect(res.status).toBe(200);
    const { nurses } = await res.json();
    expect(db.competencyNurse.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1" } }));
    expect(nurses).toHaveLength(2);
    expect(nurses[0].latest).toMatchObject({ id: "a1", totalScore: 60, level: 2, assessDate: "2019-12-20T00:00:00.000Z" });
    expect(nurses[0].assessmentCount).toBe(1);
    expect(nurses[1].latest).toBeNull();
  });
});

describe("POST /api/competency/nurses", () => {
  it("400 with a Thai message when the name is blank", async () => {
    const res = await nursesPOST(req({ fullName: "   " }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("กรุณาระบุชื่อ-นามสกุล");
  });

  it("400 when the body is not JSON", async () => {
    const broken = { json: async () => { throw new Error("bad"); } } as unknown as NextRequest;
    expect((await nursesPOST(broken)).status).toBe(400);
  });

  it("403 at the roster cap", async () => {
    db.competencyNurse.count.mockResolvedValue(500);
    expect((await nursesPOST(req({ fullName: "x" }))).status).toBe(403);
  });

  it("creates the nurse under the caller, with trimmed fields and the default position", async () => {
    db.competencyNurse.count.mockResolvedValue(3);
    db.competencyNurse.create.mockResolvedValue(nurse({ id: "n9", fullName: "คุณสมหญิง ใจดี", nickname: null, assessments: [] }));
    const res = await nursesPOST(req({ fullName: " คุณสมหญิง ใจดี ", nickname: "", position: "", mgmtLevel: 6 }));
    expect(res.status).toBe(201);
    expect(db.competencyNurse.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { userId: "u1", fullName: "คุณสมหญิง ใจดี", nickname: null, position: "พยาบาลวิชาชีพ", mgmtLevel: 6 },
      })
    );
    expect((await res.json()).nurse.id).toBe("n9");
  });
});

describe("/api/competency/nurses/[id]", () => {
  const p = { params: { id: "n1" } };

  it("GET 404 when the nurse belongs to another account (no leak of existence)", async () => {
    db.competencyNurse.findUnique.mockResolvedValue(nurse({ userId: "someone-else" }));
    expect((await nurseGET(req(), p)).status).toBe(404);
  });

  it("GET returns the profile with its history, newest first", async () => {
    const older = assessment({ id: "a0", assessDate: new Date("2019-06-01T00:00:00.000Z"), totalScore: 40, level: 1 });
    db.competencyNurse.findUnique.mockResolvedValue(nurse({ assessments: [older, assessment()] }));
    const { nurse: dto } = await (await nurseGET(req(), p)).json();
    expect(dto.assessments.map((a: { id: string }) => a.id)).toEqual(["a1", "a0"]);
    expect(dto.latest.id).toBe("a1");
  });

  it("PATCH 400 on an empty patch, otherwise updates only the given fields", async () => {
    db.competencyNurse.findUnique.mockResolvedValue(nurse());
    expect((await nursePATCH(req({}), p)).status).toBe(400);
    db.competencyNurse.update.mockResolvedValue(nurse({ nickname: null, mgmtLevel: 7 }));
    const res = await nursePATCH(req({ nickname: "", mgmtLevel: 7 }), p);
    expect(res.status).toBe(200);
    expect(db.competencyNurse.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "n1" }, data: { nickname: null, mgmtLevel: 7 } })
    );
  });

  it("DELETE 404 when not the owner; otherwise deletes and reports the cascade size", async () => {
    db.competencyNurse.findUnique.mockResolvedValue(nurse({ userId: "x" }));
    expect((await nurseDELETE(req(), p)).status).toBe(404);
    expect(db.competencyNurse.delete).not.toHaveBeenCalled();

    db.competencyNurse.findUnique.mockResolvedValue(nurse());
    db.competencyNurse.delete.mockResolvedValue({});
    const res = await nurseDELETE(req(), p);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deletedAssessments: 1 });
    expect(db.competencyNurse.delete).toHaveBeenCalledWith({ where: { id: "n1" } });
  });
});

describe("POST /api/competency/assessments", () => {
  it("400 naming the first missing criterion", async () => {
    const { "4": _dropped, ...without4 } = FULL;
    void _dropped;
    const res = await assessmentsPOST(req({ nurseId: "n1", scores: without4 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/เกณฑ์ที่ 4/);
    expect(db.competencyAssessment.create).not.toHaveBeenCalled();
  });

  it("400 when a point is out of range, and when neither nurseId nor nurse is given", async () => {
    expect((await assessmentsPOST(req({ nurseId: "n1", scores: { ...FULL, "2": 6 } }))).status).toBe(400);
    expect((await assessmentsPOST(req({ scores: FULL }))).status).toBe(400);
  });

  it("404 when the nurse is not the caller's", async () => {
    db.competencyNurse.findUnique.mockResolvedValue(nurse({ userId: "other" }));
    expect((await assessmentsPOST(req({ nurseId: "n1", scores: FULL }))).status).toBe(404);
  });

  it("computes totalScore and level on the server and ignores any client-sent values", async () => {
    db.competencyNurse.findUnique.mockResolvedValue(nurse());
    db.competencyAssessment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      assessment({ id: "a2", ...data })
    );
    const scores = { "1": 3, "2": 4, "3": 3, "4": 3, "5": 2, "6": 3, "7": 4, "8": 4, "9": 4, "10": 4 }; // 68 → L3
    const res = await assessmentsPOST(
      req({ nurseId: "n1", scores, totalScore: 100, level: 5, assessDate: "2025-01-05", assessor: " หัวหน้าหน่วย ", note: "" })
    );
    expect(res.status).toBe(201);
    const call = db.competencyAssessment.create.mock.calls[0][0].data;
    expect(call).toMatchObject({ nurseId: "n1", totalScore: 68, level: 3, assessor: "หัวหน้าหน่วย", note: null });
    expect(call.assessDate.toISOString()).toBe("2025-01-05T00:00:00.000Z");
    expect((await res.json()).assessment).toMatchObject({ totalScore: 68, level: 3 });
  });

  it("creates the nurse inline when { nurse } is given", async () => {
    db.competencyNurse.count.mockResolvedValue(0);
    db.competencyNurse.create.mockResolvedValue(nurse({ id: "n7", assessments: [] }));
    db.competencyAssessment.create.mockResolvedValue(assessment({ id: "a7", nurseId: "n7" }));
    const res = await assessmentsPOST(req({ nurse: { fullName: "คุณใหม่ ล่าสุด" }, scores: FULL }));
    expect(res.status).toBe(201);
    expect(db.competencyNurse.create).toHaveBeenCalledWith({
      data: { userId: "u1", fullName: "คุณใหม่ ล่าสุด", nickname: null, position: "พยาบาลวิชาชีพ", mgmtLevel: null },
    });
    expect(db.competencyAssessment.create.mock.calls[0][0].data.nurseId).toBe("n7");
  });
});

describe("GET /api/competency/assessments", () => {
  it("?nurseId= is ownership-checked and returns that nurse's history", async () => {
    db.competencyNurse.findUnique.mockResolvedValue(nurse({ userId: "other" }));
    expect((await assessmentsGET(req(undefined, "http://localhost/api/competency/assessments?nurseId=n1"))).status).toBe(404);

    db.competencyNurse.findUnique.mockResolvedValue(nurse());
    const res = await assessmentsGET(req(undefined, "http://localhost/api/competency/assessments?nurseId=n1"));
    expect((await res.json()).assessments).toHaveLength(1);
    expect(db.competencyAssessment.findMany).not.toHaveBeenCalled();
  });

  it("without a filter lists the caller's assessments through the nurse relation", async () => {
    db.competencyAssessment.findMany.mockResolvedValue([assessment()]);
    const res = await assessmentsGET(req());
    expect(res.status).toBe(200);
    expect(db.competencyAssessment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { nurse: { userId: "u1" } } }));
    expect((await res.json()).assessments[0].scores).toEqual(FULL);
  });
});

describe("/api/competency/assessments/[id]", () => {
  const p = { params: { id: "a1" } };
  const owned = () => ({ ...assessment(), nurse: { id: "n1", userId: "u1", fullName: "คุณจารุวรรณ พันธ์ยาง", nickname: "ตั๊ก", position: "พยาบาลวิชาชีพ", mgmtLevel: null } });

  it("GET 404 for another account's assessment; 200 with the nurse summary otherwise", async () => {
    db.competencyAssessment.findUnique.mockResolvedValue({ ...owned(), nurse: { ...owned().nurse, userId: "x" } });
    expect((await assessmentGET(req(), p)).status).toBe(404);

    db.competencyAssessment.findUnique.mockResolvedValue(owned());
    const body = await (await assessmentGET(req(), p)).json();
    expect(body.assessment.id).toBe("a1");
    expect(body.nurse).toEqual({ id: "n1", fullName: "คุณจารุวรรณ พันธ์ยาง", nickname: "ตั๊ก", position: "พยาบาลวิชาชีพ", mgmtLevel: null });
  });

  it("PATCH with new scores re-derives total and level; a note-only patch leaves them alone", async () => {
    db.competencyAssessment.findUnique.mockResolvedValue(owned());
    db.competencyAssessment.update.mockResolvedValue(assessment());

    const perfect = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 5]));
    await assessmentPATCH(req({ scores: perfect }), p);
    expect(db.competencyAssessment.update.mock.calls[0][0].data).toEqual({ scores: perfect, totalScore: 100, level: 5 });

    await assessmentPATCH(req({ note: "ติดตามอีก 3 เดือน" }), p);
    expect(db.competencyAssessment.update.mock.calls[1][0].data).toEqual({ note: "ติดตามอีก 3 เดือน" });
  });

  it("PATCH 400 on an incomplete scores map", async () => {
    db.competencyAssessment.findUnique.mockResolvedValue(owned());
    expect((await assessmentPATCH(req({ scores: { "1": 5 } }), p)).status).toBe(400);
    expect(db.competencyAssessment.update).not.toHaveBeenCalled();
  });

  it("DELETE removes an owned assessment", async () => {
    db.competencyAssessment.findUnique.mockResolvedValue(owned());
    db.competencyAssessment.delete.mockResolvedValue({});
    expect((await assessmentDELETE(req(), p)).status).toBe(200);
    expect(db.competencyAssessment.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
  });
});

describe("GET /api/competency/dashboard", () => {
  it("returns the computed unit statistics", async () => {
    db.competencyNurse.findMany.mockResolvedValue([nurse(), nurse({ id: "n2", assessments: [] })]);
    const body = await (await dashboardGET()).json();
    expect(body.summary).toMatchObject({ totalNurses: 2, assessedCount: 1, notAssessed: 1, averageScore: 60 });
    expect(body.levelDistribution.find((l: { level: number }) => l.level === 2).count).toBe(1);
    expect(body.ranking[0].nurseId).toBe("n1");
  });
});

describe("GET /api/competency/export", () => {
  it("streams a UTF-8 CSV attachment with a BOM and the OUTCOME header", async () => {
    db.competencyNurse.findMany.mockResolvedValue([nurse()]);
    const res = await exportGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toMatch(/attachment; filename="hd-competency-outcome-\d{4}-\d{2}-\d{2}\.csv"/);
    // Response.text() strips a BOM per the Fetch spec, so check the raw bytes for it.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("ลำดับ,ชื่อ-นามสกุล,ชื่อเล่น");
    expect(text).toContain("1,คุณจารุวรรณ พันธ์ยาง,ตั๊ก,พยาบาลวิชาชีพ,2019-12-20,60,,60,");
  });
});

describe("POST /api/competency/sample", () => {
  it("409 once the roster has anyone in it", async () => {
    db.competencyNurse.count.mockResolvedValue(1);
    expect((await samplePOST()).status).toBe(409);
    expect(db.competencyNurse.create).not.toHaveBeenCalled();
  });

  it("imports the seven workbook nurses, each with its 20 ธ.ค. 2562 assessment, into an empty roster", async () => {
    db.competencyNurse.count.mockResolvedValue(0);
    db.competencyNurse.create.mockResolvedValue({});
    const res = await samplePOST();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ imported: 7 });
    expect(db.competencyNurse.create).toHaveBeenCalledTimes(7);
    const first = db.competencyNurse.create.mock.calls[0][0].data;
    expect(first.userId).toBe("u1");
    expect(first.fullName).toBe("คุณจารุวรรณ พันธ์ยาง");
    expect(first.assessments.create).toMatchObject({ totalScore: 68, level: 3 });
    expect(first.assessments.create.assessDate.toISOString()).toBe("2019-12-20T00:00:00.000Z");
    const last = db.competencyNurse.create.mock.calls[6][0].data;
    expect(last.assessments.create).toMatchObject({ totalScore: 98, level: 5 });
  });
});
