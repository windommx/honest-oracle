import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { BOOK_TYPES, type BookConfig } from "@/lib/rush-engine/engine";

interface CreateBody {
  config: BookConfig;
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projects = await prisma.rushProject.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: { id: true, title: true, type: true, subGenre: true, updatedAt: true },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
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
  const count = await prisma.rushProject.count({ where: { userId: user.id } });
  if (count >= 50) {
    return NextResponse.json(
      { error: "Project limit reached (50). Delete an old project to save a new one." },
      { status: 403 }
    );
  }

  const project = await prisma.rushProject.create({
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
