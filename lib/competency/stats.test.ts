import { describe, it, expect } from "vitest";
import { computeDashboard } from "./stats";
import { SAMPLE_NURSES, sampleScores } from "./sample-data";
import { evaluate } from "./scoring";
import type { AssessmentRecord, NurseRecord } from "./types";

const day = (iso: string) => new Date(iso);

function assessment(nurseId: string, scores: Record<string, number>, date: string, id = `${nurseId}-${date}`): AssessmentRecord {
  const { totalScore, level } = evaluate(scores);
  return {
    id,
    nurseId,
    assessDate: day(date),
    assessor: null,
    note: null,
    scores,
    totalScore,
    level,
    createdAt: day(date),
    updatedAt: day(date),
  };
}

function fixture(): NurseRecord[] {
  return SAMPLE_NURSES.map((s, i) => ({
    id: `n${i + 1}`,
    fullName: s.fullName,
    nickname: s.nickname,
    position: s.position,
    mgmtLevel: i === 6 ? 6 : null, // พรชัย carries the หัวหน้าแผนก tier
    createdAt: day("2019-12-01T00:00:00.000Z"),
    updatedAt: day("2019-12-01T00:00:00.000Z"),
    assessments: [assessment(`n${i + 1}`, sampleScores(s), "2019-12-20T00:00:00.000Z")],
  }));
}

describe("computeDashboard", () => {
  it("summarises the seven-nurse workbook", () => {
    const d = computeDashboard(fixture());
    expect(d.summary).toEqual({
      totalNurses: 7,
      assessedCount: 7,
      notAssessed: 0,
      totalAssessments: 7,
      averageScore: 60.3, // (68+48+46+42+40+80+98)/7 = 60.29
      competentRate: 43, // 3 of 7 at LEVEL 3+
      competentCount: 3,
      managementCount: 1,
      latestAssessDate: "2019-12-20T00:00:00.000Z",
    });
    expect(d.levelDistribution).toEqual([
      { level: 1, count: 4 },
      { level: 2, count: 0 },
      { level: 3, count: 1 },
      { level: 4, count: 1 },
      { level: 5, count: 1 },
    ]);
  });

  it("averages each criterion from the latest assessments only", () => {
    const d = computeDashboard(fixture());
    // criterion 1 points: 3,3,3,1,3,4,5 → mean 3.14 → score 6.3
    expect(d.criteriaAverages[0]).toEqual({
      criterionId: 1,
      name: "วุฒิบัตร",
      shortName: "วุฒิบัตร",
      average: 6.3,
      averagePoint: 3.14,
    });
    // criterion 5 (RO) is the unit's weakest: 2,2,2,1,1,3,5 → 2.29 → 4.6
    expect(d.weakestCriteria[0].criterionId).toBe(5);
    expect(d.weakestCriteria).toHaveLength(3);
  });

  it("ranks by latest total, never-assessed last, and uses the newest assessment per nurse", () => {
    const rows = fixture();
    // จารุวรรณ re-assessed later and dropped to 40 — the newer result must win
    rows[0].assessments.push(assessment("n1", { ...sampleScores(SAMPLE_NURSES[4]) }, "2020-06-01T00:00:00.000Z", "n1-later"));
    rows.push({
      id: "n8",
      fullName: "คุณใหม่ ยังไม่ประเมิน",
      nickname: null,
      position: "พยาบาลวิชาชีพ",
      mgmtLevel: null,
      createdAt: day("2020-01-01T00:00:00.000Z"),
      updatedAt: day("2020-01-01T00:00:00.000Z"),
      assessments: [],
    });
    const d = computeDashboard(rows);
    expect(d.ranking.map((r) => r.latest?.totalScore ?? null)).toEqual([98, 80, 48, 46, 42, 40, 40, null]);
    expect(d.ranking[0].fullName).toBe("คุณพรชัย");
    expect(d.ranking[d.ranking.length - 1].fullName).toBe("คุณใหม่ ยังไม่ประเมิน");
    expect(d.summary.totalAssessments).toBe(8);
    expect(d.summary.assessedCount).toBe(7);
    expect(d.summary.notAssessed).toBe(1);
    expect(d.summary.latestAssessDate).toBe("2020-06-01T00:00:00.000Z");
  });

  it("two assessments on the same day: the one saved last is 'latest'", () => {
    const rows = fixture().slice(0, 1);
    const later = assessment("n1", sampleScores(SAMPLE_NURSES[6]), "2019-12-20T00:00:00.000Z", "same-day-later");
    later.createdAt = day("2019-12-20T09:00:00.000Z");
    rows[0].assessments.push(later);
    expect(computeDashboard(rows).ranking[0].latest?.totalScore).toBe(98);
  });

  it("an empty unit reports zeros, not NaN", () => {
    const d = computeDashboard([]);
    expect(d.summary.averageScore).toBe(0);
    expect(d.summary.competentRate).toBe(0);
    expect(d.summary.latestAssessDate).toBeNull();
    expect(d.criteriaAverages.every((c) => c.average === 0)).toBe(true);
    expect(d.weakestCriteria).toEqual([]);
    expect(d.ranking).toEqual([]);
  });
});
