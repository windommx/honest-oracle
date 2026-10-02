// ============================================================
// คำตอบมาตรฐานของ route handler
// - 500: รายละเอียดเต็มลง log ฝั่ง server (JSON line + errorId) · client ได้ชื่องาน + errorId
//        (production ไม่ส่งข้อความภายใน เช่น query/เส้นทางไฟล์ ออกไป — ดูด้วย errorId ใน log แทน)
// - 400: บอกว่าช่องไหนผิด (จาก zod) เพื่อให้สคริปต์/ผู้ใช้แก้ได้เอง
// ============================================================

import { NextResponse } from "next/server"
import type { z } from "zod"
import { log } from "@/lib/log"

export function serverError(scope: string, e: unknown): NextResponse {
  const errorId = crypto.randomUUID().slice(0, 8)
  log.error(scope, { errorId, error: e instanceof Error ? e : String(e) })
  const body: Record<string, unknown> = { error: scope, errorId }
  if (process.env.NODE_ENV !== "production") body.detail = e instanceof Error ? e.message : String(e)
  return NextResponse.json(body, { status: 500 })
}

export function badRequest(message: string, issues?: Array<{ path: string; message: string }>): NextResponse {
  return NextResponse.json({ error: "bad_request", message, ...(issues ? { issues } : {}) }, { status: 400 })
}

export function notFound(message: string): NextResponse {
  return NextResponse.json({ error: "not_found", message }, { status: 404 })
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; res: NextResponse }

/** ตรวจค่าด้วย zod → 400 พร้อมรายการช่องที่ผิด */
export function validate<S extends z.ZodType>(schema: S, raw: unknown): Parsed<z.infer<S>> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const issues = parsed.error.issues.slice(0, 20).map((i) => ({ path: i.path.map(String).join(".") || "(body)", message: i.message }))
  return { ok: false, res: badRequest("ข้อมูลไม่ถูกต้อง", issues) }
}

/** อ่าน body JSON แล้วตรวจด้วย zod · body ว่างถือเป็น {} (endpoint ที่ทุกช่องไม่บังคับ) */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  let raw: unknown = {}
  const text = await req.text()
  if (text.trim()) {
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, res: badRequest("body ต้องเป็น JSON ที่ถูกต้อง") }
    }
  }
  return validate(schema, raw)
}

/** Prisma: ไม่พบแถวที่จะแก้/ลบ */
export function isNotFoundError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2025"
}
