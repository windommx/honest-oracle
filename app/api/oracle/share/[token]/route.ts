import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: { token: string } }
) {
  const reading = await prisma.oracleReading.findFirst({
    where: { shareToken: context.params.token, visibility: "public" },
    select: {
      id: true,
      inputName: true,
      birthDate: true,
      createdAt: true,
      result: true,
    },
  });

  if (!reading) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ reading });
}

