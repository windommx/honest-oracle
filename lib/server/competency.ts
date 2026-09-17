import { NextResponse } from "next/server";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { firstIssue } from "@/lib/competency/validation";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  Shared plumbing for /api/competency. Every route: (1) needs a     ║
// ║  login, (2) may only touch rows owned by that login, (3) answers   ║
// ║  a bad body with a Thai message the form can show as-is. Keeping   ║
// ║  the three rules here means a route cannot forget one of them.    ║
// ╚══════════════════════════════════════════════════════════════════╝

export type CompetencyUser = NonNullable<Awaited<ReturnType<typeof requireUser>>>;

export const unauthorized = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
export const notFound = (what = "ไม่พบข้อมูล") => NextResponse.json({ error: what }, { status: 404 });
export const badRequest = (message: string) => NextResponse.json({ error: message }, { status: 400 });

/** Parse a JSON body against a schema; a failure becomes a 400 with the first issue. */
export async function parseBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S
): Promise<{ data: z.output<S> } | { response: NextResponse }> {
  const json = await request.json().catch(() => null);
  if (json === null || typeof json !== "object") return { response: badRequest("ข้อมูลที่ส่งมาไม่ใช่ JSON") };
  const parsed = schema.safeParse(json);
  if (!parsed.success) return { response: badRequest(firstIssue(parsed.error)) };
  return { data: parsed.data };
}

/** The nurse with this id, only if it belongs to the user. Assessments come newest first. */
export async function ownedNurse(user: CompetencyUser, nurseId: string) {
  const nurse = await prisma.competencyNurse.findUnique({
    where: { id: nurseId },
    include: { assessments: { orderBy: [{ assessDate: "desc" }, { createdAt: "desc" }] } },
  });
  if (!nurse || nurse.userId !== user.id) return null;
  return nurse;
}

/** An assessment with this id, only if its nurse belongs to the user. */
export async function ownedAssessment(user: CompetencyUser, assessmentId: string) {
  const assessment = await prisma.competencyAssessment.findUnique({
    where: { id: assessmentId },
    include: { nurse: { select: { id: true, userId: true, fullName: true, nickname: true, position: true, mgmtLevel: true } } },
  });
  if (!assessment || assessment.nurse.userId !== user.id) return null;
  return assessment;
}

/** Roster cap per account — a guard against runaway growth, far above any real unit. */
export const NURSE_LIMIT = 500;
