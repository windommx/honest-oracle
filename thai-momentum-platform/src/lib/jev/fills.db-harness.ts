// ============================================================
// สคริปต์ทดสอบคำสั่งซื้อ T+1 ของ Jev กับ SQLite จริง — รันเป็น subprocess โดย fills.db.test.ts เท่านั้น
// (route จริง: POST /api/jev/run · POST/GET /api/jev/pending · GET /api/portfolio · buildTrackRecord)
// ใช้: DATABASE_URL=file:/tmp/x.db bun fills.db-harness.ts <auto|human> → พิมพ์ JSON บรรทัดสุดท้าย
//
// ตลาดสังเคราะห์ 72 วันทำการ 40 หุ้น (RNG แยกต่อหุ้น — เพิ่มวันไม่เปลี่ยนข้อมูลวันก่อน) · วัน D = index 69
//   auto  : ขาลงแกว่ง 66 วัน แล้ว S00–S15 ขึ้น +2%/วัน ที่เหลือ +0.6%/วัน → composite regime = risk_on ช่วง D..D+2
//           D      : Jev สั่งซื้ออัตโนมัติ → เข้าคิว (ยังไม่มี Position) · รันซ้ำ = ไม่ส่งซ้ำ
//           D+1    : หุ้นที่สั่งตัวแรก (HALTED) ไม่มีแถว · GET /api/portfolio ก่อนรอบ = preview (ไม่เขียน)
//                    รอบ D+1 เติมที่ราคาปิด D+1 · HALTED ยกเลิก · รันซ้ำ = ไม่เติมซ้ำ
//           D+2    : HALTED กลับมามีราคา → ต้องไม่ถูกเลื่อนไปเติม D+2 · buildTrackRecord: ไม้เข้า = วัน/ราคาเติม
//   human : ตลาดแกว่งไม่มีขาขึ้น (ไม่มีคำสั่งอัตโนมัติมากินงบ) · สถานะเดิม S31 [Banking] + S36 (เข้า D−1)
//           เย็นวัน D (ข้อมูลล่าสุด = D): อนุมัติ gate S34 (→ เติม D+1) · S30 [Banking] · exit S36 (ต้องมี Trade)
//           แล้วพอร์ตเปลี่ยนนอกคิว: เพิ่ม S32/S33 [Banking] → Banking ครบ 3 ชื่อก่อนวันเติม S30 (ต้องถูกยกเลิก)
//           ข้อมูล D+1 เข้า → อนุมัติ S35 ก่อนรอบ D+1 → afterDate = D+1 → เติม D+2 (และรอบ D+1 ต้องไม่ถูกข้าม)
// ============================================================

import { db } from "@/lib/db"
import * as core from "@/lib/momentum/core"

const scenario = process.argv[2] ?? ""
const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  // ห้ามเขียน DB ที่ไม่ใช่ไฟล์ชั่วคราวของการทดสอบ (เช่น db/custom.db) เด็ดขาด
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
}

function weekdays(from: string, n: number): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < n; t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

const dates = weekdays("2026-01-05", 72)
const DI = 69 // วัน D
const D = dates[DI]
const D1 = dates[DI + 1]
const D2 = dates[DI + 2]

function makeRows(turn: number): core.ParsedCsvRow[] {
  const rows: core.ParsedCsvRow[] = []
  for (let s = 0; s < 40; s++) {
    let seed = 1000 + s * 7919
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const symbol = `S${String(s).padStart(2, "0")}`
    const leader = s < 16
    let px = 10 + rnd() * 40
    for (let i = 0; i < dates.length; i++) {
      const r = i >= turn ? (leader ? 0.02 : 0.006) + (rnd() - 0.5) * 0.004 : (rnd() - 0.5) * 0.03 - 0.001
      px = Math.max(2, px * (1 + r))
      const val = (leader && i >= turn ? 6e7 : 2e7) * (0.8 + rnd() * 0.4)
      rows.push({ date: dates[i], symbol, close: Math.round(px * 100) / 100, val })
    }
  }
  return rows
}

