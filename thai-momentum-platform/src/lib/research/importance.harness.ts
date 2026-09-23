// ============================================================
// สคริปต์ทดสอบ cache ของ Purged Permutation Importance กับ SQLite จริง — รันเป็น subprocess โดย importance.test.ts
// (ต้อง seed ข้อมูลลง DB ของตัวเอง — ทำใน DB ชั่วคราวที่ใช้ร่วมกันทุกไฟล์ test ไม่ได้)
// ใช้: DATABASE_URL=file:/tmp/x.db bun importance.harness.ts → พิมพ์บรรทัด "HARNESS_RESULT <json>"
// ============================================================

import { db } from "@/lib/db"
import { markDataChanged, seedDemoData } from "@/lib/momentum/core"
import { GET } from "@/app/api/research/importance/route"
import {
  clearImportanceCache,
  importanceCacheStats,
  purgedPermutationImportance,
  purgedPermutationImportanceCached,
} from "./importance"

const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  // เขียนได้เฉพาะไฟล์ชั่วคราวของการทดสอบ — ห้ามแตะ db/custom.db เด็ดขาด
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
}

const timed = async <T,>(p: () => Promise<T>): Promise<[number, T]> => {
  const t0 = performance.now()
  const r = await p()
  return [performance.now() - t0, r]
}
const strip = <T extends { tookMs: number }>(r: T) => ({ ...r, tookMs: 0 })

async function main() {
  await guard()
  await seedDemoData({ days: 150, symbols: 40 })
  const opts = { nRepeats: 1 }
  const out: Record<string, unknown> = {}

  // (1) miss → hit: ผลเดียวกันทุกไบต์ คำนวณครั้งเดียว
  clearImportanceCache()
  const [missMs, first] = await timed(() => purgedPermutationImportanceCached(opts))
  const [hitMs, second] = await timed(() => purgedPermutationImportanceCached(opts))
  out.first = { cache: first.cache, ms: missMs, rows: first.result.rows.length, paths: first.result.paths, panelN: first.result.panelN }
  out.second = { cache: second.cache, ms: hitMs }
  out.sameBytes = JSON.stringify(first.result) === JSON.stringify(second.result)
  out.statsAfterTwo = importanceCacheStats()

  // (2) ผลจาก cache = คำนวณตรง (ไม่ผ่าน cache) ทุกฟิลด์ยกเว้น tookMs
  const direct = await purgedPermutationImportance(opts)
  out.equalsDirect = JSON.stringify(strip(direct)) === JSON.stringify(strip(first.result))

  // (3) ผู้เรียกแก้ object ที่ได้ → cache ไม่เพี้ยน
  second.result.rows.length = 0
  second.result.baseAuc = -1
  const third = await purgedPermutationImportanceCached(opts)
  out.mutationSafe = JSON.stringify(third.result) === JSON.stringify(first.result)

  // (4) พารามิเตอร์ต่าง = key ต่าง · ค่าที่เท่ากันหลังใส่ default = key เดียวกัน
  await purgedPermutationImportanceCached({ nRepeats: 1, hold: 10 })
  const sameAsDefault = await purgedPermutationImportanceCached({ nRepeats: 1.2, hold: 8, seed: 42 })
  out.defaultsNormalized = sameAsDefault.cache
  out.statsAfterParams = importanceCacheStats()

  // (5) request พร้อมกันตอน cache ว่าง = คำนวณครั้งเดียว (single-flight)
  clearImportanceCache()
  const concurrent = await Promise.all([1, 2, 3].map(() => purgedPermutationImportanceCached(opts)))
  out.concurrent = { caches: concurrent.map((c) => c.cache), stats: importanceCacheStats() }

  // (6) ข้อมูลเปลี่ยน (ผู้เขียนตรา data_version) → คำนวณใหม่
  await markDataChanged()
  const afterChange = await purgedPermutationImportanceCached(opts)
  out.afterDataChange = { cache: afterChange.cache, stats: importanceCacheStats() }

  // (7) route: body เหมือนกันทุกไบต์ · header X-Cache MISS → HIT
  clearImportanceCache()
  const url = "http://localhost/api/research/importance?nRepeats=1"
  const r1 = await GET(new Request(url))
  const b1 = await r1.text()
  const [routeHitMs, r2] = await timed(() => GET(new Request(url)))
  const b2 = await r2.text()
  out.route = { status: [r1.status, r2.status], xcache: [r1.headers.get("x-cache"), r2.headers.get("x-cache")], sameBody: b1 === b2, hitMs: routeHitMs }

  console.log(`HARNESS_RESULT ${JSON.stringify(out)}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect().catch(() => {}))
