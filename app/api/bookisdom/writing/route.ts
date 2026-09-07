import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuth } from "@/lib/server/session";

// Writer Room sync — list the caller's cloud copies (metadata only; bundles are fetched
// one at a time). Opt-in: a book exists here only after the writer pushed it.
export async function GET() {
  const { user, unavailable } = await getAuth();
  if (unavailable) return unavailable; // 503: server misconfigured — an honest status, not a crash
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const books = await prisma.bookisdomWritingBook.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { bookId: true, title: true, bytes: true, updatedAt: true },
  });
  return NextResponse.json({ books, plan: (user as { plan?: string }).plan ?? "free" });
}