type OrderView = { id: string; symbol: string; slots: number; stopPct: number; stopMult: number; source: string; decisionDate: string; afterDate: string; fillDate: string | null; fillPx: number | null }
type RunBody = {
  date?: string
  regime?: string
  message?: string
  error?: string
  executed?: { question: string; target: string; action: string; reason: string }[]
  queued?: OrderView[]
  fills?: {
    filled: { symbol: string; fillDate: string; fillPx: number; slots: number; stop: number; source: string; decisionDate: string; afterDate: string; note: string | null }[]
    cancelled: { symbol: string; date: string | null; reason: string; source: string }[]
  }
  pendingFills?: OrderView[]
}

async function runJev(label: string) {
  const route = await import("@/app/api/jev/run/route")
  const res = await route.POST()
  const body = (await res.json()) as RunBody
  return {
    label,
    status: res.status,
    date: body.date ?? null,
    regime: body.regime ?? null,
    message: body.message ?? body.error ?? null,
    executedEntries: (body.executed ?? []).filter((d) => d.question === "Q_ENTRY").map((d) => ({ target: d.target, action: d.action })),
    queued: body.queued ?? [],
    fills: body.fills ?? { filled: [], cancelled: [] },
    pendingFills: body.pendingFills ?? [],
  }
}

async function state() {
  const [positions, queueRow, fillDecisions, gates, regimeRuns] = await Promise.all([
    db.position.findMany({ orderBy: { symbol: "asc" } }),
    db.setting.findUnique({ where: { key: "jev_pending_fills" } }),
    db.decision.findMany({ where: { question: "Q_ENTRY", action: { in: ["fill", "cancel"] } }, orderBy: { id: "asc" } }),
    db.pendingGate.findMany({ orderBy: { id: "asc" } }),
    db.decision.findMany({ where: { question: "Q_REGIME" }, select: { date: true }, orderBy: { id: "asc" } }),
  ])
  const queue = queueRow ? ((JSON.parse(queueRow.value) as { orders?: { symbol: string; afterDate: string; source: string }[] }).orders ?? []) : []
  return {
    positions: positions.map((p) => ({ symbol: p.symbol, entryDate: p.entryDate, entryPx: p.entryPx, slots: p.slots, stop: p.stop })),
    queue: queue.map((o) => ({ symbol: o.symbol, afterDate: o.afterDate, source: o.source })),
    fillDecisions: fillDecisions.map((d) => ({ date: d.date, target: d.target, action: d.action, executed: d.executed, source: d.source, reason: d.reason })),
    gates: gates.map((g) => ({ id: g.id, target: g.target, question: g.question, status: g.status })),
    regimeRuns: regimeRuns.map((r) => r.date),
  }
}

async function approve(id: number) {
  const route = await import("@/app/api/jev/pending/route")
  const res = await route.POST(new Request("http://localhost/api/jev/pending", { method: "POST", body: JSON.stringify({ id, approve: true }) }))
  const body = (await res.json()) as { status?: string; message?: string; error?: string; order?: { afterDate: string; decisionDate: string; slots: number } }
  return { status: res.status, gateStatus: body.status ?? null, message: body.message ?? body.error ?? null, order: body.order ?? null }
}

async function portfolioPreview() {
  const route = await import("@/app/api/portfolio/route")
  const body = (await (await route.GET()).json()) as { positions: { symbol: string }[]; pendingFills: OrderView[] }
  return { positions: body.positions.map((p) => p.symbol), pendingFills: body.pendingFills }
}

