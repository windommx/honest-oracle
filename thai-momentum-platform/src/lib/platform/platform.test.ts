/// <reference types="bun-types" />
// bun test — ตรรกะ pure ของ app shell / Command Center / Options (ไม่แตะ DB/เครือข่าย)
// รันซ้ำได้ใต้ TZ=UTC / Asia/Bangkok / America/Los_Angeles — ผลต้องเหมือนกัน
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import { readBangkokClock, setPhaseAt, type SetPhase } from "./market-session"
import { daysBetween, ictDate, lastDayOfMonth } from "./dates"
import { resolveGtaaCountdown, weeklyDdRatio } from "./command-center"
import { paletteFilter } from "./palette"
import { hotkeyOf, type HotkeyEventLike } from "./hotkeys"
import { DEFAULT_PREFS, FEATURE_IDS, loadPrefs, normalizeOrder, type FeatureId } from "./dashboard-prefs"
import { BUILTIN_PRESETS, deleteUserPreset, loadUserPresets, saveUserPreset } from "./dashboard-presets"

const hm = (h: number, m: number) => h * 60 + m

describe("setPhaseAt — ตารางเวลา SET (มีผล 25 มี.ค. 2567)", () => {
  it("วันทำการ: พรีเปิด → เช้า → พักกลางวัน → พรีเปิดบ่าย → บ่าย → pre-close → ปิด", () => {
    const cases: [number, SetPhase][] = [
      [hm(9, 0), "closed"], // เดิมโชว์ "พรีเปิด" ตั้งแต่ 09:00
      [hm(9, 29), "closed"],
      [hm(9, 30), "pre"],
      [hm(9, 59), "pre"],
      [hm(10, 0), "open"],
      [hm(12, 29), "open"],
      [hm(12, 30), "break"],
      [hm(13, 0), "break"], // เดิมโชว์ "SET เปิด" ตอนพักกลางวัน
      [hm(13, 29), "break"],
      [hm(13, 30), "pre"],
      [hm(13, 59), "pre"],
      [hm(14, 0), "open"],
      [hm(16, 29), "open"],
      [hm(16, 30), "preclose"],
      [hm(16, 39), "preclose"],
      [hm(16, 40), "closed"],
      [hm(23, 59), "closed"],
      [0, "closed"],
    ]
    for (const [m, want] of cases) expect(`${m}:${setPhaseAt("Tue", m)}`).toBe(`${m}:${want}`)
  })

  it("เสาร์–อาทิตย์ปิดทั้งวัน", () => {
    expect(setPhaseAt("Sat", hm(11, 0))).toBe("closed")
    expect(setPhaseAt("Sun", hm(14, 30))).toBe("closed")
  })
})

describe("readBangkokClock — ไม่ขึ้นกับ timezone ของเครื่อง", () => {
  it("13:00 ICT วันอังคาร = พักกลางวัน", () => {
    const c = readBangkokClock(new Date("2026-09-22T06:00:00Z"))
    expect(c).toEqual({ clock: "13:00:00", weekday: "Tue", minuteOfDay: hm(13, 0), phase: "break" })
  })
  it("10:15:30 ICT = เปิด · เสาร์ 11:00 = ปิด", () => {
    expect(readBangkokClock(new Date("2026-09-22T03:15:30Z")).phase).toBe("open")
    expect(readBangkokClock(new Date("2026-09-19T04:00:00Z"))).toMatchObject({ weekday: "Sat", phase: "closed" })
  })
  it("เที่ยงคืนแสดง 00 ไม่ใช่ 24 และข้ามวันตามกรุงเทพ", () => {
    // 17:00Z วันอังคาร = 00:00 วันพุธที่กรุงเทพ
    expect(readBangkokClock(new Date("2026-09-22T17:00:05Z"))).toMatchObject({ clock: "00:00:05", weekday: "Wed", minuteOfDay: 0 })
  })
})

