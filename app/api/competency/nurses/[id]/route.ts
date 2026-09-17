import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { notFound, ownedNurse, parseBody, unauthorized } from "@/lib/server/competency";
import { nurseUpdateSchema } from "@/lib/competency/validation";
import { toNurseDetailDTO } from "@/lib/competency/serialize";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

/** GET /api/competency/nurses/[id] — profile + full assessment history (newest first). */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurse = await ownedNurse(user, params.id);
  if (!nurse) return notFound("ไม่พบพยาบาลที่ระบุ");

  return NextResponse.json({ nurse: toNurseDetailDTO(nurse) });
}

/** PATCH /api/competency/nurses/[id] — edit name / nickname / position / management tier. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurse = await ownedNurse(user, params.id);
  if (!nurse) return notFound("ไม่พบพยาบาลที่ระบุ");

  const parsed = await parseBody(request, nurseUpdateSchema);
  if ("response" in parsed) return parsed.response;

  const updated = await prisma.competencyNurse.update({
    where: { id: nurse.id },
    data: parsed.data,
    include: { assessments: { orderBy: [{ assessDate: "desc" }, { createdAt: "desc" }] } },
  });

  return NextResponse.json({ nurse: toNurseDetailDTO(updated) });
}

/** DELETE /api/competency/nurses/[id] — removes the nurse and (by cascade) every assessment. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurse = await ownedNurse(user, params.id);
  if (!nurse) return notFound("ไม่พบพยาบาลที่ระบุ");

  await prisma.competencyNurse.delete({ where: { id: nurse.id } });
  return NextResponse.json({ ok: true, deletedAssessments: nurse.assessments.length });
}
