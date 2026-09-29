// ============================================================
// Yahoo Finance adapter — ราคารายวัน OHLCV ของหุ้นไทย (suffix ".BK") ผ่าน chart API v8
// ใช้จากสคริปต์ (bun scripts/fetch-yahoo.ts) — เซิร์ฟเวอร์ไม่เรียกออกอินเทอร์เน็ตเอง
//
// ความจริงของข้อมูล (บันทึกลง DataSource เสมอ):
// - adjusted=true (ค่าเริ่มต้น): ปรับ open/high/low/close ด้วย adjclose/close (ปันผล + สปลิต) → ผลตอบแทนต่อเนื่องสำหรับ backtest
// - Yahoo ไม่มีงบการเงิน/เงินไหลสถาบัน/หมวดธุรกิจของหุ้นไทยให้ — สายที่อาศัยข้อมูลเหล่านั้นงดออกเสียง
// - เงื่อนไขการใช้งานข้อมูลเป็นของ Yahoo — ใช้เพื่อการศึกษาส่วนตัว ไม่เผยแพร่ซ้ำ
// ============================================================

import type { CsvPriceRow } from "./csv"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export interface YahooChartJson {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; currency?: string; exchangeName?: string; fullExchangeName?: string; exchangeTimezoneName?: string }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }>
        adjclose?: Array<{ adjclose?: (number | null)[] }>
      }
    }>
    error?: { code?: string; description?: string } | null
  }
}

export const YAHOO_RANGES = ["1y", "2y", "3y", "5y", "10y", "max"] as const
export type YahooRange = (typeof YAHOO_RANGES)[number]

/** วันที่ตลาด (YYYY-MM-DD) ของ timestamp ตาม timezone ของตลาด — Yahoo ให้ตราเวลาเปิดตลาดใน UTC */
export function tsToMarketDate(ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts * 1000))
  } catch {
    return new Date(ts * 1000).toISOString().slice(0, 10)
  }
}

const r4 = (x: number) => Math.round(x * 10000) / 10000

/** JSON ของ chart API → แถวราคา (pure — ทดสอบด้วย fixture ได้) · volume = จำนวนหุ้น */
export function mapChartToRows(json: YahooChartJson, opts: { adjusted: boolean }): { rows: CsvPriceRow[]; currency: string | null; exchange: string | null } {
  const res = json.chart?.result?.[0]
  if (!res) throw new Error(json.chart?.error?.description ?? json.chart?.error?.code ?? "รูปแบบ response ไม่ครบ")
  const tz = res.meta?.exchangeTimezoneName ?? "Asia/Bangkok"
  const ts = res.timestamp ?? []
  const q = res.indicators?.quote?.[0] ?? {}
  const adj = res.indicators?.adjclose?.[0]?.adjclose ?? []
  const rows: CsvPriceRow[] = []
  const seen = new Set<string>()
  for (let i = 0; i < ts.length; i++) {
    const closeRaw = q.close?.[i]
    if (closeRaw == null || !Number.isFinite(closeRaw) || closeRaw <= 0) continue
    const date = tsToMarketDate(ts[i], tz)
    if (seen.has(date)) continue // Yahoo บางครั้งแนบแท่งระหว่างวันซ้ำวันสุดท้าย — เก็บแท่งแรกของวัน
    seen.add(date)
    let factor = 1
    if (opts.adjusted) {
      const a = adj[i]
      if (a != null && Number.isFinite(a) && a > 0) factor = a / closeRaw
    }
    const pick = (v: number | null | undefined) => (v != null && Number.isFinite(v) && v > 0 ? r4(v * factor) : null)
    const vol = q.volume?.[i]
    rows.push({
      date,
      open: pick(q.open?.[i]),
      high: pick(q.high?.[i]),
      low: pick(q.low?.[i]),
      close: r4(closeRaw * factor),
      volume: vol != null && Number.isFinite(vol) && vol > 0 ? vol : 0,
    })
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { rows, currency: res.meta?.currency ?? null, exchange: res.meta?.fullExchangeName ?? res.meta?.exchangeName ?? null }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** ดึงหุ้น 1 ตัว (query1 → query2) · ลองซ้ำเฉพาะความล้มเหลวชั่วคราว (429/5xx/timeout) · 401/403/404 ไม่ลองซ้ำ */
export async function fetchYahooDaily(
  symbol: string,
  range: YahooRange,
  opts: { adjusted: boolean; suffix?: string; retryDelayMs?: number; fetchImpl?: typeof fetch } = { adjusted: true },
): Promise<CsvPriceRow[]> {
  const ticker = `${symbol}${opts.suffix ?? ".BK"}`
  const doFetch = opts.fetchImpl ?? fetch
  let lastErr = "unknown"
  for (let attempt = 0; attempt < 3; attempt++) {
    let transient = false
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&events=div%2Csplit`
      try {
        const r = await doFetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) })
        if (r.status === 404) throw new Error(`ไม่พบสัญลักษณ์ ${ticker} บน Yahoo`)
        if (r.status === 429 || r.status >= 500) {
          lastErr = `HTTP ${r.status}`
          transient = true
          continue
        }
        if (!r.ok) {
          lastErr = `HTTP ${r.status}`
          continue
        }
        return mapChartToRows((await r.json()) as YahooChartJson, { adjusted: opts.adjusted }).rows
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.startsWith("ไม่พบสัญลักษณ์")) throw e
        lastErr = /abort|timeout/i.test(msg) ? "หมดเวลา (15s)" : msg
        transient = true
      }
    }
    if (!transient || attempt === 2) break
    await sleep((opts.retryDelayMs ?? 1500) * (attempt + 1))
  }
  throw new Error(lastErr)
}
