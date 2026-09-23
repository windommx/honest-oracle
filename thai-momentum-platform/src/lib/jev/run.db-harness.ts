// ============================================================
// สคริปต์ทดสอบ /api/jev/run กับ SQLite จริง 2 วันทำการติดกัน — รันเป็น subprocess โดย run.db.test.ts เท่านั้น
// (bun test แชร์ module registry/Prisma singleton ข้ามไฟล์ — subprocess ที่ตั้ง DATABASE_URL เองแยกขาดได้แน่นอน)
// ใช้: DATABASE_URL=file:/tmp/x.db bun run.db-harness.ts → พิมพ์ JSON บรรทัดสุดท้าย
//
// ฉาก (ตลาดสังเคราะห์ 70 วันทำการ, วันที่ 1 = D68, วันที่ 2 = D69):
//   HALT  : หยุดซื้อขายหลัง D58 (ไม่มีแถวเลย) — ถือตั้งแต่ D50 → D68 ไม่มีราคาครบ 10 วัน → ต้องปิดที่ราคา D58
//   AGED  : ราคาคงที่ ถือตั้งแต่ D62 → D68 ถือ 6 วัน ≥ holdDefault 5 → time exit วันที่ 1
//   EDGE  : ราคาคงที่ ถือตั้งแต่ D64 → วันที่ 1 ถือ 4 (ถือต่อ) · วันที่ 2 ถือ 5 → time exit วันที่ 2
//   FRESH : ราคาคงที่ ถือตั้งแต่ D67 → ถือต่อทั้งสองวัน
// ============================================================

import { db } from "@/lib/db"
import * as core from "@/lib/momentum/core"

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

const dates = weekdays("2026-01-05", 70)
const HALT_LAST = 58
const haltPx = (i: number) => Math.round((20 + 0.05 * i) * 100) / 100

function makeRows(): core.ParsedCsvRow[] {
  let seed = 11
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const rows: core.ParsedCsvRow[] = []
  for (let s = 0; s < 30; s++) {
    let px = 5 + rnd() * 50
    for (const date of dates) {
      px = Math.max(1.6, px * (1 + (rnd() - 0.48) * 0.05))
      rows.push({ date, symbol: `S${String(s).padStart(2, "0")}`, close: Math.round(px * 100) / 100, val: 5e6 + Math.round(rnd() * 5e7) })
    }
  }
  dates.forEach((date, i) => {
    for (const symbol of ["AGED", "EDGE", "FRESH"]) rows.push({ date, symbol, close: 50, val: 2e7 })
    if (i <= HALT_LAST) rows.push({ date, symbol: "HALT", close: haltPx(i), val: 2e7 })
  })
  return rows
}

async function runDay(label: string) {
  const route = await import("@/app/api/jev/run/route")
  const res = await route.POST()
  const body = (await res.json()) as {
    date?: string
    message?: string
    error?: string
    executed?: { question: string; target: string; action: string; reason: string }[]
  }
  const exits = (body.executed ?? []).filter((d) => d.question === "Q_EXIT")
  const exitLog = await db.decision.findMany({ where: { date: body.date ?? "", question: "Q_EXIT" }, orderBy: { id: "asc" } })
  return {
    label,
    status: res.status,
    date: body.date ?? null,
    message: body.message ?? body.error ?? null,
    exits: exits.map((d) => ({ target: d.target, action: d.action, reason: d.reason })),
    exitLog: exitLog.map((d) => ({ target: d.target, action: d.action, executed: d.executed, reason: d.reason })),
    positions: (await db.position.findMany({ orderBy: { symbol: "asc" } })).map((p) => ({ symbol: p.symbol, entryDate: p.entryDate })),
    trades: (await db.trade.findMany({ orderBy: { id: "asc" } })).map((t) => ({
      symbol: t.symbol,
      entry: t.entry,
      exit: t.exit,
      entryPx: t.entryPx,
      exitPx: t.exitPx,
      ret: t.ret,
      holdDays: t.holdDays,
      path: JSON.parse(t.pathJson) as { d: string; p: number }[],
    })),
  }
}

await guard()
const rows = makeRows()
const day2 = dates[69]
await core.ingestRows(rows.filter((r) => r.date < day2))
await core.markDataChanged()
const pos = (symbol: string, i: number, px: number) =>
  db.position.create({ data: { symbol, entryDate: dates[i], entryPx: px, slots: 1, stop: px * 0.91 } })
await pos("HALT", 50, haltPx(50))
await pos("AGED", 62, 50)
await pos("EDGE", 64, 50)
await pos("FRESH", 67, 50)

const d1 = await runDay("day1")
const again = await runDay("day1-repeat") // รันซ้ำวันเดิม = idempotent (ไม่ปิดซ้ำ)
await core.ingestRows(rows.filter((r) => r.date === day2))
await core.markDataChanged()
const d2 = await runDay("day2")

console.log(
  JSON.stringify({
    dates: { d50: dates[50], d58: dates[HALT_LAST], d62: dates[62], d64: dates[64], d67: dates[67], day1: dates[68], day2 },
    haltEntryPx: haltPx(50),
    haltLastPx: haltPx(HALT_LAST),
    d1,
    again: { status: again.status, message: again.message, trades: again.trades.length },
    d2,
  })
)
await db.$disconnect()
process.exit(0)
