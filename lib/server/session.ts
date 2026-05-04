import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? (session.user as { id: string }).id : null;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, plan: true, role: true },
  });
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user) return null;
  if (user.role !== "admin") return null;
  return user;
}

