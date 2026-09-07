import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/server/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    therapyAssessment: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    therapySession: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    therapySleepNight: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { requireUser } from "@/lib/server/session";
import { prisma } from "@/lib/prisma";
import { GET as assessGET, POST as assessPOST } from "./assessments/route";
import { GET as sessionGET, POST as sessionPOST } from "./sessions/route";
import { GET as sleepGET, POST as sleepPOST } from "./sleep/route";
import { GET as exportGET, DELETE as exportDELETE } from "./export/route";

const mUser = requireUser as unknown as ReturnType<typeof vi.fn>;
const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
  $transaction: ReturnType<typeof vi.fn>;
};

const USER = { id: "u1", email: "a@b.c", name: null, plan: "free", role: "user" };

/** A NextRequest stand-in carrying a JSON body and a URL for searchParams. */
const req = (body?: unknown, url = "http://localhost/api/therapy/assessments") =>
  ({ json: async () => body, nextUrl: new URL(url) }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  db.therapyAssessment.count.mockResolvedValue(0);
  db.therapyAssessment.findFirst.mockResolvedValue(null);
  db.therapySession.count.mockResolvedValue(0);
  db.therapySleepNight.count.mockResolvedValue(0);
  db.therapySleepNight.findUnique.mockResolvedValue(null);
});

describe("every therapy route requires a session", () => {
  it("401s across the board when unauthenticated", async () => {
    mUser.mockResolvedValue(null);
    expect((await assessGET(req())).status).toBe(401);
    expect((await assessPOST(req({}))).status).toBe(401);
    expect((await sessionGET()).status).toBe(401);
    expect((await sessionPOST(req({}))).status).toBe(401);
    expect((await sleepGET()).status).toBe(401);
    expect((await sleepPOST(req({}))).status).toBe(401);
    expect((await exportGET()).status).toBe(401);
    expect((await exportDELETE()).status).toBe(401);
  });
});

describe("POST /api/therapy/assessments — the server re-scores", () => {
  const gad7 = { instrument: "gad7", responses: [1, 2, 3, 0, 0, 1, 1] }; // sums to 8

  beforeEach(() => {
    mUser.mockResolvedValue(USER);
    db.therapyAssessment.create.mockResolvedValue({ id: "a1", createdAt: new Date(0) });
  });

  it("computes the total from the responses and stores both", async () => {
    const res = await assessPOST(req(gad7));
    expect(res.status).toBe(200);
    expect((await res.json()).score.total).toBe(8);
    expect(db.therapyAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ instrument: "gad7", responses: gad7.responses, total: 8, band: "mild" }),
      })
    );
  });

  it("ignores a client-supplied total instead of trusting it", async () => {
    // A stored score has to be re-derivable from the answers beside it, so the
    // only number that can reach the column is the one the engine computed.
    const res = await assessPOST(req({ ...gad7, total: 0, band: "minimal" }));
    expect((await res.json()).score.total).toBe(8);
    expect(db.therapyAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 8 }) })
    );
  });

  it("refuses a partial response set rather than summing it", async () => {
    const res = await assessPOST(req({ instrument: "gad7", responses: [1, 1, 1] }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("incomplete");
    expect(db.therapyAssessment.create).not.toHaveBeenCalled();
  });

  it("rejects a nine-item set submitted as a GAD-7", async () => {
    const res = await assessPOST(req({ instrument: "gad7", responses: [1, 1, 1, 1, 1, 1, 1, 1, 1] }));
    expect(res.status).toBe(400);
  });

  it("rejects out-of-scale answers", async () => {
    expect((await assessPOST(req({ instrument: "gad7", responses: [4, 0, 0, 0, 0, 0, 0] }))).status).toBe(400);
  });

  it("rejects an unknown instrument", async () => {
    expect((await assessPOST(req({ instrument: "mbti", responses: [1] }))).status).toBe(400);
  });

  it("400s on a malformed body", async () => {
    const bad = { json: async () => { throw new SyntaxError("nope"); } } as unknown as NextRequest;
    expect((await assessPOST(bad)).status).toBe(400);
  });

  it("persists the safety flag from PHQ-9 item 9, not from the total", async () => {
    await assessPOST(req({ instrument: "phq9", responses: [0, 0, 0, 0, 0, 0, 0, 0, 1] }));
    expect(db.therapyAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ total: 1, band: "minimal", safetyFlag: true }) })
    );
  });

  it("returns a crisis plan when item 9 is endorsed, whatever the total", async () => {
    const res = await assessPOST(req({ instrument: "phq9", responses: [0, 0, 0, 0, 0, 0, 0, 0, 1] }));
    const body = await res.json();
    expect(body.plan.safety.level).toBe("crisis");
    expect(body.plan.tier).toBe("clinician-led");
    expect(body.plan.safety.resources.length).toBeGreaterThan(0);
  });

  it("raises today's tier using a recent score on the other instrument", async () => {
    // Safety is a property of the person, not of one questionnaire: a severe
    // PHQ-9 from yesterday must still shape a calm GAD-7 submitted today.
    db.therapyAssessment.findFirst.mockResolvedValue({ responses: [3, 3, 3, 3, 3, 3, 2, 0, 0] });
    const res = await assessPOST(req({ instrument: "gad7", responses: [0, 0, 0, 0, 0, 0, 0] }));
    const body = await res.json();
    expect(body.score.total).toBe(0);
    expect(body.plan.tier).toBe("clinician-led");
  });

  it("ignores a stored response set that is no longer valid", async () => {
    db.therapyAssessment.findFirst.mockResolvedValue({ responses: [1, 2] });
    const res = await assessPOST(req(gad7));
    expect(res.status).toBe(200);
  });

  it("403s once the history cap is reached", async () => {
    db.therapyAssessment.count.mockResolvedValue(500);
    const res = await assessPOST(req(gad7));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("limit_reached");
  });
});

