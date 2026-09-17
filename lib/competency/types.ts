import type { Scores } from "./scoring";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  WIRE TYPES — what the /api/competency routes return and the UI    ║
// ║  consumes. Dates are ISO strings (JSON has no Date). The server    ║
// ║  builds these with the serializers below from structural record   ║
// ║  types, so this module never imports Prisma and stays testable.    ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Shape of a stored assessment row, as Prisma returns it (Json scores untyped). */
export interface AssessmentRecord {
  id: string;
  nurseId: string;
  assessDate: Date;
  assessor: string | null;
  note: string | null;
  scores: unknown;
  totalScore: number;
  level: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape of a stored nurse row with its assessments loaded. */
export interface NurseRecord {
  id: string;
  fullName: string;
  nickname: string | null;
  position: string;
  mgmtLevel: number | null;
  createdAt: Date;
  updatedAt: Date;
  assessments: AssessmentRecord[];
}

export interface AssessmentDTO {
  id: string;
  nurseId: string;
  /** ISO string. */
  assessDate: string;
  assessor: string | null;
  note: string | null;
  scores: Scores;
  totalScore: number;
  level: number;
  createdAt: string;
  updatedAt: string;
}

export interface NurseDTO {
  id: string;
  fullName: string;
  nickname: string | null;
  position: string;
  mgmtLevel: number | null;
  createdAt: string;
  updatedAt: string;
  assessmentCount: number;
  /** Most recent assessment by date (then by creation), or null when never assessed. */
  latest: AssessmentDTO | null;
}

export interface NurseDetailDTO extends NurseDTO {
  /** Newest first. */
  assessments: AssessmentDTO[];
}

export interface DashboardSummary {
  totalNurses: number;
  assessedCount: number;
  notAssessed: number;
  totalAssessments: number;
  /** Mean of the latest total per assessed nurse, 1 decimal. 0 when nobody is assessed. */
  averageScore: number;
  /** Latest totals ≥ LEVEL 3 (ผู้ปฏิบัติ) as a share of assessed nurses, whole percent. */
  competentRate: number;
  competentCount: number;
  /** Nurses carrying a management tier (LEVEL 6/7). */
  managementCount: number;
  /** ISO date of the most recent assessment across the unit, or null. */
  latestAssessDate: string | null;
}

export interface LevelCount {
  level: number;
  count: number;
}

export interface CriterionAverage {
  criterionId: number;
  name: string;
  shortName: string;
  /** Mean score 0-10 across latest assessments, 1 decimal. */
  average: number;
  /** Mean point 1-5, 2 decimals — for the radar overlay. */
  averagePoint: number;
}

export interface RankingRow {
  nurseId: string;
  fullName: string;
  nickname: string | null;
  position: string;
  mgmtLevel: number | null;
  assessmentCount: number;
  latest: { id: string; assessDate: string; totalScore: number; level: number } | null;
}

export interface DashboardDTO {
  summary: DashboardSummary;
  levelDistribution: LevelCount[];
  criteriaAverages: CriterionAverage[];
  /** Lowest three criterion averages — the unit's development priorities. */
  weakestCriteria: CriterionAverage[];
  /** Everyone, best latest total first; the never-assessed at the end. */
  ranking: RankingRow[];
}
