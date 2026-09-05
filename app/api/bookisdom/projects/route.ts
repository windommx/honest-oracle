import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/server/session";
import { BOOK_TYPES, type BookConfig } from "@/lib/bookisdom-engine/engine";

interface CreateBody {
  config: BookConfig;
}

// Cloud-project caps by plan. Free is limited on purpose (the upgrade reason);
// paid plans get the full DB-safety cap.
const FREE_PROJECT_LIMIT = 3;
const PAID_PROJECT_LIMIT = 50;

export async function GET() {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable; // 503: server misconfigured — an honest status, not a crash
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.bookisdomProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, type: true, subGenre: true, visibility: true, config: true, updatedAt: true },
  });

  return NextResponse.json({ projects, plan: (user as { plan?: string }).plan ?? "free" });
}

export async function POST(request: NextRequest) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable; // 503: server misconfigured — an honest status, not a crash
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = body.config;
  if (!config || typeof config !== "object" || !(config.type in BOOK_TYPES)) {
    return NextResponse.json({ error: "Invalid config" }, { status: 400 });
  }

  // Cap projects per user to prevent runaway DB growth.
  // Plan-based cloud-project cap: Free is limited (the reason to upgrade); paid plans
  // get the full cap. Manuscripts stay unlimited locally either way.
  const plan = (user as { plan?: string }).plan ?? "free";
  const isPaid = plan === "pro" || plan === "team";
  const limit = isPaid ? PAID_PROJECT_LIMIT : FREE_PROJECT_LIMIT;
  const count = await prisma.bookisdomProject.count({ where: { userId: user.id } });
  if (count >= limit) {
    return NextResponse.json(
      {
        error: isPaid
          ? `ถึงขีดจำกัดโปรเจกต์ (${limit}) — ลบโปรเจกต์เก่าเพื่อบันทึกใหม่`
          : `แผน Free เก็บ cloud ได้ ${FREE_PROJECT_LIMIT} โปรเจกต์ — อัปเกรด Pro เพื่อ sync ไม่จำกัด (ต้นฉบับในเครื่องไม่จำกัด)`,
        code: isPaid ? "limit_reached" : "upgrade_required",
        limit,
        plan,
      },
      { status: 403 }
    );
  }

  const project = await prisma.bookisdomProject.create({
    data: {
      userId: user.id,
      title: config.title || "Untitled",
      type: config.type,
      subGenre: config.subGenre || "",
      config: config as unknown as object,
      versions: { create: { config: config as unknown as object } },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: project.id });
}
