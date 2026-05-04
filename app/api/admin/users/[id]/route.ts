import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/server/session";

const schema = z.object({
  plan: z.enum(["free", "pro", "premium"]).optional(),
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

