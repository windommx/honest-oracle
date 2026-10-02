// ============================================================
// หน้า "สแกน Neotic 3D" — การแสดงผล/interaction ของ NeoticView (happy-dom · fetch stub)
// fixture: computeNeotic + buildNeotic บนข้อมูลจำลองของแพลตฟอร์ม (ไม่มีสัญญาณ) และข้อมูลจำลองที่เติมวันปริมาณพุ่ง (มีไม้)
// ============================================================

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { computeNeotic } from "@/lib/neotic/compute"
import { buildNeotic } from "@/lib/neotic/report"
import type { NeoticResponse } from "@/lib/neotic/types"
import { buildMarketState, buildPanel, generatedToPanelInput } from "@/lib/quant/engine/panel"
import { RULES } from "@/lib/quant/engine/rules"
import { generateMarket } from "@/lib/quant/market"
import { mulberry32 } from "@/lib/quant/rng"
import { NeoticView } from "./neotic-view"

let demo: NeoticResponse
let spiked: NeoticResponse
const realFetch = globalThis.fetch
const ctx = { data: { kind: "synthetic", label: "ข้อมูลจำลองเพื่อการสาธิต · ทดสอบ" }, bridge: { rows: 100, symbols: 22, signals: 0 } }

beforeAll(async () => {
  // ตรึงวันสุดท้ายของข้อมูลจำลอง (ปฏิทินงบเทียบกับราคาไม่เลื่อนตามวันที่รัน)
  const gen = generateMarket(RULES.seed, new Date(2026, 9, 2))
  demo = buildNeotic(computeNeotic(await buildMarketState(gen))!, ctx)
  const input = generatedToPanelInput(gen)
  const rng = mulberry32(7)
  for (const s of input) for (const p of s.prices) if (rng() < 0.15) p.volume *= 4
  spiked = buildNeotic(computeNeotic(buildPanel(input))!, ctx)
}, 180_000)

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

function stub(body: unknown, status = 200) {
  const urls: string[] = []
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    urls.push(url)
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
  }) as unknown as typeof fetch
  return urls
}

const rowsIn = (name: RegExp | string) => within(screen.getByRole("region", { name })).getAllByRole("row").length - 1

describe("NeoticView", () => {
  test("ข้อมูลสาธิต: คำตัดสิน + เหตุผล · ตารางสแกนครบทุกหุ้นและกรองได้ · ความพร้อมของข้อมูลครบ · ส่วนที่ยังไม่มีไม้บอกเหตุผล · ลิงก์ส่งออกชี้ API", async () => {
    const urls = stub(demo)
    render(<NeoticView />)
    await screen.findByRole("heading", { level: 3, name: demo.verdict.title })
    expect(urls).toEqual(["/api/neotic"])
    expect(screen.getByText(demo.data.label)).toBeDefined()
    expect(within(screen.getByRole("region", { name: demo.verdict.title })).getAllByRole("listitem").length).toBe(demo.verdict.reasons.length)

    const all = demo.scan.length
    expect(rowsIn(/ตารางสแกน Neotic 3D .*\(ทุกหุ้น\)/)).toBe(all)
    const group = screen.getByRole("group", { name: "กรองตารางสแกน" })
    const buttons = within(group).getAllByRole("button")
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(within(group).getByRole("button", { name: /^RS ≥ 80/ }))
    expect(rowsIn(/ตารางสแกน Neotic 3D .*\(RS ≥ 80\)/)).toBe(demo.scan.filter((r) => r.checks.rs).length)
    fireEvent.click(within(group).getByRole("button", { name: /^สัญญาณ/ }))
    expect(screen.getByText(/ไม่มีหุ้นที่ผ่านตัวกรอง “สัญญาณ”/)).toBeDefined()

    expect(screen.getByRole("img", { name: /แผนภาพกระจายของ 22 หุ้น/ })).toBeDefined()
    const funnel = screen.getByRole("list", { name: "กรวยเงื่อนไขของกติกา Neotic 3D" })
    expect(within(funnel).getAllByRole("listitem").length).toBe(5)
    expect(rowsIn("จำนวนสัญญาณเมื่อเปลี่ยนเกณฑ์ปริมาณ")).toBe(demo.funnel.byTrigger.length)
    const ready = screen.getByRole("region", { name: "ความพร้อมของข้อมูลสำหรับกติกานี้" })
    expect(within(ready).getAllByRole("listitem").length).toBe(demo.readiness.length)

    expect(within(screen.getByRole("region", { name: /ชั้น 2/ })).getByText(/ยังไม่มีไม้ที่ปิดแล้ว/)).toBeDefined()
    expect(within(screen.getByRole("region", { name: /ชั้น 3/ })).getByText(demo.walkforward.reason!)).toBeDefined()
    expect(within(screen.getByRole("region", { name: /ชั้น 4/ })).getByText(/ต้องมีอย่างน้อย 5 ครั้ง/)).toBeDefined()

    const bridge = screen.getByRole("region", { name: /ส่งต่อไป PyBroker/ })
    expect(within(bridge).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/api/neotic/export?format=csv", "/api/neotic/export?format=py"])
    expect(within(bridge).getByText(/pip install -U lib-pybroker==2\.0\.1/)).toBeDefined()
    const method = screen.getByRole("region", { name: "วิธีคิด (ตั้งไว้ก่อนดูผล)" })
    expect(within(method).getAllByRole("listitem").length).toBe(demo.method.length)
  })

  test("มีสัญญาณ: ตารางไม้ · สัญญาณล่าสุด · หน้าต่างเดินหน้า · MAE/MFE เทียบวันสุ่ม แสดงครบตามข้อมูล", async () => {
    stub(spiked)
    render(<NeoticView />)
    await screen.findByRole("heading", { level: 3, name: spiked.verdict.title })
    expect(spiked.backtest.trades.length).toBeGreaterThan(0)
    expect(rowsIn("ตารางไม้ของกติกา Neotic 3D ตามสเปก")).toBe(spiked.backtest.trades.length)
    expect(rowsIn("สัญญาณล่าสุดของกติกาตามสเปก")).toBe(spiked.recent.length)
    expect(spiked.walkforward.ready).toBe(true)
    expect(rowsIn("ตารางหน้าต่างเดินหน้าของการจูนเกณฑ์ Neotic")).toBe(spiked.walkforward.folds.length)
    expect(rowsIn("ตารางเปอร์เซ็นไทล์ MAE MFE ของสัญญาณ Neotic เทียบวันสุ่ม")).toBe(2)
    expect(screen.getByRole("img", { name: /ผลรวมสุทธิสะสมของ/ })).toBeDefined()
  })

  test("โหลดไม่สำเร็จ = แจ้งเตือน", async () => {
    stub({ error: "boom" }, 500)
    render(<NeoticView />)
    expect(await screen.findByRole("alert")).toBeDefined()
  })
})
