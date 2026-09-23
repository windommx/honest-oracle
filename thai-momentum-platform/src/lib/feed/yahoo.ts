// ============================================================
// Yahoo Finance adapter — ราคารายวัน OHLCV ของหุ้นไทย (suffix ".BK") ผ่าน chart API v8
//
// ทำไม Yahoo: เป็นแหล่งเดียวที่ server ของแพลตฟอร์มเรียกได้ตรง ๆ ด้วย fetch ธรรมดา (ต้องส่ง UA แบบ browser)
// — โมดูล GTAA ใช้ endpoint เดียวกันนี้ดึงข้อมูลจริง 30 ปีสำเร็จมาแล้ว
//
// ความจริงของข้อมูล (แสดงบนการ์ดเสมอ — ไม่เดาแทน):
// - val (มูลค่าซื้อขาย บาท) = close × volume โดยประมาณ (SET นับ Σ ราคา×จำนวนทุก trade) ต่างกันไม่กี่ %
// - adjusted=true: ปรับ open/high/low/close ด้วย adjclose/close (ปันผล + สปลิต) — val ใช้ราคาดิบ
// - Yahoo ไม่มีองค์ประกอบดัชนี/sector ให้ — รายชื่อมาจาก universe.ts หรือผู้ใช้
// ============================================================

import type { ParsedCsvRow } from "@/lib/momentum/core"
import type { FeedRange, FeedSymbolReport } from "@/lib/momentum/contracts"
import { assessSymbol } from "./quality"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export interface YahooChartJson {
  chart?: {
    result?: {
      meta?: {
        symbol?: string
        currency?: string
        exchangeName?: string
        fullExchangeName?: string
        exchangeTimezoneName?: string
        regularMarketPrice?: number
      }
      timestamp?: number[]
      indicators?: {
        quote?: {
          open?: (number | null)[]
          high?: (number | null)[]
          low?: (number | null)[]
          close?: (number | null)[]
          volume?: (number | null)[]
        }[]
        adjclose?: { adjclose?: (number | null)[] }[]
      }
    }[]
    error?: { code?: string; description?: string } | null
  }
}

export interface YahooMeta {
  currency: string | null
  exchange: string | null
  timezone: string
}

export const YAHOO_RANGES: FeedRange[] = ["6mo", "1y", "2y", "3y", "5y", "max"]

/** วันที่ตลาด (YYYY-MM-DD) ของ timestamp ตาม timezone ของตลาด — Yahoo ให้ตราเวลาเปิดตลาดใน UTC */
export function tsToMarketDate(ts: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ts * 1000))
  } catch {
    return new Date(ts * 1000).toISOString().slice(0, 10)
  }
}

const r4 = (x: number) => Math.round(x * 10000) / 10000

/**
 * แปลง JSON ของ chart API → แถวรูปแบบเดียวกับ CSV ingest (pure — ทดสอบได้)
 * - ข้ามแถวที่ close ว่าง/≤0
 * - adjusted: คูณ OHLC ด้วย factor = adjclose/close ของวันนั้น (val ใช้ราคาดิบ × volume)
 */
