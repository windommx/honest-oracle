import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { isValidEntry, summarise, type SleepDiaryEntry } from "@/lib/therapy-engine/sleep";

// The diary stores REPORTED QUANTITIES ONLY. Total sleep time and sleep
// efficiency are derived on read by sleep.ts, never written to a column: a
// stored derivation is a value that can silently disagree with the formula that
// is supposed to produce it, and this product's whole claim is that its numbers
// are re-derivable.

const MAX_STORED = 1000;

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  timeInBedMin: z.number().int().min(1).max(1440),
  sleepLatencyMin: z.number().int().min(0).max(1440),
  wakeAfterSleepOnsetMin: z.number().int().min(0).max(1440),
  terminalWakefulnessMin: z.number().int().min(0).max(1440),
  awakenings: z.number().int().min(0).max(100),
});

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.therapySleepNight.findMany({
    where: { userId: user.id },
    orderBy: { date: "desc" },
    take: 90,
    select: {
      date: true,
      timeInBedMin: true,
      sleepLatencyMin: true,
      wakeAfterSleepOnsetMin: true,
      terminalWakefulnessMin: true,
      awakenings: true,
    },
  });

  const nights: SleepDiaryEntry[] = rows;
  return NextResponse.json({ nights, summary: summarise(nights) });
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

  // Field-level ranges are not enough: a night can be individually plausible and
  // still impossible as a whole (90 minutes to fall asleep in 60 minutes of bed).
  // Storing it would put a negative total sleep time on the trend chart.
  if (!isValidEntry(parsed.data)) {
    return NextResponse.json(
      { error: "เวลาที่ตื่นรวมกันมากกว่าเวลาที่อยู่บนเตียง — ตรวจสอบตัวเลขอีกครั้ง", code: "inconsistent" },
      { status: 400 }
    );
  }

  const existing = await prisma.therapySleepNight.findUnique({
    where: { userId_date: { userId: user.id, date: parsed.data.date } },
    select: { id: true },
  });

  if (!existing) {
    const count = await prisma.therapySleepNight.count({ where: { userId: user.id } });
    if (count >= MAX_STORED) {
      return NextResponse.json({ error: "sleep diary is full", code: "limit_reached" }, { status: 403 });
    }
  }

  // One row per night: re-submitting a date corrects it rather than adding a
  // duplicate that would be counted twice in the weekly criterion.
  const row = await prisma.therapySleepNight.upsert({
    where: { userId_date: { userId: user.id, date: parsed.data.date } },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
    select: { id: true, date: true },
  });

  return NextResponse.json({ id: row.id, date: row.date });
}
