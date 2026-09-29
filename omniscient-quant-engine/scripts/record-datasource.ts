/// <reference types="bun-types" />
// bun scripts/record-datasource.ts — บันทึกที่มาของข้อมูลใน DB ปัจจุบัน (ตาราง DataSource) ถ้ายังไม่มี
// ใช้กับ snapshot เดิมที่ seed มาก่อนจะมีตารางนี้ · env: DATABASE_URL (file:...)
//   bun scripts/record-datasource.ts            # synthetic (generator seed ตาม RULES.seed)
//   bun scripts/record-datasource.ts --real --source "csv:amibroker" --license "ข้อมูลของผู้ใช้เอง"
import { db } from '@/lib/db'
import { RULES } from '@/lib/quant/engine/rules'

const argOf = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined)
const kind = process.argv.includes('--real') ? 'real' : 'synthetic'
const stocks = await db.stock.count()
const prices = await db.price.count()
const first = await db.price.findFirst({ orderBy: { date: 'asc' } })
const last = await db.price.findFirst({ orderBy: { date: 'desc' } })
const existing = await db.dataSource.findFirst({ orderBy: { createdAt: 'desc' } })
if (existing) {
  console.log(JSON.stringify({ msg: 'DataSource มีอยู่แล้ว', kind: existing.kind, source: existing.source, prices: existing.prices }))
} else if (stocks === 0) {
  console.log(JSON.stringify({ msg: 'ยังไม่มีข้อมูลใน DB — ไม่บันทึก' }))
} else {
  const row = await db.dataSource.create({
    data: {
      kind,
      source: kind === 'synthetic' ? `generator seed ${RULES.seed}` : (argOf('--source') ?? 'manual'),
      license: kind === 'real' ? (argOf('--license') ?? null) : null,
      note: kind === 'synthetic' ? 'demo snapshot ที่แนบมากับ repo — ข้อมูลจำลองเพื่อการสาธิต' : null,
      stocks, prices, firstDate: first?.date, lastDate: last?.date, seed: kind === 'synthetic' ? RULES.seed : null,
    },
  })
  console.log(JSON.stringify({ msg: 'บันทึก DataSource แล้ว', kind: row.kind, source: row.source, stocks, prices, lastDate: last?.date?.toISOString().slice(0, 10) }))
}
await db.$disconnect()