async function trackView() {
  const { buildTrackRecord } = await import("@/lib/track/record")
  const rec = await buildTrackRecord()
  return {
    status: rec.status,
    liveSince: rec.liveSince,
    nav: rec.nav.map((p) => ({ date: p.date, exposure: p.exposure, nav: p.nav })),
    legs: rec.legs.map((l) => ({ symbol: l.symbol, status: l.status, source: l.source, entryDate: l.entryDate, entryPx: l.entryPx, slots: l.slots, slotsSource: l.slotsSource })),
    decisions: rec.decisions as unknown as Record<string, unknown>,
  }
}

function closesOf(rows: core.ParsedCsvRow[], symbols: string[]) {
  const out: Record<string, Record<string, number | null>> = {}
  for (const s of symbols) {
    out[s] = {}
    for (const d of [dates[DI - 1], D, D1, D2]) out[s][d] = rows.find((r) => r.symbol === s && r.date === d)?.close ?? null
  }
  return out
}

async function autoScenario() {
  const rows = makeRows(66)
  await core.ingestRows(rows.filter((r) => r.date <= D))
  await core.markDataChanged()

  const dRun = await runJev("D")
  const afterD = await state()
  const dDecisions = await db.decision.findMany({ where: { date: D, question: "Q_ENTRY", action: "buy", source: { in: ["lite", "reversal"] } } })
  const dRepeat = await runJev("D-repeat")
  const afterDRepeat = await state()

  // ข้อมูล D+1 เข้า — หุ้นที่สั่งตัวแรกหยุดซื้อขายวันนั้น
  const halted = dRun.queued[0]?.symbol ?? "S00"
  await core.ingestRows(rows.filter((r) => r.date === D1 && r.symbol !== halted))
  await core.markDataChanged()
  const preview = await portfolioPreview()
  const afterPreview = await state()

  const d1Run = await runJev("D+1")
  const afterD1 = await state()
  const d1Repeat = await runJev("D+1-repeat")
  const afterD1Repeat = await state()

  await core.ingestRows(rows.filter((r) => r.date === D2))
  await core.markDataChanged()
  const d2Run = await runJev("D+2")
  const afterD2 = await state()

  const { auditEvents } = await import("@/lib/research/events")
  const audit = await auditEvents(1)
  const fillEvents = await db.eventLog.findMany({ where: { kind: "jev_fill" }, orderBy: { id: "asc" } })

  return {
    dates: { dMinus1: dates[DI - 1], D, D1, D2 },
    halted,
    closes: closesOf(rows, [...new Set([...dRun.queued.map((o) => o.symbol), ...d1Run.queued.map((o) => o.symbol), halted])]),
    dRun,
    afterD,
    dDecisions: dDecisions.map((d) => ({ target: d.target, executed: d.executed, reason: d.reason })),
    dRepeat: { status: dRepeat.status, message: dRepeat.message, queued: dRepeat.queued.length },
    afterDRepeat,
    preview,
    afterPreview,
    d1Run,
    afterD1,
    d1Repeat: { status: d1Repeat.status, message: d1Repeat.message, fills: d1Repeat.fills },
    afterD1Repeat,
    d2Run,
    afterD2,
    audit: { ok: audit.ok, total: audit.total },
    fillEvents: fillEvents.map((e) => JSON.parse(e.payload) as { filled: { symbol: string; fillDate: string }[]; cancelled: { symbol: string }[] }),
    track: await trackView(),
  }
}

