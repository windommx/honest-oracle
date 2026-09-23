import type { Metadata } from "next"
import Link from "next/link"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { BrainCircuit, Laptop, ShieldCheck } from "lucide-react"
import { getSecurityConfig } from "@/lib/security/config"
import { safeNextPath } from "@/lib/security/paths"
import { SESSION_COOKIE, verifySession } from "@/lib/security/session"
import LoginForm from "./login-form"

// หน้าเข้าสู่ระบบ — อ่าน env ทุกคำขอ (โหมด auth/local เปลี่ยนได้โดยไม่ต้อง build ใหม่)
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ — Thai Momentum Platform",
  robots: { index: false, follow: false },
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined)
  const cfg = getSecurityConfig()
  if (cfg.mode === "auth") {
    const token = (await cookies()).get(SESSION_COOKIE)?.value
    if (verifySession(token, cfg)) redirect(next) // เข้าสู่ระบบอยู่แล้ว
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <section className="hero-card px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_32%_26%,#fff4c7_0%,#ecc96b_36%,#c9a227_68%,#9a7412_100%)] text-[#3b2a06] shadow-[0_4px_12px_-4px_rgba(154,116,18,0.65),inset_0_1px_0_rgba(255,255,255,0.65)] ring-1 ring-[#b8912f]/45">
              <BrainCircuit className="h-5 w-5" aria-hidden />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="gold-kicker">Thai Momentum Platform</p>
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">
                {cfg.mode === "auth" ? "เข้าสู่ระบบ" : "โหมดเครื่องตัวเอง"}
              </h1>
            </div>
          </div>

          {cfg.mode === "auth" ? (
            <>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                แพลตฟอร์มนี้ป้องกันด้วยรหัสผ่าน — ใส่รหัสผู้ดูแลเพื่อใช้งานเต็ม
                {cfg.viewerPassword ? " หรือรหัสผู้ชมเพื่อดูแบบอ่านอย่างเดียว" : ""}
              </p>
              <LoginForm next={next} />
            </>
          ) : (
            <div className="mt-5 space-y-3 text-sm leading-relaxed">
              <p className="flex items-start gap-2 rounded-xl border border-gold/45 bg-gold-soft px-3 py-2.5 text-foreground">
                <Laptop className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  ยังไม่ได้ตั้งรหัสผ่าน (TMP_AUTH_PASSWORD) — ใช้งานได้เฉพาะบนเครื่องที่รันเซิร์ฟเวอร์ ไม่ต้องเข้าสู่ระบบ
                </span>
              </p>
              <p className="text-muted-foreground">
                ต้องการเปิดจากเครื่องอื่น: ตั้ง <code className="rounded bg-muted px-1">TMP_AUTH_PASSWORD</code> และ{" "}
                <code className="rounded bg-muted px-1">TMP_AUTH_SECRET</code> ในไฟล์ .env แล้วรีสตาร์ต (ดู .env.example)
              </p>
              <Link href="/" className="pill-action w-full justify-center">
                ไปที่แพลตฟอร์ม
              </Link>
            </div>
          )}
        </section>

        <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3.5 align-[-2px] text-gold-ink" aria-hidden />
          โหมดกระดาษ 100% · ไม่ใช่คำแนะนำการลงทุน ·{" "}
          <Link href="/terms" className="whitespace-nowrap font-semibold text-gold-ink underline-offset-4 hover:underline">
            ข้อกำหนดและการเปิดเผยความเสี่ยง
          </Link>
        </p>
      </div>
    </main>
  )
}
