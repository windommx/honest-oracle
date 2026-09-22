// ============================================================
// Core data engine — แหล่งความจริงเดียวของระบบโมเมนตัม
// - parseSnapshotCsv : รองรับ CSV จาก AFL (snapshot รายวัน และ history backfill)
// - ingestRows       : upsert ข้อมูลดิบ + recompute indicator + rebuild snapshot
// - seedDemoData     : สร้างข้อมูลตัวอย่างจำลองตลาดไทย (deterministic)
// - closePivot       : matrix ราคา (มี cache)
// - computeRegimeState : regime จาก overlap ratio + market momentum
// - runDataQualityChecks : ตรวจสุขภาพข้อมูล
// ============================================================

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

// ---------------- helpers ----------------

export function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, "0")
  const day = `${d.getDate()}`.padStart(2, "0")
  return `${y}-${m}-${day}`
}

export function normalizeDate(s: string): string | null {
  const t = s.trim()
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(t)
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(t)
  if (!isNaN(d.getTime())) return fmtDate(d)
  return null
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

// รองรับ 2 ฟอร์แมต:
// 1) date,symbol,close,val,liq5,ret5,ret10,ret20,ret40,ret80,ret160,ret300  (daily export)
// 2) date,symbol,close,volume  (history backfill)
export function parseSnapshotCsv(csv: string): ParsedCsv {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 2) throw new Error("ไฟล์ CSV ว่างเปล่าหรือมีแค่ header")
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const idx = (name: string) => header.indexOf(name)
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

  const rows: ParsedCsvRow[] = []
  for (let li = 1; li < lines.length; li++) {
    const parts = lines[li].split(",")
    if (parts.length < header.length - 1) continue
    const date = normalizeDate(parts[iDate])
    const symbol = parts[iSym].trim().toUpperCase()
    const close = parseFloat(parts[iClose])
    if (!date || !symbol || !isFinite(close)) continue
    let val = 0
    if (hasVal) val = parseFloat(parts[iVal]) || 0
    else if (hasVol) val = close * (parseFloat(parts[iVol]) || 0)
    // open/high/low เสริม (SET Sniper) — ไม่มีก็ผ่านได้ (null)
    let open: number | null = null
    let high: number | null = null
    let low: number | null = null
    if (hasOhlc) {
      open = parseFloat(parts[iOpen])
      high = parseFloat(parts[iHigh])
      low = parseFloat(parts[iLow])
      open = isFinite(open) && open > 0 ? open : null
      high = isFinite(high) && high > 0 ? high : null
      low = isFinite(low) && low > 0 ? low : null
    }
    rows.push({ date, symbol, close, open, high, low, val })
  }
  if (rows.length === 0) throw new Error("ไม่พบแถวข้อมูลที่ถูกต้องใน CSV")
  return { kind, rows }
}

// ---------------- ingest ----------------

export interface IngestSummary {
  insertedRaw: number
  updatedRows: number
  snapDates: string[]
}

export async function ingestRows(rows: ParsedCsvRow[]): Promise<IngestSummary> {
  // 1) upsert raw rows (เก็บ close/val + OHLC ถ้ามี — indicator คำนวณใหม่เสมอ)
  let inserted = 0
  const dates = new Set<string>()
  const symbols = new Set<string>()
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    await db.$transaction(
      chunk.map((r) => {
        dates.add(r.date)
        symbols.add(r.symbol)
        // OHLC: มีค่าใหม่ = ทับ, ไม่มี = คงของเดิม (CSV แบบ close-only ต้องไม่ลบของที่เคย ingest มา)
        const ohlcUpdate: Record<string, number> = {}
        if (r.open != null) ohlcUpdate.open = r.open
        if (r.high != null) ohlcUpdate.high = r.high
        if (r.low != null) ohlcUpdate.low = r.low
        return db.rawDaily.upsert({
          where: { date_symbol: { date: r.date, symbol: r.symbol } },
          create: { date: r.date, symbol: r.symbol, close: r.close, open: r.open ?? null, high: r.high ?? null, low: r.low ?? null, val: r.val },
          update: { close: r.close, val: r.val, ...ohlcUpdate },
        })
      })
    )
  }
  inserted = rows.length

  // 2) recompute indicators เฉพาะหุ้นที่กระทบ (diff-based)
  let updated = 0
  for (const sym of symbols) updated += await recomputeSymbol(sym)

  // 3) rebuild snapshot เฉพาะวันที่กระทบ
  const snapDates: string[] = []
  for (const d of [...dates].sort()) {
    await rebuildSnapshotsForDate(d)
    snapDates.push(d)
  }
  invalidateDataCache()
  return { insertedRaw: inserted, updatedRows: updated, snapDates }
}

// คำนวณ retN + liq5 ใหม่ทั้งประวัติของหุ้น 1 ตัว แล้ว update เฉพาะแถวที่ค่าเปลี่ยน
export async function recomputeSymbol(symbol: string): Promise<number> {
  const rows = await db.rawDaily.findMany({ where: { symbol }, orderBy: { date: "asc" } })
  if (rows.length === 0) return 0
  const closes = rows.map((r) => r.close)
  const vals = rows.map((r) => r.val)
  const updates: { id: number; data: Record<string, number | null> }[] = []
  for (let i = 0; i < rows.length; i++) {
    const data: Record<string, number | null> = {}
    let changed = false
    for (const tf of TFS) {
      const nv = pctChange(closes, i, tf)
      const nvR = nv === null ? null : Math.round(nv * 100) / 100
      const cur = (rows[i] as unknown as Record<string, number | null>)[`ret${tf}`] ?? null
      if (nvR !== cur) {
        data[`ret${tf}`] = nvR
        changed = true
      }
    }
    const liq = liq5Flag(vals, i) ? 1 : 0
    if (liq !== rows[i].liq5) {
      data.liq5 = liq
      changed = true
    }
    if (changed) updates.push({ id: rows[i].id, data })
  }
  if (updates.length === 0) return 0
  await db.$transaction(
    updates.map((u) => db.rawDaily.update({ where: { id: u.id }, data: u.data }))
  )
  return updates.length
}

