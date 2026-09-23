/// <reference types="bun-types" />
// bun test — กฎ Q_EXIT แบบ legacy ของสมอง Jev (pure)
import { describe, expect, it } from "bun:test"

import {
  applyTimeExit,
  exitKind,
  legacyExitDecision,
  NO_PRICE_EXIT_DAYS,
  noPriceStreak,
  timeExitReason,
} from "./exit"

const pos = (entryPx: number, stop: number) => ({ symbol: "XYZ", entryPx, stop })

describe("legacyExitDecision", () => {
  it("stop ที่ tighten เป็น +2% แล้วราคาหลุดลงมา → exit (เดิม hold เพราะไม่เคยเช็ก stop)", () => {
    const d = legacyExitDecision(pos(100, 102), 99, false, null)
    expect(d.action).toBe("exit")
    expect(d.conf).toBeGreaterThanOrEqual(0.75) // ผ่านเกณฑ์ Q_EXIT → ลงมือจริง
    expect(d.reason).toContain("หลุด stop 102.00")
  })

  it("stop ตั้งต้น −9% ราคา −10% → exit · ราคา −3% (เหนือ stop) → hold", () => {
    expect(legacyExitDecision(pos(100, 91), 90, true, null).action).toBe("exit")
    const h = legacyExitDecision(pos(100, 91), 97, true, null)
    expect(h.action).toBe("hold")
    expect(h.reason).toBe("ret=-3.0%")
  })

  it("กฎเดิมยังครบ: กำไร > 25% → exit · หลุดโผ & กำไร → tighten · ≤ −6% → exit", () => {
    expect(legacyExitDecision(pos(100, 91), 126, true, null)).toMatchObject({ action: "exit", reason: "กำไรใหญ่ ret=26.0%" })
    expect(legacyExitDecision(pos(100, 91), 105, false, null)).toMatchObject({ action: "tighten", conf: 0.8 })
    expect(legacyExitDecision(pos(100, 91), 105, true, null).action).toBe("hold")
    expect(legacyExitDecision(pos(100, 91), 93.5, true, null).action).toBe("exit")
  })

  it("ไม่มีราคาวันล่าสุด (พัก/หยุดซื้อขาย) → hold พร้อมราคาล่าสุดที่มีจริง ไม่ใช่ ret=0.0% ปลอม", () => {
    const d = legacyExitDecision(pos(100.4, 91), Number.NaN, false, { px: 97.7, date: "2026-08-10" })
    expect(d.action).toBe("hold")
    expect(d.reason).toContain("2026-08-10 ret=-2.7%")
    expect(d.reason).not.toContain("ret=0.0%")
    const none = legacyExitDecision(pos(100, 91), Number.NaN, false, null)
    expect(none.action).toBe("hold")
    expect(none.reason).not.toContain("ret=")
  })
})

