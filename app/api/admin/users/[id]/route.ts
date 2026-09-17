import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/session";

const schema = z.object({
  // "premium" unlocks the public Oracle API; "team" is the ฿1,890 StageLab
  // tier. Both are sold, and neither could be assigned: the enum accepted
  // "premium" (which stagePlan() did not recognise, so a premium customer
  // silently got Free StageLab limits) and rejected "team" outright.
  plan: z.enum(["free", "pro", "premium", "team"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: context.params.id },
    data: parsed.data,
    select: { id: true, email: true, name: true, plan: true, role: true },
  });

  return NextResponse.json({ user: updated });
}

