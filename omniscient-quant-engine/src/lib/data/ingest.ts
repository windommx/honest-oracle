// ============================================================
// นำเข้าข้อมูลตลาดจริง — แทนที่ข้อมูลจำลองทั้งชุด (Stock/Price/Fundamental/FundFlow)
//
// ขั้นตอน: ตรวจรูปแบบ (zod) → prepareDataset (pure: เรียง/ตัดซ้ำ/ตรวจ OHLC/แปลงหน่วย/ประมาณ beta/ตรวจความยาวร่วม)
//          → replaceMarketData (backup ก่อนเสมอ → transaction ลบ-เขียนใหม่ → บันทึก DataSource → ล้าง cache)
// ไม่แตะ JournalEntry / รายงานเก่า / การล็อกกติกา / ActionLog — เป็นข้อมูลของผู้ใช้ ไม่ใช่ข้อมูลตลาด
//
// หน่วย: ราคา = บาท · ปริมาณในฐานข้อมูล = ล้านหุ้น (หน่วยเดียวกับ generator) — ข้อมูลเข้าเป็นจำนวนหุ้นโดยค่าเริ่มต้น
// เงินไหล = ล้านบาท · งบ = PIT ตามวันประกาศ (announceDate) เท่านั้น
// ============================================================

import { z } from "zod"
import { db } from "@/lib/db"
import { isValidYmd, isWeekend } from "./calendar"

export const INGEST_LIMITS = {
  minSymbols: 5,
  maxSymbols: 200,
  /** วันซื้อขายร่วมขั้นต่ำ — walk-forward ต้องการ train 252 + embargo 5 + test 21 และ panel ต้องการหน้าต่างกลิ้ง 120–252 วัน */
  minBars: 300,
  maxBarsPerSymbol: 6000,
} as const

const Ymd = z.string().refine(isValidYmd, "วันที่ต้องเป็น YYYY-MM-DD ที่มีอยู่จริง")
const optPositive = z.number().positive().nullable().optional()

export const PriceRowSchema = z.object({
  date: Ymd,
  open: optPositive,
  high: optPositive,
  low: optPositive,
  close: z.number().positive(),
  volume: z.number().nonnegative().default(0),
})

export const FundamentalRowSchema = z.object({
  announceDate: Ymd,
  period: z.string().trim().min(1).max(20),
  pe: z.number(),
  pb: z.number(),
  roe: z.number(),
  de: z.number(),
  revenueGrowth: z.number(),
  netProfitM: z.number().default(0),
})

export const FlowRowSchema = z.object({ date: Ymd, netFlowM: z.number() })

export const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.&-]{0,14}$/

export const StockInputSchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(SYMBOL_RE, "สัญลักษณ์หุ้น A–Z/0–9 ไม่เกิน 15 ตัว"),
  name: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(40).optional(),
  theme: z.string().trim().max(40).optional(),
  beta: z.number().min(-5).max(5).optional(),
  prices: z.array(PriceRowSchema).min(1).max(INGEST_LIMITS.maxBarsPerSymbol),
  fundamentals: z.array(FundamentalRowSchema).max(400).default([]),
  flows: z.array(FlowRowSchema).max(INGEST_LIMITS.maxBarsPerSymbol).default([]),
})

export const DatasetSchema = z.object({
  /** ที่มาของข้อมูล เช่น "yahoo:chart-v8 adjusted" หรือ "csv:amibroker export 2026-09-28" */
  source: z.string().trim().min(1).max(120),
  /** สิทธิ์การใช้ข้อมูล — แสดงคู่กับข้อมูลเสมอ */
  license: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  /** หน่วยของ volume ที่ส่งมา: shares (ค่าเริ่มต้น — แปลง ÷1e6) | millionShares */
  volumeUnit: z.enum(["shares", "millionShares"]).default("shares"),
  stocks: z.array(StockInputSchema).min(1).max(INGEST_LIMITS.maxSymbols),
})

export type DatasetInput = z.input<typeof DatasetSchema>
export type Dataset = z.output<typeof DatasetSchema>

export interface PreparedStock {
  symbol: string
  name: string
  sector: string
  theme: string
  beta: number
  betaEstimated: boolean
  prices: Array<{ date: Date; open: number; high: number; low: number; close: number; volume: number }>
  fundamentals: Array<{ announceDate: Date; period: string; pe: number; pb: number; roe: number; de: number; revenueGrowth: number; netProfitM: number }>
  flows: Array<{ date: Date; netFlowM: number }>
}

