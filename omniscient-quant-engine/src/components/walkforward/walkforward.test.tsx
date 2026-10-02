// ============================================================
// หน้า "ทดสอบเดินหน้า" — การแสดงผล/interaction ของ WalkforwardView (happy-dom · fetch stub)
// fixture มาจาก computeWalkforward + buildWalkforward บนข้อมูลจำลองจริงของแพลตฟอร์ม (ไม่แตะ DB/เครือข่าย)
// ============================================================

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { buildMarketState } from "@/lib/quant/engine/panel"
import { rhythmBase } from "@/lib/rhythm/service"
import { computeWalkforward } from "@/lib/walkforward/compute"
import { buildWalkforward } from "@/lib/walkforward/report"
import type { WalkforwardResponse } from "@/lib/walkforward/types"
import { WalkforwardView } from "./walkforward-view"

let fixture: WalkforwardResponse
const realFetch = globalThis.fetch

beforeAll(async () => {
  const state = await buildMarketState()
  const c = computeWalkforward(state, rhythmBase(state)!.gates)
  fixture = buildWalkforward(c, { data: { kind: "synthetic", label: "ข้อมูลจำลองเพื่อการสาธิต · ทดสอบ" }, bridge: { rows: 100, symbols: 2, signals: 5 } })
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

describe("WalkforwardView", () => {
  test("คำตัดสิน + เหตุผล · หน้าต่างครบ · กับดัก 9 ข้อมีป้ายสถานะ · ปุ่มส่งออกชี้ API · วิธีคิดครบ", async () => {
    const urls = stub(fixture)
    render(<WalkforwardView />)
    await screen.findByRole("heading", { level: 3, name: fixture.verdict.title })
    expect(urls).toEqual(["/api/walkforward"])
    expect(screen.getByText(fixture.data.label)).toBeDefined()
    const verdict = screen.getByRole("region", { name: fixture.verdict.title })
    expect(within(verdict).getAllByRole("listitem").length).toBe(fixture.verdict.reasons.length)

    const folds = screen.getByRole("region", { name: /หน้าต่าง train → test/ })
    expect(within(folds).getAllByRole("listitem").length).toBe(fixture.folds.length)

    const traps = screen.getByRole("region", { name: /กับดัก 9 ข้อ/ })
    const items = within(traps).getAllByRole("listitem")
    expect(items.length).toBe(9)
    for (const [i, it] of items.entries()) {
      const label = { ok: "จัดการแล้ว", warn: "ระวัง", block: "ติดขัด", info: "ข้อมูล" }[fixture.traps[i].status]
      expect(within(it).getByText(label)).toBeDefined()
    }

    const bridge = screen.getByRole("region", { name: /ส่งต่อไป PyBroker/ })
    const links = within(bridge).getAllByRole("link")
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/api/walkforward/export?format=csv", "/api/walkforward/export?format=py"])
    expect(within(bridge).getByText(/pip install -U lib-pybroker==2\.0\.1/)).toBeDefined()

    const table = screen.getByRole("region", { name: "ตารางสรุปนอกตัวอย่างของแต่ละวิธีเลือกกติกาออก" })
    expect(table.getAttribute("tabindex")).toBe("0")
    expect(within(table).getAllByRole("row").length).toBe(fixture.optimizers.length + 1)
    const method = screen.getByRole("region", { name: "วิธีคิด (ตั้งไว้ก่อนดูผล)" })
    expect(within(method).getAllByRole("listitem").length).toBe(fixture.method.length)
  })

  test("ตารางไม้: เริ่มที่กติกาที่ล็อก · กดเปลี่ยนวิธีแล้วจำนวนแถวตรงกับวิธีนั้น", async () => {
    stub(fixture)
    render(<WalkforwardView />)
    await screen.findByRole("heading", { level: 3, name: fixture.verdict.title })
    const group = screen.getByRole("group", { name: "วิธีที่แสดงในตาราง" })
    const buttons = within(group).getAllByRole("button")
    expect(buttons[0].getAttribute("aria-pressed")).toBe("true")
    const rowsOf = (label: string) => within(screen.getByRole("region", { name: `ตารางไม้นอกตัวอย่างของ ${label}` })).getAllByRole("row").length - 1
    const locked = fixture.optimizers.find((o) => o.key === "locked")!
    expect(rowsOf(locked.label)).toBe(locked.trades)
    const other = fixture.optimizers.find((o) => o.key === "maeMfe")!
    fireEvent.click(within(group).getByRole("button", { name: new RegExp(other.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }))
    expect(rowsOf(other.label)).toBe(other.trades)
  })

  test("โหลดไม่สำเร็จ = แจ้งเตือน", async () => {
    stub({ error: "boom" }, 500)
    render(<WalkforwardView />)
    expect(await screen.findByRole("alert")).toBeDefined()
  })
})
