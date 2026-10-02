// ============================================================
// หน้า "กระบวนการทำงาน" — การแสดงผล + ปุ่มรันรอบ (happy-dom · fetch stub)
// fixture มาจาก getWorkflow() บน DB ทดสอบ (ข้อมูลจำลอง) — ตัวเลขชุดเดียวกับ API จริง
// ============================================================

import { afterAll, afterEach, beforeAll, describe, expect, mock, test } from "bun:test"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { db } from "@/lib/db"
import { ensureSeeded } from "@/lib/quant/engine/panel"
import { CYCLE_TAG } from "@/lib/workflow/cycle"
import { getWorkflow, runCycle } from "@/lib/workflow/service"
import type { WorkflowResponse } from "@/lib/workflow/types"
import { WorkflowView } from "./workflow-view"

let before: WorkflowResponse
let after: WorkflowResponse
const realFetch = globalThis.fetch

beforeAll(async () => {
  await ensureSeeded(false)
  await db.journalEntry.deleteMany({ where: { notes: { startsWith: CYCLE_TAG } } })
  before = await getWorkflow()
  await runCycle({ actor: "test" })
  after = await getWorkflow()
}, 180_000)

afterAll(async () => {
  await db.journalEntry.deleteMany({ where: { notes: { startsWith: CYCLE_TAG } } })
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

describe("WorkflowView", () => {
  test("6 ขั้น + ป้ายสถานะเป็นข้อความ · คำสั่งของรอบล่าสุด · ป้ายข้อมูลจำลอง · กดรันรอบ → POST แล้วโหลดสถานะใหม่", async () => {
    const calls: string[] = []
    let ran = false
    globalThis.fetch = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      const method = init?.method ?? "GET"
      calls.push(`${method} ${url}`)
      const body =
        method === "POST" && url === "/api/workflow/run"
          ? ((ran = true), { ok: true, report: { session: after.session, dataKind: "synthetic", recorded: after.today.length, alreadyRecorded: 0, resolved: 0, blocked: null, tookMs: 5 } })
          : url === "/api/workflow"
            ? ran
              ? after
              : before
            : { error: "not stubbed" }
      return new Response(JSON.stringify(body), { status: "error" in body ? 500 : 200, headers: { "content-type": "application/json" } })
    }) as unknown as typeof fetch

    render(<WorkflowView />)
    const steps = await screen.findByRole("region", { name: "ขั้นตอนของรอบนี้" })
    const cards = within(steps).getAllByRole("heading", { level: 4 })
    expect(cards.map((h) => h.textContent?.replace(/^\d+\./, ""))).toEqual(before.steps.map((s) => s.title))
    for (const s of before.steps) expect(within(steps).getByText(s.summary)).toBeDefined()
    expect(screen.getByText(/ไม่นับเป็นหลักฐาน forward · ดู/)).toBeDefined()
    if (before.today.length) {
      const table = screen.getByRole("region", { name: "ตารางคำสั่งของรอบล่าสุด" })
      expect(within(table).getAllByText("ยังไม่บันทึก").length).toBe(before.today.length)
    }

    const run = screen.getAllByRole("button", { name: "รันรอบนี้" })[0]
    fireEvent.click(run)
    expect((await screen.findAllByText(/^บันทึกแล้ว · /)).length).toBe(after.today.length)
    expect(calls).toContain("POST /api/workflow/run")
    expect(calls.filter((c) => c === "GET /api/workflow").length).toBe(2)
    const ledger = screen.getByRole("region", { name: "สมุดไม้กระดาษจากรอบประจำวัน" })
    expect(within(ledger).getAllByRole("row").length).toBe(after.ledger.length + 1)
    expect(screen.getByRole("region", { name: "ตารางเทียบผลย้อนหลังกับผลจริง" })).toBeDefined()
  }, 60_000)

  test("API ตอบ error → แสดงข้อความแจ้ง (role=alert)", async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({ error: "boom", message: "ล้ม" }), { status: 500, headers: { "content-type": "application/json" } })) as unknown as typeof fetch
    render(<WorkflowView />)
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toContain("โหลดกระบวนการทำงานไม่สำเร็จ")
  })
})
