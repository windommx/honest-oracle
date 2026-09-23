// ============================================================
// สคริปต์ทดสอบ GET /api/health กับ SQLite จริง — รันเป็น subprocess โดย health.test.ts เท่านั้น
// (bun test ใช้ Prisma client ร่วมกันทุกไฟล์ → DB แยกขาดต่อสถานการณ์ต้องรันใน process ของตัวเอง)
// ใช้: DATABASE_URL=file:/tmp/x.db bun health.harness.ts <raw|populated|blocked> → พิมพ์บรรทัด "HARNESS_RESULT <json>"
// (Prisma log: ["error"] พิมพ์ prisma:error ลง stdout แบบ async — test จึงหาบรรทัดที่มี marker ไม่ใช่บรรทัดสุดท้าย)
//   raw       = เรียก GET ตรง ๆ (DB ว่าง / ไม่มีตาราง / เปิดไม่ได้ ตามที่ test เตรียม)
//   populated = ใส่ RawDaily (วันล่าสุด = HEALTH_TEST_LATEST) + EventLog ingest 1 แถว ก่อนเรียก GET
//   blocked   = เริ่ม GET แล้วบล็อก event loop 3 วินาที (จำลองรายงานหนักคำนวณครั้งแรก) — ต้องไม่กลายเป็น timeout ปลอม
// ============================================================

import { db } from "@/lib/db"
import { GET } from "./route"

const scenario = process.argv[2] ?? "raw"
const emit = (out: unknown) => console.log(`HARNESS_RESULT ${JSON.stringify(out)}`)
const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  // เขียนได้เฉพาะไฟล์ชั่วคราวของการทดสอบ — ห้ามแตะ db/custom.db เด็ดขาด
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
}

function shiftDate(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

async function populate() {
  await guard()
  const latest = process.env.HEALTH_TEST_LATEST ?? ""
  if (!/^\d{4}-\d{2}-\d{2}$/.test(latest)) throw new Error("HEALTH_TEST_LATEST ต้องเป็น YYYY-MM-DD")
  const dates = [shiftDate(latest, -2), shiftDate(latest, -1), latest]
  const data = dates.flatMap((date, i) =>
    ["AAA", "BBB", "CCC"].map((symbol, s) => ({ date, symbol, close: 10 + i + s, val: 5e6 }))
  )
  await db.rawDaily.createMany({ data })
  await db.eventLog.create({
    data: { kind: "ingest", actor: "test", payload: JSON.stringify({ kind: "feed", source: "test" }), prevHash: "", hash: "h1" },
  })
}

async function blocked() {
  await GET() // warm: เปิด query engine ก่อน (ครั้งแรกไม่ใช่ประเด็นของกรณีนี้)
  const t0 = performance.now()
  const pending = GET()
  const until = Date.now() + 3000
  while (Date.now() < until) {} // บล็อก JS thread เกิน HEALTH_DB_TIMEOUT_MS (2.5 วินาที)
  const res = await pending
  const raw = await res.text()
  emit({ status: res.status, cacheControl: res.headers.get("cache-control"), raw, body: JSON.parse(raw), coldMs: performance.now() - t0, warmMs: 0 })
}

async function main() {
  if (scenario === "blocked") return blocked()
  if (scenario === "populated") await populate()
  const t0 = performance.now()
  const res = await GET()
  const raw = await res.text()
  const coldMs = performance.now() - t0
  // เรียกซ้ำ = เวลาแบบ warm (ครั้งแรกรวมการเปิด query engine ของ Prisma)
  const t1 = performance.now()
  const res2 = await GET()
  await res2.text()
  const warmMs = performance.now() - t1
  emit({ status: res.status, cacheControl: res.headers.get("cache-control"), raw, body: JSON.parse(raw), coldMs, warmMs })
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))
