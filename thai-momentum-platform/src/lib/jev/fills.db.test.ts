/// <reference types="bun-types" />
// bun test — คำสั่งซื้อ T+1 ของ Jev กับ SQLite จริง (route จริง, subprocess + DB ชั่วคราวจาก schema จริง — ไม่แตะ db/custom.db)
// ก่อน 2026-09-23: ซื้ออัตโนมัติ/มนุษย์อนุมัติ = สร้าง Position ที่ราคาปิดของวันตัดสินใจ (T+0) ทันที — ทุกข้อด้านล่างล้มบนโค้ดเดิม
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"

type Pos = { symbol: string; entryDate: string; entryPx: number; slots: number; stop: number }
type FillRow = { date: string; target: string; action: string; executed: boolean; source: string; reason: string }
type State = { positions: Pos[]; queue: { symbol: string; afterDate: string; source: string }[]; fillDecisions: FillRow[]; gates: { id: number; target: string; question: string; status: string }[]; regimeRuns: string[] }
type Order = { id: string; symbol: string; slots: number; stopPct: number; stopMult: number; source: string; decisionDate: string; afterDate: string; fillDate: string | null; fillPx: number | null }
type Run = {
  status: number
  date: string | null
  regime: string | null
  message: string | null
  executedEntries: { target: string; action: string }[]
  queued: Order[]
  fills: { filled: { symbol: string; fillDate: string; fillPx: number; slots: number; stop: number; source: string; decisionDate: string }[]; cancelled: { symbol: string; date: string | null; reason: string }[] }
  pendingFills: Order[]
}
type Track = { status: string; nav: { date: string; exposure: number }[]; legs: { symbol: string; status: string; source: string; entryDate: string; entryPx: number | null }[]; decisions: Record<string, unknown> }

const dir = mkdtempSync(path.join(tmpdir(), "jev-fills-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(scenario: string): any {
  const file = path.join(dir, `${scenario}.db`)
  createSchemaDb(file) // schema จริงจาก prisma/schema.prisma
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "fills.db-harness.ts"), scenario], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`fills harness ${scenario} failed: ${proc.stderr.toString().slice(-3000)}`)
  return JSON.parse(out)
}

