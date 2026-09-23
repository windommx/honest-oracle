"use client"

// ฟอร์มรหัสผ่าน — POST /api/auth/login (JSON เท่านั้น ตามกติกา CSRF ของ proxy) แล้วไปหน้าที่ขอไว้ (?next=)

import { useState, type FormEvent } from "react"
import { Eye, EyeOff, Loader2, LogIn, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginForm({ next }: { next: string }) {
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy || !password) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, next }),
      })
      const j = (await r.json().catch(() => null)) as { ok?: boolean; next?: string; error?: string } | null
      if (!r.ok || !j?.ok) {
        setError(j?.error ?? `เข้าสู่ระบบไม่สำเร็จ (HTTP ${r.status})`)
        setPassword("")
        return
      }
      // โหลดหน้าใหม่ทั้งหน้า — ให้ทุกคำขอถัดไปแนบ cookie ที่เพิ่งได้
      window.location.assign(j.next || "/")
    } catch {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ลองใหม่อีกครั้ง")
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "login-error" : undefined}
            className="h-11 rounded-xl border-input bg-card pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-muted-foreground hover:text-gold-ink"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>

      {error && (
        <p
          id="login-error"
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy || !password} className="h-11 w-full rounded-xl text-base font-bold">
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
        {busy ? "กำลังตรวจสอบ…" : "เข้าสู่ระบบ"}
      </Button>
    </form>
  )
}
