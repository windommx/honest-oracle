/// <reference types="bun-types" />
// bun test — กติกาคำสั่งซื้อรอเติม T+1 (pure): วันเติม = วันแรก "หลัง" afterDate · ไม่มีราคา = ยกเลิก (ไม่เลื่อนวัน)
// · sector/slot ตรวจซ้ำตอนเติม · ยุคข้อมูลเปลี่ยน = ยกเลิก · อ่านคิวเสียไม่ throw
import { describe, expect, it } from "bun:test"
import type { PendingFillOrder } from "@/lib/momentum/contracts"
import {
  T1_TAG,
  fillDecisionReason,
  fillDecisionSource,
  firstDateAfter,
  isCancelDecision,
  isFillDecision,
  isQueuedEntryDecision,
  parsePendingFills,
  previewPendingFill,
  queuedDecisionReason,
  serializePendingFills,
} from "./fill-rules"
import { planFill, type FillContext } from "./fills"

const dates = ["2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22"]
const order = (p: Partial<PendingFillOrder> = {}): PendingFillOrder => ({
  id: "abc123",
  symbol: "AAA",
  slots: 1,
  stopPct: 0.09,
  stopMult: 1,
  source: "auto",
  decisionDate: "2026-09-17",
  afterDate: "2026-09-17",
  gateId: null,
  conf: 0.9,
  reason: "n_tf=4",
  maxSlots: 7,
  placedAt: "2026-09-17T11:00:00.000Z",
  epoch: null,
  ...p,
})
// AAA มีราคาทุกวัน · HALT ไม่มีราคา 09-18 แต่กลับมา 09-21
const pivot: FillContext["pivot"] = {
  dates,
  px: [
    [10, 20, 30],
    [11, NaN, 31],
    [12, 21, 32],
    [13, 22, 33],
  ],
  symIdx: new Map([
    ["AAA", 0],
    ["HALT", 1],
    ["BNK", 2],
  ]),
}
const ctx = (p: Partial<FillContext> = {}): FillContext => ({ pivot, held: [], sectorMap: new Map(), epoch: null, ...p })

describe("firstDateAfter — วันเติม = วันแรกที่หลัง afterDate อย่างเคร่งครัด", () => {
  it("afterDate มีในปฏิทิน → วันถัดไป · ไม่มี (วันหยุด) → วันแรกที่หลังกว่า · วันล่าสุด → รอ (−1)", () => {
    expect(firstDateAfter(dates, "2026-09-17")).toBe(1)
    expect(firstDateAfter(dates, "2026-09-19")).toBe(2) // เสาร์ → จันทร์
    expect(firstDateAfter(dates, "2026-09-22")).toBe(-1)
    expect(firstDateAfter(dates, "2026-01-01")).toBe(0)
    expect(firstDateAfter([], "2026-09-17")).toBe(-1)
  })
})

