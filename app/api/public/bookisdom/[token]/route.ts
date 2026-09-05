import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public, read-only access to a shared prompt pack (no auth).
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const project = await prisma.bookisdomProject.findUnique({
    where: { shareToken: params.token },
    select: { title: true, type: true, subGenre: true, config: true, visibility: true },
  });

  if (!project || project.visibility !== "public") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    project: { title: project.title, type: project.type, subGenre: project.subGenre, config: project.config },
  });
}
