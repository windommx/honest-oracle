// ============================================================
// route handler โดยตรง (ไม่ผ่าน proxy) — ตรวจ validation (400/404), ActionLog และคำตอบของเส้นทางที่แก้ข้อมูล
// proxy/สิทธิ์ทดสอบแยกใน src/lib/security/security.test.ts · ทั้งระบบผ่าน HTTP จริงทดสอบใน deploy/smoke.ts
// ============================================================

import { beforeAll, describe, expect, test } from "bun:test"
import { db } from "@/lib/db"
import { ensureSeeded } from "@/lib/quant/engine/panel"
import * as analyst from "./analyst/[symbol]/route"
import * as auditLog from "./audit-log/route"
import * as journal from "./journal/route"
import * as robustness from "./research/robustness/route"
import * as rules from "./rules/route"
import * as system from "./system/route"

const BASE = "http://localhost:3000"
function req(method: string, path: string, body?: unknown): Request {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" }
    init.body = typeof body === "string" ? body : JSON.stringify(body)
  }
  return new Request(`${BASE}${path}`, init)
}

/** ActionLog เขียนแบบไม่รอ (fire-and-forget) — รอจนแถวปรากฏ */
async function actionAfter(action: string, since: Date) {
  for (let i = 0; i < 200; i++) {
    const row = await db.actionLog.findFirst({ where: { action, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } })
    if (row) return row
    await Bun.sleep(10)
  }
  throw new Error(`ไม่พบ ActionLog ${action}`)
}

const issuesOf = async (res: Response) => ((await res.json()) as { issues?: Array<{ path: string }> }).issues?.map((i) => i.path) ?? []

beforeAll(async () => {
  await ensureSeeded(false)
}, 120_000)

describe("/api/journal — validation + ActionLog", () => {
  const plan = { symbol: "tse", signal: "ENTRY_PULLBACK", gates: { g1: true, g2: true }, price: 12.3, entryLow: 12, entryHigh: 12.4, sizePct: 8.5, probUp: 0.61, status: "PLANNED", notes: "test" }

  test("POST ถูกต้อง → 201 (symbol ตัวใหญ่) + ActionLog journal.create", async () => {
    const since = new Date()
    const res = await journal.POST(req("POST", "/api/journal", plan))
    expect(res.status).toBe(201)
    const { entry } = (await res.json()) as { entry: { id: string; symbol: string; status: string } }
    expect(entry.symbol).toBe("TSE")
    const log = await actionAfter("journal.create", since)
    expect(log.status).toBe(201)
    expect(log.detail).toMatchObject({ id: entry.id, symbol: "TSE" })
  })

  test("POST ผิด → 400 พร้อมบอกช่องที่ผิด · ไม่ใช่ JSON → 400 · ไม่มีแถวใหม่", async () => {
    const before = await db.journalEntry.count()
    const bad = await journal.POST(req("POST", "/api/journal", { ...plan, symbol: "", price: -1, status: "WHATEVER", sizePct: 400, probUp: 2 }))
    expect(bad.status).toBe(400)
    expect((await issuesOf(bad)).sort()).toEqual(["price", "probUp", "sizePct", "status", "symbol"])
    const inf = await journal.POST(req("POST", "/api/journal", '{"symbol":"TSE","price":1e999}'))
    expect(inf.status).toBe(400) // Infinity ไม่ผ่าน
    const notJson = await journal.POST(req("POST", "/api/journal", "symbol=TSE"))
    expect(notJson.status).toBe(400)
    expect(await db.journalEntry.count()).toBe(before)
  })

  test("PATCH: ช่องที่ไม่อนุญาต → 400 · id ไม่มีจริง → 404 · ถูกต้อง → 200 + ActionLog · DELETE ซ้ำ → 404", async () => {
    const created = (await (await journal.POST(req("POST", "/api/journal", plan))).json()) as { entry: { id: string } }
    const id = created.entry.id
    expect((await journal.PATCH(req("PATCH", "/api/journal", { id, price: 1 }))).status).toBe(400)
    expect((await journal.PATCH(req("PATCH", "/api/journal", { id, pnlPct: "ten" }))).status).toBe(400)
    expect((await journal.PATCH(req("PATCH", "/api/journal", { id: "nope", status: "CLOSED" }))).status).toBe(404)
    const since = new Date()
    const ok = await journal.PATCH(req("PATCH", "/api/journal", { id, status: "CLOSED", pnlPct: 3.2 }))
    expect(ok.status).toBe(200)
    expect(((await ok.json()) as { entry: { status: string; pnlPct: number } }).entry).toMatchObject({ status: "CLOSED", pnlPct: 3.2 })
    expect((await actionAfter("journal.update", since)).detail).toMatchObject({ id, fields: ["status", "pnlPct"] })
    expect((await journal.DELETE(req("DELETE", "/api/journal"))).status).toBe(400)
    expect((await journal.DELETE(req("DELETE", `/api/journal?id=${id}`))).status).toBe(200)
    expect((await journal.DELETE(req("DELETE", `/api/journal?id=${id}`))).status).toBe(404)
  })

  test("GET: กรอง status ที่รู้จัก · status แปลก → 400", async () => {
    expect((await journal.GET(req("GET", "/api/journal?status=HACK"))).status).toBe(400)
    const res = await journal.GET(req("GET", "/api/journal?status=PLANNED"))
    expect(res.status).toBe(200)
    const { entries } = (await res.json()) as { entries: Array<{ status: string }> }
    expect(entries.every((e) => e.status === "PLANNED")).toBe(true)
  })
})

