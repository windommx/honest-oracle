/// <reference types="bun-types" />
import { describe, expect, it, mock } from "bun:test"

import { makeKey, makeSynthKey } from "./keys"
import { outcomeRFromCloses, outcomeRIfResolved } from "./outcome"
import { panelStatesFromRows, type PanelRow } from "./panel-state"
import { ruleEngine } from "./rule-engine"
import type { StatePacket } from "./state"
import { EDGE_CASE_TYPES, generateBatch } from "./synth-state"

// ---------------- fake z-ai-web-dev-sdk (ไม่แตะเครือข่าย) ----------------
type FakeMode = "ok" | "junk" | "throw" | "hang" | "conf85" | "confStr"
const fake = { createFails: true, mode: "ok" as FakeMode, calls: 0 }
const okContent = (action: string, confidence: unknown) =>
  JSON.stringify({ action, confidence, gates: { regime: 1, selection: 1, level: 1, trigger: 1, risk: 1 }, edge_case_note: "" })
class FakeZAI {
  static async create() {
    if (fake.createFails) throw new Error("Configuration file not found or invalid.")
    return new FakeZAI()
  }
  chat = {
    completions: {
      create: async () => {
        fake.calls++
        switch (fake.mode) {
          case "throw":
            throw new Error("fetch failed: ECONNREFUSED")
          case "hang":
            return new Promise(() => {})
          case "junk":
            return { choices: [{ message: { content: "Sure! You should buy it." } }] }
          case "conf85":
            return { choices: [{ message: { content: okContent("ENTER_LONG", 85) } }] }
          case "confStr":
            return { choices: [{ message: { content: okContent("ENTER_LONG", "0.85") } }] }
          default:
            return { choices: [{ message: { content: "```json\n" + okContent("NO_TRADE", 0.2) + "\n```" } }] }
        }
      },
    },
  }
}
mock.module("z-ai-web-dev-sdk", () => ({ default: FakeZAI }))
const { decide, decideBatch, firstUnavailable } = await import("./nimble")

// ---------------- fixtures ----------------
function goodPacket(over: Partial<StatePacket> = {}): StatePacket {
  return {
    asset: "PTT",
    tf: "1D",
    date: "2026-09-22",
    regime: { pass: true, fresh_cross: false, close_vs_200dma: 1.1, slope_20d: 0.02, index_ok: true },
    selection: { rs_pct: 90, eps_yoy: 0.3, catalyst_days: 60 },
    level: { type: "pullback", zone: [99, 101], status: "active", dist_pct: 0.5 },
    trigger: { candle_closed: true, pattern: "T2", in_zone: true, wick_ratio: 1.2, close_pos_in_range: 0.7 },
    risk: { entry: 100.2, stop: 98, stop_dist_pct: 2.2, rr_to_next_supply: 4.5, size_R: 1, tradeable: true },
    context: { day_pnl_R: 0, week_pnl_R: 0, loss_streak: 0 },
    ...over,
  }
}

function allFinite(o: unknown): boolean {
  if (typeof o === "number") return Number.isFinite(o)
  if (o && typeof o === "object") return Object.values(o).every(allFinite)
  return true
}

// panel 300 วันทำการ: AAA ขาขึ้น → ย่อ 9 วันเข้าโซนต่ำสุด 20 วัน → เด้ง +3.5% (T2 ในโซน)
function panelRows(): PanelRow[] {
  const days = 300
  const dates = Array.from({ length: days }, (_, t) => {
    const d = new Date(Date.UTC(2025, 0, 1) + t * 86400000)
    return d.toISOString().slice(0, 10)
  })
  const aaa: number[] = []
  for (let t = 0; t < days; t++) {
    if (t < 290) aaa.push(100 * Math.pow(1.004, t))
    else if (t < 299) aaa.push(aaa[t - 1] * 0.994)
    else aaa.push(aaa[t - 1] * 1.035)
  }
  const rows: PanelRow[] = []
  for (let t = 0; t < days; t++) {
    const add = (symbol: string, close: number) => rows.push({ date: dates[t], symbol, close, val: 5e6, liq5: 1 })
    add("AAA", aaa[t])
    add("BBB", 50 * Math.pow(1.002, t))
    add("CCC", 20 * Math.pow(1.001, t))
    if (t % 25 !== 3) add("DDD", 30 * Math.pow(1.0015, t)) // หยุดพักการซื้อขายเป็นช่วง ๆ (ยังมีบาร์ ≥ 260)
    if (t >= 200) add("EEE", 10 + t / 100) // IPO ใหม่ — บาร์ไม่ถึง 260
  }
  rows.sort((a, b) => (a.date === b.date ? (a.symbol < b.symbol ? -1 : 1) : a.date < b.date ? -1 : 1))
  return rows
}

