import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/session";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, oracleReadings, apiKeys, plans] = await Promise.all([
    prisma.user.count(),
    prisma.oracleReading.count(),
    prisma.apiKey.count({ where: { revokedAt: null } }),
    prisma.user.groupBy({
      by: ["plan"],
      _count: { plan: true },
      orderBy: { _count: { plan: "desc" } },
    }),
  ]);

  return NextResponse.json({
    users,
    oracleReadings,
    activeApiKeys: apiKeys,
    plans: plans.map((p) => ({ plan: p.plan, count: p._count.plan })),
  });
}

