// ============================================================
// Core data engine — แหล่งความจริงเดียวของระบบโมเมนตัม
// - parseSnapshotCsv : รองรับ CSV จาก AFL (snapshot รายวัน และ history backfill)
// - ingestRows       : upsert ข้อมูลดิบ + recompute indicator + rebuild snapshot
// - seedDemoData     : สร้างข้อมูลตัวอย่างจำลองตลาดไทย (deterministic)
// - closePivot       : matrix ราคา (มี cache)
// - computeRegimeState : regime จาก overlap ratio + market momentum
// - runDataQualityChecks : ตรวจสุขภาพข้อมูล
// ============================================================

import type { Prisma } from "@prisma/client"
import { db } from "@/lib/db"
import { TH_MIN_PRICE, TH_MIN_VALUE_5D, TH_TOP_N } from "@/lib/config/thai"

export const TFS = [5, 10, 20, 40, 80, 160, 300] as const
// ค่าเริ่มต้นปรับสำหรับตลาดไทย (เอกสาร "การตั้งค่าที่แนะนำสำหรับหุ้นไทย"):
// ราคา > 1.5 บาท, มูลค่า > 3 ล้านบาท/วัน ติดกัน 5 วัน, Top-25 ต่อโผ
// (timeframes เก็บ 160/300 ไว้เป็น long-only view ตามทางเลือกที่ 2 ของเอกสาร)
export const TOPN = TH_TOP_N
export const MIN_PRICE = TH_MIN_PRICE
export const MIN_VALUE = TH_MIN_VALUE_5D

export const CHUNK = 2500
const DAY_MS = 86_400_000

/** Setting ที่บอกที่มาของตาราง CrossAsset: "synthetic" (seed) | "yahoo" (bun run fetch:cross) */
export const CROSS_ASSET_SOURCE_KEY = "cross_asset_source"

// ---------------- helpers ----------------

export function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** วันที่ (YYYY-MM-DD) ตามเวลาตลาดไทยของ instant — Asia/Bangkok = UTC+7 คงที่ (ไม่มี DST) จึงไม่ขึ้นกับ TZ ของ server */
export function bangkokDate(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10)
}

// ปี พ.ศ. → ค.ศ. (Windows/AmiBroker ภาษาไทยส่งออกปีพุทธศักราช เช่น 2569 = 2026) + ตรวจว่าเป็นวันที่มีจริง
function ymdOrNull(y: number, m: number, d: number): string | null {
  if (y >= 2400) y -= 543
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null // เช่น 2026-02-30
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** ลำดับวัน/เดือนของวันที่แบบ a/b/yyyy — ค่าเริ่มต้นตามธรรมเนียมไทย (วัน/เดือน/ปี) */
export type DateOrder = "dmy" | "mdy"

const TIME_SUFFIX = String.raw`(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)?`
const RE_YMD = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})${TIME_SUFFIX}$`)
const RE_AB_Y = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})${TIME_SUFFIX}$`)
// เวลาที่มี timezone กำกับ (Z, +07:00, GMT…) → ต้องแปลงเป็นวันที่ตลาดไทย ไม่ใช่เวลาท้องถิ่นของ server
const RE_ZONED = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)(?:[+-]\d{2}:?\d{2})?(?:\s*\([^)]*\))?$/i

/**
 * แปลงข้อความวันที่ → YYYY-MM-DD (null = ไม่รู้จัก/ไม่ใช่วันที่จริง — ไม่เดาแทน)
 * รองรับ YYYY-MM-DD · YYYY/M/D · YYYYMMDD · D/M/YYYY (ไทย) หรือ M/D/YYYY (ส่วนที่เกิน 12 ตัดสิน, กำกวมใช้ order)
 * · ปี พ.ศ. · เวลาต่อท้าย (ไม่มี timezone = ใช้วันที่ตามที่เขียน, มี timezone = วันที่ตามเวลาตลาดไทย)
 */
export function normalizeDate(s: string, order: DateOrder = "dmy"): string | null {
  const t = s.trim()
  if (!t) return null
  let m = RE_YMD.exec(t)
  if (m) return ymdOrNull(+m[1], +m[2], +m[3])
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t)
  if (m) return ymdOrNull(+m[1], +m[2], +m[3])
  m = RE_AB_Y.exec(t)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    const dayFirst = a > 12 ? true : b > 12 ? false : order === "dmy"
    return dayFirst ? ymdOrNull(+m[3], b, a) : ymdOrNull(+m[3], a, b)
  }
  // ข้อความอื่น (เช่น "Sep 18, 2026", ISO ที่มี timezone) ต้องมีปี 4 หลัก + เลขวัน — ตัวเลขล้วน (Excel serial 46283)
  // และปี-เดือนเฉย ๆ ("2026-09", "Sep 2026") ไม่ใช่วันที่ — ไม่เดา
  if (/^\d+$/.test(t) || /^\d{4}[-/.]\d{1,2}$/.test(t) || !/\d{4}/.test(t)) return null
  if (!/(?:^|\D)\d{1,2}(?:\D|$)/.test(t.replace(/\d{4}/, ""))) return null
  const d = new Date(t)
  if (isNaN(d.getTime())) return null
  const [y, mo, day] = (RE_ZONED.test(t) ? bangkokDate(d) : fmtDate(d)).split("-").map(Number)
  return ymdOrNull(y, mo, day)
}

/** เดาลำดับวัน/เดือนของทั้งไฟล์จากค่าที่ไม่กำกวม (ส่วนแรก > 12 = วัน/เดือน, ส่วนที่สอง > 12 = เดือน/วัน) */
export function detectDateOrder(values: string[]): DateOrder {
  let dmy = false
  let mdy = false
  for (const v of values) {
    const m = /^\s*"?(\d{1,2})[-/.](\d{1,2})[-/.]\d{4}/.exec(v)
    if (!m) continue
    if (+m[1] > 12) dmy = true
    else if (+m[2] > 12) mdy = true
    if (dmy && mdy) break
  }
  return mdy && !dmy ? "mdy" : "dmy"
}

export function pctChange(close: number[], i: number, n: number): number | null {
  if (i < n) return null
  const ref = close[i - n]
  if (!ref || ref <= 0) return null
  return (close[i] / ref - 1) * 100
}

export function liq5Flag(vals: number[], i: number): boolean {
  if (i < 4) return false
  for (let k = i - 4; k <= i; k++) if (!(vals[k] > MIN_VALUE)) return false
  return true
}

export function logistic(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

// ---------------- CSV parsing ----------------

export interface ParsedCsvRow {
  date: string
  symbol: string
  close: number
  open?: number | null
  high?: number | null
  low?: number | null
  val: number // มูลค่าซื้อขายบาท (history format: close*volume)
}
export interface ParsedCsv {
  kind: "snapshot" | "history"
  rows: ParsedCsvRow[]
}

// แยก 1 บรรทัด CSV ตามตัวคั่น — รองรับช่องในเครื่องหมายคำพูด ("1,234,567" / "a ""b""") แบบ Excel
function splitCsvLine(line: string, delim: string): string[] {
  if (!line.includes('"')) return line.split(delim)
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch !== '"') cur += ch
      else if (line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = false
    } else if (ch === '"') quoted = true
    else if (ch === delim) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  out.push(cur)
  return out
}

// ตัวเลขจาก CSV — ตัดตัวคั่นหลักพัน (12,345,678) ที่ Excel ใส่ให้เมื่อจัดรูปแบบตัวเลข
function csvNum(s: string | undefined): number {
  const t = (s ?? "").trim()
  return parseFloat(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t) ? t.replace(/,/g, "") : t)
}