// ================================================================
describe("keys", () => {
  it("makeKey = md5('<date>|<asset>')[:12] เท่ากับ nimble_runner.state_key ของ Python", () => {
    expect(makeKey("2026-09-19", "KCE")).toBe("d82f4f8a9359")
    expect(makeKey("2026-09-22", "PTT")).toBe("c1cdb712dd98")
    expect(makeKey("2026-09-22", "ปตท")).toBe("95aef57ec7cd") // UTF-8 ทั้งสองฝั่ง
    expect(makeKey("", "X")).toBe("90219ca464e9")
  })

  it("synth key ไม่ชนกับคีย์ panel ของ (วัน, หุ้น) เดียวกัน และ state ต่างกันได้คีย์ต่างกัน", () => {
    const a = goodPacket()
    const b = goodPacket({ selection: { rs_pct: 91, eps_yoy: 0.3, catalyst_days: 60 } })
    expect(makeSynthKey(a)).not.toBe(makeKey(a.date ?? "", a.asset))
    expect(makeSynthKey(a)).not.toBe(makeSynthKey(b))
    expect(makeSynthKey(a)).toBe(makeSynthKey(goodPacket()))
    expect(makeSynthKey(a)).toMatch(/^[0-9a-f]{12}$/)
  })

  it("synth batch จริงไม่มีคีย์ชนกันเอง (เดิม md5(date|asset) ชน ~10% ต่อ batch 12)", () => {
    const batch = generateBatch(200, 4242)
    expect(new Set(batch.map((p) => makeSynthKey(p))).size).toBe(200)
  })
})

// ================================================================
describe("outcome", () => {
  it("ไม้ที่ยังเปิด (มีอนาคต 2 บาร์ ไม่โดน stop ไม่ถึง 2R) ยังสรุปผลไม่ได้ → null (เดิมบันทึก -1R ถาวร)", () => {
    // เคสจริงจาก demo DB: kmg entry 24.98 stop 15.86 → close 23.113, 24.929
    expect(outcomeRIfResolved([23.113, 24.929], 24.98, 15.86, 20)).toBeNull()
    expect(outcomeRIfResolved([], 24.98, 15.86, 20)).toBeNull()
  })

  it("โดน stop ภายในบาร์ที่มี → สรุปได้ทันที (-1R)", () => {
    expect(outcomeRIfResolved([99, 94], 100, 95, 20)).toBe(-1)
  })

  it("ครบ horizon โดยไม่โดน stop และไม่ถึง 2R → สรุปตามสเปก (-1R)", () => {
    const closes = Array.from({ length: 20 }, () => 101)
    expect(outcomeRIfResolved(closes, 100, 95, 20)).toBe(-1)
    expect(outcomeRIfResolved(closes.slice(0, 19), 100, 95, 20)).toBeNull()
  })

  it("แตะ 2R แล้วเลื่อน stop มาเท่าทุน (breakeven) — ย่อกลับใต้ entry = ออกทันที", () => {
    // entry 100 stop 95 → 2R = 110; แท่ง 111 = 1 + 0.5·(11/5) = 2.1R แล้ว 99 ≤ BE 100 → ออกที่ 2.1R
    // ไม่มี BE (โค้ดเดิม): trail ค้างที่ 97/99 → ถือต่อจน 130 = 4.0R
    expect(outcomeRFromCloses([97, 111, 99, 130], 100, 95, 20)).toBeCloseTo(2.1, 10)
    expect(outcomeRIfResolved([97, 111, 99, 130], 100, 95, 20)).toBeCloseTo(2.1, 10)
  })

  it("trail = 3-bar low (close-proxy) ไม่ใช่ 2 แท่ง", () => {
    // 2-bar trail เดิม: ออกที่ 113 (ต่ำกว่า min(120,115)=115) ได้ 3.0R
    // 3-bar: trail = min(120,115,113)=113 → 113 ยังไม่หลุด → วิ่งต่อถึง 140 = 1 + 0.5·(40/5) = 5.0R
    expect(outcomeRFromCloses([111, 120, 115, 113, 140], 100, 95, 20)).toBe(5)
  })

  it("entry/stop เพี้ยน: resolved = null (ห้ามปลอม -1R), outcomeRFromCloses คง -1 ตามสัญญาเดิม", () => {
    expect(outcomeRIfResolved([100, 101], 100, 100, 20)).toBeNull()
    expect(outcomeRIfResolved([100, 101], 0, -1, 20)).toBeNull()
    expect(outcomeRFromCloses([100, 101], 100, 100, 20)).toBe(-1)
  })
})

