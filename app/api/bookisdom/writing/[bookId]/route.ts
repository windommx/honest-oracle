import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/server/session";
import { checkUpload, FREE_CLOUD_BOOKS, PAID_CLOUD_BOOKS } from "../_shared";

type Ctx = { params: { bookId: string } };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.bookisdomWritingBook.findUnique({ where: { userId_bookId: { userId: user.id, bookId: params.bookId } }, select: { bundle: true, updatedAt: true, bytes: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ bundle: row.bundle, updatedAt: row.updatedAt, bytes: row.bytes });
}

/** Upsert the cloud copy. Free plan: 3 books (the upgrade reason, same as projects). */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const checked = checkUpload(await req.text(), params.bookId);
  if (!checked.ok) return checked.res;

  const existing = await prisma.bookisdomWritingBook.findUnique({ where: { userId_bookId: { userId: user.id, bookId: params.bookId } }, select: { id: true } });
  if (!existing) {
    const plan = (user as { plan?: string }).plan ?? "free";
    const isPaid = plan === "pro" || plan === "team";
    const limit = isPaid ? PAID_CLOUD_BOOKS : FREE_CLOUD_BOOKS;
    const count = await prisma.bookisdomWritingBook.count({ where: { userId: user.id } });
    if (count >= limit) {
      return NextResponse.json({
        error: isPaid ? `ถึงขีดจำกัดเล่มบนบัญชี (${limit}) — ลบเล่มเก่าออกจากบัญชีก่อน` : `แผน Free ซิงก์ได้ ${FREE_CLOUD_BOOKS} เล่ม — อัปเกรด Pro เพื่อซิงก์ไม่จำกัด (ในเครื่องไม่จำกัดเสมอ)`,
        code: isPaid ? "limit_reached" : "upgrade_required", limit, plan,
      }, { status: 403 });
    }
  }
  const row = await prisma.bookisdomWritingBook.upsert({
    where: { userId_bookId: { userId: user.id, bookId: params.bookId } },
    create: { userId: user.id, bookId: params.bookId, title: checked.title, bytes: checked.bytes, bundle: checked.bundle as unknown as object },
    update: { title: checked.title, bytes: checked.bytes, bundle: checked.bundle as unknown as object },
    select: { updatedAt: true, bytes: true },
  });
  return NextResponse.json({ ok: true, updatedAt: row.updatedAt, bytes: row.bytes });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable;
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await prisma.bookisdomWritingBook.deleteMany({ where: { userId: user.id, bookId: params.bookId } });
  if (r.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
