import { describe, it, expect } from "vitest";
import {
  assessmentCreateSchema,
  assessmentUpdateSchema,
  firstIssue,
  nurseCreateSchema,
  nurseUpdateSchema,
  scoresSchema,
} from "./validation";

const full = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), 3]));

describe("nurseCreateSchema", () => {
  it("trims, defaults the position and nulls empty optionals", () => {
    const r = nurseCreateSchema.parse({ fullName: "  คุณสมหญิง ใจดี ", nickname: "  ", position: "" });
    expect(r).toEqual({ fullName: "คุณสมหญิง ใจดี", nickname: null, position: "พยาบาลวิชาชีพ", mgmtLevel: null });
  });

  it("requires a name and only accepts management tiers 6/7", () => {
    expect(nurseCreateSchema.safeParse({ fullName: " " }).success).toBe(false);
    expect(nurseCreateSchema.safeParse({ fullName: "x", mgmtLevel: 5 }).success).toBe(false);
    expect(nurseCreateSchema.parse({ fullName: "x", mgmtLevel: 7 }).mgmtLevel).toBe(7);
  });
});

describe("nurseUpdateSchema", () => {
  it("rejects an empty patch and keeps only provided fields", () => {
    expect(nurseUpdateSchema.safeParse({}).success).toBe(false);
    expect(nurseUpdateSchema.parse({ nickname: "" })).toEqual({ nickname: null });
    expect(nurseUpdateSchema.parse({ mgmtLevel: null })).toEqual({ mgmtLevel: null });
  });
});

describe("scoresSchema", () => {
  it("accepts exactly the ten criteria at 1-5", () => {
    expect(scoresSchema.parse(full)).toEqual(full);
  });

  it("names the first missing criterion", () => {
    const { "3": _dropped, ...without3 } = full;
    void _dropped;
    const r = scoresSchema.safeParse(without3);
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toMatch(/เกณฑ์ที่ 3/);
  });

  it("rejects out-of-range, non-integer and unknown keys", () => {
    expect(scoresSchema.safeParse({ ...full, "3": 6 }).success).toBe(false);
    expect(scoresSchema.safeParse({ ...full, "3": 2.5 }).success).toBe(false);
    const r = scoresSchema.safeParse({ ...full, "11": 3 });
    expect(r.success).toBe(false);
    if (!r.success) expect(firstIssue(r.error)).toMatch(/ไม่รู้จักเกณฑ์ "11"/);
  });
});

describe("assessmentCreateSchema", () => {
  it("takes an existing nurse id OR a new nurse, never both or neither", () => {
    expect(assessmentCreateSchema.safeParse({ nurseId: "n1", scores: full }).success).toBe(true);
    expect(assessmentCreateSchema.safeParse({ nurse: { fullName: "ใหม่" }, scores: full }).success).toBe(true);
    expect(assessmentCreateSchema.safeParse({ scores: full }).success).toBe(false);
    expect(assessmentCreateSchema.safeParse({ nurseId: "n1", nurse: { fullName: "x" }, scores: full }).success).toBe(false);
  });

  it("parses the date to UTC midnight and rejects an impossible day", () => {
    const r = assessmentCreateSchema.parse({ nurseId: "n1", scores: full, assessDate: "2025-01-05", assessor: "", note: " x " });
    expect(r.assessDate?.toISOString()).toBe("2025-01-05T00:00:00.000Z");
    expect(r.assessor).toBeNull();
    expect(r.note).toBe("x");
    const bad = assessmentCreateSchema.safeParse({ nurseId: "n1", scores: full, assessDate: "2025-02-30" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(firstIssue(bad.error)).toBe("วันที่ประเมินไม่ถูกต้อง");
  });
});

describe("assessmentUpdateSchema", () => {
  it("needs at least one field and re-validates scores when present", () => {
    expect(assessmentUpdateSchema.safeParse({}).success).toBe(false);
    expect(assessmentUpdateSchema.safeParse({ note: "ok" }).success).toBe(true);
    expect(assessmentUpdateSchema.safeParse({ scores: { "1": 3 } }).success).toBe(false);
  });
});
