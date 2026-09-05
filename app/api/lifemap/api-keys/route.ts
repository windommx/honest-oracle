import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { apiKeyCreateSchema } from "@/lib/lifemap-engine/validation";
import { generateApiKey } from "@/lib/server/apiKey";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      label: true,
      prefix: true,
      createdAt: true,
      lastUsedAt: true,
      revokedAt: true,
    },
  });

  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = apiKeyCreateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { plain, prefix, hash } = generateApiKey();

  const created = await prisma.apiKey.create({
    data: {
      userId: user.id,
      label: parsed.data.label,
      prefix,
      keyHash: hash,
    },
    select: {
      id: true,
      label: true,
      prefix: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ apiKey: created, plain });
}

