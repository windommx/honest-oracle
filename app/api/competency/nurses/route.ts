import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { NURSE_LIMIT, parseBody, unauthorized } from "@/lib/server/competency";
import { nurseCreateSchema } from "@/lib/competency/validation";
import { toNurseDTO } from "@/lib/competency/serialize";

export const dynamic = "force-dynamic";

/** GET /api/competency/nurses — the caller's roster, each with its latest assessment. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurses = await prisma.competencyNurse.findMany({
    where: { userId: user.id },
    orderBy: [{ fullName: "asc" }],
    include: { assessments: { orderBy: [{ assessDate: "desc" }, { createdAt: "desc" }] } },
  });

  return NextResponse.json({ nurses: nurses.map(toNurseDTO) });
}

/** POST /api/competency/nurses — add a nurse to the roster (no assessment yet). */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const parsed = await parseBody(request, nurseCreateSchema);
  if ("response" in parsed) return parsed.response;

  const count = await prisma.competencyNurse.count({ where: { userId: user.id } });
  if (count >= NURSE_LIMIT) {
    return NextResponse.json({ error: `รายชื่อเต็ม (${NURSE_LIMIT} คน) — ลบรายชื่อเก่าก่อนเพิ่มใหม่` }, { status: 403 });
  }

  const nurse = await prisma.competencyNurse.create({
    data: { userId: user.id, ...parsed.data },
    include: { assessments: true },
  });

  return NextResponse.json({ nurse: toNurseDTO(nurse) }, { status: 201 });
}
