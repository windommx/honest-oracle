import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { BOOK_TYPES, type BookConfig } from "@/lib/rush-engine/engine";

interface PatchBody {
  config: BookConfig;
}

async function ownedProject(userId: string, id: string) {
  const project = await prisma.rushProject.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!project || project.userId !== userId) return null;
  return project;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.rushProject.findUnique({ where: { id: params.id } });
  if (!project || project.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await ownedProject(user.id, params.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const config = body.config;
  if (!config || typeof config !== "object" || !(config.type in BOOK_TYPES)) {
    return NextResponse.json({ error: "Invalid config" }, { status: 400 });
  }

  await prisma.rushProject.update({
    where: { id: params.id },
    data: {
      title: config.title || "Untitled",
      type: config.type,
      subGenre: config.subGenre || "",
      config: config as unknown as object,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owned = await ownedProject(user.id, params.id);
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.rushProject.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
