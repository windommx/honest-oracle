// ============================================================
// Health report — ข้อมูลของ GET /api/health (uptime monitor / Docker HEALTHCHECK / load balancer)
// หลักการ:
// - เร็ว: query นับ/ค่าสูงสุดเท่านั้น (demo 124,800 แถว ≈ 20 ms) · ทุก query มี timeout
// - ไม่มีความลับ: ไม่มี path ของ DB, env, token หรือข้อความ error ดิบ (ข้อความเต็มลง log ของ server เท่านั้น)
// - HTTP 200 = ให้บริการได้ (DB เปิดได้ + schema อ่านได้) แม้ยังไม่มีข้อมูล/ข้อมูลเก่า → status "degraded"
// - HTTP 503 = DB เปิดไม่ได้ / ไม่มีตาราง / ช้าเกิน timeout → status "down"
// ============================================================

import { promises as fs } from "node:fs"
import { db } from "@/lib/db"
import { GTAA_PANEL_PATH } from "@/lib/gtaa/data"
import { bangkokDate, missingWeekdays, SET_MAX_HOLIDAY_RUN } from "@/lib/momentum/core"
import pkg from "../../../../package.json"

/** เพดานเวลาของแต่ละ query — เกินนี้ถือว่า DB ใช้งานไม่ได้ (monitor ส่วนใหญ่ timeout ที่ 5–10 วินาที) */
export const HEALTH_DB_TIMEOUT_MS = 2500

export interface HealthCheck {
  name: "db" | "schema" | "data" | "gtaa_panel"
  ok: boolean
  /** critical = ล้มแล้วตอบ 503 · ไม่ critical = แค่ status "degraded" */
  critical: boolean
  detail: string
}

export interface HealthReport {
  ok: boolean
  status: "ok" | "degraded" | "down"
  version: string
  /** commit ที่ build (ตั้งผ่าน env TMP_GIT_SHA ตอน build image) — null ถ้าไม่ได้ตั้ง */
  commit: string | null
  uptimeSec: number
  time: string
  db: { ok: boolean; latencyMs: number | null; error: string | null }
  data: {
    rawRows: number | null
    latestDate: string | null
    /** วันนี้ตามปฏิทินกรุงเทพ (YYYY-MM-DD) */
    today: string
    /** จำนวนวันปฏิทินจาก latestDate ถึงวันนี้ (กรุงเทพ) */
    ageDays: number | null
    /** วันทำการ (จ.–ศ.) หลัง latestDate ก่อนวันนี้ที่ยังไม่มีข้อมูล — ไม่นับเสาร์–อาทิตย์และวันนี้ (ข้อมูลวันนี้เข้าหลังตลาดปิด) */
    weekdaysBehind: number | null
    /** weekdaysBehind > SET_MAX_HOLIDAY_RUN (4) หรือยังไม่มีข้อมูลเลย */
    stale: boolean
    /** เวลาที่ ingest ล่าสุด (EventLog kind=ingest) — null ถ้ายังไม่เคย ingest (เช่น demo seed) */
    lastIngestAt: string | null
  }
  checks: HealthCheck[]
  tookMs: number
}

export interface Freshness {
  ageDays: number | null
  weekdaysBehind: number | null
  stale: boolean
}

/**
 * ความสดของข้อมูลตลาด (pure) — latestDate/today เป็น YYYY-MM-DD ตามปฏิทินกรุงเทพ
 * stale เมื่อขาดเกิน SET_MAX_HOLIDAY_RUN วันทำการ (ช่วงหยุดยาวสุดปกติของ SET เช่นสงกรานต์) — เสาร์–อาทิตย์ไม่นับ
 */
export function dataFreshness(latestDate: string | null, today: string): Freshness {
  if (!latestDate) return { ageDays: null, weekdaysBehind: null, stale: true }
  const t1 = Date.parse(`${latestDate}T00:00:00Z`)
  const t2 = Date.parse(`${today}T00:00:00Z`)
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return { ageDays: null, weekdaysBehind: null, stale: true }
  const ageDays = Math.round((t2 - t1) / 86_400_000)
  const weekdaysBehind = ageDays <= 1 ? 0 : missingWeekdays(latestDate, today)
  return { ageDays, weekdaysBehind, stale: weekdaysBehind > SET_MAX_HOLIDAY_RUN }
}

class HealthTimeoutError extends Error {
  constructor(what: string) {
    super(`${what} เกิน ${HEALTH_DB_TIMEOUT_MS} ms`)
    this.name = "HealthTimeoutError"
  }
}

/**
 * timeout ที่ไม่หลอกเมื่อ event loop ถูกบล็อก: คำขอแรกหลังข้อมูลเปลี่ยนของรายงานหนัก (importance ≈ 6 วินาที) บล็อก JS thread
 * → timer ตื่นช้ากว่ากำหนด ทั้งที่ DB ตอบเสร็จแล้ว — ถ้าตื่นช้าเกิน 250 ms ให้เวลาอีกหนึ่งรอบ (ครั้งเดียว)
 * และเลื่อนการ reject ไปหลัง I/O ที่ค้างในรอบเดียวกัน (setImmediate) ให้ผล query ที่มาถึงพร้อมกันชนะ
 */