describe("Jev ซื้ออัตโนมัติ = คำสั่ง T+1 (regime risk_on)", () => {
  const r = run("auto") as {
    dates: { D: string; D1: string; D2: string }
    halted: string
    closes: Record<string, Record<string, number | null>>
    dRun: Run
    afterD: State
    dDecisions: { target: string; executed: boolean; reason: string }[]
    dRepeat: { status: number; message: string | null; queued: number }
    afterDRepeat: State
    preview: { positions: string[]; pendingFills: Order[] }
    afterPreview: State
    d1Run: Run
    afterD1: State
    d1Repeat: { status: number; message: string | null; fills: Run["fills"] }
    afterD1Repeat: State
    d2Run: Run
    afterD2: State
    audit: { ok: boolean }
    fillEvents: { filled: { symbol: string; fillDate: string }[]; cancelled: { symbol: string }[] }[]
    track: Track
  }
  const orderedD = r.dRun.queued.map((o) => o.symbol)
  const filledD = orderedD.filter((s) => s !== r.halted)

  it("วัน D: สั่งซื้ออัตโนมัติเข้าคิว — ยังไม่มี Position · Decision ไม่ executed + ป้าย T+1 · executed ไม่มี buy", () => {
    expect(r.dRun.status).toBe(200)
    expect(r.dRun.regime).toBe("risk_on")
    expect(orderedD.length).toBeGreaterThanOrEqual(3)
    expect(r.afterD.positions).toEqual([]) // เดิม: Position ของทุกตัวที่ซื้อ entryDate = D
    expect(r.dRun.executedEntries).toEqual([])
    expect(r.dRun.message).toContain(`สั่งซื้ออัตโนมัติ ${orderedD.length} (รอเติม T+1)`)
    for (const o of r.dRun.queued) {
      expect(o).toMatchObject({ source: "auto", decisionDate: r.dates.D, afterDate: r.dates.D, fillDate: null, stopPct: 0.09 })
      expect([1, 0.8]).toContain(o.stopMult)
    }
    expect(r.afterD.queue.map((q) => q.symbol)).toEqual(orderedD)
    const decs = r.dDecisions.filter((d) => orderedD.includes(d.target))
    expect(decs).toHaveLength(orderedD.length)
    for (const d of decs) {
      expect(d.executed).toBe(false)
      expect(d.reason).toContain("รอเติมราคาปิดวันทำการถัดไป (T+1)")
    }
  })

  it("รันซ้ำวัน D = idempotent: ไม่ส่งคำสั่งซ้ำ", () => {
    expect(r.dRepeat.message).toContain("รันไปแล้ว")
    expect(r.dRepeat.queued).toBe(0)
    expect(r.afterDRepeat.queue).toEqual(r.afterD.queue)
    expect(r.afterDRepeat.positions).toEqual([])
  })

  it("ข้อมูล D+1 เข้าแล้ว: GET /api/portfolio บอกวัน/ราคาที่จะเติม (อ่านอย่างเดียว ไม่สร้าง Position)", () => {
    expect(r.preview.positions).toEqual([])
    expect(r.afterPreview.positions).toEqual([])
    expect(r.afterPreview.queue).toHaveLength(orderedD.length)
    for (const o of r.preview.pendingFills) {
      expect(o.fillDate).toBe(r.dates.D1)
      expect(o.fillPx).toBe(o.symbol === r.halted ? null : r.closes[o.symbol][r.dates.D1])
    }
  })

  it("รอบ D+1: คำสั่งของวัน D กลายเป็น Position ที่ราคาปิด D+1 (entryDate = D+1) · stop จากราคาเติม · Decision fill", () => {
    expect(r.d1Run.status).toBe(200)
    expect(r.d1Run.message).not.toContain("รันไปแล้ว")
    expect(r.d1Run.fills.filled.map((f) => f.symbol)).toEqual(filledD)
    const order = new Map(r.dRun.queued.map((o) => [o.symbol, o]))
    for (const s of filledD) {
      const p = r.afterD1.positions.find((x) => x.symbol === s)
      expect(p).toBeDefined()
      expect(p!.entryDate).toBe(r.dates.D1) // เดิม: D
      expect(p!.entryPx).toBe(r.closes[s][r.dates.D1] as number) // เดิม: ราคาปิด D
      expect(p!.entryPx).not.toBe(r.closes[s][r.dates.D] as number)
      const o = order.get(s)!
      expect(p!.slots).toBe(o.slots)
      expect(p!.stop).toBeCloseTo(p!.entryPx * (1 - o.stopPct * o.stopMult), 9)
      const dec = r.afterD1.fillDecisions.find((d) => d.target === s && d.action === "fill")
      expect(dec).toMatchObject({ date: r.dates.D1, executed: true, source: "lite" })
      expect(dec!.reason.startsWith(`เติม T+1 ที่ราคาปิด ${r.dates.D1}`)).toBe(true)
      expect(dec!.reason).toContain(`ของการตัดสินใจวันที่ ${r.dates.D}`)
    }
    expect(r.d1Run.executedEntries.filter((e) => e.action === "fill").map((e) => e.target)).toEqual(filledD)
    expect(r.d1Run.message).toContain(`เติม T+1 ${filledD.length} (ยกเลิก 1)`)
  })

  it("หุ้นหยุดซื้อขายวันเติม → ยกเลิกพร้อมเหตุผลไทย ไม่มี Position · ราคากลับมา D+2 ก็ไม่เลื่อนไปเติม", () => {
    const c = r.d1Run.fills.cancelled.find((x) => x.symbol === r.halted)
    expect(c?.date).toBe(r.dates.D1)
    expect(c?.reason).toContain(`ไม่มีราคาปิด ${r.halted} วันเติม ${r.dates.D1}`)
    expect(r.afterD1.positions.some((p) => p.symbol === r.halted)).toBe(false)
    expect(r.afterD1.fillDecisions.find((d) => d.target === r.halted)).toMatchObject({ action: "cancel", executed: false })
    expect(r.afterD1.queue.some((q) => q.symbol === r.halted)).toBe(false)
    expect(r.closes[r.halted][r.dates.D2]).not.toBeNull()
    expect(r.afterD2.positions.some((p) => p.symbol === r.halted)).toBe(false)
    expect(r.afterD2.fillDecisions.filter((d) => d.target === r.halted && d.action === "fill")).toEqual([])
  })

  it("รันซ้ำวัน D+1 = ไม่เติมซ้ำ (Position/Decision fill เท่าเดิม — หนึ่งแถว fill ต่อคำสั่ง)", () => {
    expect(r.d1Repeat.message).toContain("รันไปแล้ว")
    expect(r.d1Repeat.fills).toEqual({ filled: [], cancelled: [] })
    expect(r.afterD1Repeat.positions).toEqual(r.afterD1.positions)
    expect(r.afterD1Repeat.fillDecisions).toEqual(r.afterD1.fillDecisions)
    expect(filledD.length).toBeGreaterThan(0)
    expect(r.afterD1Repeat.fillDecisions.filter((d) => d.action === "fill").map((d) => d.target)).toEqual(filledD)
    expect(r.afterD1Repeat.positions.filter((p) => filledD.includes(p.symbol)).every((p) => p.entryDate === r.dates.D1)).toBe(true)
  })

  it("คำสั่งที่ส่งรอบ D+1 เติมรอบ D+2 ที่ราคาปิด D+2 · EventLog jev_fill ต่อ hash chain ได้", () => {
    for (const o of r.d1Run.queued) {
      const p = r.afterD2.positions.find((x) => x.symbol === o.symbol)
      expect(p?.entryDate).toBe(r.dates.D2)
      expect(p?.entryPx).toBe(r.closes[o.symbol][r.dates.D2] as number)
    }
    expect(r.afterD2.queue).toEqual([])
    expect(r.fillEvents[0].filled.map((f) => f.symbol)).toEqual(filledD)
    expect(r.fillEvents[0].cancelled.map((c) => c.symbol)).toEqual([r.halted])
    expect(r.audit.ok).toBe(true)
  })

  it("track record: ไม้เข้า = วัน/ราคาเติม (ไม่ใช่วันสัญญาณ) · NAV วัน D ไม่มี exposure · คำสั่งไม่อยู่ใน NAV", () => {
    expect(r.track.status).toBe("OK")
    for (const s of filledD) {
      const leg = r.track.legs.find((l) => l.symbol === s)
      expect(leg).toMatchObject({ status: "open", source: "lite", entryDate: r.dates.D1 })
      expect(leg!.entryPx).toBe(r.closes[s][r.dates.D1] as number)
    }
    expect(r.track.legs.some((l) => l.symbol === r.halted)).toBe(false)
    const navD = r.track.nav.find((p) => p.date === r.dates.D)
    expect(navD?.exposure).toBe(0) // เดิม: ไม้ทั้งหมดเข้าที่ D
    expect(r.track.decisions.queuedOrders).toBe(orderedD.length + r.d1Run.queued.length)
    expect(r.track.decisions.cancelledOrders).toBe(1)
    expect(r.track.decisions.entries).toBe(filledD.length + r.d1Run.queued.length)
  })
})

