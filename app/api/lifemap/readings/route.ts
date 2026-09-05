import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { lifemapInputSchema } from "@/lib/lifemap-engine/validation";
import { generateLifemapReading } from "@/lib/lifemap-engine/engine";
import { getEnv } from "@/lib/server/env";
import { getUsageDay, incrementUsageDay } from "@/lib/server/usage";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const readings = await prisma.lifemapReading.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      inputName: true,
      birthDate: true,
      createdAt: true,
      visibility: true,
      shareToken: true,
    },
  });

  return NextResponse.json({ readings });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = lifemapInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const env = getEnv();
  const freeLimit = env.FREE_LIFEMAP_DAILY_LIMIT ?? 3;
  if (user.plan === "free" && freeLimit > 0) {
    const usage = await getUsageDay(user.id, new Date());
    if ((usage?.lifemapReads ?? 0) >= freeLimit) {
      return NextResponse.json(
        { error: "Daily limit reached. Upgrade to Pro for unlimited readings." },
        { status: 403 }
      );
    }
  }

  const birthDate = new Date(parsed.data.birthDate);
  const result = generateLifemapReading({
    inputName: parsed.data.inputName,
    birthDate,
    birthTime: parsed.data.birthTime,
    birthPlace: parsed.data.birthPlace,
    profileKey: user.id,
  });

  const shareToken = crypto.randomBytes(16).toString("hex");
  const reading = await prisma.lifemapReading.create({
    data: {
      userId: user.id,
      inputName: parsed.data.inputName,
      birthDate,
      birthTime: parsed.data.birthTime ?? null,
      birthPlace: parsed.data.birthPlace ?? null,
      result,
      visibility: "private",
      shareToken,
    },
    select: {
      id: true,
      shareToken: true,
      createdAt: true,
      result: true,
    },
  });

  await incrementUsageDay({ userId: user.id, day: new Date(), field: "lifemapReads" });

  return NextResponse.json({ reading });
}