export interface IngestSummary {
  symbols: number
  priceRows: number
  firstDate: string
  lastDate: string
  /** วันแรกที่ทุกตัวมีราคา (panel เริ่มที่นี่) */
  commonStart: string
  /** จำนวนวันซื้อขายตั้งแต่ commonStart ถึงวันล่าสุด */
  commonBars: number
  withFundamentals: number
  withFlows: number
  betaEstimated: number
}

export interface PreparedDataset {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: IngestSummary | null
  stocks: PreparedStock[]
  meta: { source: string; license: string | null; note: string | null }
}

const utc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)

/** beta = cov(r_i, r_m) / var(r_m) ของผลตอบแทนรายวันเทียบดัชนีเฉลี่ยเท่ากันของชุดข้อมูล (ช่วง 0.2–2.5) */
export function estimateBetas(series: Map<string, Map<string, number>>): Map<string, number> {
  const dates = [...new Set([...series.values()].flatMap((m) => [...m.keys()]))].sort()
  const rets = new Map<string, Map<string, number>>()
  for (const [sym, m] of series) {
    const r = new Map<string, number>()
    let prev: number | undefined
    for (const d of dates) {
      const c = m.get(d)
      if (c !== undefined && prev !== undefined && prev > 0) r.set(d, c / prev - 1)
      if (c !== undefined) prev = c
    }
    rets.set(sym, r)
  }
  const market = new Map<string, number>()
  for (const d of dates) {
    let acc = 0
    let n = 0
    for (const r of rets.values()) {
      const v = r.get(d)
      if (v !== undefined && Number.isFinite(v)) {
        acc += v
        n++
      }
    }
    if (n > 0) market.set(d, acc / n)
  }
  const out = new Map<string, number>()
  for (const [sym, r] of rets) {
    const xs: number[] = []
    const ys: number[] = []
    for (const [d, v] of r) {
      const m = market.get(d)
      if (m !== undefined && Number.isFinite(v)) {
        xs.push(m)
        ys.push(v)
      }
    }
    if (xs.length < 30) {
      out.set(sym, 1)
      continue
    }
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length
    const my = ys.reduce((a, b) => a + b, 0) / ys.length
    let cov = 0
    let varx = 0
    for (let i = 0; i < xs.length; i++) {
      cov += (xs[i] - mx) * (ys[i] - my)
      varx += (xs[i] - mx) ** 2
    }
    const beta = varx > 0 ? cov / varx : 1
    out.set(sym, Math.min(2.5, Math.max(0.2, +beta.toFixed(2))))
  }
  return out
}

/**
 * ตรวจ + ทำความสะอาดชุดข้อมูล (pure — ไม่แตะ DB)
 * errors = ห้ามนำเข้า · warnings = นำเข้าได้แต่ต้องแสดงให้ผู้ใช้เห็น
 */
