import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { notFound, ownedAssessment, parseBody, unauthorized } from "@/lib/server/competency";
import { assessmentUpdateSchema } from "@/lib/competency/validation";
import { evaluate } from "@/lib/competency/scoring";
import { toAssessmentDTO } from "@/lib/competency/serialize";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** GET /api/competency/assessments/[id] */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const assessment = await ownedAssessment(user, params.id);
  if (!assessment) return notFound("ไม่พบผลการประเมิน");

  const { nurse, ...row } = assessment;
  return NextResponse.json({
    assessment: toAssessmentDTO(row),
    nurse: { id: nurse.id, fullName: nurse.fullName, nickname: nurse.nickname, position: nurse.position, mgmtLevel: nurse.mgmtLevel },
  });
}

/** PATCH /api/competency/assessments/[id] — correct scores / date / assessor / note.
 *  A new scores map re-derives totalScore and level; the other fields never touch them. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const assessment = await ownedAssessment(user, params.id);
  if (!assessment) return notFound("ไม่พบผลการประเมิน");

  const parsed = await parseBody(request, assessmentUpdateSchema);
  if ("response" in parsed) return parsed.response;
  const { scores, ...rest } = parsed.data;

  const updated = await prisma.competencyAssessment.update({
    where: { id: assessment.id },
    data: { ...rest, ...(scores ? { scores, ...evaluate(scores) } : {}) },
  });

  return NextResponse.json({ assessment: toAssessmentDTO(updated) });
}

/** DELETE /api/competency/assessments/[id] */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const assessment = await ownedAssessment(user, params.id);
  if (!assessment) return notFound("ไม่พบผลการประเมิน");

  await prisma.competencyAssessment.delete({ where: { id: assessment.id } });
  return NextResponse.json({ ok: true });
}