async function humanScenario() {
  const rows = makeRows(10_000) // ไม่มีขาขึ้น
  const close = (sym: string, date: string) => rows.find((r) => r.symbol === sym && r.date === date)?.close as number
  await core.ingestRows(rows.filter((r) => r.date <= D))
  for (const symbol of ["S30", "S31", "S32", "S33"]) await db.symbolMeta.create({ data: { symbol, sector: "Banking" } })
  await core.markDataChanged()
  for (const symbol of ["S31", "S36"]) {
    const px = close(symbol, dates[DI - 1])
    await db.position.create({ data: { symbol, entryDate: dates[DI - 1], entryPx: px, slots: 0.5, stop: px * 0.8 } })
  }
  // S36 เข้าไม้เพราะมนุษย์อนุมัติ (แถวเติม T+1 ของ source human) → Trade ตอนออกต้องอยู่ถัง human-approved ของ Bayes stop
  await db.decision.create({
    data: { date: dates[DI - 1], question: "Q_ENTRY", target: "S36", action: "fill", conf: 0.72, reason: "เติม T+1 (test)", executed: true, source: "human" },
  })

  const dRun = await runJev("D")
  const afterD = await state()

  // ---------- เย็นวัน D: มนุษย์อนุมัติ (ข้อมูลล่าสุด = D) ----------
  const gate = (target: string, question = "Q_ENTRY", action = "buy", conf = 0.72) =>
    db.pendingGate.create({ data: { date: D, question, target, action, conf, reason: `test gate ${target}` } })
  const g34 = await gate("S34")
  const g30 = await gate("S30")
  const gExit = await gate("S36", "Q_EXIT", "exit", 0.8)
  const a34 = await approve(g34.id)
  const a30 = await approve(g30.id)
  const tradesBeforeExit = await db.trade.count({ where: { symbol: "S36" } })
  const aExit = await approve(gExit.id)
  const exitTrades = await db.trade.findMany({ where: { symbol: "S36" } })
  const afterApprove = await state()
  // พอร์ตเปลี่ยนนอกคิวหลังอนุมัติ S30: Banking ครบ 3 ชื่อ (S31 + S32 + S33) ก่อนวันเติม
  for (const symbol of ["S32", "S33"]) {
    const px = close(symbol, D)
    await db.position.create({ data: { symbol, entryDate: D, entryPx: px, slots: 0.5, stop: px * 0.8 } })
  }

  // ---------- ข้อมูล D+1 เข้า → อนุมัติ S35 ก่อนรอบ D+1 ----------
  await core.ingestRows(rows.filter((r) => r.date === D1))
  await core.markDataChanged()
  const preview = await portfolioPreview()
  const g35 = await gate("S35")
  const a35 = await approve(g35.id)
  const pendingGet = (await (await (await import("@/app/api/jev/pending/route")).GET()).json()) as { fills: OrderView[] }

  const d1Run = await runJev("D+1")
  const afterD1 = await state()
  const d1Repeat = await runJev("D+1-repeat")
  const afterD1Repeat = await state()

  await core.ingestRows(rows.filter((r) => r.date === D2))
  await core.markDataChanged()
  const d2Run = await runJev("D+2")
  const afterD2 = await state()

  return {
    dates: { dMinus1: dates[DI - 1], D, D1, D2 },
    closes: closesOf(rows, ["S30", "S34", "S35", "S36"]),
    dRun: { status: dRun.status, regime: dRun.regime, message: dRun.message, queued: dRun.queued.length },
    afterD,
    approvals: { a34, a30, aExit, a35 },
    tradesBeforeExit,
    exitTrades: exitTrades.map((t) => ({ entry: t.entry, exit: t.exit, entryPx: t.entryPx, exitPx: t.exitPx, ret: t.ret, stopPolicy: t.stopPolicy, holdDays: t.holdDays, src: t.src })),
    afterApprove,
    preview,
    pendingGetFills: pendingGet.fills,
    d1Run,
    afterD1,
    d1Repeat: { status: d1Repeat.status, message: d1Repeat.message, fills: d1Repeat.fills },
    afterD1Repeat,
    d2Run,
    afterD2,
    track: await trackView(),
  }
}

async function main() {
  await guard()
  if (scenario === "auto") return autoScenario()
  if (scenario === "human") return humanScenario()
  throw new Error(`unknown scenario ${scenario}`)
}

main()
  .then(async (r) => {
    console.log(JSON.stringify(r))
    await db.$disconnect()
    process.exit(0)
  })
  .catch(async (e) => {
    console.error(e)
    await db.$disconnect()
    process.exit(1)
  })