// ชื่อคอลัมน์ที่ยอมรับ (ตัวแรกคือชื่อมาตรฐาน) — "Ticker,Date/Time" คือ header ของ AmiBroker Exploration export
const CSV_COLUMNS: Record<string, string[]> = {
  date: ["date", "date/time", "datetime"],
  symbol: ["symbol", "ticker"],
  close: ["close"],
  val: ["val", "value"],
  volume: ["volume", "vol"],
  open: ["open"],
  high: ["high"],
  low: ["low"],
}

// รองรับ 2 ฟอร์แมต:
// 1) date,symbol,close,val,liq5,ret5,ret10,ret20,ret40,ret80,ret160,ret300  (daily export)
// 2) date,symbol,close,volume  (history backfill)
// ตัวคั่น , / tab (วางจาก Excel) / ; · ขึ้นบรรทัดแบบ LF / CRLF / CR · วันที่ตาม normalizeDate (ลำดับวัน/เดือนเดาทั้งไฟล์)
export function parseSnapshotCsv(csv: string): ParsedCsv {
  const lines = csv
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^﻿/, "").replace(/^ +| +$/g, "")) // ไม่ trim tab — ช่องว่างหัว/ท้ายของ TSV ต้องคงตำแหน่งคอลัมน์
    .filter((l) => l.trim().length > 0)
  if (lines.length < 2) throw new Error("ไฟล์ CSV ว่างเปล่าหรือมีแค่ header")
  const delim = lines[0].includes(",") ? "," : lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ","
  const header = splitCsvLine(lines[0], delim).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => {
    for (const alias of CSV_COLUMNS[name]) {
      const i = header.indexOf(alias)
      if (i >= 0) return i
    }
    return -1
  }
  const iDate = idx("date")
  const iSym = idx("symbol")
  const iClose = idx("close")
  const iVal = idx("val")
  const iVol = idx("volume")
  const iOpen = idx("open")
  const iHigh = idx("high")
  const iLow = idx("low")
  if (iDate < 0 || iSym < 0 || iClose < 0)
    throw new Error("ต้องมีคอลัมน์ date, symbol, close อย่างน้อย")
  const hasVal = iVal >= 0
  const hasVol = iVol >= 0
  const hasOhlc = iOpen >= 0 && iHigh >= 0 && iLow >= 0
  const kind: "snapshot" | "history" = hasVal || header.some((h) => h.startsWith("ret")) ? "snapshot" : "history"

  const table = lines.slice(1).map((l) => splitCsvLine(l, delim))
  const order = detectDateOrder(table.map((p) => p[iDate] ?? ""))
  const rows: ParsedCsvRow[] = []
  for (const parts of table) {
    if (parts.length < header.length - 1) continue
    const date = normalizeDate(parts[iDate] ?? "", order)
    const symbol = (parts[iSym] ?? "").trim().toUpperCase().replace(/\.BK$/, "") // "PTT.BK" (Yahoo) = PTT เหมือนท่อ feed
    const close = csvNum(parts[iClose])
    if (!date || !symbol || !isFinite(close) || close <= 0) continue // ราคาปิด 0 = ไม่มีการซื้อขาย ไม่ใช่ราคา
    let val = 0
    if (hasVal) val = csvNum(parts[iVal]) || 0
    else if (hasVol) val = close * (csvNum(parts[iVol]) || 0)
    if (!(val > 0)) val = 0
    // open/high/low เสริม (SET Sniper) — ไม่มีก็ผ่านได้ (null)
    let open: number | null = null
    let high: number | null = null
    let low: number | null = null
    if (hasOhlc) {
      open = csvNum(parts[iOpen])
      high = csvNum(parts[iHigh])
      low = csvNum(parts[iLow])
      open = isFinite(open) && open > 0 ? open : null
      high = isFinite(high) && high > 0 ? high : null
      low = isFinite(low) && low > 0 ? low : null
    }
    rows.push({ date, symbol, close, open, high, low, val })
  }
  if (rows.length === 0)
    throw new Error("ไม่พบแถวข้อมูลที่ถูกต้องใน CSV (ตรวจวันที่ เช่น 2026-09-18, 18/09/2026, 20260918 และราคาปิด > 0)")
  return { kind, rows }
}

// ---------------- ingest ----------------

export interface IngestSummary {
  insertedRaw: number
  updatedRows: number
  snapDates: string[]
}

export async function ingestRows(rows: ParsedCsvRow[]): Promise<IngestSummary> {
  // 1) จัดกลุ่มต่อหุ้น (date,symbol ซ้ำในชุดเดียว = แถวหลังชนะ เหมือน upsert ทีละแถว)
  const bySym = new Map<string, Map<string, ParsedCsvRow>>()
  for (const r of rows) {
    let m = bySym.get(r.symbol)
    if (!m) bySym.set(r.symbol, (m = new Map()))
    m.set(r.date, r)
  }

  // 2) merge + recompute indicator ทั้งประวัติของหุ้นที่กระทบ (เขียนเฉพาะแถวใหม่/แถวที่ค่าเปลี่ยน)
  // วันที่กระทบ = วันที่ในไฟล์ ∪ วันที่ที่ retN/liq5 เปลี่ยน — backfill ประวัติเก่า/แก้ราคาย้อนหลังทำให้
  // retN ของวันถัดไป (สูงสุด 300 แท่ง) เปลี่ยนด้วย โผของวันเหล่านั้นต้องสร้างใหม่ ไม่งั้นค้างค่าเก่า
  const affected = new Set<string>()
  let updated = 0
  for (const [symbol, incoming] of bySym) {
    for (const d of incoming.keys()) affected.add(d)
    try {
      updated += await mergeSymbol(symbol, incoming, affected)
    } catch (e) {
      // มีผู้เขียนอีกทางสร้างแถวเดียวกันระหว่างนี้ (unique date+symbol) → อ่านใหม่แล้ว merge อีกรอบ
      if ((e as { code?: string }).code !== "P2002") throw e
      updated += await mergeSymbol(symbol, incoming, affected)
    }
  }

  // 3) rebuild snapshot ของทุกวันที่กระทบ
  const snapDates = [...affected].sort()
  await rebuildSnapshotsForDates(snapDates)
  await markDataChanged()
  return { insertedRaw: rows.length, updatedRows: updated, snapDates }
}

type RetKey = `ret${(typeof TFS)[number]}`
const RET_KEYS = TFS.map((tf) => `ret${tf}` as RetKey)

