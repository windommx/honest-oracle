import { CRITERIA, COMPETENCY_LEVELS } from "./criteria";
import { parseScores, scoreKey, scoreOfPoint } from "./scoring";
import { sortAssessmentsDesc } from "./serialize";
import type { CriterionAverage, DashboardDTO, NurseRecord, RankingRow } from "./types";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  DASHBOARD STATS — one pure function over the loaded rows.         ║
// ║  Everything reported is a count, a mean, or a share of counts —   ║
// ║  nothing here is a judgement the data does not contain. "Latest"  ║
// ║  means each nurse's most recent assessment; older ones only add   ║
// ║  to `totalAssessments`.                                            ║
// ╚══════════════════════════════════════════════════════════════════╝

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The level at or above which the sheet's staff groups begin ("ผู้ปฏิบัติ" and up). */
export const COMPETENT_LEVEL = 3;

export function computeDashboard(nurses: NurseRecord[]): DashboardDTO {
  const withLatest = nurses.map((n) => ({ nurse: n, latest: sortAssessmentsDesc(n.assessments)[0] ?? null }));
  const assessed = withLatest.filter((x): x is { nurse: NurseRecord; latest: NonNullable<typeof x.latest> } => x.latest !== null);

  const totalAssessments = nurses.reduce((s, n) => s + n.assessments.length, 0);
  const assessedCount = assessed.length;
  const averageScore = assessedCount ? round1(assessed.reduce((s, x) => s + x.latest.totalScore, 0) / assessedCount) : 0;
  const competentCount = assessed.filter((x) => x.latest.level >= COMPETENT_LEVEL).length;
  const competentRate = assessedCount ? Math.round((competentCount / assessedCount) * 100) : 0;
  const managementCount = nurses.filter((n) => n.mgmtLevel != null).length;

  let latestAssessDate: Date | null = null;
  for (const n of nurses) {
    for (const a of n.assessments) {
      if (!latestAssessDate || a.assessDate.getTime() > latestAssessDate.getTime()) latestAssessDate = a.assessDate;
    }
  }

  const levelDistribution = COMPETENCY_LEVELS.map((l) => ({
    level: l.level,
    count: assessed.filter((x) => x.latest.level === l.level).length,
  }));

  const criteriaAverages: CriterionAverage[] = CRITERIA.map((c) => {
    let sumPoints = 0;
    let n = 0;
    for (const x of assessed) {
      const p = parseScores(x.latest.scores)[scoreKey(c.id)];
      if (typeof p === "number") {
        sumPoints += p;
        n += 1;
      }
    }
    const averagePoint = n ? sumPoints / n : 0;
    return {
      criterionId: c.id,
      name: c.name,
      shortName: c.shortName,
      average: round1(scoreOfPoint(averagePoint)),
      averagePoint: round2(averagePoint),
    };
  });

  const weakestCriteria = assessedCount
    ? [...criteriaAverages].sort((a, b) => a.average - b.average || a.criterionId - b.criterionId).slice(0, 3)
    : [];

  const ranking: RankingRow[] = withLatest
    .map(({ nurse, latest }) => ({
      nurseId: nurse.id,
      fullName: nurse.fullName,
      nickname: nurse.nickname,
      position: nurse.position,
      mgmtLevel: nurse.mgmtLevel,
      assessmentCount: nurse.assessments.length,
      latest: latest
        ? { id: latest.id, assessDate: latest.assessDate.toISOString(), totalScore: latest.totalScore, level: latest.level }
        : null,
    }))
    .sort(
      (a, b) =>
        (b.latest?.totalScore ?? -1) - (a.latest?.totalScore ?? -1) || a.fullName.localeCompare(b.fullName, "th")
    );

  return {
    summary: {
      totalNurses: nurses.length,
      assessedCount,
      notAssessed: nurses.length - assessedCount,
      totalAssessments,
      averageScore,
      competentRate,
      competentCount,
      managementCount,
      latestAssessDate: latestAssessDate ? latestAssessDate.toISOString() : null,
    },
    levelDistribution,
    criteriaAverages,
    weakestCriteria,
    ranking,
  };
}
