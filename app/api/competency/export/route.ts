import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/server/session";
import { unauthorized } from "@/lib/server/competency";
import { computeDashboard } from "@/lib/competency/stats";
import { toNurseDTO } from "@/lib/competency/serialize";
import { buildOutcomeCsv, outcomeCsvFilename } from "@/lib/competency/csv";
import { toDateInputValue } from "@/lib/competency/format";

export const dynamic = "force-dynamic";

/** GET /api/competency/export — the OUTCOME table as UTF-8 CSV, in dashboard ranking order. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const nurses = await prisma.competencyNurse.findMany({
    where: { userId: user.id },
    include: { assessments: { orderBy: [{ assessDate: "desc" }, { createdAt: "desc" }] } },
  });

  const order = computeDashboard(nurses).ranking.map((r) => r.nurseId);
  const byId = new Map(nurses.map((n) => [n.id, toNurseDTO(n)]));
  const rows = order.map((id) => byId.get(id)!).filter(Boolean);

  // The engine is clock-free by design; the route stamps today's date on the file name.
  const filename = outcomeCsvFilename(toDateInputValue(new Date()));
  return new Response(buildOutcomeCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