export function prepareDataset(ds: Dataset): PreparedDataset {
  const errors: string[] = []
  const warnings: string[] = []
  const meta = { source: ds.source, license: ds.license ?? null, note: ds.note ?? null }
  const seen = new Set<string>()
  for (const s of ds.stocks) {
    if (seen.has(s.symbol)) errors.push(`สัญลักษณ์ซ้ำ: ${s.symbol}`)
    seen.add(s.symbol)
  }
  if (ds.stocks.length < INGEST_LIMITS.minSymbols) {
    errors.push(`ต้องมีอย่างน้อย ${INGEST_LIMITS.minSymbols} หุ้น (มี ${ds.stocks.length}) — z-score ตัดขวาง, factor model และ dependence ต้องการความกว้างของตลาด`)
  }
  const volScale = ds.volumeUnit === "shares" ? 1e-6 : 1
  const closesBySym = new Map<string, Map<string, number>>()
  const cleaned: Array<Omit<PreparedStock, "beta" | "betaEstimated"> & { betaIn?: number }> = []
  let weekendRows = 0
  let dupRows = 0
  let droppedRows = 0
  let widenedRows = 0

  for (const s of ds.stocks) {
    const byDate = new Map<string, (typeof s.prices)[number]>()
    for (const p of s.prices) {
      if (byDate.has(p.date)) dupRows++
      byDate.set(p.date, p) // วันซ้ำ: ใช้แถวหลังสุด
    }
    const rows: PreparedStock["prices"] = []
    for (const [date, p] of [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (isWeekend(date)) weekendRows++
      const open = p.open ?? p.close
      let high = p.high ?? Math.max(open, p.close)
      let low = p.low ?? Math.min(open, p.close)
      if (high < low) {
        droppedRows++ // high < low = แถวเสีย ไม่เดาแก้ให้
        continue
      }
      if (high < Math.max(open, p.close) || low > Math.min(open, p.close)) {
        widenedRows++
        high = Math.max(high, open, p.close)
        low = Math.min(low, open, p.close)
      }
      rows.push({ date: utc(date), open, high, low, close: p.close, volume: p.volume * volScale })
    }
    if (rows.length === 0) {
      errors.push(`${s.symbol}: ไม่มีแถวราคาที่ใช้ได้`)
      continue
    }
    closesBySym.set(s.symbol, new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r.close])))
    const fundamentals = [...new Map(s.fundamentals.map((f) => [f.announceDate, f])).values()]
      .sort((a, b) => (a.announceDate < b.announceDate ? -1 : 1))
      .map((f) => ({ ...f, announceDate: utc(f.announceDate) }))
    const flows = [...new Map(s.flows.map((f) => [f.date, f])).values()]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((f) => ({ date: utc(f.date), netFlowM: f.netFlowM }))
    cleaned.push({
      symbol: s.symbol,
      name: s.name || s.symbol,
      sector: s.sector || "ไม่ระบุ",
      theme: s.theme || s.sector || "ไม่ระบุ",
      betaIn: s.beta,
      prices: rows,
      fundamentals,
      flows,
    })
  }

  if (dupRows) warnings.push(`พบวันที่ซ้ำ ${dupRows} แถว — ใช้แถวหลังสุดของแต่ละวัน`)
  if (droppedRows) warnings.push(`ตัดแถวที่ high < low ทิ้ง ${droppedRows} แถว`)
  if (widenedRows) warnings.push(`${widenedRows} แถวที่ high/low ไม่ครอบ open/close — ขยาย high/low ให้ครอบ`)
  const totalRows = cleaned.reduce((a, s) => a + s.prices.length, 0)
  if (weekendRows > Math.max(3, totalRows * 0.01)) {
    warnings.push(`มี ${weekendRows} แถวที่ตรงวันเสาร์–อาทิตย์ — ตรวจ timezone ของวันที่ (ควรเป็นวันตลาดตามเวลาไทย)`)
  }

  let summary: IngestSummary | null = null
  if (cleaned.length) {
    const firsts = cleaned.map((s) => ({ symbol: s.symbol, first: s.prices[0].date.getTime(), last: s.prices[s.prices.length - 1].date.getTime() }))
    const commonStart = Math.max(...firsts.map((f) => f.first))
    const lastDate = Math.max(...firsts.map((f) => f.last))
    const allDates = new Set<number>()
    for (const s of cleaned) for (const p of s.prices) allDates.add(p.date.getTime())
    const commonBars = [...allDates].filter((t) => t >= commonStart).length
    if (commonBars < INGEST_LIMITS.minBars) {
      const late = [...firsts].sort((a, b) => b.first - a.first).slice(0, 5)
      errors.push(
        `ช่วงที่ทุกตัวมีราคาร่วมกันมีแค่ ${commonBars} วันซื้อขาย (ต้อง ≥ ${INGEST_LIMITS.minBars}) — ตัวที่เริ่มช้าสุด: ${late
          .map((f) => `${f.symbol} (${new Date(f.first).toISOString().slice(0, 10)})`)
          .join(", ")} · ตัดตัวที่เข้าตลาดช้าออก หรือดึงประวัติยาวขึ้น`,
      )
    }
    for (const f of firsts) {
      const staleDays = (lastDate - f.last) / 86_400_000
      if (staleDays > 10) warnings.push(`${f.symbol}: ราคาล่าสุด ${new Date(f.last).toISOString().slice(0, 10)} เก่ากว่าวันล่าสุดของชุด ${Math.round(staleDays)} วัน — ระบบจะเติมด้วยราคาล่าสุด (พักการซื้อขาย?)`)
    }
    const withFund = cleaned.filter((s) => s.fundamentals.length > 0).length
    const withFlows = cleaned.filter((s) => s.flows.length > 0).length
    if (withFund < cleaned.length) warnings.push(`${cleaned.length - withFund} ตัวไม่มีงบการเงิน — สาย "มูลค่า" และ "พื้นฐาน" ของหุ้นเหล่านั้นงดออกเสียง`)
    if (withFlows < cleaned.length) warnings.push(`${cleaned.length - withFlows} ตัวไม่มีเงินไหลสถาบัน — สาย "เงินไหล" ของหุ้นเหล่านั้นงดออกเสียง`)
    summary = {
      symbols: cleaned.length,
      priceRows: totalRows,
      firstDate: new Date(Math.min(...firsts.map((f) => f.first))).toISOString().slice(0, 10),
      lastDate: new Date(lastDate).toISOString().slice(0, 10),
      commonStart: new Date(commonStart).toISOString().slice(0, 10),
      commonBars,
      withFundamentals: withFund,
      withFlows,
      betaEstimated: cleaned.filter((s) => s.betaIn === undefined).length,
    }
  }

  const betas = estimateBetas(closesBySym)
  const stocks: PreparedStock[] = cleaned.map(({ betaIn, ...s }) => ({
    ...s,
    beta: betaIn ?? betas.get(s.symbol) ?? 1,
    betaEstimated: betaIn === undefined,
  }))
  return { ok: errors.length === 0, errors, warnings, summary, stocks, meta }
}