async function withTimeout<T>(p: Promise<T>, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    const arm = (retried: boolean) => {
      const due = Date.now() + HEALTH_DB_TIMEOUT_MS
      timer = setTimeout(() => {
        if (!retried && Date.now() - due > 250) return arm(true)
        setImmediate(() => reject(new HealthTimeoutError(what)))
      }, HEALTH_DB_TIMEOUT_MS)
    }
    arm(false)
  })
  try {
    return await Promise.race([p, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** ชื่อชนิด error + รหัส Prisma (ถ้ามี) — ไม่มีข้อความดิบที่อาจมี path/URL ของ DB */
function publicError(e: unknown): string {
  const err = e as { name?: unknown; code?: unknown; errorCode?: unknown }
  const name = typeof err?.name === "string" ? err.name : "Error"
  const code = typeof err?.code === "string" ? err.code : typeof err?.errorCode === "string" ? err.errorCode : ""
  return code ? `${name} (${code})` : name
}

const round1 = (x: number) => Math.round(x * 10) / 10

/** รวบรวมสุขภาพระบบ — ไม่ throw (ทุกความล้มเหลวกลายเป็น check ที่ไม่ผ่าน) */
export async function collectHealth(now: Date = new Date()): Promise<{ httpStatus: 200 | 503; report: HealthReport }> {
  const t0 = performance.now()
  const today = bangkokDate(now)
  const checks: HealthCheck[] = []

  // 1) DB เปิดได้/ตอบได้
  let dbOk = false
  let latencyMs: number | null = null
  let dbError: string | null = null
  try {
    const t = performance.now()
    await withTimeout(db.$queryRaw`SELECT 1`, "SELECT 1")
    latencyMs = round1(performance.now() - t)
    dbOk = true
    checks.push({ name: "db", ok: true, critical: true, detail: `SELECT 1 ใน ${latencyMs} ms` })
  } catch (e) {
    dbError = publicError(e)
    console.error("[health] db ping failed:", (e as Error)?.message ?? e)
    checks.push({ name: "db", ok: false, critical: true, detail: `เชื่อมต่อฐานข้อมูลไม่ได้ — ${dbError}` })
  }

  // 2) schema อ่านได้ + ข้อมูลตลาดล่าสุด
  let rawRows: number | null = null
  let latestDate: string | null = null
  let lastIngestAt: string | null = null
  if (dbOk) {
    try {
      const [agg, lastIngest] = await withTimeout(
        Promise.all([
          db.rawDaily.aggregate({ _count: { _all: true }, _max: { date: true } }),
          db.eventLog.findFirst({ where: { kind: "ingest" }, orderBy: { id: "desc" }, select: { ts: true } }),
        ]),
        "อ่านตาราง RawDaily/EventLog"
      )
      rawRows = agg._count._all
      latestDate = agg._max.date ?? null
      lastIngestAt = lastIngest?.ts ? lastIngest.ts.toISOString() : null
      checks.push({ name: "schema", ok: true, critical: true, detail: `RawDaily ${rawRows.toLocaleString("en-US")} แถว` })
    } catch (e) {
      dbError = publicError(e)
      console.error("[health] schema check failed:", (e as Error)?.message ?? e)
      checks.push({
        name: "schema",
        ok: false,
        critical: true,
        detail: `อ่านตาราง RawDaily/EventLog ไม่ได้ (schema ไม่ตรง? รัน prisma db push) — ${dbError}`,
      })
    }
  }

  // 3) ความสดของข้อมูล (ไม่ critical — ข้อมูลเก่า/ว่างยังให้บริการได้ แต่ต้องมีคนดู)
  const fresh = dataFreshness(latestDate, today)
  const schemaOk = checks.some((c) => c.name === "schema" && c.ok)
  if (schemaOk) {
    let detail: string
    let ok = !fresh.stale
    if (latestDate === null) {
      detail = "ยังไม่มีข้อมูลตลาด — seed หรือ ingest ก่อน (แท็บข้อมูล / bun run fetch:th)"
    } else if ((fresh.ageDays ?? 0) < 0) {
      ok = false
      detail = `วันที่ล่าสุด ${latestDate} อยู่หลังวันนี้ (${today}) — ตรวจรูปแบบวันที่ของ feed/CSV`
    } else {
      detail = `ล่าสุด ${latestDate} · ${fresh.ageDays} วันปฏิทิน · ขาด ${fresh.weekdaysBehind} วันทำการ (เกณฑ์ stale > ${SET_MAX_HOLIDAY_RUN})`
    }
    checks.push({ name: "data", ok, critical: false, detail })
  }

  // 4) ไฟล์ panel ของ GTAA (ไม่มี → GTAA ใช้ข้อมูลสังเคราะห์)
  try {
    const st = await fs.stat(GTAA_PANEL_PATH)
    checks.push({
      name: "gtaa_panel",
      ok: st.size > 0,
      critical: false,
      detail: st.size > 0 ? `data/gtaa/panel.json ${Math.round(st.size / 1024)} KB` : "data/gtaa/panel.json ว่างเปล่า",
    })
  } catch {
    checks.push({ name: "gtaa_panel", ok: false, critical: false, detail: "ไม่พบ data/gtaa/panel.json — GTAA ใช้ข้อมูลสังเคราะห์" })
  }

  const down = checks.some((c) => c.critical && !c.ok) || !dbOk
  const degraded = checks.some((c) => !c.ok)
  const report: HealthReport = {
    ok: !down,
    status: down ? "down" : degraded ? "degraded" : "ok",
    version: pkg.version,
    commit: process.env.TMP_GIT_SHA?.trim().slice(0, 40) || null,
    uptimeSec: Math.round(process.uptime()),
    time: now.toISOString(),
    db: { ok: dbOk && schemaOk, latencyMs, error: dbError },
    data: {
      rawRows,
      latestDate,
      today,
      ageDays: fresh.ageDays,
      weekdaysBehind: fresh.weekdaysBehind,
      stale: fresh.stale,
      lastIngestAt,
    },
    checks,
    tookMs: round1(performance.now() - t0),
  }
  return { httpStatus: down ? 503 : 200, report }
}
