"use client"

// ชิปสถานะการเข้าสู่ระบบบน header — บทบาท + ปุ่มออกจากระบบ
// โหมด local (ไม่ได้ตั้งรหัสผ่าน) หรือยังไม่เข้าสู่ระบบ = ไม่แสดงอะไรเลย

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, Loader2, LogOut, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

interface SessionInfo {
  mode: "auth" | "local"
  authenticated: boolean
  role: "admin" | "viewer" | null
  via: "session" | "token" | "local" | null
  exp: number | null
}

const PILL = "rounded-full px-3 py-1 text-xs font-semibold shadow-[0_1px_2px_rgba(120,90,20,0.06)]"

export default function SessionBadge() {
  const router = useRouter()
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetch("/api/auth/session", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<SessionInfo>) : null))
      .then((j) => {
        if (alive) setInfo(j)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  if (!info || info.mode !== "auth" || !info.authenticated || info.via !== "session") return null

  async function logout() {
    if (leaving) return
    setLeaving(true)
    try {
      await fetch("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
    } catch {}
    // cookie ถูกลบแล้ว — ออกจากหน้าแอป (state ของแท็บทั้งหมด unmount ไปด้วย)
    router.replace("/login")
    router.refresh()
  }

  const admin = info.role === "admin"
  const expires = info.exp ? new Date(info.exp * 1000).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : null

  return (
    <div className="flex items-center gap-1">
      <Badge
        variant="outline"
        title={expires ? `session หมดอายุ ${expires}` : undefined}
        className={
          admin
            ? `${PILL} gap-1.5 border-gold/45 bg-gold-soft text-gold-ink`
            : `${PILL} gap-1.5 border-neon-cyan/25 bg-neon-cyan/[0.07] text-neon-cyan`
        }
      >
        {admin ? <ShieldCheck className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        {admin ? "ผู้ดูแล" : "ผู้ชม · อ่านอย่างเดียว"}
      </Badge>
      <Button
        variant="ghost"
        size="icon"
        onClick={logout}
        disabled={leaving}
        aria-label="ออกจากระบบ"
        title="ออกจากระบบ"
        className="size-8 rounded-full text-muted-foreground hover:text-gold-ink"
      >
        {leaving ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
      </Button>
    </div>
  )
}