export interface ReplaceResult {
  stocks: number
  prices: number
  dataSourceId: string
  tookMs: number
}

/**
 * แทนที่ข้อมูลตลาดทั้งชุดใน transaction เดียว — ล้มกลางทาง = ข้อมูลเดิมอยู่ครบ
 * ผู้เรียกต้อง backup ก่อน (route/สคริปต์ทำให้) · หลังสำเร็จต้องล้าง cache ของ process (invalidateMarketCache)
 */
export async function replaceMarketData(prepared: PreparedDataset): Promise<ReplaceResult> {
  if (!prepared.ok || !prepared.summary) throw new Error(`ชุดข้อมูลไม่ผ่านการตรวจ: ${prepared.errors.join(" · ")}`)
  const t0 = Date.now()
  const summary = prepared.summary
  const result = await db.$transaction(
    async (tx) => {
      await tx.price.deleteMany()
      await tx.fundFlow.deleteMany()
      await tx.fundamental.deleteMany()
      await tx.stock.deleteMany()
      let prices = 0
      for (const s of prepared.stocks) {
        const stock = await tx.stock.create({ data: { symbol: s.symbol, name: s.name, sector: s.sector, theme: s.theme, beta: s.beta } })
        for (let i = 0; i < s.prices.length; i += 500) {
          const chunk = s.prices.slice(i, i + 500).map((p) => ({ stockId: stock.id, ...p }))
          prices += (await tx.price.createMany({ data: chunk })).count
        }
        if (s.fundamentals.length) await tx.fundamental.createMany({ data: s.fundamentals.map((f) => ({ stockId: stock.id, ...f })) })
        for (let i = 0; i < s.flows.length; i += 500) {
          await tx.fundFlow.createMany({ data: s.flows.slice(i, i + 500).map((f) => ({ stockId: stock.id, ...f })) })
        }
      }
      const source = await tx.dataSource.create({
        data: {
          kind: "real",
          source: prepared.meta.source,
          license: prepared.meta.license,
          note: [prepared.meta.note, prepared.warnings.length ? `คำเตือนตอนนำเข้า: ${prepared.warnings.join(" · ")}` : null].filter(Boolean).join(" | ").slice(0, 2000) || null,
          stocks: prepared.stocks.length,
          prices,
          firstDate: new Date(`${summary.firstDate}T00:00:00.000Z`),
          lastDate: new Date(`${summary.lastDate}T00:00:00.000Z`),
        },
      })
      return { stocks: prepared.stocks.length, prices, dataSourceId: source.id }
    },
    { maxWait: 10_000, timeout: 300_000 },
  )
  return { ...result, tookMs: Date.now() - t0 }
}
