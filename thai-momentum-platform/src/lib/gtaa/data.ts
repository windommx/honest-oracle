// Data layer — โหลด/บันทึก panel (ไฟล์ data/gtaa/panel.json) + parser CSV 2 รูปแบบ
// ช่องทางข้อมูลจริง: ผู้ใช้อัปโหลด CSV หรือรัน scripts/gtaa.ts fetch บนเครื่องที่เน็ตปกติ

import { promises as fs } from "fs"
import path from "path"
import { ALL_ASSETS, GTAA_UNIVERSE } from "./defaults"
import { makeSyntheticPanel } from "./synthetic"
import type { AssetDef, GtaaPanel } from "./types"

export const GTAA_DATA_DIR = path.join(process.cwd(), "data", "gtaa")
export const GTAA_PANEL_PATH = path.join(GTAA_DATA_DIR, "panel.json")

/** ตรวจโครงสร้าง panel ที่อ่านจากไฟล์ — คืน panel (เติม notes/assets ที่ขาด) หรือข้อความเหตุผลที่ใช้ไม่ได้ */
export function normalizePanel(p: unknown): GtaaPanel | string {
  if (!p || typeof p !== "object") return "ไม่ใช่ออบเจ็กต์ JSON"
  const o = p as Partial<GtaaPanel>
  if (!Array.isArray(o.dates) || o.dates.length === 0 || !o.dates.every((d) => typeof d === "string")) {
    return "dates ว่างหรือไม่ใช่ array ของ \"YYYY-MM\""
  }
  if (!o.closes || typeof o.closes !== "object") return "ไม่มี closes"
  for (const [ticker, series] of Object.entries(o.closes)) {
    if (!Array.isArray(series) || series.length !== o.dates.length) return `ซีรีส์ ${ticker} ยาวไม่เท่าจำนวนเดือน`
  }
  if (!o.meta || typeof o.meta !== "object") return "ไม่มี meta"
  const closes = o.closes
  return {
    ...(o as GtaaPanel),
    meta: { ...o.meta, notes: Array.isArray(o.meta.notes) ? o.meta.notes : [] },
    assets: Array.isArray(o.assets) ? o.assets : ALL_ASSETS.filter((a) => a.ticker in closes),
  }
}

/** โหลด panel: ไฟล์ข้อมูลจริงถ้ามี ไม่งั้น synthetic seed 42 (ไฟล์มีแต่ใช้ไม่ได้ → แจ้งเหตุผลใน meta.notes) */
export async function loadPanel(): Promise<{ panel: GtaaPanel; fromFile: boolean }> {
  let problem: string | null = null
  try {
    const raw = await fs.readFile(GTAA_PANEL_PATH, "utf8")
    try {
      const res = normalizePanel(JSON.parse(raw) as unknown)
      if (typeof res !== "string") return { panel: res, fromFile: true }
      problem = res
    } catch {
      problem = "JSON เสีย/อ่านไม่ได้"
    }
  } catch (e) {
    // ไม่มีไฟล์ = ใช้ synthetic
    if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") problem = e instanceof Error ? e.message : String(e)
  }
  const panel = makeSyntheticPanel(42)
  if (problem) {
    panel.meta.notes.unshift(`พบไฟล์ data/gtaa/panel.json แต่ใช้ไม่ได้ (${problem}) — แสดงข้อมูลสังเคราะห์แทน · ดึงข้อมูล/อัปโหลดใหม่เพื่อแทนที่ไฟล์`)
  }
  return { panel, fromFile: false }
}

export async function savePanel(panel: GtaaPanel): Promise<void> {
  await fs.mkdir(GTAA_DATA_DIR, { recursive: true })
  await fs.writeFile(GTAA_PANEL_PATH, JSON.stringify(panel, null, 2), "utf8")
}

export async function clearPanel(): Promise<void> {
  await fs.rm(GTAA_PANEL_PATH, { force: true })
}

/**
 * วันที่รูปแบบต่าง ๆ → ป้ายเดือน "YYYY-MM" + key เรียงลำดับภายในเดือน (y·10000 + m·100 + d; ไม่มีวัน = d 0)
 * — key ใช้เลือก "ราคาปิดวันท้ายสุดของเดือน" เมื่อไฟล์เป็นรายวัน/เรียงจากใหม่ไปเก่า
 */
