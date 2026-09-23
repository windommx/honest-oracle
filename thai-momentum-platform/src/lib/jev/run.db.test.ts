/// <reference types="bun-types" />
// bun test — /api/jev/run กับ SQLite จริง 2 วันทำการติดกัน: บังคับปิดหุ้นหยุดซื้อขาย ≥ 10 วัน + time exit (2026-09-23)
// รันใน subprocess ที่ตั้ง DATABASE_URL ชี้ไฟล์ชั่วคราวของตัวเอง (แบบเดียวกับ core.db.test.ts) — ไม่แตะ db/custom.db
import { afterAll, describe, expect, it } from "bun:test"
import { createSchemaDb } from "@/test/schema-db"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

interface DayResult {
  status: number
  date: string | null
  message: string | null
  exits: { target: string; action: string; reason: string }[]
  exitLog: { target: string; action: string; executed: boolean; reason: string }[]
  positions: { symbol: string; entryDate: string }[]
  trades: { symbol: string; entry: string; exit: string; entryPx: number; exitPx: number; ret: number; holdDays: number; path: { d: string; p: number }[] }[]
}
interface HarnessOut {
  dates: Record<string, string>
  haltEntryPx: number
  haltLastPx: number
  d1: DayResult
  again: { status: number; message: string | null; trades: number }
  d2: DayResult
}

const dir = mkdtempSync(path.join(tmpdir(), "jev-run-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(): HarnessOut {
  const file = path.join(dir, "jev.db")
  createSchemaDb(file) // schema จริงจาก prisma/schema.prisma
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "run.db-harness.ts")], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`jev harness failed: ${proc.stderr.toString().slice(-2000)}`)
  return JSON.parse(out) as HarnessOut
}

describe("/api/jev/run — กฎปิดที่ตัดสินเมื่อ 2026-09-23 (2 วันทำการติดกัน)", () => {
  const r = run()
  const exitOf = (d: DayResult, sym: string) => d.exits.find((e) => e.target === sym)

  it("วันที่ 1: หุ้นหยุดซื้อขายครบ 10 วันทำการ → exit จริง (paper) + บันทึก Trade ที่ราคาปิดล่าสุดที่มี", () => {
    expect(r.d1.status).toBe(200)
    expect(r.d1.date).toBe(r.dates.day1)
    const e = exitOf(r.d1, "HALT")
    expect(e?.action).toBe("exit") // เดิม: hold ตลอดไป ("ไม่มีราคาวันล่าสุด — ถือไว้ก่อน")
    expect(e?.reason.startsWith("หยุดซื้อขาย/ไม่มีราคา 10 วัน — ปิดที่ราคาล่าสุดที่มี")).toBe(true)
    const t = r.d1.trades.find((x) => x.symbol === "HALT")
    expect(t).toBeDefined() // เดิม persistClosedTrade คืน false เมื่อไม่มีราคาวันออก → ไม่มี Trade
    expect(t!.exit).toBe(r.dates.day1) // วันที่ตัดสินปิด (เงินถูกล็อกถึงวันนี้)
    expect(t!.exitPx).toBe(r.haltLastPx) // ราคาปิดล่าสุดที่มีจริง (D58) ไม่ใช่ราคาแต่ง
    expect(t!.ret).toBeCloseTo((r.haltLastPx / r.haltEntryPx - 1 - 0.014) * 100, 1)
    expect(t!.path.at(-1)?.d).toBe(r.dates.d58)
    expect(r.d1.positions.some((p) => p.symbol === "HALT")).toBe(false)
  })

  it("วันที่ 1: ถือครบ holdDefault (5) วันทำการ → time exit จริง · ยังไม่ครบไม่ถูกปิด", () => {
    const e = exitOf(r.d1, "AGED")
    expect(e?.action).toBe("exit") // เดิม live ไม่มี time exit (hold อยู่แค่ใน reason ของ entry)
    expect(e?.reason.startsWith("ครบกำหนดถือ 5 วัน (time exit)")).toBe(true)
    const t = r.d1.trades.find((x) => x.symbol === "AGED")!
    expect(t.exitPx).toBe(50)
    expect(t.holdDays).toBe(6)
    expect(exitOf(r.d1, "EDGE")).toBeUndefined() // ถือ 4 วัน
    expect(exitOf(r.d1, "FRESH")).toBeUndefined()
    expect(r.d1.positions.map((p) => p.symbol)).toEqual(expect.arrayContaining(["EDGE", "FRESH"]))
    expect(r.d1.message).toContain("(time 1 · หยุดซื้อขาย 1)")
  })

  it("รันซ้ำวันเดิม = idempotent: ไม่ปิดซ้ำ ไม่บันทึก Trade ซ้ำ", () => {
    expect(r.again.status).toBe(200)
    expect(r.again.message).toContain("รันไปแล้ว")
    expect(r.again.trades).toBe(r.d1.trades.length)
  })

  it("วันที่ 2: EDGE ครบ 5 วันพอดี → time exit · FRESH (ถือ 2 วัน) ยังอยู่ · เทรดวันที่ 1 ไม่ถูกปิดซ้ำ", () => {
    expect(r.d2.status).toBe(200)
    expect(r.d2.date).toBe(r.dates.day2)
    const e = exitOf(r.d2, "EDGE")
    expect(e?.action).toBe("exit")
    expect(e?.reason.startsWith("ครบกำหนดถือ 5 วัน (time exit)")).toBe(true)
    expect(r.d2.trades.find((x) => x.symbol === "EDGE")?.holdDays).toBe(5)
    expect(r.d2.positions.some((p) => p.symbol === "FRESH")).toBe(true)
    expect(r.d2.trades.filter((x) => x.symbol === "HALT" || x.symbol === "AGED")).toHaveLength(2)
    // ไม้ที่เพิ่งเข้าวันที่ 1 (ถ้ามี) ต้องไม่โดน time exit วันที่ 2
    const boughtDay1 = r.d1.positions.filter((p) => p.entryDate === r.dates.day1).map((p) => p.symbol)
    for (const s of boughtDay1) expect(exitOf(r.d2, s)?.reason.startsWith("ครบกำหนดถือ") ?? false).toBe(false)
  })
})
