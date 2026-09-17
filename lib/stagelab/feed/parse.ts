import { type DailyBar, type SymbolBars, FeedError } from './types'

// ─── CSV import ──────────────────────────────────────────────────────────────
// SET price history arrives as a file far more often than as an API response:
// a broker export, a Refinitiv or Bloomberg pull, a settrade download. The
// column names differ, the date formats differ, and the numbers frequently
// carry thousands separators. This accepts what those files actually look
// like rather than one canonical shape, and refuses anything ambiguous.

const ALIASES: Record<keyof Omit<DailyBar, 't'> | 't', string[]> = {
  t: ['date', 'time', 'datetime', 'timestamp', 'วันที่', 'trade_date', 'tradedate'],
  o: ['open', 'o', 'openprice', 'open_price', 'ราคาเปิด'],
  h: ['high', 'h', 'highprice', 'high_price', 'สูงสุด'],
  l: ['low', 'l', 'lowprice', 'low_price', 'ต่ำสุด'],
  c: ['close', 'c', 'closeprice', 'close_price', 'last', 'ราคาปิด'],
  v: ['volume', 'v', 'vol', 'shares', 'ปริมาณ', 'quantity'],
  adjClose: ['adjclose', 'adj_close', 'adjustedclose', 'adjusted_close', 'adj close'],
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, '')

/** A number that may carry thousands separators, a currency symbol, or "-". */
function num(raw: string): number | null {
  const s = raw.trim().replace(/[,\s฿]/g, '')
  if (s === '' || s === '-' || s === 'N/A' || s === 'null') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Dates, without guessing.
 *
 * 03/04/2024 is the third of April in Bangkok and the fourth of March in New
 * York, and a file of them is genuinely ambiguous. Rather than pick one and
 * be silently wrong for a third of the year, this accepts unambiguous forms
 * and rejects the rest with a message naming the value — a backtest run on
 * dates that are wrong three months of the year is worse than no backtest.
 */
export function parseDate(raw: string): string {
  const s = raw.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  // DD/MM/YYYY or MM/DD/YYYY — only safe when one component exceeds 12.
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > 12 && b <= 12) return `${m[3]}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
    if (b > 12 && a <= 12) return `${m[3]}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
    throw new Error(
      `Ambiguous date "${s}": could be day/month or month/day. Re-export with ISO dates (YYYY-MM-DD).`,
    )
  }
  // Unix seconds or milliseconds.
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000).toISOString().slice(0, 10)
  if (/^\d{13}$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10)
  throw new Error(`Unrecognised date "${s}". Use ISO dates (YYYY-MM-DD).`)
}

function splitLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',' || ch === '\t' || ch === ';') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

export function parseCsv(text: string, symbol: string, source = 'csv'): SymbolBars {
  // A BOM in front of the header stops the first column ever matching.
  const clean = text.replace(/^﻿/, '').trim()
  const lines = clean.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) throw new FeedError('File has no data rows', symbol)

  const header = splitLine(lines[0]).map(norm)
  const idx = {} as Record<keyof DailyBar, number>
  for (const [field, names] of Object.entries(ALIASES)) {
    const at = header.findIndex((h) => names.includes(h))
    idx[field as keyof DailyBar] = at
  }
  for (const req of ['t', 'c'] as const) {
    if (idx[req] < 0) {
      throw new FeedError(
        `Could not find a ${req === 't' ? 'date' : 'close'} column. Saw: ${header.join(', ')}`,
        symbol,
      )
    }
  }

  const bars: DailyBar[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i])
    let t: string
    try {
      t = parseDate(cells[idx.t] ?? '')
    } catch (e) {
      throw new FeedError(`Row ${i + 1}: ${(e as Error).message}`, symbol, e)
    }
    const c = num(cells[idx.c] ?? '')
    if (c === null) continue // a holiday row with no trade is not an error
    const pick = (k: keyof DailyBar, fallback: number) =>
      idx[k] >= 0 ? (num(cells[idx[k]] ?? '') ?? fallback) : fallback
    bars.push({
      t,
      o: pick('o', c),
      h: pick('h', c),
      l: pick('l', c),
      c,
      v: Math.max(0, pick('v', 0)),
      ...(idx.adjClose >= 0 && num(cells[idx.adjClose] ?? '') !== null
        ? { adjClose: num(cells[idx.adjClose] ?? '') as number }
        : {}),
    })
  }
  if (bars.length === 0) throw new FeedError('No usable rows after parsing', symbol)

  bars.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0))
  return {
    symbol,
    source,
    fetchedAt: new Date().toISOString(),
    currency: 'THB',
    bars,
  }
}