export function mapChartToRows(
  symbol: string,
  json: YahooChartJson,
  opts: { adjusted: boolean },
): { rows: ParsedCsvRow[]; meta: YahooMeta } {
  const res = json.chart?.result?.[0]
  if (!res) {
    const msg = json.chart?.error?.description ?? json.chart?.error?.code ?? "รูปแบบ response ไม่ครบ"
    throw new Error(msg)
  }
  const tz = res.meta?.exchangeTimezoneName ?? "Asia/Bangkok"
  const meta: YahooMeta = {
    currency: res.meta?.currency ?? null,
    exchange: res.meta?.fullExchangeName ?? res.meta?.exchangeName ?? null,
    timezone: tz,
  }
  const ts = res.timestamp ?? []
  const q = res.indicators?.quote?.[0] ?? {}
  const adj = res.indicators?.adjclose?.[0]?.adjclose ?? []
  const rows: ParsedCsvRow[] = []
  const seen = new Set<string>()
  for (let i = 0; i < ts.length; i++) {
    const closeRaw = q.close?.[i]
    if (closeRaw === null || closeRaw === undefined || !Number.isFinite(closeRaw) || closeRaw <= 0) continue
    const date = tsToMarketDate(ts[i], tz)
    if (seen.has(date)) continue // Yahoo บางครั้งแนบแท่งระหว่างวันซ้ำวันสุดท้าย — เก็บแท่งแรกของวัน
    seen.add(date)
    const volume = q.volume?.[i]
    const vol = volume !== null && volume !== undefined && Number.isFinite(volume) && volume > 0 ? volume : 0
    let factor = 1
    if (opts.adjusted) {
      const a = adj[i]
      if (a !== null && a !== undefined && Number.isFinite(a) && a > 0) factor = a / closeRaw
    }
    const pick = (v: number | null | undefined): number | null =>
      v !== null && v !== undefined && Number.isFinite(v) && v > 0 ? r4(v * factor) : null
    rows.push({
      date,
      symbol,
      close: r4(closeRaw * factor),
      open: pick(q.open?.[i]),
      high: pick(q.high?.[i]),
      low: pick(q.low?.[i]),
      val: Math.round(closeRaw * vol),
    })
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return { rows, meta }
}

async function fetchWithTimeout(url: string, ms = 15_000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * ดึงหุ้น 1 ตัว (ลอง query1 → query2) — ถอยหลังแล้วลองรอบใหม่เฉพาะความล้มเหลวชั่วคราว (429/5xx/timeout/เครือข่าย)
 * 401/403 (ถูกบล็อก/proxy ปฏิเสธ) ไม่ลองซ้ำ: เดิมถอยหลัง 1.5+3+4.5 วินาทีต่อตัว → SET50 ที่ถูกบล็อกใช้ ~8 นาที
 * deadline (epoch ms) = งบเวลาของทั้งชุด — ไม่เริ่มคำขอ/รอบใหม่เมื่อเลยงบ
 */
export async function fetchYahooDaily(
  symbol: string,
  range: FeedRange,
  opts: { adjusted: boolean; suffix?: string; retryDelayMs?: number; deadline?: number } = { adjusted: true },
): Promise<{ rows: ParsedCsvRow[]; meta: YahooMeta }> {
  const ticker = `${symbol}${opts.suffix ?? ".BK"}`
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
  const retryDelay = opts.retryDelayMs ?? 1500
  const ATTEMPTS = 3
  let lastErr = "unknown"
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    let transient = false
    for (const host of hosts) {
      const left = opts.deadline !== undefined ? opts.deadline - Date.now() : Infinity
      if (left <= 1000) throw new Error(`หมดงบเวลาของรอบนี้ (${lastErr})`)
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&events=div%2Csplit`
      try {
        const r = await fetchWithTimeout(url, Math.min(15_000, left))
        if (r.status === 404) throw new Error(`ไม่พบสัญลักษณ์ ${ticker} บน Yahoo`)
        if (r.status === 429 || r.status >= 500) {
          lastErr = `HTTP ${r.status}`
          transient = true
          continue
        }
        if (!r.ok) {
          lastErr = `HTTP ${r.status}` // 401/403 ฯลฯ — ลองอีก host ได้ แต่ไม่ถอยหลังรอบใหม่
          continue
        }
        const json = (await r.json()) as YahooChartJson
        return mapChartToRows(symbol, json, { adjusted: opts.adjusted })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.startsWith("ไม่พบสัญลักษณ์")) throw e
        lastErr = msg.includes("aborted") ? "หมดเวลา (timeout 15s)" : msg
        transient = true
      }
    }
    if (!transient || attempt === ATTEMPTS - 1) break
    await sleep(retryDelay * (attempt + 1)) // ถอยหลังก่อนรอบใหม่ (rate limit)
  }
  throw new Error(lastErr)
}

export interface YahooBatchResult {
  rows: ParsedCsvRow[]
  reports: FeedSymbolReport[]
  blocked: boolean // ทุกตัวล้มเหลวด้วยเหตุผลเครือข่ายเดียวกัน → น่าจะโดนบล็อก/ไม่มีเน็ต
}

/** ถ้า N ตัวแรกล้มเหลวด้วยเหตุผลเครือข่ายทั้งหมด (ไม่มีตัวไหนสำเร็จ) ถือว่าเข้าถึง Yahoo ไม่ได้ — หยุดทั้งชุด */
export const BLOCKED_AFTER = 3

/** ดึงหลายตัวแบบเรียงคิว (เว้นช่วงกัน rate limit) + รายงานรายตัวแบบ honest */
export async function fetchYahooBatch(
  symbols: string[],
  range: FeedRange,
  opts: {
    adjusted: boolean
    delayMs?: number
    retryDelayMs?: number
    /** epoch ms — ตัวที่ยังไม่ได้ดึงเมื่อเลยงบจะถูกรายงานว่า "ข้าม" (route มี maxDuration) */
    deadline?: number
    onProgress?: (done: number, total: number, symbol: string) => void
  },
): Promise<YahooBatchResult> {
  const rows: ParsedCsvRow[] = []
  const reports: FeedSymbolReport[] = []
  const delay = opts.delayMs ?? 150
  let netFails = 0
  let okCount = 0
  let blockedEarly = false
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i]
    const skipReason = blockedEarly
      ? `ข้าม — ${BLOCKED_AFTER} ตัวแรกเข้าถึง Yahoo ไม่ได้ทั้งหมด (ถูกบล็อก/ไม่มีเน็ต)`
      : opts.deadline !== undefined && Date.now() > opts.deadline
        ? "ข้าม — เกินงบเวลาของรอบนี้ ดึงตัวที่เหลือในรอบถัดไป"
        : null
    if (skipReason) {
      reports.push({ symbol: sym, ok: false, bars: 0, firstDate: null, lastDate: null, warnings: [], error: skipReason })
      continue
    }
    try {
      const { rows: r } = await fetchYahooDaily(sym, range, {
        adjusted: opts.adjusted,
        retryDelayMs: opts.retryDelayMs,
        deadline: opts.deadline,
      })
      rows.push(...r)
      reports.push(assessSymbol(sym, r))
      okCount++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!msg.startsWith("ไม่พบสัญลักษณ์")) netFails++
      reports.push({ symbol: sym, ok: false, bars: 0, firstDate: null, lastDate: null, warnings: [], error: msg })
    }
    opts.onProgress?.(i + 1, symbols.length, sym)
    if (okCount === 0 && netFails >= BLOCKED_AFTER && netFails === i + 1) blockedEarly = true
    if (i < symbols.length - 1 && !blockedEarly) await sleep(delay)
  }
  return { rows, reports, blocked: symbols.length > 0 && okCount === 0 && (blockedEarly || netFails === symbols.length) }
}
