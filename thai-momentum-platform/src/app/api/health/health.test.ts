/// <reference types="bun-types" />
// bun test — GET /api/health: ตรรกะความสดของข้อมูล (pure) + route จริงบน SQLite ชั่วคราวใน subprocess
// (DB ว่าง → 200 + null, มีข้อมูล → latestDate/ageDays, DB เปิดไม่ได้/ไม่มีตาราง → 503 ไม่หลุด path ของ DB)
import { afterAll, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"
import { dataFreshness } from "./health"

const dir = mkdtempSync(path.join(tmpdir(), "health-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

interface HarnessOut {
  status: number
  cacheControl: string | null
  raw: string
  body: any
  coldMs: number
  warmMs: number
}

function run(name: string, opts: { scenario?: string; dbUrl?: string; schema?: boolean; env?: Record<string, string> } = {}): HarnessOut {
  const cwd = path.join(dir, name)
  mkdirSync(cwd, { recursive: true })
  let dbUrl = opts.dbUrl
  if (!dbUrl) {
    const file = path.join(cwd, "test.db")
    if (opts.schema === false) writeFileSync(file, "") // ไฟล์ SQLite ว่าง ไม่มีตาราง
    else createSchemaDb(file)
    dbUrl = `file:${file}`
  }
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "health.harness.ts"), opts.scenario ?? "raw"], {
    cwd,
    env: { ...process.env, DATABASE_URL: dbUrl, NODE_ENV: "test", TMP_GIT_SHA: "", ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  })
  if (proc.exitCode !== 0) throw new Error(`health harness ${name} failed: ${proc.stderr.toString().slice(-2000)}`)
  // หาบรรทัดผลที่มี marker — log ของ Prisma (prisma:error) อาจตามมาทีหลังแบบ async
  const line = proc.stdout.toString().split("\n").find((l) => l.startsWith("HARNESS_RESULT "))
  if (!line) throw new Error(`health harness ${name}: ไม่พบบรรทัดผล\n${proc.stdout.toString().slice(-1500)}`)
  return JSON.parse(line.slice("HARNESS_RESULT ".length)) as HarnessOut
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

describe("dataFreshness — นับวันทำการที่ขาด (ไม่นับเสาร์–อาทิตย์และวันนี้)", () => {
  it("ยังไม่มีข้อมูล = stale และค่าเป็น null", () => {
    expect(dataFreshness(null, "2026-09-23")).toEqual({ ageDays: null, weekdaysBehind: null, stale: true })
  })

  it("ศุกร์ → จันทร์ = 3 วันปฏิทินแต่ไม่ขาดวันทำการ", () => {
    expect(dataFreshness("2026-09-18", "2026-09-21")).toEqual({ ageDays: 3, weekdaysBehind: 0, stale: false })
  })

  it("ข้อมูลของเมื่อวาน/วันนี้ = สด", () => {
    expect(dataFreshness("2026-09-22", "2026-09-23")).toEqual({ ageDays: 1, weekdaysBehind: 0, stale: false })
    expect(dataFreshness("2026-09-23", "2026-09-23")).toEqual({ ageDays: 0, weekdaysBehind: 0, stale: false })
  })

  it("ขาด 4 วันทำการ (เท่าหยุดยาวสงกรานต์) ยังไม่ stale · 5 วันทำการ = stale", () => {
    expect(dataFreshness("2026-04-10", "2026-04-17")).toMatchObject({ ageDays: 7, weekdaysBehind: 4, stale: false })
    expect(dataFreshness("2026-09-11", "2026-09-21")).toMatchObject({ ageDays: 10, weekdaysBehind: 5, stale: true })
  })

  it("วันที่ล่าสุดอยู่ในอนาคต → ageDays ติดลบ ไม่นับเป็นวันขาด", () => {
    expect(dataFreshness("2026-09-25", "2026-09-23")).toEqual({ ageDays: -2, weekdaysBehind: 0, stale: false })
  })

  it("สตริงวันที่เสีย = stale (ไม่ throw)", () => {
    expect(dataFreshness("not-a-date", "2026-09-23")).toEqual({ ageDays: null, weekdaysBehind: null, stale: true })
  })
})

describe("GET /api/health บน SQLite จริง", () => {
  it("DB ว่าง (schema ครบ ไม่มีแถว) → 200 ok:true, latestDate/ageDays = null, status degraded", () => {
    const r = run("empty")
    expect(r.status).toBe(200)
    expect(r.cacheControl).toContain("no-store")
    expect(r.body.ok).toBe(true)
    expect(r.body.status).toBe("degraded")
    expect(r.body.db.ok).toBe(true)
    expect(typeof r.body.db.latencyMs).toBe("number")
    expect(r.body.data).toMatchObject({ rawRows: 0, latestDate: null, ageDays: null, weekdaysBehind: null, stale: true, lastIngestAt: null })
    expect(r.body.checks.find((c: { name: string }) => c.name === "data")?.ok).toBe(false)
    expect(typeof r.body.version).toBe("string")
    expect(r.body.commit).toBeNull()
    expect(Number.isInteger(r.body.uptimeSec)).toBe(true)
  })

  it("มีข้อมูล → latestDate/ageDays/weekdaysBehind ตามปฏิทินกรุงเทพ + เวลา ingest ล่าสุด, status ok", () => {
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
    const latest = new Date(Date.parse(`${today}T00:00:00Z`) - 3 * 86_400_000).toISOString().slice(0, 10)
    const name = "populated"
    mkdirSync(path.join(dir, name, "data", "gtaa"), { recursive: true })
    writeFileSync(path.join(dir, name, "data", "gtaa", "panel.json"), JSON.stringify({ dates: ["2026-08"] }))
    const r = run(name, { scenario: "populated", env: { HEALTH_TEST_LATEST: latest, TMP_GIT_SHA: "abc1234" } })
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.data.rawRows).toBe(9)
    expect(r.body.data.latestDate).toBe(latest)
    expect(r.body.data.ageDays).toBe(daysBetween(latest, r.body.data.today))
    expect(r.body.data.weekdaysBehind).toBe(dataFreshness(latest, r.body.data.today).weekdaysBehind)
    expect(r.body.data.stale).toBe(false)
    expect(typeof r.body.data.lastIngestAt).toBe("string")
    expect(r.body.status).toBe("ok")
    expect(r.body.commit).toBe("abc1234")
    expect(r.body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true)
  })

  it("เร็ว: เรียกซ้ำ (warm) < 100 ms", () => {
    const r = run("timing")
    expect(r.warmMs).toBeLessThan(100)
    expect(r.body.tookMs).toBeLessThan(1000)
  })

  it("event loop ถูกบล็อกเกิน timeout (รายงานหนักคำนวณครั้งแรก) → ยังตอบ 200 ไม่ใช่ timeout ปลอม", () => {
    const r = run("blocked", { scenario: "blocked" })
    expect(r.status).toBe(200)
    expect(r.body.db.ok).toBe(true)
    expect(r.coldMs).toBeGreaterThan(2500)
  })

  it("DB เปิดไม่ได้ → 503 status down และไม่มี path ของ DB ใน body", () => {
    const missing = path.join(dir, "no-such-dir", "nested", "app.db")
    const r = run("unreachable", { dbUrl: `file:${missing}` })
    expect(r.status).toBe(503)
    expect(r.body.ok).toBe(false)
    expect(r.body.status).toBe("down")
    expect(r.body.db.ok).toBe(false)
    expect(r.body.data.latestDate).toBeNull()
    expect(r.raw).not.toContain("no-such-dir")
    expect(r.raw).not.toContain(dir)
  })

  it("ไฟล์ DB ไม่มีตาราง (ยังไม่ได้ db push) → 503", () => {
    const r = run("noschema", { schema: false })
    expect(r.status).toBe(503)
    expect(r.body.ok).toBe(false)
    expect(r.body.checks.find((c: { name: string }) => c.name === "schema")?.ok).toBe(false)
    expect(r.raw).not.toContain(dir)
  })
})
