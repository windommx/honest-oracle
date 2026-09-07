import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  Take it with you, or take it away.                               ║
// ║                                                                    ║
// ║  Mental-health answers are among the most sensitive data a person  ║
// ║  can hand an app, and Thailand's PDPA gives them a right of access ║
// ║  and a right to erasure. Those rights are worth nothing if         ║
// ║  exercising them means emailing support and waiting, so they are   ║
// ║  two HTTP calls here: GET returns everything, DELETE removes       ║
// ║  everything, immediately and without a retention window.           ║
// ║                                                                    ║
// ║  The export includes the raw item responses, not just the totals.  ║
// ║  A summary export would be the app deciding which of your own      ║
// ║  answers you are allowed to keep.                                  ║
// ╚══════════════════════════════════════════════════════════════════╝

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [assessments, sessions, sleepNights] = await Promise.all([
    prisma.therapyAssessment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.therapySession.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } }),
    prisma.therapySleepNight.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } }),
  ]);

  return NextResponse.json(
    {
      exportedFor: user.email,
      counts: { assessments: assessments.length, sessions: sessions.length, sleepNights: sleepNights.length },
      assessments,
      sessions,
      sleepNights,
      note:
        "ไฟล์นี้มีคำตอบรายข้อของแบบประเมินด้วย ไม่ใช่เฉพาะคะแนนรวม — คุณจึงคำนวณคะแนนซ้ำเองได้ทั้งหมด",
    },
    { headers: { "Content-Disposition": 'attachment; filename="mindbridge-export.json"' } }
  );
}

export async function DELETE() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Scoped to the therapy tables only: this endpoint is "delete my mental-health
  // data", not "delete my account", and quietly doing the larger thing would be
  // its own kind of dishonesty.
  const [assessments, sessions, sleepNights] = await prisma.$transaction([
    prisma.therapyAssessment.deleteMany({ where: { userId: user.id } }),
    prisma.therapySession.deleteMany({ where: { userId: user.id } }),
    prisma.therapySleepNight.deleteMany({ where: { userId: user.id } }),
  ]);

  return NextResponse.json({
    deleted: { assessments: assessments.count, sessions: sessions.count, sleepNights: sleepNights.count },
  });
}