// merge แถวใหม่เข้ากับประวัติของหุ้น 1 ตัว แล้วคำนวณ retN + liq5 ใหม่ทั้งประวัติ
// - close/val: ทับเสมอ · OHLC: มีค่าใหม่ = ทับ, ไม่มี = คงของเดิม (CSV แบบ close-only ต้องไม่ลบของที่เคย ingest มา)
// - คืนจำนวนแถวที่ indicator เปลี่ยน และเติมวันที่ของแถวเหล่านั้นลง affected
async function mergeSymbol(symbol: string, incoming: Map<string, ParsedCsvRow>, affected: Set<string>): Promise<number> {
  const existing = await db.rawDaily.findMany({ where: { symbol }, orderBy: { date: "asc" } })
  interface Work {
    id: number | null
    date: string
    close: number
    open: number | null
    high: number | null
    low: number | null
    val: number
    liq5: number
    rets: (number | null)[]
    baseChanged: boolean
  }
  const byDate = new Map<string, Work>()
  for (const e of existing) {
    byDate.set(e.date, {
      id: e.id,
      date: e.date,
      close: e.close,
      open: e.open,
      high: e.high,
      low: e.low,
      val: e.val,
      liq5: e.liq5,
      rets: RET_KEYS.map((k) => e[k] ?? null),
      baseChanged: false,
    })
  }
  for (const r of incoming.values()) {
    const w = byDate.get(r.date)
    if (!w) {
      byDate.set(r.date, {
        id: null,
        date: r.date,
        close: r.close,
        open: r.open ?? null,
        high: r.high ?? null,
        low: r.low ?? null,
        val: r.val,
        liq5: 0,
        rets: RET_KEYS.map(() => null),
        baseChanged: true,
      })
      continue
    }
    const open = r.open ?? w.open
    const high = r.high ?? w.high
    const low = r.low ?? w.low
    if (w.close !== r.close || w.val !== r.val || w.open !== open || w.high !== high || w.low !== low) {
      Object.assign(w, { close: r.close, val: r.val, open, high, low, baseChanged: true })
    }
  }
  const all = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const closes = all.map((w) => w.close)
  const vals = all.map((w) => w.val)
  const creates: Prisma.RawDailyCreateManyInput[] = []
  const updates: { id: number; data: Prisma.RawDailyUpdateInput }[] = []
  let changed = 0
  for (let i = 0; i < all.length; i++) {
    const w = all[i]
    const rets = TFS.map((tf) => {
      const nv = pctChange(closes, i, tf)
      return nv === null ? null : Math.round(nv * 100) / 100
    })
    const liq = liq5Flag(vals, i) ? 1 : 0
    const indChanged = liq !== w.liq5 || rets.some((v, k) => v !== w.rets[k])
    if (indChanged) {
      changed++
      affected.add(w.date)
    }
    const ind = {
      liq5: liq,
      ret5: rets[0],
      ret10: rets[1],
      ret20: rets[2],
      ret40: rets[3],
      ret80: rets[4],
      ret160: rets[5],
      ret300: rets[6],
    }
    if (w.id === null) {
      creates.push({ date: w.date, symbol, close: w.close, open: w.open, high: w.high, low: w.low, val: w.val, ...ind })
    } else if (indChanged || w.baseChanged) {
      const data: Prisma.RawDailyUpdateInput = indChanged ? { ...ind } : {}
      if (w.baseChanged) Object.assign(data, { close: w.close, val: w.val, open: w.open, high: w.high, low: w.low })
      updates.push({ id: w.id, data })
    }
  }
  const ops: Prisma.PrismaPromise<unknown>[] = []
  for (let i = 0; i < creates.length; i += CHUNK) ops.push(db.rawDaily.createMany({ data: creates.slice(i, i + CHUNK) }))
  for (const u of updates) ops.push(db.rawDaily.update({ where: { id: u.id }, data: u.data }))
  if (ops.length > 0) await db.$transaction(ops)
  return changed
}

// คำนวณ retN + liq5 ใหม่ทั้งประวัติของหุ้น 1 ตัว แล้ว update เฉพาะแถวที่ค่าเปลี่ยน
// (ไม่ rebuild snapshot ให้ — ผู้เรียกต้อง rebuild วันที่กระทบเอง หรือใช้ ingestRows)
export async function recomputeSymbol(symbol: string): Promise<number> {
  return mergeSymbol(symbol, new Map(), new Set())
}

// เลือกโผ Top-N ต่อ timeframe ของวันเดียว (กรองราคา > MIN_PRICE, liq5, มี retN)
type SnapCreate = { date: string; timeframe: number; rank: number; symbol: string; ret: number }
type SnapSource = { symbol: string; close: number; liq5: number } & Record<RetKey, number | null>
function snapshotRowsFor(date: string, rows: SnapSource[]): SnapCreate[] {
  const creates: SnapCreate[] = []
  for (const tf of TFS) {
    const key = `ret${tf}` as RetKey
    const eligible = rows
      .filter((r) => r.close > MIN_PRICE && r.liq5 === 1 && r[key] !== null)
      .sort((a, b) => (b[key] as number) - (a[key] as number))
      .slice(0, TOPN)
    eligible.forEach((r, idx) => {
      creates.push({ date, timeframe: tf, rank: idx + 1, symbol: r.symbol, ret: r[key] as number })
    })
  }
  return creates
}

const SNAP_DATE_BATCH = 60

// สร้าง snapshot (Top-N ต่อ timeframe) ใหม่สำหรับหลายวัน — อ่าน/ลบ/เขียนเป็นชุด (ลบ+เขียนใน transaction เดียว
// ผู้อ่านจึงไม่เห็นวันที่โผว่างระหว่าง rebuild)
export async function rebuildSnapshotsForDates(dates: string[]): Promise<number> {
  const uniq = [...new Set(dates)].sort()
  let total = 0
  for (let i = 0; i < uniq.length; i += SNAP_DATE_BATCH) {
    const batch = uniq.slice(i, i + SNAP_DATE_BATCH)
    const rows = await db.rawDaily.findMany({
      where: { date: { in: batch } },
      select: { date: true, symbol: true, close: true, liq5: true, ret5: true, ret10: true, ret20: true, ret40: true, ret80: true, ret160: true, ret300: true },
      orderBy: [{ date: "asc" }, { symbol: "asc" }],
    })
    const byDate = new Map<string, SnapSource[]>()
    for (const r of rows) {
      let a = byDate.get(r.date)
      if (!a) byDate.set(r.date, (a = []))
      a.push(r)
    }
    const creates = batch.flatMap((d) => snapshotRowsFor(d, byDate.get(d) ?? []))
    const ops: Prisma.PrismaPromise<unknown>[] = [db.snapshot.deleteMany({ where: { date: { in: batch } } })]
    for (let j = 0; j < creates.length; j += CHUNK) ops.push(db.snapshot.createMany({ data: creates.slice(j, j + CHUNK) }))
    await db.$transaction(ops)
    total += creates.length
  }
  return total
}

// สร้าง snapshot (Top-N ต่อ timeframe) ใหม่สำหรับวันที่เดียว
export async function rebuildSnapshotsForDate(date: string): Promise<number> {
  return rebuildSnapshotsForDates([date])
}

// ---------------- demo seed (deterministic) ----------------

