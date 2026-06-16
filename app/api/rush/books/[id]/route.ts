import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";

interface PatchBody {
  storyBible?: string;
  chapter?: { number: number; status: string; content: string };
}

async function ownedBook(userId: string, id: string) {
  const book = await prisma.rushBook.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!book || book.userId !== userId) return null;
  return book;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await prisma.rushBook.findUnique({
    where: { id: params.id },
    include: { chapters: { orderBy: { number: "asc" } } },
  });
  if (!book || book.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ book });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await ownedBook(user.id, params.id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.storyBible === "string") {
    await prisma.rushBook.update({
      where: { id: params.id },
      data: { storyBible: body.storyBible },
    });
  }

  if (body.chapter && typeof body.chapter.number === "number") {
    const { number, status, content } = body.chapter;
    await prisma.rushChapter.upsert({
      where: { bookId_number: { bookId: params.id, number } },
      create: { bookId: params.id, number, status: status ?? "done", content: content ?? "" },
      update: { status: status ?? "done", content: content ?? "" },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const book = await ownedBook(user.id, params.id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.rushBook.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