describe("หุ้นหยุดซื้อขาย/ไม่มีราคา ≥ NO_PRICE_EXIT_DAYS วันทำการ → exit ที่ราคาปิดล่าสุดที่มี (2026-09-23)", () => {
  const lk = { px: 97.7, date: "2026-08-10" }

  it("ครบ 10 วัน → exit conf ผ่าน Q_EXIT พร้อมเหตุผลมาตรฐาน + ราคาล่าสุดที่ใช้ปิด (เดิม hold ตลอดไป)", () => {
    expect(NO_PRICE_EXIT_DAYS).toBe(10)
    const d = legacyExitDecision(pos(100.4, 91), Number.NaN, false, lk, 10)
    expect(d.action).toBe("exit")
    expect(d.conf).toBeGreaterThanOrEqual(0.75)
    expect(d.reason.startsWith("หยุดซื้อขาย/ไม่มีราคา 10 วัน — ปิดที่ราคาล่าสุดที่มี")).toBe(true)
    expect(d.reason).toContain("2026-08-10 ราคา 97.70 ret=-2.7%")
    expect(exitKind(d)).toBe("no_price")
    expect(legacyExitDecision(pos(100.4, 91), Number.NaN, false, lk, 30).reason).toContain("30 วัน")
  })

  it("9 วัน → ยัง hold (บอกความคืบหน้า 9/10) · ไม่รู้ราคาล่าสุด → hold (ไม่แต่งราคาปิด) · ไม่ส่งจำนวนวัน = พฤติกรรมเดิม", () => {
    const h = legacyExitDecision(pos(100.4, 91), Number.NaN, false, lk, 9)
    expect(h.action).toBe("hold")
    expect(h.reason).toContain("ไม่มีราคา 9/10 วัน")
    expect(legacyExitDecision(pos(100.4, 91), Number.NaN, false, null, 25).action).toBe("hold")
    expect(legacyExitDecision(pos(100.4, 91), Number.NaN, false, lk).action).toBe("hold")
  })

  it("noPriceStreak: นับวันทำการติดกันที่ไม่มีราคา · มีราคาวันนี้ = 0 · ไม่เคยมีราคา = null", () => {
    const px = [[10, NaN], [11, NaN], [NaN, NaN], [NaN, 5], [NaN, NaN]]
    expect(noPriceStreak(px, 0, 1)).toBe(0)
    expect(noPriceStreak(px, 0, 4)).toBe(3)
    expect(noPriceStreak(px, 1, 4)).toBe(1)
    expect(noPriceStreak(px, 1, 2)).toBeNull()
  })
})

describe("time exit — ถือครบ holdDefault วันทำการ → exit (2026-09-23)", () => {
  const hold = (reason = "ret=1.0%") => ({ question: "Q_EXIT" as const, target: "XYZ", action: "hold", conf: 0.6, reason })

  it("ครบกำหนด → exit conf 0.85 เหตุผล 'ครบกำหนดถือ N วัน (time exit)' + เก็บเหตุผลเดิมไว้ตรวจย้อนหลัง", () => {
    const d = applyTimeExit(hold(), 5, 5, true)
    expect(d.action).toBe("exit")
    expect(d.conf).toBeGreaterThanOrEqual(0.75)
    expect(d.reason.startsWith(timeExitReason(5))).toBe(true)
    expect(d.reason.startsWith("ครบกำหนดถือ 5 วัน (time exit)")).toBe(true)
    expect(d.reason).toContain("กฎเดิม: hold (ret=1.0%)")
    expect(exitKind(d)).toBe("time")
    expect(applyTimeExit(hold(), 9, 5, true).action).toBe("exit")
  })

  it("ยังไม่ครบ → คงเดิม · tighten ที่ครบกำหนด → exit", () => {
    expect(applyTimeExit(hold(), 4, 5, true)).toEqual(hold())
    const t = { ...hold("ret=3.0%"), action: "tighten", conf: 0.8 }
    expect(applyTimeExit(t, 5, 5, true).action).toBe("exit")
  })

  it("precedence: exit ของ Bayes/stop คงเหตุผลเดิม (stop มาก่อน time) · ไม่มีราคาวันนี้ = ยังออกไม่ได้", () => {
    const bayes = { question: "Q_EXIT" as const, target: "XYZ", action: "exit", conf: 0.85, reason: "bayes: dd=4.0% … → ออก" }
    expect(applyTimeExit(bayes, 12, 5, true)).toBe(bayes)
    expect(exitKind(bayes)).toBe("other")
    const noPx = legacyExitDecision(pos(100, 91), Number.NaN, true, { px: 99, date: "2026-09-18" }, 2)
    expect(applyTimeExit(noPx, 8, 5, false).action).toBe("hold")
  })

  it("ข้อมูลไม่ครบ (ไม่รู้วันเข้าในปฏิทิน / holdDefault ผิดรูป) → ไม่เดา (คงเดิม)", () => {
    expect(applyTimeExit(hold(), null, 5, true).action).toBe("hold")
    expect(applyTimeExit(hold(), 7, 0, true).action).toBe("hold")
    expect(applyTimeExit(hold(), 7, Number.NaN, true).action).toBe("hold")
  })
})
