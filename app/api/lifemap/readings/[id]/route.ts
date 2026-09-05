import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reading = await prisma.lifemapReading.findFirst({
    where: { id: context.params.id, userId: user.id },
    select: {
      id: true,
      inputName: true,
      birthDate: true,
      birthTime: true,
      birthPlace: true,
      createdAt: true,
      visibility: true,
      shareToken: true,
      result: true,
    },
  });

  if (!reading) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ reading });
}

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const visibility = json?.visibility === "public" ? "public" : "private";

  const updated = await prisma.lifemapReading.updateMany({
    where: { id: context.params.id, userId: user.id },
    data: { visibility },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