describe("GET /api/therapy/assessments", () => {
  beforeEach(() => mUser.mockResolvedValue(USER));

  it("returns only the caller's rows", async () => {
    db.therapyAssessment.findMany.mockResolvedValue([{ id: "a1", total: 8 }]);
    const res = await assessGET(req(undefined, "http://localhost/api/therapy/assessments"));
    expect(res.status).toBe(200);
    expect(db.therapyAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });

  it("filters by instrument when asked", async () => {
    db.therapyAssessment.findMany.mockResolvedValue([]);
    await assessGET(req(undefined, "http://localhost/api/therapy/assessments?instrument=phq9"));
    expect(db.therapyAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", instrument: "phq9" } })
    );
  });

  it("ignores an unknown instrument filter rather than querying for it", async () => {
    db.therapyAssessment.findMany.mockResolvedValue([]);
    await assessGET(req(undefined, "http://localhost/api/therapy/assessments?instrument=../etc"));
    expect(db.therapyAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1" } })
    );
  });
});

describe("POST /api/therapy/sessions — adherence, not intentions", () => {
  beforeEach(() => {
    mUser.mockResolvedValue(USER);
    db.therapySession.create.mockResolvedValue({ id: "s1", createdAt: new Date(0) });
  });

  it("logs a completed music session", async () => {
    const res = await sessionPOST(req({ kind: "music", plannedMin: 20, completedMin: 14, startBpm: 96, targetBpm: 62 }));
    expect(res.status).toBe(200);
    expect(db.therapySession.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1", completedMin: 14 }) })
    );
  });

  it("accepts a zero-minute session — an abandoned session is real adherence data", async () => {
    expect((await sessionPOST(req({ kind: "breath", plannedMin: 5, completedMin: 0 }))).status).toBe(200);
  });

  it("refuses a session that ran longer than it was planned to", async () => {
    const res = await sessionPOST(req({ kind: "music", plannedMin: 10, completedMin: 40 }));
    expect(res.status).toBe(400);
    expect(db.therapySession.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown breath pattern", async () => {
    expect(
      (await sessionPOST(req({ kind: "breath", plannedMin: 5, completedMin: 5, breathPattern: "wim-hof" }))).status
    ).toBe(400);
  });

  it("sums completed minutes on read", async () => {
    db.therapySession.findMany.mockResolvedValue([{ completedMin: 20 }, { completedMin: 14 }]);
    expect((await (await sessionGET()).json()).totalMinutes).toBe(34);
  });
});

describe("POST /api/therapy/sleep", () => {
  beforeEach(() => {
    mUser.mockResolvedValue(USER);
    db.therapySleepNight.upsert.mockResolvedValue({ id: "n1", date: "2026-01-01" });
  });

  const night = {
    date: "2026-01-01",
    timeInBedMin: 480,
    sleepLatencyMin: 20,
    wakeAfterSleepOnsetMin: 20,
    terminalWakefulnessMin: 0,
    awakenings: 1,
  };

  it("stores a valid night", async () => {
    expect((await sleepPOST(req(night))).status).toBe(200);
  });

  it("refuses a night whose awake minutes exceed its time in bed", async () => {
    // Every field is individually in range; the night as a whole is impossible,
    // and storing it would put a negative sleep time on the chart.
    const res = await sleepPOST(req({ ...night, timeInBedMin: 60, sleepLatencyMin: 90 }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("inconsistent");
    expect(db.therapySleepNight.upsert).not.toHaveBeenCalled();
  });

  it("rejects a malformed date", async () => {
    expect((await sleepPOST(req({ ...night, date: "01/01/2026" }))).status).toBe(400);
  });

  it("upserts by date so a correction replaces the night, never duplicates it", async () => {
    await sleepPOST(req(night));
    expect(db.therapySleepNight.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_date: { userId: "u1", date: "2026-01-01" } } })
    );
  });

  it("does not count a correction against the storage cap", async () => {
    db.therapySleepNight.findUnique.mockResolvedValue({ id: "n1" });
    db.therapySleepNight.count.mockResolvedValue(1000);
    expect((await sleepPOST(req(night))).status).toBe(200);
  });

  it("derives the summary on read instead of storing it", async () => {
    db.therapySleepNight.findMany.mockResolvedValue([night]);
    const body = await (await sleepGET()).json();
    expect(body.summary.nights).toBe(1);
    expect(body.summary.meanEfficiencyPct).toBeCloseTo(91.7, 1);
  });
});

describe("data export and erasure", () => {
  beforeEach(() => mUser.mockResolvedValue(USER));

  it("exports raw item responses, not only totals", async () => {
    // A summary-only export would be the app deciding which of your own answers
    // you are allowed to keep.
    db.therapyAssessment.findMany.mockResolvedValue([{ id: "a1", responses: [1, 2, 3, 0, 0, 1, 1], total: 8 }]);
    db.therapySession.findMany.mockResolvedValue([]);
    db.therapySleepNight.findMany.mockResolvedValue([]);
    const body = await (await exportGET()).json();
    expect(body.assessments[0].responses).toEqual([1, 2, 3, 0, 0, 1, 1]);
    expect(body.counts.assessments).toBe(1);
  });

  it("deletes every therapy table in one transaction", async () => {
    db.$transaction.mockResolvedValue([{ count: 3 }, { count: 2 }, { count: 7 }]);
    const body = await (await exportDELETE()).json();
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(body.deleted).toEqual({ assessments: 3, sessions: 2, sleepNights: 7 });
  });

  it("scopes erasure to the caller", async () => {
    db.$transaction.mockResolvedValue([{ count: 0 }, { count: 0 }, { count: 0 }]);
    await exportDELETE();
    for (const table of ["therapyAssessment", "therapySession", "therapySleepNight"]) {
      expect(db[table].deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
    }
  });
});
