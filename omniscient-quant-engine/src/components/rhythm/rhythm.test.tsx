// ============================================================
// หน้า "จังหวะตลาด" — สเกลสี diverging + การแสดงผล/interaction ของ RhythmView (happy-dom · fetch stub)
// fixture มาจาก rhythmFromState บนข้อมูลจำลองจริงของแพลตฟอร์ม (ไม่แตะ DB/เครือข่าย)
// ============================================================

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { flowEntitiesFromState } from "@/lib/flows/service"
import { buildMarketState } from "@/lib/quant/engine/panel"
import type { MarketState } from "@/lib/quant/engine/types"
import { rhythmFromState } from "@/lib/rhythm/service"
import type { RhythmResponse } from "@/lib/rhythm/types"
import { divergingColor, robustMax } from "./rhythm-charts"
import { RhythmView } from "./rhythm-view"

let state: MarketState
const data = { kind: "synthetic", label: "ข้อมูลจำลองเพื่อการสาธิต · ทดสอบ" }
const fixture = (symbol: string): RhythmResponse => {
  const r = rhythmFromState(state, symbol, data)
  if (!r.ok) throw new Error(r.reason)
  return r.data
}

const realFetch = globalThis.fetch
let urls: string[] = []

beforeAll(async () => {
  state = await buildMarketState()
}, 120_000)

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

function stub() {
  urls = []
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    urls.push(url)
    const u = new URL(url, "http://x")
    const body = u.pathname === "/api/flows" ? flowEntitiesFromState(state) : u.pathname === "/api/rhythm" ? fixture(u.searchParams.get("symbol") ?? "SET") : { error: "not stubbed" }
    return new Response(JSON.stringify(body), { status: "error" in body ? 500 : 200, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
}

describe("สเกลสี diverging ของ heatmap", () => {
  test("0 = เทากลาง · บวก = ฝั่งน้ำเงิน · ลบ = ฝั่งแดง · ขั้นเข้มขึ้นตามขนาด · เกินเพดาน = ขั้นสุดท้าย", () => {
    const mid = divergingColor(0, 1)
    const pos = [0.1, 0.3, 0.6, 0.9, 5].map((v) => divergingColor(v, 1))
    const neg = [0.1, 0.3, 0.6, 0.9, 5].map((v) => divergingColor(-v, 1))
    expect(new Set(pos.slice(0, 4)).size).toBe(4)
    expect(new Set(neg.slice(0, 4)).size).toBe(4)
    expect(pos[4]).toBe(pos[3])
    expect(neg[4]).toBe(neg[3])
    for (const c of [...pos, ...neg]) expect(c).not.toBe(mid)
    for (const c of pos) expect(neg).not.toContain(c)
    expect(divergingColor(5, 0)).toBe(mid)
  })

  test("เพดานสเกลทนค่าผิดปกติ (เปอร์เซ็นไทล์ 95 ของ |ค่า|)", () => {
    const xs = Array.from({ length: 100 }, (_, i) => (i % 2 ? 1 : -1) * (i < 99 ? 0.5 : 50))
    expect(robustMax(xs)).toBe(0.5)
    expect(robustMax([])).toBe(0)
  })
})

describe("RhythmView", () => {
  test("5 แผง + สรุปข้อค้นพบ 5 ข้อ · ป้ายข้อมูลจำลอง · ตารางกลุ่มวันเลือกได้ · เปลี่ยนหุ้นแล้วขอข้อมูลของหุ้นนั้น", async () => {
    stub()
    render(<RhythmView />)
    const set = fixture("SET")
    await screen.findByRole("heading", { level: 3, name: set.gates.title })
    expect(screen.getAllByRole("heading", { level: 3 }).filter((h) => h.id.startsWith("rhythm-")).length).toBe(5)
    const nav = screen.getByRole("navigation", { name: "สรุปข้อค้นพบ" })
    expect(within(nav).getAllByRole("link").length).toBe(5)
    expect(screen.getByText(data.label)).toBeDefined()
    expect(screen.getByText(/ไม่ใช่พฤติกรรมจริงของตลาดหุ้นไทย/)).toBeDefined()

    // กลุ่มของวันล่าสุดถูกเลือกไว้ก่อน → กดกลุ่มอื่นแล้วสถานะเปลี่ยน
    const table = screen.getByRole("region", { name: "ตารางกลุ่มของวันซื้อขาย" })
    const buttons = within(table).getAllByRole("button")
    expect(buttons.length).toBe(5)
    expect(buttons[set.dayMap.latest.cluster].getAttribute("aria-pressed")).toBe("true")
    const other = (set.dayMap.latest.cluster + 1) % 5
    fireEvent.click(buttons[other])
    expect(buttons[other].getAttribute("aria-pressed")).toBe("true")
    expect(buttons[set.dayMap.latest.cluster].getAttribute("aria-pressed")).toBe("false")
    expect(screen.getByText(`ลักษณะของกลุ่ม ${other + 1}: ${set.dayMap.clusters[other].label}`)).toBeDefined()

    // ตัวเลือกหุ้นมาจากรายชื่อเดียวกับแดชบอร์ดเงินไหล (จัดกลุ่มตามหมวดภาษาไทย)
    const select = screen.getByLabelText("ฤดูกาล + ด่านสัญญาณของ") as HTMLSelectElement
    await screen.findByRole("option", { name: /^KBANK · / })
    fireEvent.change(select, { target: { value: "KBANK" } })
    await screen.findByRole("heading", { level: 3, name: fixture("KBANK").gates.title })
    expect(urls).toContain("/api/rhythm?symbol=KBANK")
    expect(screen.getByRole("heading", { level: 3, name: fixture("KBANK").seasonality.title })).toBeDefined()
  }, 60_000)

  test("API ตอบ error → แสดงข้อความแจ้ง (role=alert)", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "insufficient_data", message: "ข้อมูลย้อนหลังไม่พอ" }), { status: 409, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    render(<RhythmView />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("โหลดจังหวะตลาดไม่สำเร็จ")
  })
})
