import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
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


/** Answer "who is this visitor?" while keeping two different truths apart:
 *
 *  - `user: null`            — the server WORKS and this visitor has no session → 401.
 *  - `unavailable: Response` — the server CANNOT answer the question at all
 *                              (NEXTAUTH_SECRET missing, database unreachable) → 503.
 *
 *  Before this, both collapsed into an unhandled throw → a bare 500 with no body.
 *  Worse than ugly, it was untruthful in the way that matters for a self-hosted
 *  product: a misconfigured server must tell its OPERATOR what is missing, not
 *  send its USERS to a login page that cannot possibly work. The detail names the
 *  missing configuration (a variable NAME, never a value).
 */
export async function getAuth(): Promise<
  | { user: Awaited<ReturnType<typeof requireUser>>; unavailable: null }
  | { user: null; unavailable: NextResponse }
> {
  try {
    return { user: await requireUser(), unavailable: null };
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    // next-auth WRAPS its config errors before throwing: the caller sees the generic
    // "There is a problem with the server configuration..." (the NO_SECRET detail goes
    // only to the server log). Classify on the wrapper too, or a missing secret gets
    // blamed on the database — verified against the real thrown error, not the log line.
    const hint = /secret|server configuration/i.test(msg)
      ? "auth ยังตั้งค่าไม่ครบ เช่น NEXTAUTH_SECRET — ดูรายละเอียดใน server log"
      : "database unreachable — check DATABASE_URL";
    return {
      user: null,
      unavailable: NextResponse.json(
        {
          error: "server_not_configured",
          detail: `เซิร์ฟเวอร์ยังตั้งค่าไม่เสร็จ (${hint}) — ดูตัวแปรที่ต้องตั้งใน .env.example`,
        },
        { status: 503 },
      ),
    };
  }
}
