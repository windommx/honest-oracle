import { parseScores } from "./scoring";
import type { AssessmentDTO, AssessmentRecord, NurseDTO, NurseDetailDTO, NurseRecord } from "./types";

/** Newest first: by assessment date, then by creation time — two entries on the same
 *  day keep the one saved last as "latest", which is what the assessor expects. */
export function sortAssessmentsDesc<T extends { assessDate: Date; createdAt: Date }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) => b.assessDate.getTime() - a.assessDate.getTime() || b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function toAssessmentDTO(a: AssessmentRecord): AssessmentDTO {
  return {
    id: a.id,
    nurseId: a.nurseId,
    assessDate: a.assessDate.toISOString(),
    assessor: a.assessor,
    note: a.note,
    scores: parseScores(a.scores),
    totalScore: a.totalScore,
    level: a.level,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toNurseDTO(n: NurseRecord): NurseDTO {
  const sorted = sortAssessmentsDesc(n.assessments);
  return {
    id: n.id,
    fullName: n.fullName,
    nickname: n.nickname,
    position: n.position,
    mgmtLevel: n.mgmtLevel,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    assessmentCount: n.assessments.length,
    latest: sorted[0] ? toAssessmentDTO(sorted[0]) : null,
  };
}

export function toNurseDetailDTO(n: NurseRecord): NurseDetailDTO {
  return { ...toNurseDTO(n), assessments: sortAssessmentsDesc(n.assessments).map(toAssessmentDTO) };
}
