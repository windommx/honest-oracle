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

  const books = await prisma.rushBook.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      type: true,
      subGenre: true,
      updatedAt: true,
      _count: { select: { chapters: true } },
    },
  });

  return NextResponse.json({ books });
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

  const book = await prisma.rushBook.create({
    data: {
      userId: user.id,
      title: config.title || "Untitled",
      type: config.type,
      subGenre: config.subGenre || "",
      config: config as unknown as object,
    },
    select: { id: true },
  });

  return NextResponse.json({ id: book.id });
}
