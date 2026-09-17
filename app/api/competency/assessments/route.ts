import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { NURSE_LIMIT, notFound, ownedNurse, parseBody, unauthorized } from "@/lib/server/competency";
import { assessmentCreateSchema } from "@/lib/competency/validation";
import { evaluate } from "@/lib/competency/scoring";
import { toAssessmentDTO } from "@/lib/competency/serialize";

export const dynamic = "force-dynamic";

/** GET /api/competency/assessments?nurseId= — assessments (all, or one nurse's), newest first. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurseId = request.nextUrl.searchParams.get("nurseId");
  if (nurseId) {
    const nurse = await ownedNurse(user, nurseId);
    if (!nurse) return notFound("ไม่พบพยาบาลที่ระบุ");
    return NextResponse.json({ assessments: nurse.assessments.map(toAssessmentDTO) });
  }

  const assessments = await prisma.competencyAssessment.findMany({
    where: { nurse: { userId: user.id } },
    orderBy: [{ assessDate: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  return NextResponse.json({ assessments: assessments.map(toAssessmentDTO) });
}

/**
 * POST /api/competency/assessments — record an assessment.
 * Body: { nurseId } OR { nurse: { fullName, nickname?, position?, mgmtLevel? } }
 *       + { scores: { "1".."10": 1-5 }, assessDate?: "YYYY-MM-DD", assessor?, note? }
 * totalScore and level are computed here, never trusted from the client.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, assessmentCreateSchema);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data;

  let nurseId: string;
  if (body.nurseId) {
    const nurse = await ownedNurse(user, body.nurseId);
    if (!nurse) return notFound("ไม่พบพยาบาลที่ระบุ");
    nurseId = nurse.id;
  } else {
    const count = await prisma.competencyNurse.count({ where: { userId: user.id } });
    if (count >= NURSE_LIMIT) {
      return NextResponse.json({ error: `รายชื่อเต็ม (${NURSE_LIMIT} คน) — ลบรายชื่อเก่าก่อนเพิ่มใหม่` }, { status: 403 });
    }
    const created = await prisma.competencyNurse.create({ data: { userId: user.id, ...body.nurse! } });
    nurseId = created.id;
  }

  const { totalScore, level } = evaluate(body.scores);
  const assessment = await prisma.competencyAssessment.create({
    data: {
      nurseId,
      assessDate: body.assessDate ?? new Date(),
      assessor: body.assessor,
      note: body.note,
      scores: body.scores,
      totalScore,
      level,
    },
  });

  return NextResponse.json({ assessment: toAssessmentDTO(assessment) }, { status: 201 });
}