describe("planFill", () => {
  it("เติมที่ราคาปิดของวันถัดไป (ไม่ใช่ราคาวันตัดสินใจ) · stop คิดจากราคาเติม × stopPct × stopMult", () => {
    const p = planFill(order({ stopMult: 0.8 }), ctx())
    expect(p).toMatchObject({ kind: "fill", date: "2026-09-18", px: 11, slots: 1, note: null })
    if (p.kind === "fill") expect(p.stop).toBeCloseTo(11 * (1 - 0.09 * 0.8), 9)
  })

  it("ยังไม่มีข้อมูลวันทำการถัดไป → รอ", () => {
    expect(planFill(order({ afterDate: "2026-09-22" }), ctx()).kind).toBe("wait")
  })

  it("ไม่มีราคาวันเติม (หยุดซื้อขาย) → ยกเลิกพร้อมเหตุผลไทย ไม่เลื่อนไปวันที่ราคากลับมา", () => {
    const p = planFill(order({ symbol: "HALT" }), ctx())
    expect(p.kind).toBe("cancel")
    if (p.kind === "cancel") {
      expect(p.date).toBe("2026-09-18")
      expect(p.why).toContain("ไม่มีราคาปิด HALT วันเติม 2026-09-18")
      expect(p.epochChanged).toBe(false)
    }
    // หุ้นที่ไม่มีในข้อมูลเลย = ยกเลิกเช่นกัน
    expect(planFill(order({ symbol: "GONE" }), ctx()).kind).toBe("cancel")
  })

  it("sector ตรวจซ้ำกับพอร์ต ณ ตอนเติม: Banking ครบ 3 ชื่อแล้ว → ยกเลิก · งบ slots เหลือน้อย → ลดขนาด", () => {
    const sectorMap = new Map([
      ["BNK", "Banking"],
      ["B1", "Banking"],
      ["B2", "Banking"],
      ["B3", "Banking"],
    ])
    const held = ["B1", "B2", "B3"].map((symbol) => ({ symbol, entryDate: "2026-09-17", entryPx: 5, slots: 0.5 }))
    const full = planFill(order({ symbol: "BNK" }), ctx({ sectorMap, held }))
    expect(full.kind).toBe("cancel")
    if (full.kind === "cancel") expect(full.why).toContain("เต็มจำนวนชื่อแล้ว (3)")
    // งบของรอบ 2 slots มีสถานะแล้ว 1.5 → เหลือ 0.5 → ลดขนาดตอนเติม
    const tight = planFill(order({ maxSlots: 2 }), ctx({ held: [{ symbol: "X", entryDate: "2026-09-17", entryPx: 5, slots: 1.5 }] }))
    expect(tight).toMatchObject({ kind: "fill", slots: 0.5 })
    if (tight.kind === "fill") expect(tight.note).toContain("ลดขนาดตอนเติม")
  })

  it("มีสถานะหุ้นนี้อยู่แล้ว: เป็นไม้ของคำสั่งนี้ (วัน/ราคาเติมตรง) → done ไม่ซื้อซ้ำ · ไม้อื่น → ยกเลิก", () => {
    const mine = planFill(order(), ctx({ held: [{ symbol: "AAA", entryDate: "2026-09-18", entryPx: 11, slots: 1 }] }))
    expect(mine).toMatchObject({ kind: "done", date: "2026-09-18", px: 11 })
    const other = planFill(order(), ctx({ held: [{ symbol: "AAA", entryDate: "2026-09-10", entryPx: 9, slots: 1 }] }))
    expect(other.kind).toBe("cancel")
  })

  it("ยุคข้อมูลเปลี่ยน (seed / ล้าง demo) หลังส่งคำสั่ง → ยกเลิกโดยติดธง epochChanged", () => {
    const p = planFill(order({ epoch: 5 }), ctx({ epoch: 9 }))
    expect(p).toMatchObject({ kind: "cancel", epochChanged: true, date: null })
  })
})

describe("คิว + Decision ของคำสั่ง", () => {
  it("parse ข้ามแถวเสีย/JSON เสีย ไม่ throw · serialize แล้ว parse กลับได้เท่าเดิม", () => {
    const good = order()
    expect(parsePendingFills(serializePendingFills([good]))).toEqual([good])
    expect(parsePendingFills("{oops")).toEqual([])
    expect(parsePendingFills(null)).toEqual([])
    const raw = JSON.stringify({ v: 1, orders: [good, { ...good, id: "x", slots: -1 }, { ...good, id: "y", afterDate: "18/09" }, 5] })
    expect(parsePendingFills(raw).map((o) => o.id)).toEqual(["abc123"])
  })

  it("preview: วัน/ราคาที่จะเติม · ยังไม่มีข้อมูล = null · ไม่มีราคาวันเติม = fillPx null", () => {
    expect(previewPendingFill(order(), pivot)).toMatchObject({ fillDate: "2026-09-18", fillPx: 11 })
    expect(previewPendingFill(order({ afterDate: "2026-09-22" }), pivot)).toMatchObject({ fillDate: null, fillPx: null })
    expect(previewPendingFill(order({ symbol: "HALT" }), pivot)).toMatchObject({ fillDate: "2026-09-18", fillPx: null })
  })

  it("จัดประเภท Decision: วันตัดสินใจ (buy ไม่ executed + T1_TAG) · เติม (fill executed) · ยกเลิก (cancel)", () => {
    const queued = { question: "Q_ENTRY", action: "buy", executed: false, reason: queuedDecisionReason("n_tf=4", "abc123") }
    expect(queued.reason).toContain(T1_TAG)
    expect(isQueuedEntryDecision(queued)).toBe(true)
    expect(isQueuedEntryDecision({ ...queued, reason: "n_tf=4" })).toBe(false) // buy ที่ส่ง human gate
    expect(isFillDecision({ question: "Q_ENTRY", action: "fill", executed: true, reason: "" })).toBe(true)
    expect(isCancelDecision({ question: "Q_ENTRY", action: "cancel" })).toBe(true)
    const r = fillDecisionReason(order({ source: "human", gateId: 7, afterDate: "2026-09-18" }), "2026-09-21", 12, null)
    expect(r.startsWith("เติม T+1 ที่ราคาปิด 2026-09-21 (12.00) ของการตัดสินใจวันที่ 2026-09-17")).toBe(true)
    expect(r).toContain("gate #7 หลังข้อมูล 2026-09-18")
    expect(fillDecisionSource("auto")).toBe("lite")
    expect(fillDecisionSource("human")).toBe("human")
  })
})
