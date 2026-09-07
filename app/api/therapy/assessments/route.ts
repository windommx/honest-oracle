import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { INSTRUMENTS } from "@/lib/therapy-engine/instruments";
import { isComplete, score } from "@/lib/therapy-engine/scoring";
import { buildPlan } from "@/lib/therapy-engine/protocol";
import type { InstrumentId, ScoreResult } from "@/lib/therapy-engine/types";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  The server re-scores. It never accepts a total from the client.  ║
// ║                                                                    ║
// ║  Two reasons, and the second is the one that matters here:         ║
// ║   · a client-supplied total is trivially forgeable;                ║
// ║   · and if the browser computed the score, the stored row would    ║
// ║     be a claim rather than a derivation. Storing the RESPONSES and ║
// ║     re-deriving the total through the same engine the UI uses      ║
// ║     means any row in this table can be recomputed from the answers ║
// ║     beside it — which is the whole basis of the product's claim    ║
// ║     that its numbers are checkable.                                ║
// ╚══════════════════════════════════════════════════════════════════╝

/** Keep a user's history bounded; assessments are small, but unbounded growth
 *  from a stuck client is still a DB problem. */
const MAX_STORED = 500;

const bodySchema = z.object({
  instrument: z.enum(["gad7", "phq9"]),
  responses: z.array(z.number().int().min(0).max(3)).min(1).max(20),
});

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const instrument = request.nextUrl.searchParams.get("instrument");
  const where =
    instrument === "gad7" || instrument === "phq9"
      ? { userId: user.id, instrument }
      : { userId: user.id };

  const assessments = await prisma.therapyAssessment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, instrument: true, total: true, band: true, safetyFlag: true, createdAt: true },
  });

  return NextResponse.json({ assessments });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { instrument, responses } = parsed.data;

  // The engine's own completeness check — the right item count for THIS
  // instrument, every answer on its scale. A partial set is refused rather than
  // summed: five of seven answers is not a GAD-7 score.
  if (!isComplete(instrument, responses)) {
    return NextResponse.json(
      { error: `ต้องตอบให้ครบ ${INSTRUMENTS[instrument].items.length} ข้อ`, code: "incomplete" },
      { status: 400 }
    );
  }

  const result = score(instrument, responses);

  const count = await prisma.therapyAssessment.count({ where: { userId: user.id } });
  if (count >= MAX_STORED) {
    return NextResponse.json(
      { error: `เก็บผลประเมินได้สูงสุด ${MAX_STORED} ครั้ง — ลบผลเก่าก่อน`, code: "limit_reached" },
      { status: 403 }
    );
  }

  const row = await prisma.therapyAssessment.create({
    data: {
      userId: user.id,
      instrument,
      responses,
      total: result.total,
      band: result.band.id,
      safetyFlag: result.safetyFlag,
    },
    select: { id: true, createdAt: true },
  });

  // The plan is built from THIS submission plus the user's most recent score on
  // the other instrument, so a high PHQ-9 from yesterday still raises today's
  // tier. Safety is a property of the person, not of one questionnaire.
  const other: InstrumentId = instrument === "gad7" ? "phq9" : "gad7";
  const recent = await prisma.therapyAssessment.findFirst({
    where: { userId: user.id, instrument: other },
    orderBy: { createdAt: "desc" },
    select: { responses: true },
  });

  const scores: ScoreResult[] = [result];
  if (recent && Array.isArray(recent.responses)) {
    const prior = recent.responses as number[];
    if (isComplete(other, prior)) scores.push(score(other, prior));
  }

  return NextResponse.json({ id: row.id, createdAt: row.createdAt, score: result, plan: buildPlan({ scores }) });
}
