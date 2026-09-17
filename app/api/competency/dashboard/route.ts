import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { unauthorized } from "@/lib/server/competency";
import { computeDashboard } from "@/lib/competency/stats";

export const dynamic = "force-dynamic";

/** GET /api/competency/dashboard — unit-level counts, means and ranking (see lib/competency/stats.ts). */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurses = await prisma.competencyNurse.findMany({
    where: { userId: user.id },
    include: { assessments: { orderBy: [{ assessDate: "desc" }, { createdAt: "desc" }] } },
  });

  return NextResponse.json(computeDashboard(nurses));
}
