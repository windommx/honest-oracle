import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { BOOK_TYPES, type BookConfig } from "@/lib/rush-engine/engine";

interface PatchBody {
  config?: BookConfig;
  visibility?: "private" | "public";
}

async function ownedProject(userId: string, id: string) {
  const project = await prisma.rushProject.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!project || project.userId !== userId) return null;
  return project;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await prisma.rushProject.findUnique({
    where: { id: params.id },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, createdAt: true, config: true } } },
  });
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

  // Share visibility toggle (no config change).
  if (body.visibility && !body.config) {
    const current = await prisma.rushProject.findUnique({ where: { id: params.id }, select: { shareToken: true } });
    const shareToken =
      body.visibility === "public" ? current?.shareToken ?? crypto.randomBytes(16).toString("hex") : current?.shareToken;
    await prisma.rushProject.update({
      where: { id: params.id },
      data: { visibility: body.visibility, shareToken },
    });
    return NextResponse.json({ ok: true, visibility: body.visibility, shareToken: body.visibility === "public" ? shareToken : null });
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
      versions: { create: { config: config as unknown as object } },
    },
  });

  // Keep version history bounded (latest 20).
  const old = await prisma.rushProjectVersion.findMany({
    where: { projectId: params.id },
    orderBy: { createdAt: "desc" },
    skip: 20,
    select: { id: true },
  });
  if (old.length) {
    await prisma.rushProjectVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
  }

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