// ================================================================
describe("rule engine (5 gates + day_pnl_R > -2)", () => {
  it("ทุกประตูผ่าน → ENTER_LONG; day_pnl_R = -2 → breaker (ต้อง > -2 เคร่ง)", () => {
    expect(ruleEngine(goodPacket()).action).toBe("ENTER_LONG")
    expect(ruleEngine(goodPacket({ context: { day_pnl_R: -1.99, week_pnl_R: 0, loss_streak: 0 } })).action).toBe("ENTER_LONG")
    const brk = ruleEngine(goodPacket({ context: { day_pnl_R: -2, week_pnl_R: 0, loss_streak: 0 } }))
    expect(brk.action).toBeNull()
    expect(brk.gates).toEqual({ regime: 1, selection: 1, level: 1, trigger: 1, risk: 1 })
  })

  it("แต่ละประตูตกเดี่ยว ๆ → NO_TRADE และ gate นั้น = 0", () => {
    const p = goodPacket()
    const cases: [keyof ReturnType<typeof ruleEngine>["gates"], StatePacket][] = [
      ["regime", { ...p, regime: { ...p.regime, pass: false } }],
      ["selection", { ...p, selection: { rs_pct: 79.99, eps_yoy: 0.3, catalyst_days: 60 } }],
      ["level", { ...p, level: { ...p.level, status: "frozen" } }],
      ["trigger", { ...p, trigger: { ...p.trigger, pattern: null } }],
      ["trigger", { ...p, trigger: { ...p.trigger, in_zone: false } }],
      ["risk", { ...p, risk: { ...p.risk, tradeable: false } }],
    ]
    for (const [gate, s] of cases) {
      const d = ruleEngine(s)
      expect(d.action).toBeNull()
      expect(d.gates[gate]).toBe(0)
    }
  })

  it("G2 selection: RS ≥80 และ (EPS ≥20% หรือ catalyst ≤90 วัน)", () => {
    const sel = (rs: number, eps: number, cat: number | null) =>
      ruleEngine(goodPacket({ selection: { rs_pct: rs, eps_yoy: eps, catalyst_days: cat } })).gates.selection
    expect(sel(80, 0.2, null)).toBe(1)
    expect(sel(80, 0.1, 90)).toBe(1)
    expect(sel(80, 0.1, 91)).toBe(0)
    expect(sel(80, 0.19, null)).toBe(0)
  })
})

// ================================================================
describe("synth-state", () => {
  it("seed เดิม → ชุดเดิม (ภายในวันเดียวกัน)", () => {
    expect(JSON.stringify(generateBatch(30, 123))).toBe(JSON.stringify(generateBatch(30, 123)))
  })

  it("edge case 10 แบบมีครบ และตัดประตูตามที่คอมเมนต์ระบุ", () => {
    const byType = new Map<string, StatePacket[]>()
    for (const s of generateBatch(4000, 42)) {
      const t = s.edge_case_note?.split(":")[0]
      if (t) byType.set(t, [...(byType.get(t) ?? []), s])
    }
    expect([...byType.keys()].sort()).toEqual([...EDGE_CASE_TYPES].sort())
    for (const s of byType.get("gap_through_zone")!) expect(ruleEngine(s).gates.trigger).toBe(0)
    for (const s of byType.get("near_miss_trigger")!) expect(ruleEngine(s).gates.trigger).toBe(0)
    for (const s of byType.get("regime_slope_flat")!) expect(ruleEngine(s).gates.regime).toBe(0)
    for (const s of byType.get("stop_too_wide")!) expect(ruleEngine(s).gates.risk).toBe(0)
    for (const s of byType.get("rr_too_low")!) expect(ruleEngine(s).gates.risk).toBe(0)
    for (const s of byType.get("loss_streak_active")!) expect(ruleEngine(s).action).toBeNull()
    for (const s of byType.get("regime_fresh_cross")!) expect(ruleEngine(s).gates.regime).toBe(1)
    for (const s of byType.get("weak_trigger")!) expect(ruleEngine(s).gates.trigger).toBe(1)
    for (const s of byType.get("spoof_zone")!) {
      expect(ruleEngine(s).gates.level).toBe(1)
      expect(ruleEngine(s).gates.trigger).toBe(1)
    }
  })
})

