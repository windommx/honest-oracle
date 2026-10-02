// ============================================================
// CSV → ชุดข้อมูลนำเข้า (pure) — รูปแบบ "ยาว" 1 แถว = 1 หุ้น × 1 วัน
//
//   symbol,date,open,high,low,close,volume
//   PTT,2026-09-25,33.25,33.75,33.00,33.50,41234500
//
// หัวคอลัมน์ไม่สนตัวพิมพ์ และรับชื่อแบบ AmiBroker/MetaStock: <TICKER>, Ticker, Date/Time, <DTYYYYMMDD>, Vol
// ตัวคั่น: , ; หรือ tab (ดูจากบรรทัดหัว) · ค่าที่มีเครื่องหมายคำพูดครอบได้
// วันที่: YYYY-MM-DD · YYYYMMDD · YYYY/MM/DD · DD/MM/YYYY (แบบไทย) · ปี พ.ศ. (> 2400) ถูกแปลงเป็น ค.ศ.
// ไฟล์ metadata (ไม่บังคับ): symbol,name,sector,theme,beta
// ============================================================

const ALIASES: Record<string, string[]> = {
  symbol: ["symbol", "ticker", "<ticker>", "code", "stock", "หุ้น", "ชื่อย่อ"],
  date: ["date", "date/time", "<date>", "<dtyyyymmdd>", "datetime", "วันที่"],
  open: ["open", "<open>", "o", "เปิด"],
  high: ["high", "<high>", "h", "สูงสุด"],
  low: ["low", "<low>", "l", "ต่ำสุด"],
  close: ["close", "<close>", "c", "adj close", "last", "ปิด"],
  volume: ["volume", "vol", "<vol>", "<volume>", "v", "ปริมาณ"],
  name: ["name", "ชื่อ", "company"],
  sector: ["sector", "หมวด", "industry"],
  theme: ["theme", "ธีม", "group"],
  beta: ["beta"],
}

export interface CsvIssue {
  line: number
  message: string
}

function detectDelimiter(header: string): string {
  const counts = [",", ";", "\t"].map((d) => ({ d, n: header.split(d).length }))
  counts.sort((a, b) => b.n - a.n)
  return counts[0].n > 1 ? counts[0].d : ","
}

/** แยกบรรทัด CSV (รองรับ "..." และ "" ภายใน) */
export function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function headerIndex(cells: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  cells.forEach((raw, i) => {
    const h = raw.replace(/^﻿/, "").trim().toLowerCase()
    for (const [key, names] of Object.entries(ALIASES)) if (idx[key] === undefined && names.includes(h)) idx[key] = i
  })
  return idx
}

/** วันที่หลายรูปแบบ → YYYY-MM-DD (null = อ่านไม่ออก) */
export function normalizeDate(raw: string): string | null {
  const s = raw.trim().split(/[ T]/)[0]
  let y: number, m: number, d: number
  let mt: RegExpMatchArray | null
  if ((mt = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])]
  else if ((mt = s.match(/^(\d{4})(\d{2})(\d{2})$/))) [y, m, d] = [Number(mt[1]), Number(mt[2]), Number(mt[3])]
  else if ((mt = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, y] = [Number(mt[1]), Number(mt[2]), Number(mt[3])]
  else return null
  if (y > 2400) y -= 543 // พ.ศ. → ค.ศ.
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  const t = Date.parse(`${iso}T00:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? iso : null
}

function num(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const s = raw.replace(/,/g, "").trim()
  if (!s || s === "-" || /^n\/?a$/i.test(s) || /^null$/i.test(s)) return null
  const v = Number(s)
  return Number.isFinite(v) ? v : null
}

export interface CsvPriceRow {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number
}

/** ราคารายวันแบบยาว → Map<symbol, rows> + ปัญหารายบรรทัด (ข้ามบรรทัดเสียแทนที่จะล้มทั้งไฟล์ — จำนวนแสดงให้ผู้ใช้เห็น) */
export function parsePriceCsv(text: string): { bySymbol: Map<string, CsvPriceRow[]>; issues: CsvIssue[]; rows: number } {
  const lines = text.split(/\r?\n/)
  const headerLine = lines.findIndex((l) => l.trim().length > 0)
  const issues: CsvIssue[] = []
  const bySymbol = new Map<string, CsvPriceRow[]>()
  if (headerLine < 0) return { bySymbol, issues: [{ line: 1, message: "ไฟล์ว่าง" }], rows: 0 }
  const delim = detectDelimiter(lines[headerLine])
  const idx = headerIndex(splitCsvLine(lines[headerLine], delim))
  for (const need of ["symbol", "date", "close"]) {
    if (idx[need] === undefined) issues.push({ line: headerLine + 1, message: `ไม่พบคอลัมน์ ${need} ในบรรทัดหัว (ต้องมี symbol,date,close อย่างน้อย)` })
  }
  if (issues.length) return { bySymbol, issues, rows: 0 }
  let rows = 0
  for (let i = headerLine + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    const c = splitCsvLine(line, delim)
    const symbol = (c[idx.symbol] ?? "").toUpperCase().replace(/\.BK$/, "")
    const date = normalizeDate(c[idx.date] ?? "")
    const close = num(c[idx.close])
    if (!symbol || !date || close === null || close <= 0) {
      if (issues.length < 200) issues.push({ line: i + 1, message: `ข้ามบรรทัด: ${!symbol ? "ไม่มี symbol" : !date ? `วันที่อ่านไม่ออก "${c[idx.date] ?? ""}"` : "close ไม่ใช่ตัวเลขบวก"}` })
      continue
    }
    const vol = idx.volume !== undefined ? num(c[idx.volume]) : null
    const arr = bySymbol.get(symbol) ?? []
    arr.push({
      date,
      open: idx.open !== undefined ? num(c[idx.open]) : null,
      high: idx.high !== undefined ? num(c[idx.high]) : null,
      low: idx.low !== undefined ? num(c[idx.low]) : null,
      close,
      volume: vol !== null && vol > 0 ? vol : 0,
    })
    bySymbol.set(symbol, arr)
    rows++
  }
  return { bySymbol, issues, rows }
}

export interface CsvMetaRow {
  symbol: string
  name?: string
  sector?: string
  theme?: string
  beta?: number
}

/** ไฟล์ metadata: symbol,name,sector,theme,beta */
export function parseMetaCsv(text: string): Map<string, CsvMetaRow> {
  const out = new Map<string, CsvMetaRow>()
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return out
  const delim = detectDelimiter(lines[0])
  const idx = headerIndex(splitCsvLine(lines[0], delim))
  if (idx.symbol === undefined) return out
  for (const line of lines.slice(1)) {
    const c = splitCsvLine(line, delim)
    const symbol = (c[idx.symbol] ?? "").toUpperCase().replace(/\.BK$/, "")
    if (!symbol) continue
    const beta = idx.beta !== undefined ? num(c[idx.beta]) : null
    out.set(symbol, {
      symbol,
      name: idx.name !== undefined ? c[idx.name] || undefined : undefined,
      sector: idx.sector !== undefined ? c[idx.sector] || undefined : undefined,
      theme: idx.theme !== undefined ? c[idx.theme] || undefined : undefined,
      beta: beta ?? undefined,
    })
  }
  return out
}