describe("มนุษย์อนุมัติ = คำสั่ง T+1 · exit ที่มนุษย์อนุมัติบันทึก Trade", () => {
  const r = run("human") as {
    dates: { dMinus1: string; D: string; D1: string; D2: string }
    closes: Record<string, Record<string, number>>
    dRun: { status: number; regime: string | null; queued: number }
    afterD: State
    approvals: Record<"a34" | "a30" | "aExit" | "a35", { status: number; gateStatus: string | null; message: string | null; order: { afterDate: string; decisionDate: string; slots: number } | null }>
    tradesBeforeExit: number
    exitTrades: { entry: string; exit: string; entryPx: number; exitPx: number; ret: number; stopPolicy: string; holdDays: number; src: string }[]
    afterApprove: State
    preview: { positions: string[]; pendingFills: Order[] }
    pendingGetFills: Order[]
    d1Run: Run
    afterD1: State
    d1Repeat: { status: number; message: string | null; fills: Run["fills"] }
    afterD1Repeat: State
    d2Run: Run
    afterD2: State
    track: Track
  }

  it("ตลาดไม่ risk_on → ไม่มีคำสั่งอัตโนมัติมากินงบ (ฉากนี้ทดสอบเฉพาะทางมนุษย์)", () => {
    expect(r.dRun.status).toBe(200)
    expect(r.dRun.regime).not.toBe("risk_on")
    expect(r.dRun.queued).toBe(0)
  })

  it("อนุมัติเย็นวัน D: ยังไม่มี Position · ข้อความบอกว่าเติมที่ราคาปิดวันทำการถัดไป · gate คง approved", () => {
    expect(r.approvals.a34.status).toBe(200)
    expect(r.approvals.a34.message).toContain("เติมที่ราคาปิดของวันทำการถัดไป")
    expect(r.approvals.a34.order).toMatchObject({ afterDate: r.dates.D, decisionDate: r.dates.D, slots: 0.5 })
    expect(r.approvals.a34.gateStatus).toBe("approved")
    expect(r.afterApprove.positions.some((p) => p.symbol === "S34")).toBe(false) // เดิม: Position ที่ราคาปิด D ทันที
    expect(r.afterApprove.queue).toEqual([
      { symbol: "S34", afterDate: r.dates.D, source: "human" },
      { symbol: "S30", afterDate: r.dates.D, source: "human" },
    ])
  })

  it("อนุมัติเย็นวันเดียวกัน → เติมที่ราคาปิด D+1 (source human) แล้ว gate เป็น executed", () => {
    const p = r.afterD1.positions.find((x) => x.symbol === "S34")
    expect(p).toMatchObject({ entryDate: r.dates.D1, entryPx: r.closes.S34[r.dates.D1], slots: 0.5 })
    expect(p!.stop).toBeCloseTo(r.closes.S34[r.dates.D1] * (1 - 0.09), 9)
    const dec = r.afterD1.fillDecisions.find((d) => d.target === "S34")
    expect(dec).toMatchObject({ date: r.dates.D1, action: "fill", executed: true, source: "human" })
    expect(dec!.reason).toContain(`ของการตัดสินใจวันที่ ${r.dates.D}`)
    expect(r.afterD1.gates.find((g) => g.target === "S34" && g.question === "Q_ENTRY")?.status).toBe("executed")
  })

  it("อนุมัติหลังข้อมูล D+1 เข้า (ก่อนรอบ D+1) → afterDate = D+1 → ไม่เติม D+1 แต่เติมที่ราคาปิด D+2", () => {
    expect(r.approvals.a35.order?.afterDate).toBe(r.dates.D1)
    expect(r.pendingGetFills.find((o) => o.symbol === "S35")).toMatchObject({ afterDate: r.dates.D1, fillDate: null })
    expect(r.afterD1.positions.some((p) => p.symbol === "S35")).toBe(false) // เดิม: ราคาปิด D+1 ทันทีตอนอนุมัติ
    expect(r.afterD1.queue).toEqual([{ symbol: "S35", afterDate: r.dates.D1, source: "human" }])
    expect(r.afterD2.positions.find((p) => p.symbol === "S35")).toMatchObject({ entryDate: r.dates.D2, entryPx: r.closes.S35[r.dates.D2] })
    expect(r.afterD2.gates.find((g) => g.target === "S35")?.status).toBe("executed")
  })

  it("การอนุมัติหลังข้อมูลเข้าไม่ทำให้รอบของวันนั้นถูกข้าม (Decision ของมนุษย์ไม่ใช่หลักฐานว่ารันแล้ว)", () => {
    expect(r.d1Run.message).not.toContain("รันไปแล้ว") // เดิม: guard เห็น Q_ENTRY ของมนุษย์ลงวัน D+1 → ข้ามทั้งรอบ
    expect(r.afterD1.regimeRuns).toContain(r.dates.D1)
  })

  it("sector ตรวจซ้ำตอนเติม: Banking ครบ 3 ชื่อหลังอนุมัติ → S30 ถูกยกเลิกพร้อมเหตุผล ไม่มี Position", () => {
    expect(r.approvals.a30.order).not.toBeNull() // ผ่านตอนอนุมัติ (Banking มีแค่ S31)
    const c = r.d1Run.fills.cancelled.find((x) => x.symbol === "S30")
    expect(c?.reason).toContain("เต็มจำนวนชื่อแล้ว (3)")
    expect(r.afterD1.positions.some((p) => p.symbol === "S30")).toBe(false)
    expect(r.afterD1.fillDecisions.find((d) => d.target === "S30")).toMatchObject({ action: "cancel", executed: false, source: "human" })
    expect(r.afterD1.gates.find((g) => g.target === "S30")?.status).toBe("approved")
  })

  it("exit ที่มนุษย์อนุมัติบันทึก Trade (stopPolicy jev) ที่ราคาปิดวันอนุมัติก่อนลบ Position", () => {
    expect(r.approvals.aExit.gateStatus).toBe("executed")
    expect(r.tradesBeforeExit).toBe(0)
    expect(r.exitTrades).toHaveLength(1) // เดิม: ลบ Position เฉย ๆ ไม่มี Trade
    expect(r.exitTrades[0]).toMatchObject({ entry: r.dates.dMinus1, exit: r.dates.D, exitPx: r.closes.S36[r.dates.D], stopPolicy: "jev", holdDays: 1 })
    // เข้าไม้เพราะมนุษย์อนุมัติ → ถัง human-approved ของ posterior (เดิมบันทึก "auto" ทุกไม้)
    expect(r.exitTrades[0].src).toBe("human-approved")
    expect(r.exitTrades[0].ret).toBeCloseTo((r.closes.S36[r.dates.D] / r.closes.S36[r.dates.dMinus1] - 1 - 0.014) * 100, 1)
    expect(r.afterApprove.positions.some((p) => p.symbol === "S36")).toBe(false)
  })

  it("รันซ้ำวัน D+1 ไม่เติมซ้ำ · track record: ไม้ของมนุษย์เข้าที่วันเติม", () => {
    expect(r.d1Repeat.fills).toEqual({ filled: [], cancelled: [] })
    expect(r.afterD1Repeat.positions).toEqual(r.afterD1.positions)
    expect(r.afterD1Repeat.fillDecisions).toEqual(r.afterD1.fillDecisions)
    expect(r.track.legs.find((l) => l.symbol === "S34")).toMatchObject({ entryDate: r.dates.D1, source: "human", entryPx: r.closes.S34[r.dates.D1] })
    expect(r.track.legs.find((l) => l.symbol === "S35")).toMatchObject({ entryDate: r.dates.D2, source: "human" })
    expect(r.track.decisions.human).toBe(4) // อนุมัติ 3 + exit 1 — แถวเติม/ยกเลิกไม่นับซ้ำ
  })
})
