import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/session";
import { getEnv } from "@/lib/server/env";
import { getUsageDay } from "@/lib/server/usage";

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const usage = await getUsageDay(user.id, new Date());
  const env = getEnv();

  return NextResponse.json({
    plan: user.plan,
    role: user.role,
    limits: {
      lifemapDaily: user.plan === "free" ? env.FREE_LIFEMAP_DAILY_LIMIT ?? 3 : null,
      apiDaily: user.plan === "premium" ? env.FREE_API_DAILY_LIMIT ?? 1000 : null,
    },
    today: {
      lifemapReads: usage?.lifemapReads ?? 0,
      apiCalls: usage?.apiCalls ?? 0,
    },
  });
}