// ================================================================
describe("panel-state (pure)", () => {
  it("ไม่มีข้อมูล → ว่างอย่างสุภาพ", () => {
    expect(panelStatesFromRows([])).toEqual({ date: "", states: [] })
  })

  it("G5 ผ่านได้จริง: ย่อเข้าโซนแล้ว stop = ใต้โซน (ไม่ใช่ 6% เสมอ) → rule ENTER_LONG ได้", () => {
    const p = panelStatesFromRows(panelRows())
    expect(p.date).toBe("2025-10-27")
    const aaa = p.states.find((s) => s.asset === "AAA")!
    expect(aaa).toBeDefined()
    expect(aaa.packet.trigger.pattern).toBe("T2")
    expect(aaa.packet.trigger.in_zone).toBe(true)
    expect(aaa.packet.risk.stop_dist_pct).toBeLessThan(6)
    expect(aaa.packet.risk.rr_to_next_supply).toBeGreaterThanOrEqual(2)
    expect(aaa.packet.risk.tradeable).toBe(true) // เดิม stop=min(zoneLo, 0.94c) → RR ≤ 1.62 → false เสมอ
    expect(ruleEngine(aaa.packet).action).toBe("ENTER_LONG")
    expect(aaa.stopPx).toBeLessThan(aaa.entryPx)
  })

  it("หุ้นหยุดพัก/IPO ใหม่: ไม่มี NaN/Infinity ใน packet, IPO บาร์ไม่พอถูกตัด, stop ไม่เกินเพดาน", () => {
    const p = panelStatesFromRows(panelRows())
    expect(p.states.map((s) => s.asset).sort()).toEqual(["AAA", "BBB", "CCC", "DDD"])
    for (const s of p.states) {
      expect(allFinite(s.packet)).toBe(true)
      expect(s.packet.risk.stop_dist_pct).toBeLessThanOrEqual(6.3)
      expect(s.stopPx).toBeLessThan(s.entryPx)
    }
  })

  it("วันล่าสุดหุ้นไม่มีสภาพคล่อง → ไม่เป็นผู้สมัคร", () => {
    const rows = panelRows().map((r) => (r.symbol === "AAA" && r.date === "2025-10-27" ? { ...r, liq5: 0 } : r))
    expect(panelStatesFromRows(rows).states.some((s) => s.asset === "AAA")).toBe(false)
  })
})

// ================================================================
describe("nimble (SDK ปลอม)", () => {
  it("config ยังไม่มี → unavailable; เพิ่ม config แล้วเรียกใหม่ได้ทันที (ไม่แคช error)", async () => {
    fake.createFails = true
    const d1 = await decide(goodPacket())
    expect(d1.unavailable).toBe(true)
    expect(d1.error).toContain("Configuration")
    fake.createFails = false
    fake.mode = "ok"
    const d2 = await decide(goodPacket())
    expect(d2.error).toBeUndefined()
    expect(d2.unavailable).toBeUndefined()
    expect(d2.action).toBe("NO_TRADE")
    expect(d2.confidence).toBe(0.2)
  })

  it("เครือข่ายล้ม → unavailable (ไม่ใช่การตัดสิน); JSON เพี้ยน → error แต่ไม่ unavailable", async () => {
    fake.mode = "throw"
    const t = await decide(goodPacket())
    expect(t.unavailable).toBe(true)
    fake.mode = "junk"
    const j = await decide(goodPacket())
    expect(j.error).toBe("json_parse_failed")
    expect(j.unavailable).toBeUndefined()
  })

  it("LLM ค้าง → timeout คืน unavailable (ไม่แขวน request)", async () => {
    fake.mode = "hang"
    const t0 = Date.now()
    const d = await decide(goodPacket(), { timeoutMs: 50 })
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(d.unavailable).toBe(true)
    expect(d.error).toContain("timeout")
  })

  it("confidence นอกช่วง 0..1 (85) = grammar ไม่ผ่าน; \"0.85\" (string) ยอมรับ", async () => {
    fake.mode = "conf85"
    expect((await decide(goodPacket())).error).toBeDefined()
    fake.mode = "confStr"
    const s = await decide(goodPacket())
    expect(s.error).toBeUndefined()
    expect(s.confidence).toBe(0.85)
  })

  it("decideBatch หยุดยิงหลังโมเดลติดต่อไม่ได้ + firstUnavailable ชี้สาเหตุ", async () => {
    fake.mode = "throw"
    fake.calls = 0
    const out = await decideBatch(generateBatch(20, 1))
    expect(out.length).toBe(20)
    expect(out.every((d) => d.unavailable === true)).toBe(true)
    expect(fake.calls).toBeLessThanOrEqual(6)
    expect(firstUnavailable(out)).toContain("ECONNREFUSED")
    fake.mode = "ok"
    const ok = await decideBatch(generateBatch(8, 2))
    expect(firstUnavailable(ok)).toBeNull()
  })
})