let _seedState = 20260920
function rnd(): number {
  _seedState |= 0
  _seedState = (_seedState + 0x6d2b79f5) | 0
  let t = Math.imul(_seedState ^ (_seedState >>> 15), 1 | _seedState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
function gauss(): number {
  let u = 0
  let v = 0
  while (u === 0) u = rnd()
  while (v === 0) v = rnd()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const REAL_TICKERS = [
  "cnt", "ukem", "madame", "kce", "eastw", "smt", "trt", "cph", "unix", "sricha",
  "adb", "pttep", "gulf", "aot", "bbl", "kbank", "cpall", "tu", "delta", "ivl",
  "top", "ptt", "scgp", "hana", "vih", "sprc", "glo", "bem", "ck", "tok",
  "asim", "xpg", "jj", "byd", "anan", "light", "rlf", "nsl", "egco", "gpsc",
  "bgrim", "com7", "synex", "mip", "jwd", "xl", "intuch", "awc", "wha", "wice",
  "pb", "kex", "rcl", "cho", "tvh", "sawad", "tisco", "mcs", "nkli", "ygg",
  "bch", "irc", "svr", "snn", "twn", "krds", "genco", "bts", "lalin", "works",
  "sjwd", "monmax", "oline", "zpwb", "sst", "fns",
]

// แผนที่หุ้นจริง (ชื่อตัวอย่างในชุด demo) → sector ตาม TH_SECTORS ของ config/thai
// หมายเหตุ: ข้อมูล demo เป็น synthetic — การจัด sector เป็นการประมาณจากธุรกิจจริงของแต่ละตัว
// (TU จัดตามเอกสาร tuning = กลุ่มพลังงาน/ยูทิลิตี้, NSL จัดตามสเปก = Construction)
const REAL_SECTOR_MAP: Record<string, string> = {
  // Electronic — กลุ่มอิเล็กทรอนิกส์/PCB/EMS
  kce: "Electronic", delta: "Electronic", hana: "Electronic", vih: "Electronic",
  smt: "Electronic", wice: "Electronic", sst: "Electronic", ukem: "Electronic",
  asim: "Electronic", xpg: "Electronic", tok: "Electronic", light: "Electronic",
  // ICT — เทคโนโลยี/โทรคมนาคม/ดิจิทัล
  com7: "ICT", synex: "ICT", mip: "ICT", intuch: "ICT", xl: "ICT", glo: "ICT",
  oline: "ICT", cnt: "ICT",
  // Banking
  bbl: "Banking", kbank: "Banking",
  // Finance — สินเชื่อ/ลีสซิ่ง/สถาบันการเงินนอกระบบ (mcs ตามสเปก tuning)
  sawad: "Finance", tisco: "Finance", nkli: "Finance", mcs: "Finance", adb: "Finance", fns: "Finance",
  // Energy — พลังงาน/ปิโตรเลียม/ยูทิลิตี้ไฟฟ้า-น้ำ
  ptt: "Energy", pttep: "Energy", top: "Energy", sprc: "Energy", gulf: "Energy",
  genco: "Energy", egco: "Energy", gpsc: "Energy", bgrim: "Energy", irc: "Energy",
  tu: "Energy", eastw: "Energy",
  // Material — ปิโตรเคมี/บรรจุภัณฑ์/เหล็ก/EV ผู้ผลิต (byd ตามสเปก tuning = Material)
  ivl: "Material", scgp: "Material", svr: "Material", byd: "Material",
  // Commerce — ค้าปลีก/บริการ
  cpall: "Commerce", unix: "Commerce", sricha: "Commerce",
  pb: "Commerce",
  // Transport — ขนส่ง/โลจิสติกส์/ท่าอากาศยาน/รถไฟฟ้า
  aot: "Transport", bts: "Transport", kex: "Transport",
  rcl: "Transport", cho: "Transport", tvh: "Transport", trt: "Transport",
  twn: "Transport",
  // Property — อสังหาริมทรัพย์
  anan: "Property", rlf: "Property", lalin: "Property", awc: "Property",
  wha: "Property", works: "Property", sjwd: "Property",
  // Construction — รับเหมา/โครงสร้าง (jwd ตามสเปก tuning อยู่กลุ่มรับเหมา)
  ck: "Construction", jj: "Construction", nsl: "Construction", zpwb: "Construction",
  jwd: "Construction",
  // Health — โรงพยาบาล/สุขภาพ
  cph: "Health", bch: "Health", krds: "Health",
  // Food
  snn: "Food",
  // Media — สื่อ/คอนเทนต์ (bem ตามสเปก tuning = กลุ่มสื่อ)
  madame: "Media", monmax: "Media", ygg: "Media", bem: "Media",
}

function buildSymbolPool(n: number): string[] {
  const pool: string[] = []
  const seen = new Set<string>()
  for (const t of REAL_TICKERS) {
    if (pool.length < n && !seen.has(t)) {
      seen.add(t)
      pool.push(t)
    }
  }
  const letters = "abcdefghikmnoprstuvwxyz"
  let guard = 0
  while (pool.length < n && guard < 5000) {
    guard++
    let s = ""
    for (let i = 0; i < 3; i++) s += letters[Math.floor(rnd() * letters.length)]
    if (!seen.has(s)) {
      seen.add(s)
      pool.push(s)
    }
  }
  return pool
}

export interface SeedStats {
  rawRows: number
  snapRows: number
  dates: number
  symbols: number
  sectorRows: number
  crossRows: number
  tradeRows: number
  tookMs: number
}

export async function seedDemoData(opts: { days?: number; symbols?: number } = {}): Promise<SeedStats> {
  const t0 = Date.now()
  // จำนวนเต็มเสมอ (days=300.5 ทำให้ index ท้ายชุดเป็นทศนิยม → สถานะเปิด/เทรดค้างไม่ถูกสร้าง/ปิด)
  const days = Math.round(Math.min(Math.max(opts.days ?? 520, 120), 900))
  const nSym = Math.round(Math.min(Math.max(opts.symbols ?? 240, 40), 400))
  _seedState = 20260920 // deterministic reset

  // วันทำการย้อนหลัง (ข้ามเสาร์-อาทิตย์) จบที่ "วันนี้ของตลาดไทย" — นับวันด้วย UTC ล้วน
  // (เดิมใช้เวลาท้องถิ่น − 24 ชม. → ใน TZ ที่เปลี่ยน DST วันธรรมดา วันทำการหายไป 1 วัน)
  const dates: string[] = []
  let dayT = Date.parse(`${bangkokDate(new Date())}T00:00:00Z`)
  while (dates.length < days) {
    const dow = new Date(dayT).getUTCDay()
    if (dow !== 0 && dow !== 6) dates.unshift(new Date(dayT).toISOString().slice(0, 10))
    dayT -= DAY_MS
  }

  const symbols = buildSymbolPool(nSym)

  // กำหนด sector ของทุกสัญลักษณ์ "ก่อน" ลูปจำลองราคา — ตัวจริงใช้ REAL_SECTOR_MAP,
  // ตัวสร้าง 3 ตัวอักษรสุ่มแบบ deterministic จาก TH_SECTORS (dynamic import เพราะ
  // ขอบเขตไฟล์ห้ามแก้ import block ด้านบน)
  const { TH_SECTORS } = await import("@/lib/config/thai")
  const sectorAssign = new Map<string, string>()
  for (const sym of symbols) {
    sectorAssign.set(sym, REAL_SECTOR_MAP[sym] ?? TH_SECTORS[Math.floor(rnd() * TH_SECTORS.length)])
  }

  interface MemRow {
    symbol: string
    close: number
    open: number | null
    high: number | null
    low: number | null
    val: number
    liq5: boolean
    rets: (number | null)[]
  }
  const byDate = new Map<string, MemRow[]>()
  const closesBySym = new Map<string, number[]>()
  const valsBySym = new Map<string, number[]>()

  // ปัจจัยร่วม (market + sector) — ทำให้โครงสร้าง cross-sectional เหมือนตลาดจริง:
  // หุ้น same-sector มี correlation, breadth/sector-rotation มี pattern, pairs มีคู่ให้หา
  const mktF: number[] = dates.map(() => gauss() * 0.008)
  const secF = new Map<string, number[]>()
  for (const sec of TH_SECTORS) secF.set(sec, dates.map(() => gauss() * 0.01))

  // pass 1: ราคา + มูลค่าซื้อขายต่อสัญลักษณ์ (ยังไม่แตะ byDate)
  for (const sym of symbols) {
    const sec = sectorAssign.get(sym) ?? TH_SECTORS[0]
    const liquid = rnd() < 0.62
    const baseVal = liquid ? 2.5e6 + rnd() * 45e6 : 0.15e6 + rnd() * 1.6e6
    const vol = 0.013 + rnd() * 0.034
    const hot = rnd() < 0.2
    let px = 1.5 + rnd() * 80
    let drift = 0
    let regimeLeft = 0
    const closes: number[] = []
    const vals: number[] = []
    for (let i = 0; i < days; i++) {
      if (regimeLeft <= 0) {
        regimeLeft = 15 + Math.floor(rnd() * 70)
        const p = rnd()
        if (hot && p < 0.45) drift = 0.0022 + rnd() * 0.0058
        else if (p < 0.14) drift = -(0.002 + rnd() * 0.004)
        else drift = (rnd() - 0.45) * 0.0012
      }
      regimeLeft--
      px = Math.max(0.4, px * Math.exp(drift + 0.7 * mktF[i] + 0.9 * (secF.get(sec)![i] ?? 0) + gauss() * vol * 0.75))
      closes.push(px)
      const vNoise = Math.exp(gauss() * 0.5)
      const boost = drift > 0.0022 ? 1 + rnd() * 1.6 : 1
      vals.push(baseVal * vNoise * boost)
    }
    closesBySym.set(sym, closes)
    valsBySym.set(sym, vals)
  }

  // pass 1.5: คู่ cointegrated แบบ deterministic (~16 คู่ เทียบเท่า KBANK/SCB ของตลาดจริง)
  // logB = β·logA + c + OU(hl 8-28 วัน) + noise — Pairs scanner ต้องเจอคู่เหล่านี้ได้
  {
    const bySector = new Map<string, string[]>()
    for (const sym of symbols) {
      const sec = sectorAssign.get(sym) ?? "Unknown"
      const a = bySector.get(sec) ?? []
      a.push(sym)
      bySector.set(sec, a)
    }
    const avgVal = (s: string): number => {
      const v = valsBySym.get(s) ?? []
      const r = v.slice(-60)
      return r.reduce((x, y) => x + y, 0) / (r.length || 1)
    }
    let made = 0
    for (const [, syms] of bySector) {
      if (made >= 16) break
      for (let k = 0; k + 1 < syms.length && made < 16; k += 2) {
        const a = syms[k]
        const b = syms[k + 1]
        if (avgVal(a) < 1.2e6 || avgVal(b) < 1.2e6) continue
        const beta = 0.85 + rnd() * 0.3
        const hlTarget = 8 + rnd() * 20
        const phi = Math.exp(-Math.LN2 / hlTarget)
        const sEta = 0.035 * Math.sqrt(1 - phi * phi)
        const la = (closesBySym.get(a) ?? []).map((v) => Math.log(Math.max(v, 0.4)))
        if (la.length < days) continue
        const b0 = 1.5 + rnd() * 80
        const c0 = Math.log(b0) - beta * la[0]
        let s = 0
        const nb: number[] = []
        for (let i = 0; i < days; i++) {
          s = phi * s + gauss() * sEta
          nb.push(Math.max(0.4, Math.exp(c0 + beta * la[i] + s + gauss() * 0.002)))
        }
        closesBySym.set(b, nb)
        made++
      }
    }
  }

  // pass 2: สร้างแถวรายวัน (rets/liq5) จากราคาสุดท้าย
  for (const sym of symbols) {
    const closes = closesBySym.get(sym) ?? []
    const vals = valsBySym.get(sym) ?? []
    // indicator คำนวณจากค่าที่ "เก็บจริง" (close ปัด 3 ตำแหน่ง, val ปัดเต็มบาท) ให้ตรงกับที่ ingest/recompute
    // คำนวณซ้ำจาก DB — เดิมคำนวณจากราคาไม่ปัด ทำให้ ingest หุ้น demo ตัวเดียวเขียน retN ทับครึ่งประวัติ (±0.01)
    const closesR = closes.map((c) => Math.round(c * 1000) / 1000)
    const valsR = vals.map((v) => Math.round(v))
    for (let i = 0; i < days; i++) {
      const rets: (number | null)[] = TFS.map((tf) => {
        const v = pctChange(closesR, i, tf)
        return v === null ? null : Math.round(v * 100) / 100
      })
      // OHLC จำลอง (deterministic): open มี gap ข้ามคืนจาก close เมื่อวาน, wick จาก |gauss()|
      // — ให้ชุด SET Sniper (sweep/FVG) มีข้อมูลจริงเชิงโครงสร้างในชุด demo
      const prevC = i > 0 ? closes[i - 1] : closes[i]
      const openV = Math.max(0.4, prevC * Math.exp(gauss() * 0.004))
      const highV = Math.max(openV, closes[i]) * (1 + Math.abs(gauss()) * 0.008)
      const lowV = Math.min(openV, closes[i]) * (1 - Math.abs(gauss()) * 0.008)
      const row: MemRow = {
        symbol: sym,
        close: closesR[i],
        open: Math.round(openV * 1000) / 1000,
        high: Math.round(highV * 1000) / 1000,
        low: Math.round(lowV * 1000) / 1000,
        val: valsR[i],
        liq5: liq5Flag(valsR, i),
        rets,
      }
      const arr = byDate.get(dates[i]) || []
      arr.push(row)
      byDate.set(dates[i], arr)
    }
  }

  // เคลียร์ของเดิมทั้งหมด (reseed = force)
  await db.symbolMeta.deleteMany()
  await db.snapshot.deleteMany()
  await db.rawDaily.deleteMany()
  await db.crossAsset.deleteMany()
  await db.decision.deleteMany()
  await db.pendingGate.deleteMany()
  await db.position.deleteMany()
  await db.backtestRun.deleteMany()
  await db.trade.deleteMany()
  // โมเดล meta / prereg / signals & stops policy ผูกกับชุดข้อมูลเดิม — reseed ต้องเคลียร์ด้วย
  await db.setting.deleteMany({ where: { key: { in: ["meta_model", "prereg_trial", "signals_policy", "stops_policy"] } } })
  invalidateDataCache()

  // insert raw_daily
  const rawCreates: {
    date: string
    symbol: string
    close: number
    open: number | null
    high: number | null
    low: number | null
    val: number
    liq5: number
    ret5: number | null
    ret10: number | null
    ret20: number | null
    ret40: number | null
    ret80: number | null
    ret160: number | null
    ret300: number | null
  }[] = []
  for (const [date, arr] of byDate) {
    for (const r of arr) {
      rawCreates.push({
        date,
        symbol: r.symbol,
        close: r.close,
        open: r.open,
        high: r.high,
        low: r.low,
        val: r.val,
        liq5: r.liq5 ? 1 : 0,
        ret5: r.rets[0],
        ret10: r.rets[1],
        ret20: r.rets[2],
        ret40: r.rets[3],
        ret80: r.rets[4],
        ret160: r.rets[5],
        ret300: r.rets[6],
      })
    }
  }
  for (let i = 0; i < rawCreates.length; i += CHUNK) {
    await db.rawDaily.createMany({ data: rawCreates.slice(i, i + CHUNK) })
  }

  // build snapshots in memory
  const snapCreates: { date: string; timeframe: number; rank: number; symbol: string; ret: number }[] = []
  for (const [date, arr] of byDate) {
    for (let ti = 0; ti < TFS.length; ti++) {
      const tf = TFS[ti]
      const eligible = arr
        .filter((r) => r.close > MIN_PRICE && r.liq5 && r.rets[ti] !== null)
        .sort((a, b) => (b.rets[ti] as number) - (a.rets[ti] as number))
        .slice(0, TOPN)
      eligible.forEach((r, idx) => {
        snapCreates.push({ date, timeframe: tf, rank: idx + 1, symbol: r.symbol, ret: r.rets[ti] as number })
      })
    }
  }
  for (let i = 0; i < snapCreates.length; i += CHUNK) {
    await db.snapshot.createMany({ data: snapCreates.slice(i, i + CHUNK) })
  }

  // SymbolMeta — แผนที่ symbol → sector สำหรับ Sector/Group risk layer
  const metaCreates = symbols.map((s) => ({ symbol: s, sector: sectorAssign.get(s) ?? "Unknown" }))
  for (let i = 0; i < metaCreates.length; i += CHUNK) {
    await db.symbolMeta.createMany({ data: metaCreates.slice(i, i + CHUNK) })
  }

  // CrossAsset — SPX / USDTHB / GOLD ที่สัมพันธ์กับตลาดจำลอง (สำหรับ crossZ ของ Signals v2)
  // SPX lead ตลาดไทย, บาทแข็งเมื่อตลาดขึ้น (เงินไหลเข้า), ทองขึ้นเมื่อ risk-off
  const mkt1: number[] = dates.map((_, i) => {
    let s = 0
    let n = 0
    for (const closes of closesBySym.values()) {
      if (i > 0 && isFinite(closes[i]) && isFinite(closes[i - 1]) && closes[i - 1] > 0) {
        s += closes[i] / closes[i - 1] - 1
        n++
      }
    }
    return n > 0 ? s / n : 0
  })
  const crossCreates: { date: string; asset: string; close: number }[] = []
  let spx = 1500
  let thb = 34.5 // USDTHB (ต่ำ = บาทแข็ง)
  let gold = 1150
  for (let i = 0; i < days; i++) {
    const m = mkt1[i]
    spx *= Math.exp(0.0002 + 0.45 * m + gauss() * 0.009)
    thb *= Math.exp(-0.28 * m + gauss() * 0.0035) // ตลาดขึ้น → บาทแข็ง (USDTHB ลง)
    gold *= Math.exp(0.00012 - 0.2 * m + gauss() * 0.008)
    crossCreates.push(
      { date: dates[i], asset: "SPX", close: Math.round(spx * 100) / 100 },
      { date: dates[i], asset: "USDTHB", close: Math.round(thb * 1000) / 1000 },
      { date: dates[i], asset: "GOLD", close: Math.round(gold * 100) / 100 }
    )
  }
  for (let i = 0; i < crossCreates.length; i += CHUNK) {
    await db.crossAsset.createMany({ data: crossCreates.slice(i, i + CHUNK) })
  }
  // ป้ายที่มา: CrossAsset ชุดนี้สังเคราะห์จากตลาดจำลอง — ล้าง demo (feed replaceDemo) ต้องล้างตามไปด้วย
  await db.setting.upsert({
    where: { key: CROSS_ASSET_SOURCE_KEY },
    create: { key: CROSS_ASSET_SOURCE_KEY, value: "synthetic" },
    update: { value: "synthetic" },
  })

  // ------------------------------------------------------------
  // pass 4: ประวัติเทรดจำลอง (paper trade log) — ฐานข้อมูลของ Bayesian
  // Stop-Loss Engine (Zambelli): จำลองกลยุทธ์โมเมนตัม k>=2 โผ (tf 10/20/40)
  // T+1 fill, ถือ ≤ 10 วัน, backstop −15% (กว้างให้แขนง stop อื่นมีที่วิ่ง)
  // เก็บ path รายวัน (p = close/entryPx) เพื่อให้ R-method สร้าง posterior ได้
  // ------------------------------------------------------------
  const COST_LEG = 0.007 // 70bps ต่อขา (commission 30 + slippage 40) — เทียบเท่า TH_STRATEGY
  const TRADE_HOLD = 10
  const TRADE_BACKSTOP = 0.15
  const TRADE_MAXPOS = 7

  // mkt20% ต่อวัน (equal weight) → label regime วันเข้า
  const mkt20pct: number[] = dates.map((_, i) => {
    if (i < 20) return 0
    let s = 0
    let n = 0
    for (const closes of closesBySym.values()) {
      const a = closes[i - 20]
      const b = closes[i]
      if (isFinite(a) && isFinite(b) && a > 0) {
        s += b / a - 1
        n++
      }
    }
    return n > 0 ? (s / n) * 100 : 0
  })
  const regimeAt = (i: number): string =>
    mkt20pct[i] > 1.2 ? "risk_on" : mkt20pct[i] < -1.2 ? "risk_off" : "neutral"

  const topOf = (i: number, ti: number): Set<string> => {
    const arr = (byDate.get(dates[i]) ?? [])
      .filter((r) => r.liq5 && r.close > MIN_PRICE && r.rets[ti] !== null)
      .sort((a, b) => (b.rets[ti] as number) - (a.rets[ti] as number))
      .slice(0, TOPN)
    return new Set(arr.map((r) => r.symbol))
  }

  interface SimOpen {
    sym: string
    ei: number
    entryPx: number
    regime: string
    src: string
    path: { d: string; p: number }[]
  }
  interface SimTrade {
    symbol: string
    entry: string
    exit: string
    entryPx: number
    exitPx: number
    ret: number
    mae: number
    regime: string
    src: string
    holdDays: number
    pathJson: string
    stopPolicy: string
  }
  const closeSim = (t: SimOpen, i: number, closes: number[]): SimTrade => {
    const px = closes[i]
    const p = px / t.entryPx
    t.path.push({ d: dates[i], p: Math.round(p * 10000) / 10000 })
    let mae = 0
    for (const pt of t.path) mae = Math.max(mae, Math.max(0, 1 - pt.p))
    return {
      symbol: t.sym,
      entry: dates[t.ei],
      exit: dates[i],
      entryPx: Math.round(t.entryPx * 1000) / 1000,
      exitPx: Math.round(px * 1000) / 1000,
      ret: Math.round((p - 1 - 2 * COST_LEG) * 100 * 100) / 100,
      mae: Math.round(mae * 10000) / 10000,
      regime: t.regime,
      src: t.src,
      holdDays: i - t.ei,
      pathJson: JSON.stringify(t.path),
      stopPolicy: "fixed15",
    }
  }

  const simTrades: SimTrade[] = []
  const simOpen = new Map<string, SimOpen>()
  let pendingSig: Set<string> = new Set()
  for (let i = 25; i < days - 1; i++) {
    // (1) exits วันนี้ (stop backstop / time)
    for (const [sym, t] of [...simOpen]) {
      const closes = closesBySym.get(sym)
      if (!closes || !isFinite(closes[i]) || closes[i] <= 0) continue
      const p = closes[i] / t.entryPx
      if (1 - p >= TRADE_BACKSTOP || i - t.ei >= TRADE_HOLD) {
        simOpen.delete(sym)
        simTrades.push(closeSim(t, i, closes))
      } else {
        // path รายวันจริงระหว่างถือ — MAE / R-method / walk-forward ของ Bayes Stop ต้องเห็น drawdown ระหว่างทาง
        // (เดิมเก็บแค่วันเข้า + วันออก: MAE ของไม้ชนะเป็น 0 เสมอ → demo adopt stop 1% ที่ไม่สมจริง)
        t.path.push({ d: dates[i], p: Math.round(p * 10000) / 10000 })
      }
    }
    // (2) entries T+1 (สัญญาณจากวันก่อน) — ไม่เพิ่มสถานะใน risk_off
    if (regimeAt(i) !== "risk_off") {
      for (const sym of pendingSig) {
        if (simOpen.size >= TRADE_MAXPOS) break
        if (simOpen.has(sym)) continue
        const closes = closesBySym.get(sym)
        if (!closes || !isFinite(closes[i]) || closes[i] <= 0) continue
        simOpen.set(sym, {
          sym,
          ei: i,
          entryPx: closes[i],
          regime: regimeAt(i),
          src: rnd() < 0.25 ? "human-approved" : "auto",
          path: [{ d: dates[i], p: 1 }],
        })
      }
    }
    // (3) สัญญาณวันนี้ = ติด ≥2 จาก 3 โผ (tf 10/20/40)
    const cnt = new Map<string, number>()
    for (const ti of [1, 2, 3]) {
      for (const sym of topOf(i, ti)) cnt.set(sym, (cnt.get(sym) ?? 0) + 1)
    }
    pendingSig = new Set([...cnt.entries()].filter(([, c]) => c >= 2).map(([s]) => s))
  }
  // ปิดสถานะค้างท้ายชุดข้อมูล (ไม่ทิ้ง path ค้าง)
  for (const [sym, t] of [...simOpen]) {
    const closes = closesBySym.get(sym)
    if (closes && isFinite(closes[days - 1]) && closes[days - 1] > 0) {
      simTrades.push(closeSim(t, days - 1, closes))
    }
  }
  const tradeCreates = simTrades.map((t) => ({ ...t }))
  for (let i = 0; i < tradeCreates.length; i += CHUNK) {
    await db.trade.createMany({ data: tradeCreates.slice(i, i + CHUNK) })
  }

  // สถานะเปิดตัวอย่าง (paper) — 5 ตัวจากโผ tf=20 วันล่าสุด เข้าเมื่อ ~4 วันทำการก่อน
  const positionCreates: { symbol: string; entryDate: string; entryPx: number; slots: number; stop: number }[] = []
  {
    const lastTop = [...topOf(days - 1, 2)].slice(0, 8)
    const ei = Math.max(0, days - 4)
    let made = 0
    for (const sym of lastTop) {
      if (made >= 5) break
      const closes = closesBySym.get(sym)
      const px = closes ? closes[ei] : NaN
      if (!isFinite(px) || px <= 0) continue
      positionCreates.push({
        symbol: sym,
        entryDate: dates[ei],
        entryPx: Math.round(px * 1000) / 1000,
        slots: [0.5, 0.75, 1][made % 3],
        stop: Math.round(px * 0.9 * 1000) / 1000,
      })
      made++
    }
  }
  if (positionCreates.length > 0) await db.position.createMany({ data: positionCreates })

  await markDataChanged()
  return {
    rawRows: rawCreates.length,
    snapRows: snapCreates.length,
    dates: dates.length,
    symbols: symbols.length,
    sectorRows: metaCreates.length,
    crossRows: crossCreates.length,
    tradeRows: tradeCreates.length,
    tookMs: Date.now() - t0,
  }
}

// ---------------- close pivot (cached) ----------------

export interface Pivot {
  dates: string[]
  symbols: string[]
  px: number[][] // dates × symbols
  dateIdx: Map<string, number>
  symIdx: Map<string, number>
}

let _pivotCache: { key: string; pivot: Pivot } | null = null

export function invalidateDataCache() {
  _pivotCache = null
}

const DATA_VERSION_KEY = "data_version"

/**
 * ตราเวอร์ชันข้อมูลตลาดลง DB (Setting.data_version) — ผู้เขียน RawDaily ทุกทาง (ingest / seed / ล้าง demo)
 * เรียกหลังเขียนเสร็จ ทำให้ cache ของ process อื่น (เช่น server ขณะ cron `bun run fetch:th` เขียน DB)
 * รู้ว่าข้อมูลเปลี่ยน แม้จำนวนแถว/วันล่าสุดเท่าเดิม (แก้ราคาย้อนหลัง, adjclose ถูกปรับหลังปันผล)
 */
export async function markDataChanged(): Promise<void> {
  invalidateDataCache()
  const value = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await db.setting.upsert({ where: { key: DATA_VERSION_KEY }, create: { key: DATA_VERSION_KEY, value }, update: { value } })
  } catch (e) {
    console.error("[core] data_version bump failed:", (e as Error).message)
  }
}

/** ลายนิ้วมือข้อมูลตลาดสำหรับ key ของ cache: จำนวนแถว · วันล่าสุด · id ล่าสุด · เวอร์ชันที่ผู้เขียนตราไว้ */
export async function dataFingerprint(): Promise<string> {
  const [agg, ver] = await Promise.all([
    db.rawDaily.aggregate({ _count: { _all: true }, _max: { date: true, id: true } }),
    db.setting.findUnique({ where: { key: DATA_VERSION_KEY } }).catch(() => null),
  ])
  return `${agg._count._all}:${agg._max.date ?? ""}:${agg._max.id ?? 0}:${ver?.value ?? ""}`
}

export async function closePivot(): Promise<Pivot> {
  const key = await dataFingerprint()
  if (_pivotCache && _pivotCache.key === key) return _pivotCache.pivot

  const rows = await db.rawDaily.findMany({
    orderBy: [{ date: "asc" }, { symbol: "asc" }],
    select: { date: true, symbol: true, close: true },
  })
  const dates: string[] = []
  const symbols: string[] = []
  const dateIdx = new Map<string, number>()
  const symIdx = new Map<string, number>()
  for (const r of rows) {
    if (!dateIdx.has(r.date)) {
      dateIdx.set(r.date, dates.length)
      dates.push(r.date)
    }
    if (!symIdx.has(r.symbol)) {
      symIdx.set(r.symbol, symbols.length)
      symbols.push(r.symbol)
    }
  }
  const px: number[][] = Array.from({ length: dates.length }, () =>
    new Array<number>(symbols.length).fill(NaN)
  )
  for (const r of rows) px[dateIdx.get(r.date) as number][symIdx.get(r.symbol) as number] = r.close

  const pivot: Pivot = { dates, symbols, px, dateIdx, symIdx }
  _pivotCache = { key, pivot }
  return pivot
}

// สมาชิก snapshot ต่อวัน (set ของ symbol ต่อ date)
export async function snapshotMembers(): Promise<{
  dates: string[]
  byDate: Map<string, Set<string>>
  tfByDate: Map<string, Map<number, Set<string>>>
}> {
  const snaps = await db.snapshot.findMany({ select: { date: true, timeframe: true, symbol: true } })
  const dset = [...new Set(snaps.map((s) => s.date))].sort()
  const byDate = new Map<string, Set<string>>()
  const tfByDate = new Map<string, Map<number, Set<string>>>()
  for (const s of snaps) {
    if (!byDate.has(s.date)) byDate.set(s.date, new Set())
    byDate.get(s.date)!.add(s.symbol)
    if (!tfByDate.has(s.date)) tfByDate.set(s.date, new Map())
    const m = tfByDate.get(s.date)!
    if (!m.has(s.timeframe)) m.set(s.timeframe, new Set())
    m.get(s.timeframe)!.add(s.symbol)
  }
  return { dates: dset, byDate, tfByDate }
}

// ---------------- regime ----------------

export async function computeRegimeState(date?: string) {
  const { dates, byDate } = await snapshotMembers()
  if (dates.length === 0) return null
  const d = date ?? dates[dates.length - 1]
  const idx = dates.indexOf(d)
  if (idx < 0) return null

  // นับ rows รวมทุก tf ต่อวันจาก snapshot
  const snapCounts = await db.snapshot.groupBy({
    by: ["date"],
    _count: { _all: true },
  })
  const rowsByDate = new Map<string, number>()
  for (const c of snapCounts) rowsByDate.set(c.date, c._count._all)

  const series: number[] = []
  for (const dd of dates) {
    const rowsN = rowsByDate.get(dd) ?? 0
    const uniq = (byDate.get(dd)?.size ?? 0)
    series.push(rowsN > 0 ? 1 - uniq / rowsN : 0)
  }
  const z = zScore(series, idx)
  const pivot = await closePivot()
  const pi = pivot.dateIdx.get(d)
  let mkt20 = 0
  if (pi !== undefined && pi >= 20) {
    let sum = 0
    let n = 0
    for (let s = 0; s < pivot.symbols.length; s++) {
      const now = pivot.px[pi][s]
      const ref = pivot.px[pi - 20][s]
      if (isFinite(now) && isFinite(ref) && ref > 0) {
        sum += now / ref - 1
        n++
      }
    }
    mkt20 = n > 0 ? sum / n : 0
  }
  const pOn = logistic(1.2 * z + 8 * mkt20)
  const action = pOn > 0.6 ? "risk_on" : pOn < 0.4 ? "risk_off" : "neutral"
  return {
    date: d,
    action: action as "risk_on" | "neutral" | "risk_off",
    conf: Math.round(Math.max(pOn, 1 - pOn) * 100) / 100,
    repeatZ: Math.round(z * 100) / 100,
    mktMom20: Math.round(mkt20 * 1000) / 1000,
  }
}

// z-score เทียบ rolling window (สูงสุด 250 วัน, ขั้นต่ำ 20)
export function zScore(series: number[], idx: number): number {
  const start = Math.max(0, idx - 250)
  const win = series.slice(start, idx + 1)
  if (win.length < 20) return 0
  const mean = win.reduce((a, b) => a + b, 0) / win.length
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - mean) ** 2, 0) / win.length) + 1e-9
  return (series[idx] - mean) / sd
}

