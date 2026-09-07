import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { BREATH_PATTERNS } from "@/lib/therapy-engine/music";

// Adherence log: what the user ACTUALLY did, which is a different quantity from
// what the plan recommended. Storing only completed minutes (never "sessions
// planned") keeps the progress page honest — it can show a gap between plan and
// practice rather than quietly counting intentions as sessions.

const MAX_STORED = 2000;

const bodySchema = z
  .object({
    kind: z.enum(["music", "breath"]),
    plannedMin: z.number().int().min(1).max(120),
    completedMin: z.number().int().min(0).max(120),
    startBpm: z.number().int().min(40).max(200).optional(),
    targetBpm: z.number().int().min(40).max(200).optional(),
    breathPattern: z.enum(Object.keys(BREATH_PATTERNS) as [string, ...string[]]).optional(),
  })
  // A session cannot have run longer than it was planned to: that would be a
  // client bug being written to the adherence record as fact.
  .refine((b) => b.completedMin <= b.plannedMin, {
    message: "completedMin cannot exceed plannedMin",
  });

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.therapySession.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      plannedMin: true,
      completedMin: true,
      startBpm: true,
      targetBpm: true,
      breathPattern: true,
      createdAt: true,
    },
  });

  const totalMinutes = sessions.reduce((n, s) => n + s.completedMin, 0);
  return NextResponse.json({ sessions, totalMinutes });
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
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const count = await prisma.therapySession.count({ where: { userId: user.id } });
  if (count >= MAX_STORED) {
    return NextResponse.json({ error: "session log is full", code: "limit_reached" }, { status: 403 });
  }

  const row = await prisma.therapySession.create({
    data: { userId: user.id, ...parsed.data },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ id: row.id, createdAt: row.createdAt });
}
