import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { nextSessionOpen, nextTradingDay } from "@/lib/data/calendar"
import { db } from "@/lib/db"
import { evaluateGates } from "@/lib/quant/engine/gates"
import { ensureSeeded, loadMarketState } from "@/lib/quant/engine/panel"
import { RULES_HASH } from "@/lib/quant/engine/rules"
import { rhythmBase } from "@/lib/rhythm/service"
import {
  buildSteps,
  compareForward,
  CYCLE_TAG,
  cycleMetaOf,
  decisionRecord,
  forwardReason,
  journalUpdate,
  losingStreak,
  paperStats,
  planOf,
  statusOf,
  type CycleMeta,
  type JournalLike,
  type StatusContext,
} from "./cycle"
import { EXEC, emaOf, floorToTick, scaledStop, setTick, simulatePlan, type Bars, type PlanInput } from "./execution"
import { barsOf, replayBaseline } from "./replay"
import { shouldRunCycle } from "./scheduler"
import { getWorkflow, runCycle } from "./service"

// ─── แท่งราคาทดสอบ: วันที่ 0 = วันสัญญาณ (ปิด 100) ───
function mk(rows: Array<[number, number, number, number, number?]>): Bars {
  return {
    dates: rows.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`),
    open: rows.map((r) => r[0]),
    high: rows.map((r) => r[1]),
    low: rows.map((r) => r[2]),
    close: rows.map((r) => r[3]),
    volume: rows.map((r) => r[4] ?? 1),
  }
}
const pullback: PlanInput = { kind: "pullback", close: 100, limit: 98, stop: 94 }
const signal: [number, number, number, number] = [100, 101, 99, 100]

describe("workflow/โบรกเกอร์กระดาษ — ทำตามแผนเทรด ดูเฉพาะแท่งหลังวันสัญญาณ", () => {
  test("limit ได้ของที่ min(เปิด, limit) → ถึงเป้า +2R (ราคาเป้าหรือเปิดที่กระโดดเกิน)", () => {
    const b = mk([signal, [99, 100, 97, 99], [99, 103, 98, 102], [103, 110, 102, 109]])
    const r = simulatePlan(b, 0, pullback)
    expect(r.fill).toEqual({ index: 1, date: b.dates[1], price: 98 })
    expect(r.target).toBe(98 + 2 * 4)
    expect(r.state).toBe("closed")
    expect(r.exit).toMatchObject({ index: 3, kind: "target", price: 106 })
    expect(r.r).toBe(2)
    // เปิดกระโดดเหนือเป้า = ออกที่ราคาเปิด (ดีกว่าเป้า)
    const gapUp = simulatePlan(mk([signal, [97, 99, 96, 98], [108, 109, 107, 108]]), 0, pullback)
    expect(gapUp.fill!.price).toBe(97)
    expect(gapUp.exit).toMatchObject({ kind: "target", price: 108 })
  })

  test("MAE/MFE แบบระมัดระวัง: low วันได้ของนับเสมอ · high วันได้ของนับเฉพาะได้ของที่ราคาเปิด · วันออกตัดที่ราคาออก", () => {
    // limit ได้ของกลางวัน (เปิด 99 > 98): high 100 ของวันได้ของอาจเกิดก่อนได้ของ → ไม่นับ · low 97 นับ · ออกที่เป้า 106 = MFE 2R
    const t1 = simulatePlan(mk([signal, [99, 100, 97, 99], [99, 103, 98, 102], [103, 110, 102, 109]]), 0, pullback)
    expect(t1).toMatchObject({ state: "closed", maeR: 0.25, mfeR: 2, maePct: 1.02, mfePct: 8.163 })
    // ได้ของที่ราคาเปิดแล้วโดน stop วันเดียวกัน: MAE = ถึง stop พอดี · MFE = 0 (ไม่รู้ว่าขึ้นก่อนหรือหลัง)
    const t2 = simulatePlan(mk([signal, [100, 104, 93, 95]]), 0, { kind: "momentum", close: 100, limit: null, stop: 94 })
    expect(t2).toMatchObject({ state: "closed", maeR: 1, mfeR: 0 })
    // เปิดต่ำกว่า limit (ได้ของที่ราคาเปิด 97) → high วันได้ของนับ · หมดเวลา = นับทั้งแท่งสุดท้าย
    const rule = { orderDays: 3, holdDays: 2, targetR: null }
    const t3 = simulatePlan(mk([signal, [97, 101, 96.5, 100], [100, 102, 99, 101], [101, 103, 100, 102]]), 0, pullback, rule)
    expect(t3).toMatchObject({ state: "closed", maeR: 0.167, mfeR: 2, exit: { kind: "time", price: 102 } })
    // โดน stop วันถัดไป: MAE ตัดที่ราคาออก (ไม่ใช่ low 90 ที่เกิดหลังออก) · เปิดกระโดดต่ำกว่า stop = MAE ถึงราคาเปิด
    expect(simulatePlan(mk([signal, [99, 99.5, 97.5, 98], [96, 97, 90, 92]]), 0, pullback)).toMatchObject({ maeR: 1, mfeR: 0 })
    expect(simulatePlan(mk([signal, [99, 99.5, 97.5, 98], [92, 93, 90, 91]]), 0, pullback)).toMatchObject({ maeR: 1.5 })
    // ยังถือ = ค่าถึงวันล่าสุด · ไม่ได้ของ = null
    expect(simulatePlan(mk([signal, [99, 100, 97, 99], [99, 101, 98, 100]]), 0, pullback)).toMatchObject({ state: "open", maeR: 0.25, mfeR: 0.75 })
    expect(simulatePlan(mk([signal, [93, 95, 92, 94]]), 0, pullback)).toMatchObject({ state: "gap", maeR: null, mfeR: null })
  })

  test("เปิดต่ำกว่า stop = ยกเลิก (gap) · ไม่ได้ราคาใน 3 วัน = หมดอายุ · ยังไม่ครบ 3 วัน = คำสั่งยังรอ", () => {
    expect(simulatePlan(mk([signal, [93, 95, 92, 94]]), 0, pullback).state).toBe("gap")
    const noFill = mk([signal, [100, 101, 99, 100], [100, 102, 99, 101], [101, 102, 99.5, 101]])
    expect(simulatePlan(noFill, 0, pullback)).toMatchObject({ state: "expired", eventDate: noFill.dates[3] })
    expect(simulatePlan(mk([signal, [100, 101, 99, 100]]), 0, pullback)).toMatchObject({ state: "order", barsSeen: 1 })
  })

  test("วันที่ได้ของหลุด stop = ออกที่ stop วันเดียวกัน · แท่งเดียวแตะทั้งสองฝั่ง = นับ stop · ครบ 5 วันออกที่ราคาปิด", () => {
    const sameDay = simulatePlan(mk([signal, [99, 99, 93, 94]]), 0, pullback)
    expect(sameDay).toMatchObject({ state: "closed", days: 0, exit: { kind: "stop", price: 94 } })
    expect(sameDay.r).toBe(-1)
    const both = simulatePlan(mk([signal, [99, 100, 97, 99], [99, 107, 93, 100]]), 0, pullback)
    expect(both.exit!.kind).toBe("stop")
    const flat: Array<[number, number, number, number]> = [signal, [99, 100, 97, 99], ...Array.from({ length: 5 }, (_, i) => [99, 100, 97.5, 99 + i * 0.1] as [number, number, number, number])]
    const timed = simulatePlan(mk(flat), 0, pullback)
    expect(timed).toMatchObject({ state: "closed", days: EXEC.holdDays, exit: { kind: "time", index: 1 + EXEC.holdDays } })
    expect(timed.exit!.price).toBeCloseTo(99.4, 6)
    const open = simulatePlan(mk(flat.slice(0, 4)), 0, pullback)
    expect(open.state).toBe("open")
  })

  test("momentum ซื้อที่ราคาเปิด · แท่งหยุดซื้อขาย (ปริมาณ 0) ไม่จับคู่ · แผนผิดรูป = invalid", () => {
    const mom = simulatePlan(mk([signal, [101, 102, 100.5, 101.5]]), 0, { ...pullback, kind: "momentum", limit: null })
    expect(mom).toMatchObject({ state: "open", fill: { price: 101 } })
    const halted = simulatePlan(mk([signal, [97, 97, 97, 97, 0], [99, 100, 97.5, 99]]), 0, pullback)
    expect(halted.fill!.index).toBe(2)
    expect(simulatePlan(mk([signal]), 0, { ...pullback, stop: 101 }).state).toBe("invalid")
    expect(simulatePlan(mk([signal]), 0, { ...pullback, limit: 90 }).state).toBe("invalid")
  })

  test("EMA ของราคาปิด: เริ่มด้วยค่าเฉลี่ย period วันแรก แล้วถ่วงด้วย 2/(n+1) · cache ต่ออาร์เรย์", () => {
    const close = [1, 2, 3, 4]
    const e = emaOf(close, 3)
    expect(Number.isNaN(e[0]) && Number.isNaN(e[1])).toBe(true)
    expect(e[2]).toBe(2)
    expect(e[3]).toBe(3)
    expect(emaOf(close, 3)).toBe(e)
    expect([...emaOf([5, 6], 3)].every(Number.isNaN)).toBe(true)
  })

  test("ออกตามเส้น EMA: ปิดต่ำกว่าเส้น → ขายที่ราคาเปิดวันซื้อขายถัดไป · เปิดต่ำกว่า stop = stop · ข้ามวันหยุดซื้อขาย", () => {
    // ซื้อราคาเปิด 100 · stop 5% จากราคาได้ของ = 95 · เป้า 3R = 115 · EMA 3 วัน: วันที่ 3 ปิด 100.5 < EMA 101.08
    const momentum: PlanInput = { kind: "momentum", close: 100, limit: null, stop: 95, stopPct: 5 }
    const rule = { orderDays: 3, holdDays: 60, targetR: 3, costPct: 0, trailEma: 3 }
    const head: Array<[number, number, number, number, number?]> = [signal, [100, 103, 99.5, 102], [102, 104, 101, 103], [103, 104, 100, 100.5]]
    const r = simulatePlan(mk([...head, [100.2, 101, 99, 100]]), 0, momentum, rule)
    expect(r.fill).toMatchObject({ index: 1, price: 100 })
    expect(r.target).toBe(115)
    expect(r.exit).toMatchObject({ index: 4, kind: "trail", price: 100.2 })
    expect(r.days).toBe(3)
    expect(r.retPct).toBe(0.2)
    // MAE = low วันได้ของ 99.5 (0.5% = 0.1R) · MFE = high 104 (ได้ของที่ราคาเปิดจึงนับ high ทั้งวัน) · วันออกนับเฉพาะราคาเปิด
    expect([r.maePct, r.maeR, r.mfePct, r.mfeR]).toEqual([0.5, 0.1, 4, 0.8])
    // สัญญาณออกค้างอยู่ แล้ววันถัดไปเปิดกระโดดต่ำกว่า stop = ออกที่ราคาเปิดในชื่อ stop
    expect(simulatePlan(mk([...head, [94, 95, 93, 94]]), 0, momentum, rule).exit).toMatchObject({ index: 4, kind: "stop", price: 94 })
    // วันหยุดซื้อขาย (ปริมาณ 0) ขายไม่ได้ → ขายที่ราคาเปิดของวันซื้อขายถัดไป
    expect(simulatePlan(mk([...head, [100.5, 100.5, 100.5, 100.5, 0], [99.8, 100, 99, 99.5]]), 0, momentum, rule).exit).toMatchObject({ index: 5, kind: "trail", price: 99.8 })
    // ไม่ตั้ง trailEma = พฤติกรรมเดิม (ถือจนครบวัน)
    expect(simulatePlan(mk([...head, [100.2, 101, 99, 100]]), 0, momentum, { ...rule, trailEma: undefined, holdDays: 3 }).exit).toMatchObject({ index: 4, kind: "time", price: 100 })
  })

  test("stop เป็น % ใต้ราคาได้ของ (แบบ stop_loss_pct ของ PyBroker): เปิดกระโดดขึ้นแล้ว stop ขยับตามราคาได้ของ", () => {
    const plan: PlanInput = { kind: "momentum", close: 100, limit: null, stop: 95, stopPct: 5 }
    // ได้ของที่ราคาเปิด 104 → stop = ปัด tick(98.8) = 98.75 · R = 5.25 · วันถัดไป low 98.7 แตะ stop
    const r = simulatePlan(mk([signal, [104, 106, 103, 105], [101, 102, 98.7, 99]]), 0, plan, { orderDays: 3, holdDays: 10, targetR: 3, costPct: 0 })
    expect(r.fill!.price).toBe(104)
    expect(r.target).toBe(104 + 3 * 5.25)
    expect(r.exit).toMatchObject({ index: 2, kind: "stop", price: 98.75 })
    expect(r.r).toBe(-1)
    // stop ของแผนยังใช้กันซื้อของที่เปิดหลุดก่อนได้ของ · % นอกช่วง 0–100 = แผนผิดรูป
    expect(simulatePlan(mk([signal, [94, 96, 93, 95]]), 0, plan).state).toBe("gap")
    expect(simulatePlan(mk([signal, [100, 101, 99, 100]]), 0, { ...plan, stopPct: 0 }).state).toBe("invalid")
  })

  test("ผลสุทธิหักค่าธรรมเนียมไป-กลับ · ไม้ที่กำไรน้อยกว่าค่าธรรมเนียม = แพ้ · stop ตามตัวคูณวัดจากราคาตั้งซื้อ", () => {
    const tiny = simulatePlan(mk([signal, [99, 100, 97, 99], [98.2, 98.3, 98.1, 98.2], ...Array.from({ length: 4 }, () => [98.2, 98.3, 98.1, 98.2] as [number, number, number, number])]), 0, pullback, { ...EXEC, targetR: null })
    expect(tiny.state).toBe("closed")
    expect(tiny.retPct!).toBeGreaterThan(0) // กำไรก่อนค่าธรรมเนียม…
    expect(tiny.retNetPct!).toBeLessThan(0) // …แต่ขาดทุนหลังหัก 0.30%
    expect(tiny.rNet!).toBeLessThan(0)
    expect(scaledStop(98, 94, 1)).toBe(94)
    expect(scaledStop(98, 94, 1.5)).toBe(92)
    expect(scaledStop(98, 94, 0.5)).toBe(96)
  })

  test("ราคาตั้งซื้อ/stop ปัดลงตามช่วงราคาของ SET (ส่งเข้าระบบซื้อขายได้จริง)", () => {
    expect([1.99, 2, 4.99, 5, 9.99, 10, 24.9, 25, 99.9, 100, 199.5, 200, 399, 400].map(setTick)).toEqual([0.01, 0.02, 0.02, 0.05, 0.05, 0.1, 0.1, 0.25, 0.25, 0.5, 0.5, 1, 1, 2])
    expect(floorToTick(166.58)).toBe(166.5)
    expect(floorToTick(52.984)).toBe(52.75)
    expect(floorToTick(21.8)).toBe(21.8)
    expect(floorToTick(180.686)).toBe(180.5)
    expect(floorToTick(450.7)).toBe(450)
    expect(floorToTick(1.237)).toBe(1.23)
    expect(floorToTick(25)).toBe(25)
  })

  test("point-in-time: ตัดแท่งอนาคตทิ้งแล้วสิ่งที่ตัดสินไปแล้วไม่เปลี่ยน", () => {
    const b = mk([signal, [99, 100, 97, 99], [99, 103, 98, 102], [102, 104, 101, 103], [103, 110, 102, 109]])
    const full = simulatePlan(b, 0, pullback)
    for (let n = 2; n <= b.dates.length; n++) {
      const cut: Bars = { ...b, dates: b.dates.slice(0, n) }
      const r = simulatePlan(cut, 0, pullback)
      expect(r.fill).toEqual(full.fill)
      if (r.state === "closed") expect(r).toEqual({ ...full, barsSeen: r.barsSeen })
    }
  })
})

describe("workflow/รอบประจำวัน — บันทึก · อัปเดตไปข้างหน้า · หลักฐาน forward", () => {
  const meta: CycleMeta = { v: 1, session: "2026-09-24", kind: "pullback", limit: 98, rulesHash: "h1", dataKind: "real" }
  const entry = (over: Partial<JournalLike> = {}): JournalLike => ({
    id: "e1",
    createdAt: new Date("2026-09-24T11:00:00Z"),
    symbol: "PTT",
    signal: "ENTRY_PULLBACK",
    gates: { g1: true, cycle: meta },
    price: 100,
    stopHard: 94,
    sizePct: 10,
    probUp: 0.55,
    status: "PLANNED",
    pnlPct: null,
    notes: null,
    ...over,
  })

  test("decisionRecord: meta อ่านกลับได้ · limit = ขอบบนของโซนเข้า (momentum = ซื้อที่ราคาเปิด) · ป้ายหน้าบันทึก", () => {
    const row = { symbol: "PTT", signal: "ENTRY_PULLBACK", gates: { g1: true, g2: true, g3: true, g4: true, g5: true }, price: 100, entryLow: 96, entryHigh: 98, stopStruct: 95, stopHard: 94, maxSizePct: 12, cvar: 0.02, probUp: 0.57 }
    const rec = decisionRecord(row, "2026-09-24", { rulesHash: "h1", dataKind: "real" })
    expect(cycleMetaOf(rec.gates)).toEqual(meta)
    expect(rec.status).toBe("PLANNED")
    expect(rec.notes.startsWith(CYCLE_TAG)).toBe(true)
    expect(rec.runDate.toISOString()).toBe("2026-09-24T10:00:00.000Z")
    expect(cycleMetaOf(decisionRecord({ ...row, signal: "ENTRY_MOMENTUM" }, "2026-09-24", { rulesHash: "h1", dataKind: "real" }).gates)!.limit).toBeNull()
    expect(cycleMetaOf({ g1: true })).toBeNull()
  })

  test("journalUpdate: ไปข้างหน้าเท่านั้น · ไม่แตะรายการที่จบแล้ว · ไม่มีอะไรเปลี่ยน = null", () => {
    const b = mk([signal, [99, 100, 97, 99]])
    const open = simulatePlan(b, 0, pullback)
    const upd = journalUpdate(entry(), meta, open)!
    expect(upd.status).toBe("EXECUTED")
    expect(upd.pnlPct).toBeNull()
    expect(journalUpdate(entry({ status: "EXECUTED", notes: upd.notes }), meta, open)).toBeNull()
    const pending = simulatePlan(mk([signal]), 0, pullback)
    expect(journalUpdate(entry({ status: "EXECUTED" }), meta, pending)).toBeNull() // ผู้ใช้ตั้ง EXECUTED เอง → ไม่ถอยกลับ
    const closed = simulatePlan(mk([signal, [99, 99, 93, 94]]), 0, pullback)
    expect(journalUpdate(entry(), meta, closed)).toMatchObject({ status: "CLOSED", pnlPct: -4.38 }) // −4.08% − ค่าธรรมเนียม 0.30%
    for (const s of ["CLOSED", "SKIPPED"]) expect(journalUpdate(entry({ status: s }), meta, closed)).toBeNull()
    expect(statusOf("expired")).toBe("SKIPPED")
    expect(statusOf("gap")).toBe("SKIPPED")
  })

  test("forwardReason: ข้อมูลจริง + ล็อกด้วย hash เดียวกัน + บันทึกหลังล็อก + ก่อนตลาดเปิดรอบถัดไป", () => {
    const lock = { hash: "h1", at: new Date("2026-09-20T00:00:00Z") }
    const deadline = nextSessionOpen("2026-09-24")
    expect(deadline.toISOString()).toBe(`${nextTradingDay("2026-09-24")}T03:00:00.000Z`)
    expect(forwardReason(entry(), meta, lock)).toBe("counted")
    expect(forwardReason(entry(), { ...meta, dataKind: "synthetic" }, lock)).toBe("synthetic")
    expect(forwardReason(entry(), meta, null)).toBe("not-locked")
    expect(forwardReason(entry(), { ...meta, rulesHash: "old" }, lock)).toBe("rules-changed")
    expect(forwardReason(entry({ createdAt: new Date("2026-09-19T00:00:00Z") }), meta, lock)).toBe("pre-lock")
    expect(forwardReason(entry({ createdAt: deadline }), meta, lock)).toBe("late")
    expect(forwardReason(entry({ createdAt: new Date(deadline.getTime() - 1) }), meta, lock)).toBe("counted")
  })

  test("สถิติ + เทียบความคาดหวัง: ไม่ถึง 10 ไม้ = ยังเทียบไม่ได้ · ต่ำกว่าชัดเจน = below · ขาดทุนติดกันนับจากท้าย", () => {
    const st = paperStats([
      simulatePlan(mk([signal, [99, 99, 93, 94]]), 0, pullback),
      simulatePlan(mk([signal, [100, 101, 99, 100], [100, 102, 99, 101], [101, 102, 99.5, 101]]), 0, pullback),
      simulatePlan(mk([signal, [93, 95, 92, 94]]), 0, pullback),
      simulatePlan(mk([signal]), 0, pullback),
    ])
    expect(st).toMatchObject({ signals: 4, filled: 1, expired: 1, gaps: 1, closed: 1, winRate: 0, fillRate: 33.3, sumR: -1.07 }) // −1R − ค่าธรรมเนียม
    expect(st.byExit.stop).toBe(1)
    const base = Array.from({ length: 200 }, (_, i) => (i % 2 ? 1.2 : -0.8))
    expect(compareForward([1, 2], base).verdict).toBe("insufficient")
    expect(compareForward(Array(12).fill(-1), base).verdict).toBe("below")
    expect(compareForward(Array(12).fill(2), base).verdict).toBe("above")
    expect(compareForward(base.slice(0, 20), base).verdict).toBe("in-line")
    expect(losingStreak([1, -1, 0, -2])).toBe(3)
    expect(losingStreak([-1, 1])).toBe(0)
  })

  test("ขั้นตอน: ข้อมูลจำลอง = เตือน · ยังไม่ล็อก = เตือน + ปุ่มล็อก · แก้กติกาหลังล็อก = บล็อก · ข้อมูลค้าง = ไม่บันทึก", () => {
    const ctx: StatusContext = {
      data: { kind: "synthetic", label: "demo", status: "synthetic", lagSessions: null, expectedSession: "2026-09-30", notes: [] },
      rules: { hashShort: "aaa", locked: false, lockedAt: null, lockedHashShort: null, matches: false },
      session: "2026-09-25",
      deadline: "2026-09-29T03:00:00.000Z",
      deadlinePassed: false,
      todaySignals: 2,
      todayRecorded: 0,
      orders: 0,
      positions: 0,
      exposurePct: 0,
      closed: 0,
      lastRunSession: null,
      forward: paperStats([]),
      excluded: { synthetic: 0, "not-locked": 0, "pre-lock": 0, "rules-changed": 0, late: 0 },
      comparison: compareForward([], []),
      streak: null,
    }
    const s = Object.fromEntries(buildSteps(ctx).map((x) => [x.key, x]))
    expect(Object.keys(s)).toEqual(["data", "rules", "signals", "record", "track", "evaluate"])
    expect(s.data.status).toBe("warn")
    expect(s.rules).toMatchObject({ status: "warn", action: "lock-rules" })
    expect(s.record).toMatchObject({ status: "wait", action: "run-cycle" })
    expect(s.evaluate.status).toBe("wait")
    const locked = Object.fromEntries(buildSteps({ ...ctx, rules: { ...ctx.rules, locked: true, lockedAt: "2026-09-20T00:00:00Z", lockedHashShort: "bbb" } }).map((x) => [x.key, x]))
    expect(locked.rules.status).toBe("block")
    const stale = Object.fromEntries(buildSteps({ ...ctx, data: { ...ctx.data, kind: "real", status: "stale", lagSessions: 4 } }).map((x) => [x.key, x]))
    expect(stale.data.status).toBe("block")
    expect(stale.record).toMatchObject({ status: "block", action: null })
  })

  test("ตัวตั้งเวลา: วันซื้อขาย + หลัง 17:45 น. + ข้อมูลของวันนี้เข้าแล้ว + ยังไม่รันรอบนี้", () => {
    const at = (iso: string) => new Date(iso)
    expect(shouldRunCycle(at("2026-09-29T11:00:00Z"), "2026-09-29", null)).toBe(true) // 18:00 น.
    expect(shouldRunCycle(at("2026-09-29T10:30:00Z"), "2026-09-29", null)).toBe(false) // 17:30 น.
    expect(shouldRunCycle(at("2026-09-29T11:00:00Z"), "2026-09-28", null)).toBe(false) // ข้อมูลวันนี้ยังไม่เข้า
    expect(shouldRunCycle(at("2026-09-29T11:00:00Z"), "2026-09-29", "2026-09-29")).toBe(false)
    expect(shouldRunCycle(at("2026-10-03T11:00:00Z"), "2026-10-03", null)).toBe(false) // เสาร์
  })
})

describe("workflow/service — บันทึกลง Journal จริง (DB ทดสอบ · ข้อมูลจำลอง)", () => {
  const made: string[] = []

  beforeAll(async () => {
    await ensureSeeded(false)
    await db.journalEntry.deleteMany({ where: { notes: { startsWith: CYCLE_TAG } } })
  }, 180_000)

  afterAll(async () => {
    await db.journalEntry.deleteMany({ where: { notes: { startsWith: CYCLE_TAG } } })
  })

  test("รันรอบ: บันทึกสัญญาณของรอบล่าสุดครบ · รันซ้ำไม่ซ้ำรายการ · ActionLog แบบ SYSTEM", async () => {
    const since = new Date()
    const first = await runCycle({ actor: "test" })
    const again = await runCycle({ actor: "test" })
    const wf = await getWorkflow()
    expect(first.dataKind).toBe("synthetic")
    expect(first.blocked).toBeNull()
    expect(first.recorded).toBe(wf.today.length)
    expect(again.recorded).toBe(0)
    expect(again.alreadyRecorded).toBe(first.recorded)
    const rows = await db.journalEntry.findMany({ where: { notes: { startsWith: CYCLE_TAG } } })
    expect(rows.length).toBe(first.recorded)
    made.push(...rows.map((r) => r.id))
    for (const r of rows) {
      expect(cycleMetaOf(r.gates)).toMatchObject({ session: wf.session, rulesHash: RULES_HASH, dataKind: "synthetic" })
      expect(r.status).toBe("PLANNED")
    }
    const log = await db.actionLog.findFirst({ where: { action: "workflow.run", createdAt: { gte: since } }, orderBy: { createdAt: "desc" } })
    expect(log).toMatchObject({ actor: "test", method: "SYSTEM" })
    expect(wf.lastRun?.session).toBe(wf.session)
  }, 180_000)

  test("สถานะของหน้า: 6 ขั้น · ข้อมูลจำลองไม่นับเป็นหลักฐาน forward · ฐานความคาดหวังจากการเล่นซ้ำ", async () => {
    const wf = await getWorkflow()
    expect(wf.steps.map((s) => s.key)).toEqual(["data", "rules", "signals", "record", "track", "evaluate"])
    expect(wf.steps[0].status).toBe("warn")
    expect(wf.today.every((r) => r.id !== null && r.reason === "synthetic")).toBe(true)
    expect(wf.forward.stats.signals).toBe(0)
    expect(wf.forward.excluded.synthetic).toBe(wf.ledger.length)
    expect(wf.baseline.stats.signals).toBeGreaterThan(20)
    expect(wf.baseline.stats.closed).toBeGreaterThan(10)
    expect(wf.comparison.verdict).toBe("insufficient")
    expect(wf.alerts.some((a) => a.text.includes("ข้อมูลจำลอง"))).toBe(true)
    expect(wf.exec).toEqual({ ...EXEC })
  }, 180_000)

  test("อัปเดตไม้เก่าด้วยราคาที่เกิดขึ้นหลังจากนั้น — ตรงกับโบรกเกอร์กระดาษทุกประการ", async () => {
    const state = await loadMarketState()
    const base = rhythmBase(state)!
    const N = state.dates.length
    let pick: { si: number; t: number } | null = null
    for (let t = N - 40; t < N - 12 && !pick; t++)
      for (let si = 0; si < state.stocks.length && !pick; si++) if (base.gates.cat[si][t - base.t0] === 5) pick = { si, t }
    expect(pick).not.toBeNull()
    const { si, t } = pick!
    const s = state.stocks[si]
    const ev = evaluateGates(state, s.symbol, t, { light: true })
    const session = state.dates[t].toISOString().slice(0, 10)
    const rec = decisionRecord(
      { symbol: s.symbol, signal: ev.signal, gates: ev.gates, price: s.rows[t].close, entryLow: ev.plan.entryLow, entryHigh: ev.plan.entryHigh, stopStruct: ev.plan.stopStruct, stopHard: ev.plan.stopHard, maxSizePct: ev.plan.sizePct, cvar: ev.plan.cvar, probUp: ev.plan.probUp },
      session,
      { rulesHash: RULES_HASH, dataKind: "synthetic" },
    )
    const created = await db.journalEntry.create({ data: { ...rec, gates: rec.gates as never } })
    made.push(created.id)
    const recMeta = cycleMetaOf(rec.gates)!
    expect(recMeta.limit === null || recMeta.limit === floorToTick(recMeta.limit)).toBe(true)
    const expected = simulatePlan(barsOf(state, si, state.dates.map((d) => d.toISOString().slice(0, 10))), t, planOf(rec, recMeta))
    const report = await runCycle({ actor: "test" })
    expect(report.resolved).toBeGreaterThanOrEqual(expected.state === "order" ? 0 : 1)
    const after = await db.journalEntry.findUniqueOrThrow({ where: { id: created.id } })
    expect(after.status).toBe(statusOf(expected.state))
    if (expected.state === "closed") expect(after.pnlPct!).toBeCloseTo(Math.round(expected.retNetPct! * 100) / 100, 9) // Journal เก็บ % สุทธิ 2 ตำแหน่ง
    const row = (await getWorkflow()).ledger.find((r) => r.id === created.id)!
    expect(row.state).toBe(expected.state)
    // ฐานความคาดหวังใช้แผนแบบเดียวกัน: สัญญาณเดียวกันในการเล่นซ้ำให้ผลเท่ากัน
    const replay = replayBaseline(state, base.gates, null).trades.find((x) => x.symbol === s.symbol && x.session === session)!
    expect(replay.res).toEqual(expected)
  }, 180_000)
})