describe("/api/system, /api/rules, /api/audit-log", () => {
  test("POST /api/system: body ผิดชนิด → 400 · {} (DB มีข้อมูลแล้ว) → 200 ไม่ seed ซ้ำ + ActionLog data.seed", async () => {
    expect((await system.POST(req("POST", "/api/system", { force: "yes" }))).status).toBe(400)
    const since = new Date()
    const res = await system.POST(req("POST", "/api/system", {}))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { count: number }).count).toBe(22)
    expect((await actionAfter("data.seed", since)).detail).toMatchObject({ force: false, count: 22 })
  })

  test("POST /api/rules: note ยาวเกิน → 400 · ล็อก → 201 matches=true · GET มีในประวัติ", async () => {
    expect((await rules.POST(req("POST", "/api/rules", { note: "x".repeat(501) }))).status).toBe(400)
    const res = await rules.POST(req("POST", "/api/rules", { note: "ล็อกจาก test" }))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { matchesRegistered: boolean; registration: { hash: string } }
    expect(body.matchesRegistered).toBe(true)
    const g = (await (await rules.GET()).json()) as { history: Array<{ note: string | null }>; rules: unknown; provenance: { tunedOn: string } }
    expect(g.history[0].note).toBe("ล็อกจาก test")
    expect(g.provenance.tunedOn).toContain("synthetic")
  })

  test("GET /api/audit-log: limit/action ถูกตรวจ · กรองตามกลุ่ม (journal → journal.*)", async () => {
    expect((await auditLog.GET(req("GET", "/api/audit-log?limit=0"))).status).toBe(400)
    expect((await auditLog.GET(req("GET", "/api/audit-log?action=DROP%20TABLE"))).status).toBe(400)
    const res = await auditLog.GET(req("GET", "/api/audit-log?action=journal&limit=5"))
    expect(res.status).toBe(200)
    const { entries, total } = (await res.json()) as { entries: Array<{ action: string; createdAt: string }>; total: number }
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.length).toBeLessThanOrEqual(5)
    expect(total).toBeGreaterThanOrEqual(entries.length)
    expect(entries.every((e) => e.action.startsWith("journal."))).toBe(true)
    const times = entries.map((e) => Date.parse(e.createdAt))
    expect([...times].sort((a, b) => b - a)).toEqual(times)
  })
})

describe("LLM routes / งานหนัก — ตรวจ input ก่อนใช้ทรัพยากร", () => {
  const params = { params: Promise.resolve({ symbol: "TSE" }) }

  test("POST /api/analyst: คำถามว่าง/ยาวเกิน → 400 · ไม่มีผู้ให้บริการ LLM → 503 llm_unavailable + ActionLog", async () => {
    expect((await analyst.POST(req("POST", "/api/analyst/TSE", { question: "   " }), params)).status).toBe(400)
    expect((await analyst.POST(req("POST", "/api/analyst/TSE", { question: "ก".repeat(601) }), params)).status).toBe(400)
    const since = new Date()
    const res = await analyst.POST(req("POST", "/api/analyst/TSE", { question: "แนวรับอยู่ที่ไหน" }), { params: Promise.resolve({ symbol: "TSE" }) })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { error: string }).error).toBe("llm_unavailable")
    expect((await actionAfter("analyst.chat", since)).status).toBe(503)
  })

  test("GET /api/research/robustness: seeds ผิดรูป/เกิน 8/ค่าลบ → 400 ก่อนเริ่มคำนวณ", async () => {
    for (const q of ["abc", "11,abc", "1,2,3,4,5,6,7,8,9", "-5", "", "11,,12", "99999999999"]) {
      const res = await robustness.GET(req("GET", `/api/research/robustness?seeds=${encodeURIComponent(q)}`))
      expect(res.status).toBe(400)
    }
  })
})
