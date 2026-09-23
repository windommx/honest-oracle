/// <reference types="bun-types" />
// bun test — core กับ SQLite จริง (ingest / backfill / DQ / routes / seed)
// แต่ละชุดรันใน subprocess ที่ตั้ง DATABASE_URL ชี้ไฟล์ชั่วคราวของตัวเอง: bun test ใช้ module registry ร่วมกันทุกไฟล์
// การสลับ DATABASE_URL ใน process เดียวกันอาจได้ Prisma client ที่ไฟล์อื่นสร้างไว้ (ชี้ db/custom.db) — ไม่เสี่ยง
import { afterAll, describe, expect, it } from "bun:test"
import { createSchemaDb } from "@/test/schema-db"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"


const dir = mkdtempSync(path.join(tmpdir(), "core-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(scenario: string, tz = "UTC"): any {
  const file = path.join(dir, `${scenario}.db`)
  createSchemaDb(file) // schema จริงจาก prisma/schema.prisma (src/test/schema-db.ts)
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "core.db-harness.ts"), scenario], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, TZ: tz, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`harness ${scenario} failed: ${proc.stderr.toString().slice(-2000)}`)
  return JSON.parse(out)
}

describe("ingestRows / DQ บน SQLite จริง", () => {
  const r = run("ingest", "America/Los_Angeles")

  it("DB ว่าง: DQ ไม่มีรายการตรวจ (ไม่ใช่ 'ผ่านทั้งหมด' ที่ไม่มีข้อมูลรองรับ)", () => {
    expect(r.emptyDq).toEqual({ flags: [], checks: [] })
  })

  it("backfill ประวัติเก่า → โผของวันถัดไปที่ retN เปลี่ยนถูกสร้างใหม่ด้วย (เดิมค้างค่าเก่า)", () => {
    expect(r.backfill.stale).toBe(0)
    expect(r.backfill.wrongRet).toBe(0)
    expect(r.backfill.snapDates).toBeGreaterThan(25) // มากกว่าวันที่ในไฟล์ backfill
  })

  it("แก้ราคาปิดย้อนหลัง 1 จุด → โผทุกวันที่กระทบตรงกับ RawDaily", () => {
    expect(r.correction.stale).toBe(0)
    expect(r.correction.wrongRet).toBe(0)
    expect(r.correction.snapDates).toBeGreaterThan(1)
  })

  it("นำเข้าชุดเดิมซ้ำ = ไม่มีแถว indicator เปลี่ยน ไม่มีแถวเพิ่ม", () => {
    expect(r.idempotent).toEqual({ updatedRows: 0, snapSame: true, rawCount: 30 * 90 })
  })

  it("OHLC: close-only ไม่ลบ OHLC เดิม, ค่าใหม่ทับเฉพาะช่องที่ส่งมา", () => {
    expect(r.ohlc.closeOnly).toMatchObject({ close: 20.5, open: 19, high: 21, low: 18.5 })
    expect(r.ohlc.newOpen).toMatchObject({ close: 20.5, open: 19.9, high: 21, low: 18.5 })
  })

  it("closePivot cache เห็นการเขียนจาก process อื่นที่ตรา data_version (จำนวนแถว/วันล่าสุดเท่าเดิม)", () => {
    expect(r.fingerprint.after).toBeCloseTo(r.fingerprint.expected, 6)
  })

  it("DQ: สงกรานต์ 3 วันทำการไม่ถูกนับเป็นช่องว่าง แต่แจ้งไว้ในรายละเอียด", () => {
    const gap = r.dq.checks.find((c: { name: string }) => c.name === "ช่องว่างวันที่")
    expect(gap.ok).toBe(true)
    expect(gap.detail).toContain("2026-04-10→2026-04-16")
  })
})

describe("routes ของ data slice", () => {
  const r = run("routes", "Asia/Bangkok")

  it("POST /api/ingest: body null / CSV ผิดรูปแบบ = 400 (เดิม 500)", () => {
    expect(r.csvNull).toBe(400)
    expect(r.csvBad).toBe(400)
  })

  it("POST /api/ingest: TSV วางจาก Excel + วันที่ พ.ศ. + ตัวคั่นหลักพัน", () => {
    expect(r.csvTsv.status).toBe(200)
    expect(r.csvTsv.dates[0]).toEqual({ date: "2026-06-01", val: 5_000_000 })
  })

  it("GET /api/dates: ใหม่ → เก่า และ count = จำนวนวันทั้งหมด", () => {
    expect(r.dates.first).toBe(r.dates.latest)
    expect(r.dates.count).toBe(r.dates.len)
  })

  it("POST /api/feed/ingest: sectors ผิดชนิด/แถว null ไม่ล้ม, val null ใช้ volume, replaceDemo ล้าง CrossAsset สังเคราะห์", () => {
    expect(r.feedReplace.status).toBe(200)
    expect(r.feedReplace.crossLeft).toBe(0)
    expect(r.feedReplace.val).toBe(150 * 100000)
    expect(r.feedReplace.body.notes.join(" ")).toContain("CrossAsset")
    expect(r.feedKeepReal).toEqual({ status: 200, crossLeft: 1 })
    expect(r.feedEmpty).toBe(400)
  })
})

describe("seedDemoData", () => {
  const r = run("seed", "Asia/Jerusalem") // TZ ที่เปลี่ยน DST วันศุกร์ — วันทำการต้องไม่หาย

  it("วันที่ = วันทำการต่อเนื่อง ไม่ซ้ำ จบที่วันนี้ของตลาดไทย, days ปัดเป็นจำนวนเต็ม", () => {
    expect(r.nDates).toBe(151)
    expect(r.unique).toBe(true)
    expect(r.weekdayGaps).toBe(0)
    expect(r.weekend).toBe(0)
    expect(r.last <= r.bangkokToday).toBe(true)
    expect(r.positions).toBeGreaterThan(0)
  })

  it("indicator ของ demo คำนวณจากค่าที่เก็บจริง — recompute ไม่เปลี่ยนอะไร", () => {
    expect(r.recomputed).toBe(0)
  })

  it("ติดป้ายที่มา CrossAsset = synthetic และตรา data_version", () => {
    expect(r.crossSource).toBe("synthetic")
    expect(r.dataVersion).toBe(true)
  })
})