function toMonthKey(s: string): { label: string; key: number } | null {
  const t = s.trim()
  const out = (y: number, mo: number, d: number) =>
    mo >= 1 && mo <= 12 ? { label: `${y}-${String(mo).padStart(2, "0")}`, key: y * 10000 + mo * 100 + d } : null
  let m = t.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.](\d{1,2}))?/) // YYYY-MM[-DD] · YYYY/MM/DD · YYYY.MM.DD
  if (m) return out(Number(m[1]), Number(m[2]), m[3] ? Number(m[3]) : 0)
  m = t.match(/^(\d{1,2})\/(\d{4})$/) // MM/YYYY
  if (m) return out(Number(m[2]), Number(m[1]), 0)
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) {
    // สตริงที่ไม่ใช่ ISO ถูก parse เป็นเวลาท้องถิ่น → ต้องใช้ getter ท้องถิ่น
    // (getUTC* ทำให้วันที่ 1 ของเดือนเลื่อนไปเดือนก่อนในโซน UTC+ เช่น Asia/Bangkok)
    return out(d.getFullYear(), d.getMonth() + 1, d.getDate())
  }
  return null
}

/** แยกเซลล์ CSV หนึ่งบรรทัด — รองรับ "ค่าในเครื่องหมายคำพูด" (มี , หรือ "" ข้างใน) ตาม RFC 4180 */
function splitCsvLine(line: string): string[] {
  if (!line.includes('"')) return line.split(",")
  const cells: string[] = []
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
    else if (ch === ",") {
      cells.push(cur)
      cur = ""
    } else cur += ch
  }
  cells.push(cur)
  return cells
}

function parseNum(s: string): number | null {
  if (s === undefined) return null
  const t = s.trim().replace(/,/g, "")
  if (t === "" || t === "null" || t === "NA" || t === "-") return null
  const v = Number(t)
  return Number.isFinite(v) && v > 0 ? v : null
}

export interface ParseResult {
  panel: GtaaPanel | null
  error?: string
  rows: number
  tickers: string[]
}

/**
 * Parser CSV อัตโนมัติ 2 รูปแบบ:
 * - wide: คอลัมน์แรก date ที่เหลือคือ ticker (Yahoo/Stooq export style)
 * - long: date,ticker,adjclose (value column: adjclose|adj close|close|price)
 * หลัง parse จะ align เป็นกริดรายเดือน และเติม BIL/SPY ที่หายด้วยชุดแทน (พร้อม note)
 */
