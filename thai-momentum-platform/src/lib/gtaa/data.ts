// Data layer — โหลด/บันทึก panel (ไฟล์ data/gtaa/panel.json) + parser CSV 2 รูปแบบ
// ช่องทางข้อมูลจริง: ผู้ใช้อัปโหลด CSV หรือรัน scripts/gtaa.ts fetch บนเครื่องที่เน็ตปกติ

import { promises as fs } from "fs"
import path from "path"
import { ALL_ASSETS, GTAA_UNIVERSE } from "./defaults"
import { makeSyntheticPanel } from "./synthetic"
import type { AssetDef, GtaaPanel } from "./types"

export const GTAA_DATA_DIR = path.join(process.cwd(), "data", "gtaa")
export const GTAA_PANEL_PATH = path.join(GTAA_DATA_DIR, "panel.json")

function isValidPanel(p: unknown): p is GtaaPanel {
  if (!p || typeof p !== "object") return false
  const o = p as GtaaPanel
  return Array.isArray(o.dates) && o.dates.length > 0 && !!o.closes && typeof o.closes === "object" && !!o.meta
}

/** โหลด panel: ไฟล์ข้อมูลจริงถ้ามี ไม่งั้น synthetic seed 42 */
export async function loadPanel(): Promise<{ panel: GtaaPanel; fromFile: boolean }> {
  try {
    const raw = await fs.readFile(GTAA_PANEL_PATH, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (isValidPanel(parsed)) return { panel: parsed, fromFile: true }
  } catch {
    // ไม่มีไฟล์ = ใช้ synthetic
  }
  return { panel: makeSyntheticPanel(42), fromFile: false }
}

export async function savePanel(panel: GtaaPanel): Promise<void> {
  await fs.mkdir(GTAA_DATA_DIR, { recursive: true })
  await fs.writeFile(GTAA_PANEL_PATH, JSON.stringify(panel, null, 2), "utf8")
}

export async function clearPanel(): Promise<void> {
  await fs.rm(GTAA_PANEL_PATH, { force: true })
}

/** ป้ายเดือนจากวันที่รูปแบบต่าง ๆ → "YYYY-MM" */
function toMonthLabel(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{1,2})/)
  if (m) return `${m[1]}-${String(parseInt(m[2], 10)).padStart(2, "0")}`
  m = t.match(/^(\d{1,2})\/(\d{4})$/) // MM/YYYY
  if (m) return `${m[2]}-${String(parseInt(m[1], 10)).padStart(2, "0")}`
  const d = new Date(t)
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  }
  return null
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
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const dateCol = header.findIndex((h) => h === "date" || h === "เดือน" || h === "month" || h.startsWith("dates"))
  if (dateCol === -1) {
    return { panel: null, error: 'ไม่เจอคอลัมน์ "date" ในแถวหัวไฟล์', rows: 0, tickers: [] }
  }

  const valueHeaders = ["adjclose", "adj close", "adj_close", "close", "price", "adjclose*", "adjusted close"]
  const isLong = header.some((h) => h === "ticker" || h === "symbol") && header.some((h) => valueHeaders.includes(h))

  const monthMap = new Map<string, Record<string, number>>() // YYYY-MM → {ticker: close}
  const tickerSet = new Set<string>()
  let dataRows = 0

  if (isLong) {
    const dateI = dateCol
    const tickerI = header.findIndex((h) => h === "ticker" || h === "symbol")
    const valueI = header.findIndex((h) => valueHeaders.includes(h))
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",")
      const label = toMonthLabel(cells[dateI] ?? "")
      const ticker = (cells[tickerI] ?? "").trim().toUpperCase()
      const v = parseNum(cells[valueI] ?? "")
      if (!label || !ticker || v === null) continue
      dataRows++
      tickerSet.add(ticker)
      const row = monthMap.get(label) ?? {}
      row[ticker] = v
      monthMap.set(label, row)
    }
  } else {
    const tickerCols = header.map((h, i) => ({ h, i })).filter(({ h, i }) => i !== dateCol && h.length > 0 && h.length <= 6)
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(",")
      const label = toMonthLabel(cells[dateCol] ?? "")
      if (!label) continue
      const row: Record<string, number> = {}
      let any = false
      for (const { h, i: col } of tickerCols) {
        const v = parseNum(cells[col] ?? "")
        const ticker = h.toUpperCase()
        if (v !== null) {
          row[ticker] = v
          tickerSet.add(ticker)
          any = true
        }
      }
      if (any) {
        dataRows++
        const prev = monthMap.get(label) ?? {}
        monthMap.set(label, { ...prev, ...row })
      }
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