// ---------------- data quality ----------------

/**
 * SET ปิดทำการติดกันยาวสุดตามปฏิทินปกติ ≈ 4 วันทำการ (สงกรานต์ + วันหยุดพิเศษ เช่น 12–15 เม.ย. 2564)
 * ช่วงหยุด 3 วันทำการ (สงกรานต์/ปีใหม่) เกิดแทบทุกปี — ช่องว่างที่ยาวกว่านี้ = ข้อมูลหายจริง
 */
export const SET_MAX_HOLIDAY_RUN = 4

/** จำนวนวันทำการ (จ.–ศ.) ที่หายไประหว่างวันที่สองวันที่ติดกันในชุดข้อมูล — คิดด้วย UTC จึงไม่ขึ้นกับ TZ ของ server */
export function missingWeekdays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`)
  const tb = Date.parse(`${b}T00:00:00Z`)
  if (!isFinite(ta) || !isFinite(tb)) return 0
  let n = 0
  for (let t = ta + DAY_MS; t < tb; t += DAY_MS) {
    const dow = new Date(t).getUTCDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

export interface DateBreak {
  from: string
  to: string
  missing: number // จำนวนวันทำการที่ไม่มีข้อมูล
}

/** gaps = ขาดเกิน SET_MAX_HOLIDAY_RUN วันทำการ (ข้อมูลหาย) · longBreaks = ปิดยาว 3–4 วันทำการ (วันหยุดยาวปกติของ SET) */
export function dateGapReport(dates: string[]): { gaps: DateBreak[]; longBreaks: DateBreak[] } {
  const gaps: DateBreak[] = []
  const longBreaks: DateBreak[] = []
  for (let i = 1; i < dates.length; i++) {
    const missing = missingWeekdays(dates[i - 1], dates[i])
    const br = { from: dates[i - 1], to: dates[i], missing }
    if (missing > SET_MAX_HOLIDAY_RUN) gaps.push(br)
    else if (missing >= 3) longBreaks.push(br)
  }
  return { gaps, longBreaks }
}

/**
 * นับจุดที่ราคาปิดเปลี่ยนเกิน limit เทียบราคาปิด "ล่าสุดที่มี" ของหุ้นตัวเดียวกัน — ข้ามช่องว่าง (พักการซื้อขาย/
 * วันที่ไม่มีแถว) ไปเทียบกับราคาก่อนหน้า ตามกติกา ceiling/floor ของ SET ที่อิงราคาปิดล่าสุด
 * (corporate action มักเกิดคู่กับการพักซื้อขาย — เทียบเฉพาะวันติดกันจะพลาดจุดเหล่านี้)
 */
export function countPriceJumps(px: number[][], nSymbols: number, limit = 0.35): number {
  let jumps = 0
  for (let s = 0; s < nSymbols; s++) {
    let last = NaN
    for (let i = 0; i < px.length; i++) {
      const b = px[i][s]
      if (!isFinite(b)) continue
      if (last > 0 && Math.abs(b / last - 1) > limit) jumps++
      if (b > 0) last = b
    }
  }
  return jumps
}

const fmtBreaks = (xs: DateBreak[]) => xs.slice(0, 3).map((g) => `${g.from}→${g.to} ขาด ${g.missing} วันทำการ`).join(", ")

export async function runDataQualityChecks() {
  const checks: { name: string; ok: boolean; detail: string }[] = []

  const pivot = await closePivot()
  // DB ว่าง (ติดตั้งใหม่) — ยังไม่มีอะไรให้ตรวจ: คืนรายการว่าง ไม่ใช่ "ผ่านทั้งหมด" ที่ไม่มีข้อมูลรองรับ
  if (pivot.dates.length === 0) return { flags: [] as string[], checks }

  const dup = await db.$queryRaw<{ n: number | bigint }[]>`
    SELECT COUNT(*) as n FROM (
      SELECT date, symbol, COUNT(*) as c FROM "RawDaily" GROUP BY date, symbol HAVING c > 1
    )`
  const dupN = Number(dup[0]?.n ?? 0)
  checks.push({
    name: "ความซ้ำของแถว",
    ok: dupN === 0,
    detail: dupN === 0 ? "ไม่มี (date,symbol) ซ้ำ" : `พบ ${dupN} กลุ่มซ้ำ`,
  })

  // ช่องว่างวันที่ — วัดเป็น "วันทำการที่หายไป" (จ.–ศ.) ไม่ใช่วันปฏิทิน: วันหยุดยาวปกติของ SET ไม่ถูกนับเป็นปัญหา
  const { gaps, longBreaks } = dateGapReport(pivot.dates)
  checks.push({
    name: "ช่องว่างวันที่",
    ok: gaps.length === 0,
    detail:
      gaps.length > 0
        ? `พบ ${gaps.length} ช่องว่างเกิน ${SET_MAX_HOLIDAY_RUN} วันทำการ (${fmtBreaks(gaps)})`
        : longBreaks.length > 0
          ? `ต่อเนื่องดี — มีช่วงปิดยาว 3–${SET_MAX_HOLIDAY_RUN} วันทำการ ${longBreaks.length} ครั้ง (วันหยุดยาวปกติของ SET เช่น สงกรานต์/ปีใหม่: ${fmtBreaks(longBreaks)})`
          : `ต่อเนื่องดี (ไม่มีช่วงขาดเกิน ${SET_MAX_HOLIDAY_RUN} วันทำการ)`,
  })

  // ราคากระโดด > 35% (นอกเหนือ limit ของ SET) — เทียบกับราคาปิดล่าสุดที่มี (ข้ามวันพักการซื้อขาย)
  const jumps = countPriceJumps(pivot.px, pivot.symbols.length, 0.35)
  checks.push({
    name: "ราคากระโดดผิดปกติ",
    ok: jumps === 0,
    detail: jumps === 0 ? "ไม่พบการกระโดด > 35%" : `พบ ${jumps} จุด (ตรวจ corporate action)`,
  })

  // filter รั่ว: snapshot มีหุ้นที่ close <= MIN_PRICE หรือ liq5 != 1
  const leak = await db.$queryRaw<{ n: number | bigint }[]>`
    SELECT COUNT(*) as n FROM "Snapshot" s
    JOIN "RawDaily" r ON r.date = s.date AND r.symbol = s.symbol
    WHERE r.close <= ${MIN_PRICE} OR r.liq5 != 1`
  const leakN = Number(leak[0]?.n ?? 0)
  checks.push({
    name: "ตัวกรองหลุด",
    ok: leakN === 0,
    detail: leakN === 0 ? "snapshot เป็นไปตามเงื่อนไขทั้งหมด" : `รั่ว ${leakN} แถว`,
  })

  const flags = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`)
  return { flags, checks }
}