describe("ictDate / daysBetween / lastDayOfMonth", () => {
  it("วันที่ปฏิทินกรุงเทพ (ops pulse: อายุ Evidence Night)", () => {
    expect(ictDate(new Date("2026-09-22T20:30:00Z"))).toBe("2026-09-23") // 03:30 ICT — เดิมนับเป็นวันที่ UTC 22
    expect(ictDate(new Date("2026-09-22T16:59:59Z"))).toBe("2026-09-22")
    expect(ictDate(new Date("2026-09-22T17:00:00Z"))).toBe("2026-09-23")
    expect(ictDate(new Date("2026-09-30T17:00:00Z"))).toBe("2026-10-01")
    expect(ictDate(new Date("2026-12-31T17:30:00Z"))).toBe("2027-01-01")
  })
  it("run 30 วัน ICT ก่อน = 30 (ผ่านเกณฑ์ ≤ 30) ไม่ใช่ 31", () => {
    expect(daysBetween(ictDate(new Date("2026-08-23T18:00:00Z")), "2026-09-23")).toBe(30)
    expect(daysBetween(ictDate(new Date("2026-09-22T20:30:00Z")), "2026-09-23")).toBe(0)
  })
  it("daysBetween นับด้วยเที่ยงคืน UTC — ไม่เพี้ยนช่วง DST / ข้ามเดือน / สตริงเสีย", () => {
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2)
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2)
    expect(daysBetween("2026-12-15", "2026-10-31")).toBe(-45)
    expect(daysBetween("", "2026-10-31")).toBeNull()
    expect(daysBetween("—", "2026-10-31")).toBeNull()
  })
  it("lastDayOfMonth", () => {
    expect(lastDayOfMonth("2026-02")).toBe("2026-02-28")
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29")
    expect(lastDayOfMonth("2026-09")).toBe("2026-09-30")
    expect(lastDayOfMonth("2026-12")).toBe("2026-12-31")
    expect(lastDayOfMonth("2026-13")).toBeNull()
    expect(lastDayOfMonth("—")).toBeNull()
    expect(lastDayOfMonth("")).toBeNull()
  })
})

describe("weeklyDdRatio — Risk Radar (สัญญา /api/portfolio: maxWeeklyDD = -0.05)", () => {
  it("นับเฉพาะขาดทุน เทียบขนาดเพดาน — ratio ≥ 1 ตรงกับ kill switch (weeklyDD ≤ maxWeeklyDD)", () => {
    expect(weeklyDdRatio(-0.07, -0.05)).toBe(1) // เดิม 0 (เพราะเช็ก maxWeeklyDD > 0) ทั้งที่ kill switch ติด
    expect(weeklyDdRatio(-0.05, -0.05)).toBe(1)
    expect(weeklyDdRatio(-0.03, -0.05)).toBeCloseTo(0.6, 10)
    expect(weeklyDdRatio(0.0638, -0.05)).toBe(0) // สัปดาห์ที่กำไร (demo) ไม่ใช่ drawdown
    expect(weeklyDdRatio(0, -0.05)).toBe(0)
  })
  it("ข้อมูลไม่พร้อม/เพี้ยน = 0 · เพดานบวกก็ใช้ขนาดเดียวกัน", () => {
    expect(weeklyDdRatio(null, -0.05)).toBe(0)
    expect(weeklyDdRatio(undefined, undefined)).toBe(0)
    expect(weeklyDdRatio(Number.NaN, -0.05)).toBe(0)
    expect(weeklyDdRatio(-0.02, 0)).toBe(0)
    expect(weeklyDdRatio(-0.03, 0.05)).toBeCloseTo(0.6, 10)
  })
})

describe("resolveGtaaCountdown — นับถอยหลังรอบ GTAA ไม่ติดลบ", () => {
  const cal = { date: "2026-12-31", daysLeft: 16 }
  it("เอนจินยังไม่เลยกำหนด = ใช้ปิดเดือน nextDecisionMonth", () => {
    expect(resolveGtaaCountdown("2026-09-23", "2026-10", { date: "2026-09-30", daysLeft: 7 })).toEqual({
      date: "2026-10-31",
      daysLeft: 38,
      source: "engine",
    })
    expect(resolveGtaaCountdown("2026-10-31", "2026-10", null)).toEqual({ date: "2026-10-31", daysLeft: 0, source: "engine" })
  })
  it("panel GTAA ค้าง (วันปิดรอบผ่านไปแล้ว) = ใช้สิ้นเดือนตามปฏิทินจาก pulse — เดิมได้ 'อีก -45 วัน'", () => {
    expect(resolveGtaaCountdown("2026-12-15", "2026-10", cal)).toEqual({ ...cal, source: "calendar" })
    expect(resolveGtaaCountdown("2026-12-15", "2026-10", null)).toEqual({ date: null, daysLeft: null, source: null })
  })
  it("ยังไม่มีข้อมูลเอนจิน / วันที่ / รูปแบบเดือนเสีย", () => {
    expect(resolveGtaaCountdown("2026-12-15", null, cal).source).toBe("calendar")
    expect(resolveGtaaCountdown(null, "2027-01", cal).source).toBe("calendar")
    expect(resolveGtaaCountdown("2026-12-15", "—", cal).source).toBe("calendar")
    expect(resolveGtaaCountdown(null, null, undefined)).toEqual({ date: null, daysLeft: null, source: null })
  })
})

