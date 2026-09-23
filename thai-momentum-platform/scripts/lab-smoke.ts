// ============================================================
// Smoke test แล็บเงา — เรียก route handlers ตรง ๆ ใน process สด
// (dev server ค้าง client เก่าจนกว่าจะ restart → ใช้สคริปต์นี้ยืนยันโค้ดจริง)
// รัน: bun scripts/lab-smoke.ts   (เขียน DB จริงตาม DATABASE_URL — ชี้ไปที่สำเนาก่อน เช่น DATABASE_URL=file:/tmp/lab-copy.db)
// ============================================================
import { POST as runPost } from "../src/app/api/lab/run/route"
import { GET as dashboardGet } from "../src/app/api/lab/dashboard/route"
import { POST as labelPost } from "../src/app/api/lab/label/route"
import { POST as evalPost } from "../src/app/api/lab/eval/route"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const post = (url: string, body: unknown) =>
  new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const ms = async <T,>(p: Promise<T>): Promise<[number, T]> => {
  const t0 = Date.now()
  const r = await p
  return [Date.now() - t0, r]
}

async function main() {
  // ---------- 1) run synth ----------
  {
    const [dt, res] = await ms(runPost(post("http://x/api/lab/run", { n: 6, origin: "synth" })))
    console.log("1) run synth:", JSON.stringify(await res.json()), `(${dt}ms)`)
  }
  // ---------- 2) run mix (panel + synth) ----------
  {
    const [dt, res] = await ms(runPost(post("http://x/api/lab/run", { n: 6, origin: "mix" })))
    console.log("2) run mix:", JSON.stringify(await res.json()), `(${dt}ms)`)
  }
  // ---------- 3) dashboard ----------
  let edgeKey: string | null = null
  {
    const [dt, res] = await ms(dashboardGet())
    const j = (await res.json()) as {
      matrix: { cells: number[][] }
      stats: { total: number; wouldExecute: number; agreementRate: number | null }
      brier: number | null
      executedN: number
      gateKill: { gate: string; kills: number }[]
      edgeQueue: { key: string; asset: string; rule: string | null; nimble: string; conf: number }[]
      labels: unknown[]
      weekly: { n: number }
    }
    const cellSum = j.matrix.cells.flat().reduce((a, b) => a + b, 0)
    edgeKey = j.edgeQueue[0]?.key ?? null
    console.log(
      "3) dashboard:",
      JSON.stringify({
        matrixSum: cellSum,
        stats: j.stats,
        brier: j.brier,
        executedN: j.executedN,
        gateKill: j.gateKill,
        edgeQueueN: j.edgeQueue.length,
        firstEdge: j.edgeQueue[0] ?? null,
        labelsN: j.labels.length,
        weekly: j.weekly,
      }),
      `(${dt}ms)`
    )
    console.log("   matrix sums = total:", cellSum === j.stats.total)
  }
  // ---------- 4) label พิธี 5 นาที ----------
  // จำ label เดิมของ key นี้ไว้ — smoke ต้องไม่ทิ้ง label ปลอมใน ground truth ของผู้ใช้ (G2 eval replay ใช้)
  const prevLabel = edgeKey ? await db.edgeLabel.findUnique({ where: { logKey: edgeKey } }) : null
  if (edgeKey) {
    const [dt, res] = await ms(
      labelPost(post("http://x/api/lab/label", { logKey: edgeKey, gut: "ENTER", label: "ENTER_LONG", reason: "TRIG_WEAK", confLabel: 4 }))
    )
    console.log("4) label:", JSON.stringify(await res.json()), `(${dt}ms)`)
    // invalid case ต้อง 400
    const bad = await labelPost(post("http://x/api/lab/label", { logKey: edgeKey, label: "WRONG", reason: "TRIG_WEAK", confLabel: 4 }))
    console.log("   invalid label status:", bad.status)
    const bad2 = await labelPost(post("http://x/api/lab/label", { logKey: "nokey123", label: "ENTER_LONG", reason: "OTHER", confLabel: 3 }))
    console.log("   missing log status:", bad2.status)
  } else {
    console.log("4) label: SKIPPED (edgeQueue ว่าง)")
  }
  // ---------- 5) dashboard รอบสอง (ตรวจ label ขึ้น + edgeQueue ตัด key ที่ label แล้ว) ----------
  {
    const res = await dashboardGet()
    const j = (await res.json()) as {
      labels: { key: string; label: string; reason: string }[]
      edgeQueue: { key: string }[]
      stats: { total: number }
    }
    console.log(
      "5) dashboard#2:",
      JSON.stringify({ labelsN: j.labels.length, firstLabel: j.labels[0] ?? null, labeledInQueue: j.edgeQueue.some((e) => e.key === edgeKey) })
    )
  }
  // คืนสภาพ label ของ key ทดสอบ (ลบถ้าเดิมไม่มี / เขียนค่าเดิมกลับถ้ามี)
  if (edgeKey) {
    if (prevLabel) {
      const { id: _id, createdAt: _c, ...restore } = prevLabel
      await db.edgeLabel.update({ where: { logKey: edgeKey }, data: restore })
    } else {
      await db.edgeLabel.deleteMany({ where: { logKey: edgeKey } })
    }
  }
  // ---------- 6) eval 5 ประตู ----------
  {
    const [dt, res] = await ms(evalPost(post("http://x/api/lab/eval", { n: 8 })))
    console.log("6) eval:", JSON.stringify(await res.json()), `(${dt}ms)`)
  }
  // ---------- 7) outcome filler: สร้าง panel log เก่า → dashboard ต้องเติม outcomeR ----------
  const { makeKey } = await import("../src/lib/lab/keys")
  const first = await db.rawDaily.findFirst({ select: { symbol: true } })
  if (!first) {
    console.log("7) outcome filler: SKIPPED (RawDaily ว่าง)")
    await db.$disconnect()
    return
  }
  const someSymbol = first.symbol
  const rows = await db.rawDaily.findMany({ where: { symbol: someSymbol }, orderBy: { date: "asc" }, select: { date: true, close: true } })
  if (rows.length < 22) {
    console.log("7) outcome filler: SKIPPED (บาร์ไม่พอ", rows.length, ")")
    await db.$disconnect()
    return
  }
  // เข้า 22 บาร์ก่อนวันสุดท้าย → มีอนาคต 21 บาร์ ≥ horizon 20 → ผลต้องสรุปได้เสมอ (ไม้ที่อนาคตไม่ครบจะรอ null)
  const entryIdx = rows.length - 22
  const tkey = makeKey(rows[entryIdx].date, someSymbol)
  await db.shadowLog.upsert({
    where: { key: tkey },
    create: {
      key: tkey,
      date: rows[entryIdx].date,
      asset: someSymbol,
      origin: "panel",
      stateJson: "",
      ruleAction: "ENTER_LONG",
      gatesJson: "{}",
      nimbleAction: "ENTER_LONG",
      nimbleConf: 0.8,
      wouldExecute: true,
      entryPx: rows[entryIdx].close,
      stopPx: rows[entryIdx].close * 0.95,
    },
    update: { outcomeR: null, entryPx: rows[entryIdx].close, stopPx: rows[entryIdx].close * 0.95 },
  })
  await dashboardGet()
  const filled = await db.shadowLog.findUnique({ where: { key: tkey } })
  console.log("7) outcome filler:", someSymbol, "date", rows[entryIdx].date, "entry", rows[entryIdx].close, "→ outcomeR =", filled?.outcomeR)
  // เคลียร์ขยะทดสอบ
  await db.shadowLog.delete({ where: { key: tkey } })
  await db.$disconnect()
}

main().catch(async (e) => {
  console.error("SMOKE FAIL:", e)
  await db.$disconnect()
  process.exit(1)
})
