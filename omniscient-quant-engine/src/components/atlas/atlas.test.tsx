// ============================================================
// หน้า "Atlas พฤติกรรมระบบ" — สเกลสีจำนวนนับ + การแสดงผล/interaction ของ AtlasView (happy-dom · fetch stub)
// fixture มาจาก computeAtlas บนข้อมูลจำลองจริงของแพลตฟอร์ม (ไม่แตะ DB/เครือข่าย)
// ============================================================

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { SEQUENTIAL, sequentialColor } from "@/components/charts/chart-kit"
import { computeAtlas } from "@/lib/atlas/compute"
import type { AtlasResponse } from "@/lib/atlas/types"
import { runBacktest } from "@/lib/quant/engine/backtest"
import { buildMarketState } from "@/lib/quant/engine/panel"
import { dayFeatureMatrix } from "@/lib/rhythm/compute"
import { rhythmBase } from "@/lib/rhythm/service"
import { AtlasView } from "./atlas-view"

const data = { kind: "synthetic", label: "ข้อมูลจำลองเพื่อการสาธิต · ทดสอบ" }
let atlas: AtlasResponse
const realFetch = globalThis.fetch

beforeAll(async () => {
  const state = await buildMarketState()
  const base = rhythmBase(state)!
  atlas = computeAtlas({
    state,
    t0: base.t0,
    t1: base.t1,
    gates: base.gates,
    dayMap: base.dayMap,
    breadth: base.breadth,
    features: dayFeatureMatrix(state, base.t0, base.t1),
    backtest: runBacktest(state),
    data,
  })
}, 180_000)

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

describe("สเกลสีจำนวนนับ (น้ำเงินเฉดเดียว)", () => {
  test("0/ติดลบ = ไม่มีสี · ไล่ขั้นตามขนาด · เกินเพดาน = ขั้นสว่างสุด", () => {
    expect(sequentialColor(0, 10)).toBeNull()
    expect(sequentialColor(-3, 10)).toBeNull()
    expect(sequentialColor(3, 0)).toBeNull()
    const steps = [1, 3, 5, 6, 8, 10].map((v) => sequentialColor(v, 10))
    expect(steps).toEqual(SEQUENTIAL)
    expect(sequentialColor(50, 10)).toBe(SEQUENTIAL[SEQUENTIAL.length - 1])
  })
})

describe("AtlasView", () => {
  test("6 มุม + สรุป 6 ข้อ · ป้ายข้อมูลจำลอง · ข้อเสนอพร้อมป้ายประเภท · คันโยกทุกตัวมีคำตัดสินเป็นข้อความ · เลือกกลุ่มวันแล้วแผนที่เปลี่ยนโหมด", async () => {
    const urls: string[] = []
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      urls.push(url)
      const ok = new URL(url, "http://x").pathname === "/api/atlas"
      return new Response(JSON.stringify(ok ? atlas : { error: "not stubbed" }), { status: ok ? 200 : 500, headers: { "content-type": "application/json" } })
    }) as unknown as typeof fetch
    render(<AtlasView />)
    await screen.findByRole("heading", { level: 3, name: atlas.intel.title })
    expect(urls).toEqual(["/api/atlas"])

    const sections = screen.getAllByRole("heading", { level: 3 }).filter((h) => /^atlas-[a-f]-h$/.test(h.id))
    expect(sections.map((h) => h.textContent)).toEqual([atlas.stateMap, atlas.timing, atlas.depth, atlas.mix, atlas.lifecycle, atlas.intel].map((s) => s.title))
    const nav = screen.getByRole("navigation", { name: "หกมุมของ Atlas" })
    expect(within(nav).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#atlas-a", "#atlas-b", "#atlas-c", "#atlas-d", "#atlas-e", "#atlas-f"])
    expect(screen.getByText(data.label)).toBeDefined()
    expect(screen.getByText(/ไม่ใช่พฤติกรรมจริงของระบบบนตลาดหุ้นไทย/)).toBeDefined()

    // ข้อเสนอ: ครบทุกข้อ และทุกข้อมีป้ายประเภทเป็นข้อความ (ไม่สื่อด้วยสีอย่างเดียว)
    const actions = screen.getByRole("region", { name: "ข้อเสนอเพื่อเพิ่มประสิทธิภาพ" })
    const items = within(actions).getAllByRole("listitem")
    expect(items.length).toBe(atlas.actions.length)
    for (const it of items) expect(/^(ทดลอง|คงไว้|เฝ้าระวัง)/.test(it.textContent ?? "")).toBe(true)

    // มุม E/F: ทุกคันโยกแสดงพร้อมคำตัดสิน · ฐานคือกติกาปัจจุบันทั้งสองชุด
    for (const l of [...atlas.lifecycle.exitLevers, ...atlas.intel.levers]) expect(screen.getAllByText(l.label).length).toBeGreaterThan(0)
    expect(screen.getAllByText("กติกาปัจจุบัน").length).toBe(2)
    const idle = [...atlas.lifecycle.exitLevers, ...atlas.intel.levers].filter((l) => l.verdict === "same").length
    if (idle) expect(screen.getAllByText("ไม่เปลี่ยนสัญญาณ").length).toBe(idle)

    // แผนที่: เริ่มที่สีตามผลของโมเดล → กดกลุ่มวันในตาราง = โหมดไฮไลต์กลุ่มนั้น
    const outcomeBtn = screen.getByRole("button", { name: "สีตามผลของโมเดลวันนั้น" })
    const clusterBtn = screen.getByRole("button", { name: "ไฮไลต์กลุ่มวัน" })
    expect(outcomeBtn.getAttribute("aria-pressed")).toBe("true")
    const table = screen.getByRole("region", { name: "ตารางผลของระบบตามกลุ่มวัน" })
    const rows = within(table).getAllByRole("button")
    expect(rows.length).toBe(atlas.stateMap.clusters.length)
    const target = atlas.stateMap.clusters.length - 1
    fireEvent.click(rows[target])
    expect(rows[target].getAttribute("aria-pressed")).toBe("true")
    expect(clusterBtn.getAttribute("aria-pressed")).toBe("true")
    expect(outcomeBtn.getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByText(`กลุ่ม ${target + 1} · ${atlas.stateMap.clusters[target].label}`)).toBeDefined()
  }, 60_000)

  test("API ตอบ error → แสดงข้อความแจ้ง (role=alert)", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "insufficient_data", message: "ข้อมูลย้อนหลังไม่พอ" }), { status: 409, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    render(<AtlasView />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("โหลด Atlas ไม่สำเร็จ")
  })
})