describe("paletteFilter — ป้ายตรงคำค้นขึ้นก่อน", () => {
  const signals = { v: "สัญญาณ", kw: ["signals", "สัญญาณ & วิจัย"] }
  const flagship = { v: "สัญญาณเรือธง (Flagship 1–10)", kw: ["flagship", "สัญญาณ & วิจัย"] }
  it("พิมพ์ 'สัญญาณ' → แท็บ สัญญาณ ชนะ Flagship (เดิมเสมอกัน 0.99 แล้วชนะด้วยลำดับ DOM)", () => {
    const a = paletteFilter(signals.v, "สัญญาณ", signals.kw)
    const b = paletteFilter(flagship.v, "สัญญาณ", flagship.kw)
    expect(a).toBe(1)
    expect(b).toBeGreaterThan(0)
    expect(b).toBeLessThan(a)
  })
  it("ค้นด้วยรหัสแท็บ/ชื่อกลุ่มยังเจอ · ไม่ตรงเลย = 0 · ไม่สนตัวพิมพ์/ช่องว่าง", () => {
    expect(paletteFilter(signals.v, "signals", signals.kw)).toBeGreaterThan(0)
    expect(paletteFilter(flagship.v, "flag", flagship.kw)).toBeGreaterThan(0)
    expect(paletteFilter(signals.v, "zzzz", signals.kw)).toBe(0)
    expect(paletteFilter("Jev AI", "  jev ai ", ["jev", "ระบบเทรด"])).toBe(1)
  })
})

describe("hotkeyOf — คีย์ลัดไม่ทะลุการพิมพ์/overlay", () => {
  const el = (tagName: string, opts: { editable?: boolean; inOverlay?: boolean } = {}) =>
    ({
      tagName,
      isContentEditable: opts.editable ?? false,
      closest: (sel: string) => (opts.inOverlay && sel.includes('[role="dialog"]') ? {} : null),
    }) as unknown as EventTarget
  const ev = (key: string, target: EventTarget | null, mods: Partial<HotkeyEventLike> = {}): HotkeyEventLike => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    target,
    ...mods,
  })
  it("ปุ่มเดี่ยวบนหน้า = ส่งต่อ (ตัวเล็ก)", () => {
    expect(hotkeyOf(ev("o", el("DIV")))).toBe("o")
    expect(hotkeyOf(ev("O", el("BUTTON")))).toBe("o")
    expect(hotkeyOf(ev("Escape", el("BODY")))).toBe("escape")
    expect(hotkeyOf(ev("?", null))).toBe("?")
  })
  it("กดคู่ ⌘/Ctrl/Alt = ปล่อยผ่าน", () => {
    expect(hotkeyOf(ev("k", el("DIV"), { metaKey: true }))).toBeNull()
    expect(hotkeyOf(ev("k", el("DIV"), { ctrlKey: true }))).toBeNull()
    expect(hotkeyOf(ev("r", el("DIV"), { altKey: true }))).toBeNull()
  })
  it("กำลังพิมพ์ = ไม่ทำงาน", () => {
    expect(hotkeyOf(ev("r", el("INPUT")))).toBeNull()
    expect(hotkeyOf(ev("r", el("textarea")))).toBeNull()
    expect(hotkeyOf(ev("r", el("SELECT")))).toBeNull()
    expect(hotkeyOf(ev("r", el("DIV", { editable: true })))).toBeNull()
  })
  it("โฟกัสอยู่ใน dialog/เมนูที่เปิดอยู่ = ไม่ทำงาน (กันคีย์ทะลุ overlay)", () => {
    expect(hotkeyOf(ev("d", el("DIV", { inOverlay: true })))).toBeNull()
    expect(hotkeyOf(ev("escape", el("BUTTON", { inOverlay: true })))).toBeNull()
  })
  it("event ที่ไม่มี key (เช่น autofill) = ไม่พัง", () => {
    expect(hotkeyOf(ev(undefined as unknown as string, el("DIV")))).toBeNull()
  })
})

