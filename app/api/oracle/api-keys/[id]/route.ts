import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";

export async function DELETE(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await prisma.apiKey.updateMany({
    where: { id: context.params.id, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

