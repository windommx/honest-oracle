/// <reference types="bun-types" />
// bun test — กฎ Q_EXIT แบบ legacy ของสมอง Jev (pure)
import { describe, expect, it } from "bun:test"

import { legacyExitDecision } from "./exit"

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