// ---------------------------------------------------------------------
// prefs v3 + migration v1/v2 · พรีเซ็ตผู้ใช้ (localStorage จำลอง)
// ---------------------------------------------------------------------

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    _m: m,
  }
}

describe("dashboard prefs / presets", () => {
  const g = globalThis as { window?: unknown }
  let store: ReturnType<typeof fakeStorage>
  beforeEach(() => {
    store = fakeStorage()
    g.window = { localStorage: store }
  })
  afterEach(() => {
    delete g.window
  })

  it("normalizeOrder: ทิ้งตัวปลอม/ซ้ำ แล้วต่อท้ายตัวที่ขาดครบทุก id", () => {
    const out = normalizeOrder(["ops", "bogus" as FeatureId, "ops", "posture"])
    expect(out.slice(0, 2)).toEqual(["ops", "posture"])
    expect([...out].sort()).toEqual([...FEATURE_IDS].sort())
  })

  it("v3 เสีย (JSON พัง / ชนิดผิด) = ค่าเริ่มต้น ไม่ throw", () => {
    store.setItem("tpx.dashboard-prefs.v3", "{not json")
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
    store.setItem("tpx.dashboard-prefs.v3", JSON.stringify({ density: 5, modules: "x", order: "nope", layout: "dual" }))
    const p = loadPrefs()
    expect(p.density).toBe("comfortable")
    expect(p.layout).toBe("dual")
    expect(p.order).toEqual([...FEATURE_IDS])
    expect(Object.values(p.modules).every(Boolean)).toBe(true)
  })

  it("ย้ายค่า v2 → v3 (เก็บ density/autoRefresh/modules) แล้วบันทึก v3", () => {
    store.setItem("tpx.dashboard-prefs.v2", JSON.stringify({ density: "compact", autoRefresh: "30", modules: { lab: false } }))
    const p = loadPrefs()
    expect(p).toMatchObject({ density: "compact", autoRefresh: "30", layout: "single", showOptions: true })
    expect(p.modules.lab).toBe(false)
    expect(p.modules.posture).toBe(true)
    expect(JSON.parse(store.getItem("tpx.dashboard-prefs.v3")!)).toEqual(p)
  })

  it("ย้ายค่า v1 (sections) → v3 · v2 เสียแล้วลอง v1 ต่อ", () => {
    store.setItem("tpx.dashboard-prefs.v2", "null")
    store.setItem("tpx.dashboard-prefs.v1", JSON.stringify({ density: "compact", sections: { feeds: false, kpi: true } }))
    const p = loadPrefs()
    expect(p.density).toBe("compact")
    expect([p.modules.evidence, p.modules.lab, p.modules.topstocks, p.modules.jevfeed]).toEqual([false, false, false, false])
    expect(p.modules.vitals && p.modules.ops).toBe(true)
  })

  it("พรีเซ็ต: ชื่อซ้ำ = ทับตัวเดิม · สูงสุด 8 · ตัวเสียในที่เก็บถูกข้าม", () => {
    for (let i = 1; i <= 9; i++) saveUserPreset(`p${i}`, { ...DEFAULT_PREFS, density: i % 2 ? "compact" : "comfortable" })
    let list = loadUserPresets()
    expect(list.length).toBe(8)
    expect(list[0].name).toBe("p9")
    expect(list.map((p) => p.name)).not.toContain("p1")
    list = saveUserPreset("  p5  ", { ...DEFAULT_PREFS, layout: "dual" })
    expect(list.filter((p) => p.name === "p5").length).toBe(1)
    expect(list[0]).toMatchObject({ name: "p5", snapshot: { layout: "dual" } })
    expect(deleteUserPreset(list[0].id).some((p) => p.name === "p5")).toBe(false)

    store.setItem("tpx.dashboard-presets.v1", JSON.stringify([{ id: 1 }, null, { id: "a", name: "ok", snapshot: { density: "compact", order: ["gtaa"] } }]))
    const loaded = loadUserPresets()
    expect(loaded.length).toBe(1)
    expect(loaded[0].snapshot.order[0]).toBe("gtaa")
    expect(loaded[0].snapshot.order.length).toBe(FEATURE_IDS.length)
  })

  it("พรีเซ็ตในตัวครบทุก id และลำดับถูก normalize", () => {
    for (const p of BUILTIN_PRESETS) {
      expect([...p.snapshot.order].sort()).toEqual([...FEATURE_IDS].sort())
      expect(Object.keys(p.snapshot.modules).sort()).toEqual([...FEATURE_IDS].sort())
    }
  })
})
