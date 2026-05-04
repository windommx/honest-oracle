import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { oracleInputSchema } from "@/lib/honest-oracle/validation";
import { hashApiKey } from "@/lib/server/apiKey";
import { generateOracleReading } from "@/lib/honest-oracle/engine";
import { getEnv } from "@/lib/server/env";
import { getUsageDay, incrementUsageDay } from "@/lib/server/usage";

export async function POST(request: NextRequest) {
  const rawKey = request.headers.get("x-api-key")?.trim();
  if (!rawKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 401 });
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash, revokedAt: null },
    select: { id: true, userId: true },
  });

  if (!apiKey) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: apiKey.userId },
    select: { id: true, plan: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  if (user.plan !== "premium") {
    return NextResponse.json(
      { error: "API access requires Premium plan" },
      { status: 403 }
    );
  }

  const env = getEnv();
  const freeLimit = env.FREE_API_DAILY_LIMIT ?? 1000;
  if (freeLimit > 0) {
    const usage = await getUsageDay(user.id, new Date());
    if ((usage?.apiCalls ?? 0) >= freeLimit) {
      return NextResponse.json(
        { error: "Daily API limit reached" },
        { status: 429 }
      );
    }
  }

  const json = await request.json().catch(() => null);
  const parsed = oracleInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const birthDate = new Date(parsed.data.birthDate);
  const result = generateOracleReading({
    inputName: parsed.data.inputName,
    birthDate,
    birthTime: parsed.data.birthTime,
    birthPlace: parsed.data.birthPlace,
    profileKey: user.id,
  });

  const shareToken = crypto.randomBytes(16).toString("hex");
  const reading = await prisma.oracleReading.create({
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
    select: { id: true, createdAt: true },
  });

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date() },
  });
  await incrementUsageDay({ userId: user.id, day: new Date(), field: "apiCalls" });

  return NextResponse.json({ readingId: reading.id, result });
}
