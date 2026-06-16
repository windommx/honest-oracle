import { prisma } from "@/lib/prisma";

export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

type UsageField = "oracleReads" | "apiCalls" | "bookChapters";

export async function getUsageDay(userId: string, day: Date) {
  const normalized = utcDay(day);
  return prisma.usageDay.findUnique({
    where: { userId_day: { userId, day: normalized } },
  });
}

export async function incrementUsageDay(params: {
  userId: string;
  day: Date;
  field: UsageField;
  by?: number;
}) {
  const by = params.by ?? 1;
  const normalized = utcDay(params.day);
  const update: Record<string, unknown> = {
    [params.field]: { increment: by },
  };

  return prisma.usageDay.upsert({
    where: { userId_day: { userId: params.userId, day: normalized } },
    create: {
      userId: params.userId,
      day: normalized,
      oracleReads: params.field === "oracleReads" ? by : 0,
      apiCalls: params.field === "apiCalls" ? by : 0,
      bookChapters: params.field === "bookChapters" ? by : 0,
    },
    update: update as any,
  });
}
