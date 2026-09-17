import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { unauthorized } from "@/lib/server/competency";
import { SAMPLE_ASSESS_DATE, SAMPLE_NOTE, SAMPLE_NURSES, sampleScores } from "@/lib/competency/sample-data";
import { evaluate } from "@/lib/competency/scoring";
import { parseAssessDate } from "@/lib/competency/format";

export const dynamic = "force-dynamic";

/**
 * POST /api/competency/sample — load the workbook's seven nurses into an EMPTY roster.
 * Refused (409) once the account has any nurse, so it can never duplicate or mix
 * sample rows into real data.
 */
export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const existing = await prisma.competencyNurse.count({ where: { userId: user.id } });
  if (existing > 0) {
    return NextResponse.json({ error: "มีรายชื่อในระบบแล้ว — นำเข้าข้อมูลตัวอย่างได้เฉพาะเมื่อยังไม่มีข้อมูล" }, { status: 409 });
  }

  const assessDate = parseAssessDate(SAMPLE_ASSESS_DATE)!;
  for (const s of SAMPLE_NURSES) {
    const scores = sampleScores(s);
    const { totalScore, level } = evaluate(scores);
    await prisma.competencyNurse.create({
      data: {
        userId: user.id,
        fullName: s.fullName,
        nickname: s.nickname,
        position: s.position,
        assessments: { create: { assessDate, note: SAMPLE_NOTE, scores, totalScore, level } },
      },
    });
  }

  return NextResponse.json({ imported: SAMPLE_NURSES.length }, { status: 201 });
}