// สร้าง snapshot (top-30 ต่อ timeframe) ใหม่สำหรับวันที่เดียว
export async function rebuildSnapshotsForDate(date: string): Promise<number> {
  const rows = await db.rawDaily.findMany({ where: { date } })
  await db.snapshot.deleteMany({ where: { date } })
  const creates: { date: string; timeframe: number; rank: number; symbol: string; ret: number }[] = []
  for (const tf of TFS) {
    const key = `ret${tf}` as const
    const eligible = rows
      .filter((r) => r.close > MIN_PRICE && r.liq5 === 1 && (r[key] as number | null) !== null)
      .sort((a, b) => (b[key] as number) - (a[key] as number))
      .slice(0, TOPN)
    eligible.forEach((r, idx) => {
      creates.push({ date, timeframe: tf, rank: idx + 1, symbol: r.symbol, ret: r[key] as number })
    })
  }
  for (let i = 0; i < creates.length; i += CHUNK) {
    await db.snapshot.createMany({ data: creates.slice(i, i + CHUNK) })
  }
  return creates.length
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
  const days = Math.min(Math.max(opts.days ?? 520, 120), 900)
  const nSym = Math.min(Math.max(opts.symbols ?? 240, 40), 400)
  _seedState = 20260920 // deterministic reset

  // วันทำการย้อนหลัง (ข้ามเสาร์-อาทิตย์) จบที่วันนี้
  const dates: string[] = []
  let d = new Date()
  while (dates.length < days) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) dates.unshift(fmtDate(d))
    d = new Date(d.getTime() - 86400000)
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
    for (let i = 0; i < days; i++) {
      const rets: (number | null)[] = TFS.map((tf) => {
        const v = pctChange(closes, i, tf)
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
        close: Math.round(closes[i] * 1000) / 1000,
        open: Math.round(openV * 1000) / 1000,
        high: Math.round(highV * 1000) / 1000,
        low: Math.round(lowV * 1000) / 1000,
        val: Math.round(vals[i]),
        liq5: liq5Flag(vals, i),
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

  invalidateDataCache()
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

export async function closePivot(): Promise<Pivot> {
  const [count, last] = await Promise.all([
    db.rawDaily.count(),
    db.rawDaily.aggregate({ _max: { date: true } }),
  ])
  const key = `${count}:${last._max.date ?? ""}`
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

export async function runDataQualityChecks() {
  const checks: { name: string; ok: boolean; detail: string }[] = []

  const dup = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*) as n FROM (
      SELECT date, symbol, COUNT(*) as c FROM "RawDaily" GROUP BY date, symbol HAVING c > 1
    )`
  checks.push({
    name: "ความซ้ำของแถว",
    ok: Number(dup[0].n) === 0,
    detail: Number(dup[0].n) === 0 ? "ไม่มี (date,symbol) ซ้ำ" : `พบ ${dup[0].n} กลุ่มซ้ำ`,
  })

  const pivot = await closePivot()
  let gapDays = 0
  for (let i = 1; i < pivot.dates.length; i++) {
    const a = new Date(pivot.dates[i - 1]).getTime()
    const b = new Date(pivot.dates[i]).getTime()
    if ((b - a) / 86400000 > 5) gapDays++
  }
  checks.push({
    name: "ช่องว่างวันที่",
    ok: gapDays === 0,
    detail: gapDays === 0 ? "ต่อเนื่องดี (ไม่มีช่องว่าง > 5 วัน)" : `พบ ${gapDays} ช่องว่าง`,
  })

  // ราคากระโดด > 35% (นอกเหนือ limit ของ SET)
  let jumps = 0
  for (let s = 0; s < pivot.symbols.length; s++) {
    for (let i = 1; i < pivot.dates.length; i++) {
      const a = pivot.px[i - 1][s]
      const b = pivot.px[i][s]
      if (isFinite(a) && isFinite(b) && a > 0 && Math.abs(b / a - 1) > 0.35) jumps++
    }
  }
  checks.push({
    name: "ราคากระโดดผิดปกติ",
    ok: jumps === 0,
    detail: jumps === 0 ? "ไม่พบการกระโดด > 35%" : `พบ ${jumps} จุด (ตรวจ corporate action)`,
  })

  // filter รั่ว: snapshot มีหุ้นที่ close <= MIN_PRICE หรือ liq5 != 1
  const leak = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*) as n FROM "Snapshot" s
    JOIN "RawDaily" r ON r.date = s.date AND r.symbol = s.symbol
    WHERE r.close <= ${MIN_PRICE} OR r.liq5 != 1`
  checks.push({
    name: "ตัวกรองหลุด",
    ok: Number(leak[0].n) === 0,
    detail: Number(leak[0].n) === 0 ? "snapshot เป็นไปตามเงื่อนไขทั้งหมด" : `รั่ว ${leak[0].n} แถว`,
  })

  const flags = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`)
  return { flags, checks }
}
