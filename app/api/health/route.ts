import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  GET /api/health                                                         ║
// ║                                                                          ║
// ║  What a load balancer, an uptime monitor, and a deploy pipeline all ask  ║
// ║  before they send traffic here. It answers the only question that        ║
// ║  matters — can this instance actually serve a request — which means      ║
// ║  reaching the database, because every meaningful route does.             ║
// ║                                                                          ║
// ║  A health check that only proves the process is running is worse than    ║
// ║  none: it keeps a broken instance in the rotation and makes the graph    ║
// ║  green while users get 500s.                                             ║
// ║                                                                          ║
// ║  Three rules it follows:                                                 ║
// ║   · It is unauthenticated, because a monitor has no session.             ║
// ║   · It never returns the cause of a failure. "degraded" plus a duration  ║
// ║     is all an unauthenticated caller gets; the detail goes to the log.   ║
// ║   · It times out. A health check that hangs when the database hangs      ║
// ║     turns one slow dependency into an outage, because the orchestrator   ║
// ║     is left waiting instead of being told to route elsewhere.            ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const DB_TIMEOUT_MS = 2_500;

type CheckState = "ok" | "degraded";

async function checkDatabase(): Promise<{ state: CheckState; ms: number }> {
  const started = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("database check timed out")), DB_TIMEOUT_MS),
      ),
    ]);
    return { state: "ok", ms: Date.now() - started };
  } catch (cause) {
    console.error(
      JSON.stringify({
        level: "error",
        module: "health",
        check: "database",
        message: cause instanceof Error ? cause.message : String(cause),
      }),
    );
    return { state: "degraded", ms: Date.now() - started };
  }
}

export async function GET() {
  const database = await checkDatabase();
  const healthy = database.state === "ok";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      // Surfaced so a deploy can confirm the new build is the one answering.
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "unknown",
      checks: { database },
      at: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        // A cached health check is a lie with a TTL.
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