export function parseCsvPanel(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 5) {
    return { panel: null, error: "ไฟล์สั้นเกินไป (ต้องมีอย่างน้อย ~5 บรรทัด)", rows: 0, tickers: [] }
  }
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const dateCol = header.findIndex((h) => h === "date" || h === "เดือน" || h === "month" || h.startsWith("dates"))
  if (dateCol === -1) {
    return { panel: null, error: 'ไม่เจอคอลัมน์ "date" ในแถวหัวไฟล์', rows: 0, tickers: [] }
  }

  // เรียงตามลำดับความสำคัญ: ราคาปรับปันผลก่อนเสมอ — ไฟล์แบบ Yahoo มีทั้ง Close และ Adj Close
  const valueHeaders = ["adjclose", "adj close", "adj_close", "adjclose*", "adjusted close", "close", "price"]
  const isLong = header.some((h) => h === "ticker" || h === "symbol") && header.some((h) => valueHeaders.includes(h))

  const monthMap = new Map<string, Record<string, number>>() // YYYY-MM → {ticker: close}
  const keyMap = new Map<string, Record<string, number>>() // YYYY-MM → {ticker: วันของราคาที่เก็บไว้}
  // เก็บราคาของ "วันท้ายสุดในเดือน" ต่อ ticker ไม่ขึ้นกับลำดับแถว (ไฟล์รายวัน/เรียงใหม่→เก่า) — วันเดียวกันซ้ำ = แถวหลังชนะ
  const put = (label: string, key: number, ticker: string, v: number) => {
    const row = monthMap.get(label) ?? {}
    const keys = keyMap.get(label) ?? {}
    if (keys[ticker] === undefined || key >= keys[ticker]) {
      row[ticker] = v
      keys[ticker] = key
    }
    monthMap.set(label, row)
    keyMap.set(label, keys)
  }
  const tickerSet = new Set<string>()
  let dataRows = 0

  if (isLong) {
    const dateI = dateCol
    const tickerI = header.findIndex((h) => h === "ticker" || h === "symbol")
    const valueI = header.indexOf(valueHeaders.find((v) => header.includes(v)) ?? "")
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i])
      const mk = toMonthKey(cells[dateI] ?? "")
      const ticker = (cells[tickerI] ?? "").trim().toUpperCase()
      const v = parseNum(cells[valueI] ?? "")
      if (!mk || !ticker || v === null) continue
      dataRows++
      tickerSet.add(ticker)
      put(mk.label, mk.key, ticker, v)
    }
  } else {
    const tickerCols = header.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== dateCol && h.length > 0 && h.length <= 6)
    for (let i = 1; i < lines.length; i++) {
      const cells = splitCsvLine(lines[i])
      const mk = toMonthKey(cells[dateCol] ?? "")
      if (!mk) continue
      let any = false
      for (const { h, i: col } of tickerCols) {
        const v = parseNum(cells[col] ?? "")
        const ticker = h.toUpperCase()
        if (v !== null) {
          put(mk.label, mk.key, ticker, v)
          tickerSet.add(ticker)
          any = true
        }
      }
      if (any) dataRows++
    }
  }

  if (monthMap.size < 24) {
    return {
      panel: null,
      error: `มีเดือนที่ใช้ได้แค่ ${monthMap.size} เดือน (ต้อง ≥ 24) — เช็ครูปแบบวันที่และคอลัมน์ราคา`,
      rows: dataRows,
      tickers: [...tickerSet],
    }
  }

  const dates = [...monthMap.keys()].sort()
  const universePresent = GTAA_UNIVERSE.filter((a) => tickerSet.has(a.ticker))
  if (universePresent.length < 4) {
    return {
      panel: null,
      error: `เจอ ticker ของ universe แค่ ${universePresent.length}/13 ตัว (ต้อง ≥ 4) — tickers ที่เจอ: ${[...tickerSet].slice(0, 12).join(", ")}`,
      rows: dataRows,
      tickers: [...tickerSet],
    }
  }

  // align เป็น array
  const closes: Record<string, (number | null)[]> = {}
  const assets: AssetDef[] = []
  for (const a of ALL_ASSETS) {
    if (!tickerSet.has(a.ticker)) continue
    assets.push(a)
    closes[a.ticker] = dates.map((d) => monthMap.get(d)?.[a.ticker] ?? null)
  }

  const notes: string[] = [`อัปโหลดผ่าน UI เมื่อ ${new Date().toISOString()}`]

  // เติม BIL/SPY ถ้าไฟล์ไม่มี — เพื่อให้ engine รันได้ครบ (แจ้งใน note ว่าเป็นชุดแทน)
  if (!tickerSet.has("BIL")) {
    let p = 100
    closes["BIL"] = dates.map(() => {
      p *= 1 + 0.0016
      return p
    })
    assets.push({ ...ALL_ASSETS.find((a) => a.ticker === "BIL")! })
    notes.push("ไฟล์ไม่มี BIL — สร้างชุดแทนเงินสด 0.16%/เดือน")
  }
  if (!tickerSet.has("SPY")) {
    // SPY ชุดแทน = เฉลี่ยผลตอบแทนรายเดือนของ universe ที่มีข้อมูล
    const spyRet: number[] = []
    for (let t = 1; t < dates.length; t++) {
      let sum = 0
      let n = 0
      for (const a of universePresent) {
        const cur = closes[a.ticker][t]
        const prev = closes[a.ticker][t - 1]
        if (cur !== null && prev !== null) {
          sum += cur / prev - 1
          n++
        }
      }
      spyRet.push(n > 0 ? sum / n : 0)
    }
    closes["SPY"] = [100, ...spyRet.reduce<number[]>((acc, r) => {
      const last = acc.length > 0 ? acc[acc.length - 1] : 100
      acc.push(last * (1 + r))
      return acc
    }, [])]
    assets.push({ ...ALL_ASSETS.find((a) => a.ticker === "SPY")! })
    notes.push("ไฟล์ไม่มี SPY — benchmark ชุดแทน = เฉลี่ยเท่ากันของ universe")
  }

  return {
    panel: {
      meta: { source: "upload", fetchedAt: new Date().toISOString(), notes },
      dates,
      assets,
      closes,
    },
    rows: dataRows,
    tickers: [...tickerSet],
    error: undefined,
  }
}
