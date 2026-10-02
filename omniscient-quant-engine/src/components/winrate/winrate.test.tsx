// ============================================================
// หน้า "เป้าหมายชนะ 80%" — การแสดงผล/interaction ของ WinrateView (happy-dom · fetch stub)
// fixture มาจาก computeLab + buildWinrate บนข้อมูลจำลองจริงของแพลตฟอร์ม (ไม่แตะ DB/เครือข่าย)
// ============================================================

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { buildMarketState } from "@/lib/quant/engine/panel"
import { rhythmBase } from "@/lib/rhythm/service"
import { computeLab } from "@/lib/winrate/lab"
import { buildWinrate } from "@/lib/winrate/report"
import type { WinrateResponse } from "@/lib/winrate/types"
import { WinrateView } from "./winrate-view"

let fixture: WinrateResponse
const realFetch = globalThis.fetch

beforeAll(async () => {
  const state = await buildMarketState()
  const lab = computeLab(state, rhythmBase(state)!.gates)
  fixture = buildWinrate(lab, {
    data: { kind: "synthetic", label: "ข้อมูลจำลองเพื่อการสาธิต · ทดสอบ" },
    rules: { hashShort: "abc123", locked: false, matches: false },
    exec: { orderDays: 3, targetR: 2, stopMult: 1, holdDays: 5, costPct: 0.3 },
    forward: { closed: 0, wins: 0 },
  })
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

describe("WinrateView", () => {
  test("คำตอบสั้น + เหตุผล · ป้ายข้อมูลจำลอง · แผน 6 ขั้นพร้อมสถานะเป็นข้อความ · ตาราง/กรวย/วิธีคิดครบ", async () => {
    const urls = stub(fixture)
    render(<WinrateView />)
    await screen.findByRole("heading", { level: 3, name: fixture.verdict.title })
    expect(urls).toEqual(["/api/winrate"])
    expect(screen.getByText(fixture.data.label)).toBeDefined()
    expect(screen.getByText(/ใช้ซ้อมวิธีพิสูจน์เท่านั้น/)).toBeDefined()
    // ระดับคำตัดสินมีป้ายข้อความ (ไม่สื่อด้วยสีอย่างเดียว)
    expect(screen.getByText("ยังไม่มีหลักฐาน")).toBeDefined()
    const verdict = screen.getByRole("region", { name: fixture.verdict.title })
    expect(within(verdict).getAllByRole("listitem").length).toBe(fixture.verdict.reasons.length)

    const plan = screen.getByRole("region", { name: /แผน 6 ขั้น/ })
    const steps = within(plan).getAllByRole("listitem")
    expect(steps.length).toBe(6)
    expect(steps.map((s) => s.querySelector("h4")?.textContent?.replace(/^\d+\./, ""))).toEqual(fixture.plan.map((p) => p.title))
    for (const [i, s] of steps.entries()) {
      const label = { ok: "ผ่าน", warn: "ระวัง", block: "ติดขัด", wait: "รอ" }[fixture.plan[i].status]
      expect(within(s).getByText(label)).toBeDefined()
    }
    expect(within(plan).getByRole("progressbar", { name: "ไม้ forward ที่ปิดแล้วเทียบจำนวนที่ต้องใช้" })).toBeDefined()

    // ตารางผู้ถึง 80%: แถวละ config + สถานะเป็นข้อความ · เลื่อนได้ด้วยคีย์บอร์ด
    const table = screen.getByRole("region", { name: /ตาราง config ที่ชนะถึง 80%/ })
    expect(table.getAttribute("tabindex")).toBe("0")
    expect(within(table).getAllByRole("row").length).toBe(fixture.reach.length + 1)
    expect(screen.getByText(/กรวยการคัด/)).toBeDefined()
    const method = screen.getByRole("region", { name: "วิธีคิด (ตั้งไว้ก่อนดูผล)" })
    expect(within(method).getAllByRole("listitem").length).toBe(fixture.method.length)
    if (fixture.trap) expect(screen.getByText(`ตัวอย่างกับดัก: ${fixture.trap.config}`)).toBeDefined()
  })

  test("กราฟกับดักเริ่มที่ stop/วันถือของ config อ้างอิง · กดเปลี่ยนแล้วกราฟเปลี่ยนตาม", async () => {
    stub(fixture)
    render(<WinrateView />)
    await screen.findByRole("heading", { level: 3, name: fixture.verdict.title })
    const ref = fixture.selection.selected ?? fixture.selection.closest!
    const stops = screen.getByRole("group", { name: "stop" })
    const holds = screen.getByRole("group", { name: "ถือ" })
    expect(within(stops).getByRole("button", { name: `${ref.stopMult}×` }).getAttribute("aria-pressed")).toBe("true")
    expect(within(holds).getByRole("button", { name: `${ref.holdDays} วัน` }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("img", { name: new RegExp(`อัตราชนะตามระยะเป้า \\(stop ${ref.stopMult}× ถือ ${ref.holdDays} วัน\\)`) })).toBeDefined()
    const other = fixture.grid.stopMults.find((s) => s !== ref.stopMult)!
    fireEvent.click(within(stops).getByRole("button", { name: `${other}×` }))
    expect(within(stops).getByRole("button", { name: `${other}×` }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("img", { name: new RegExp(`อัตราชนะตามระยะเป้า \\(stop ${other}× ถือ ${ref.holdDays} วัน\\)`) })).toBeDefined()
  })

  test("ระดับยืนยันแล้ว = ป้ายเขียว · โหลดไม่สำเร็จ = แจ้งเตือน", async () => {
    stub({ ...fixture, data: { kind: "real", label: "Yahoo · ทดสอบ" }, verdict: { level: "confirmed", title: "ยืนยันแล้ว: ทดสอบ", reasons: ["ครบ"] } })
    render(<WinrateView />)
    await screen.findByRole("heading", { level: 3, name: "ยืนยันแล้ว: ทดสอบ" })
    expect(screen.getByText("ยืนยันแล้ว")).toBeDefined()
    expect(screen.queryByText(/ใช้ซ้อมวิธีพิสูจน์เท่านั้น/)).toBeNull()
    cleanup()
    stub({ error: "boom", message: "พัง" }, 500)
    render(<WinrateView />)
    expect(await screen.findByRole("alert")).toBeDefined()
  })
})
