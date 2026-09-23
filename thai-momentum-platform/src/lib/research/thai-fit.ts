// ============================================================
// Thai Fit — เครื่องทดสอบสมมติฐาน H1–H4 สำหรับกลยุทธ์โมเมนตัมหุ้นไทย
// (port จาก thai_fit.py — ทำงานบน RawDaily ทั้งหมดในหน่วยความจำ)
//
//   H1 — โมเมนตัมระยะสั้น (form<=20, hold<=10) มี ICIR > 0.25 หรือไม่
//   H2 — Snap-back reversal: ยิ่งลึก (z5<=-2.5) + turnover สูง + flow ออก
//        → กลับตัว 5 วันชนะตลาดหรือไม่
//   H3 — Turn-of-month: 3 วันแรก/3 วันท้ายของเดือน ตลาดวิ่งแรงกว่าปกติหรือไม่
//   H4 — โมเมนตัมระยะยาว (form>=160) ตายไปแล้วตามงานวิจัยหรือยัง
//
// ทุกตัวเลขใน pure function พร้อมคอมเมนต์อ้างกลับสเปก python ทุกข้อ
// ============================================================

import { createHash } from "crypto"
import { db } from "@/lib/db"

// ---------- constants (freeze ลง paramsHash ทุกรัน) ----------

/** forms ของสัญญาณโมเมนตัม (วันทำการ) — ตามสเปก scan() */
export const FORMS_TH = [5, 10, 20, 40, 80, 160, 300] as const
/** holds สำหรับ form <= 80 */
export const HOLDS_SHORT = [3, 5, 10, 20] as const
/** holds สำหรับ form > 80 */
export const HOLDS_LONG = [10] as const
/** ต้นทุน round-trip ของ H2 (snap-back) = 1.1% */
export const COST_RT = 0.011
/** จำนวนหุ้นขั้นต่ำต่อวันที่ IC จะถูกนับ (สเปก icPerDate) */
export const MIN_CS_N = 30
/** เกณฑ์ z5 ต่ำสุดของ H2 */
export const Z_IN = -2.5
/** turnover percentile ขั้นต่ำของ H2 */
export const TURN_MIN = 0.6
/** money-flow ต้องติดลบมากกว่านี้ (ออกจากหุ้น) ของ H2 */
export const FLOW_MAX = -0.2
/** Welch t ขั้นต่ำของ H3 */
export const TOM_T = 2

// ---------- types ----------

/** เมทริกซ์ [dateIdx][symbolIdx] — undefined = ไม่มีข้อมูล */
export type Mat = (number | undefined)[][]

/** โครงสร้าง pivot ของ RawDaily ทั้งหมด (close/val/liq เป็นเมทริกซ์ตามวัน×หุ้น) */
export interface ThaiPivots {
  dates: string[] // เรียง asc (YYYY-MM-DD เรียง lexicographic = เรียงเวลา)
  symbols: string[] // เรียง asc
  nSym: number
  close: Mat
  val: Mat
  liq: boolean[][] // liq5 === 1
}

export interface IcSummary {
  meanIC: number // 4dp
  ICIR: number // 3dp = mean/std (std แบบ sample, ddof=1)
  t: number // 2dp = ICIR*sqrt(n)
  n: number // จำนวนวันที่ถูกนับ
}

export interface ScanCell extends IcSummary {
  form: number
  hold: number
}

export interface H2Result {
  pass: boolean
  n: number
  winRate: number // ส่วนแบ่ง net > 0
  avgNet: number // เฉลี่ยผลตอบแทนสุทธิหลังต้นทุน (fraction)
  edgeVsCtrl: number // mean(net) - mean(control คือ fwd5 ของตลาดวันเดียวกัน)
  stopPct: number // ส่วนแบ่งออกด้วย reason 'stop'
}

export interface H3Result {
  pass: boolean
  insideMean: number // ผลตอบแทนตลาดต่อวัน % ในหน้าต่าง turn-of-month
  outsideMean: number // % นอกหน้าต่าง
  t: number // Welch t-stat
  nIn: number
}

export interface LongCell {
  form: number
  hold: number
  meanIC: number
  ICIR: number
}

export type ThaiFitMode = "all" | "scan" | "reversal" | "tom"

export interface ThaiFitReport {
  ranAt: string // ISO
  mode: ThaiFitMode
  h1: { pass: boolean; best: ScanCell[] } | null // null เมื่อ mode ไม่รวม scan
  h2: H2Result | null
  h3: H3Result | null
  h4: { pass: boolean; longCells: LongCell[] } | null
  scan: ScanCell[]
  actions: Record<string, string> // action ภาษาไทยต่อ verdict (เฉพาะส่วนที่รัน)
}

// ---------- rounding helpers ----------

const r2 = (x: number) => Math.round(x * 1e2) / 1e2
const r3 = (x: number) => Math.round(x * 1e3) / 1e3
const r4 = (x: number) => Math.round(x * 1e4) / 1e4

const mean = (a: number[]): number => (a.length === 0 ? 0 : a.reduce((s, v) => s + v, 0) / a.length)

/** sample variance (ddof=1) — ใช้กับ ICIR/Welch */
function varD1(a: number[]): number {
  const n = a.length
  if (n < 2) return 0
  const m = mean(a)
  let s = 0
  for (const v of a) s += (v - m) * (v - m)
  return s / (n - 1)
}

// ---------- loadPivots ----------

let _pivCache: { key: string; piv: ThaiPivots } | null = null

/**
 * ดึง RawDaily ทั้งหมด (เรียง date, symbol) → เมทริกซ์ close/val/liq
 * ~124k แถว in-memory สบาย; cache ระดับโมดูลด้วย fingerprint
 * (count|maxDate|maxId|Σclose|Σval|Σliq5) กัน refetch ตอนเรียกซ้ำ — ผลรวมค่าจับการ
 * แก้แถวเดิมแบบ in-place (ingest upsert ราคาแก้ไข / recompute liq5) ที่ count/maxId ไม่ขยับ
 */
export async function loadPivots(): Promise<ThaiPivots> {
  const [cnt, agg] = await Promise.all([
    db.rawDaily.count(),
    db.rawDaily.aggregate({ _max: { date: true, id: true }, _sum: { close: true, val: true, liq5: true } }),
  ])
  const key = `${cnt}:${agg._max.date ?? ""}:${agg._max.id ?? 0}:${agg._sum.close ?? 0}:${agg._sum.val ?? 0}:${agg._sum.liq5 ?? 0}`
  if (_pivCache && _pivCache.key === key) return _pivCache.piv

  const rows = await db.rawDaily.findMany({
    orderBy: [{ date: "asc" }, { symbol: "asc" }],
    select: { date: true, symbol: true, close: true, val: true, liq5: true },
  })

  const piv = buildPivots(rows)
  _pivCache = { key, piv }
  return piv
}

export interface PivotRow {
  date: string
  symbol: string
  close: number
  val: number
  liq5: number
}

/**
 * แถว RawDaily → ThaiPivots — pure (เรียงวัน asc เองเสมอ: YYYY-MM-DD เรียง lexicographic = เรียงเวลา)
 * close ที่ไม่ใช่ราคาจริง (≤0 / ไม่ finite เช่น CSV ใส่ 0 วันหยุดพัก) ถือเป็น "ไม่มีข้อมูล"
 * กัน Infinity/NaN ไหลเข้า pct_change, demean รายวัน และ market return
 */
export function buildPivots(rows: PivotRow[]): ThaiPivots {
  const dateKeys = new Set<string>()
  const symSet = new Set<string>()
  for (const r of rows) {
    dateKeys.add(r.date)
    symSet.add(r.symbol)
  }
  const dates = [...dateKeys].sort()
  const dateSet = new Map<string, number>()
  dates.forEach((d, i) => dateSet.set(d, i))
  const symbols = [...symSet].sort()
  const si = new Map<string, number>()
  symbols.forEach((s, i) => si.set(s, i))
  const nD = dates.length
  const nSym = symbols.length

  const close: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  const val: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  const liq: boolean[][] = Array.from({ length: nD }, () => new Array<boolean>(nSym).fill(false))
  for (const r of rows) {
    const i = dateSet.get(r.date) as number
    const j = si.get(r.symbol) as number
    close[i][j] = Number.isFinite(r.close) && r.close > 0 ? r.close : undefined
    val[i][j] = r.val
    liq[i][j] = r.liq5 === 1
  }

  return { dates, symbols, nSym, close, val, liq }
}

// ---------- IC harness ----------

/**
 * Spearman แบบ ordinal rank หลัง sort (ties ของ float ถือ negligible —
 * ไม่ทำ average-ties ตามสเปก) แล้ววัด Pearson ของ rank สองชุด
 */
function spearmanOrd(xs: number[], ys: number[]): number {
  const n = xs.length
  const rank = (v: number[]): number[] => {
    const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b])
    const out = new Array<number>(n)
    idx.forEach((vi, r) => {
      out[vi] = r + 1
    })
    return out
  }
  const ra = rank(xs)
  const rb = rank(ys)
  const ma = mean(ra)
  const mb = mean(rb)
  let cov = 0
  let va = 0
  let vb = 0
  for (let k = 0; k < n; k++) {
    const da = ra[k] - ma
    const db = rb[k] - mb
    cov += da * db
    va += da * da
    vb += db * db
  }
  if (va <= 1e-12 || vb <= 1e-12) return NaN // rank คงที่ทั้งชุด → ไม่มีข้อมูล
  return cov / Math.sqrt(va * vb)
}

/**
 * icPerDate(sig, fwd) — ต่อวัน: Spearman ระหว่าง sig กับ fwd บน intersection
 * ของหุ้นที่มีทั้งสองค่า; วันไหนมี < MIN_CS_N (30) หุ้น → ข้ามวันนั้น
 * คืน { meanIC (4dp), ICIR (3dp = mean/std, ddof=1), t (2dp = ICIR*sqrt(n)), n }
 */
export function icPerDate(sig: Mat, fwd: Mat, nSym: number): IcSummary {
  const nDates = Math.min(sig.length, fwd.length)
  const ics: number[] = []
  for (let i = 0; i < nDates; i++) {
    const rs = sig[i]
    const rf = fwd[i]
    if (!rs || !rf) continue
    const a: number[] = []
    const b: number[] = []
    for (let j = 0; j < nSym; j++) {
      const sv = rs[j]
      const fv = rf[j]
      if (sv !== undefined && fv !== undefined) {
        a.push(sv)
        b.push(fv)
      }
    }
    if (a.length < MIN_CS_N) continue // ≥30 หุ้นเท่านั้น
    const ic = spearmanOrd(a, b)
    if (Number.isFinite(ic)) ics.push(ic)
  }
  const n = ics.length
  if (n === 0) return { meanIC: 0, ICIR: 0, t: 0, n: 0 }
  const m = mean(ics)
  const sd = Math.sqrt(varD1(ics))
  const icir = sd > 1e-12 ? m / sd : 0
  // t คำนวณจาก ICIR ดิบแล้วค่อยปัด (meanIC/ICIR/t แสดงตามสเปก 4/3/2dp)
  return { meanIC: r4(m), ICIR: r3(icir), t: r2(icir * Math.sqrt(n)), n }
}

// ---------- H1/H4: scan ----------

/** sig = pct_change(form) โดย mask = liq && close > 1 (สเปก H1/H4) */
function momentumSig(piv: ThaiPivots, form: number): Mat {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const prev = i >= form ? close[i - form] : null
    const cur = close[i]
    if (prev) {
      for (let j = 0; j < nSym; j++) {
        const c0 = cur[j]
        const cf = prev[j]
        if (c0 !== undefined && cf !== undefined && c0 > 1 && liq[i][j]) row[j] = c0 / cf - 1
      }
    }
    out.push(row)
  }
  return out
}

/**
 * fwd hold = close.pct_change(hold) shifted by -hold (ผลตอบแทน t → t+hold)
 * แล้ว demean แบบ cross-section ต่อวัน (market-adjusted) ก่อน mask ด้วย liq
 */
function fwdDemeaned(piv: ThaiPivots, hold: number): Mat {
  const { close, liq, nSym } = piv
  const nD = piv.dates.length
  const out: Mat = []
  for (let i = 0; i < nD; i++) {
    const row: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
    const fut = i + hold < nD ? close[i + hold] : null
    if (fut) {
      const raw: (number | undefined)[] = new Array<number | undefined>(nSym).fill(undefined)
      let s = 0
      let c = 0
      for (let j = 0; j < nSym; j++) {
        const c0 = close[i][j]
        const cf = fut[j]
        if (c0 !== undefined && cf !== undefined) {
          const v = cf / c0 - 1
          raw[j] = v
          s += v
          c++
        }
      }
      const m = c > 0 ? s / c : 0
      for (let j = 0; j < nSym; j++) {
        if (raw[j] !== undefined && liq[i][j]) row[j] = (raw[j] as number) - m
      }
    }
    out.push(row)
  }
  return out
}

export interface ScanResult {
  cells: ScanCell[]
  h1Pass: boolean
  h4Pass: boolean
  best: ScanCell[]
  longCells: LongCell[]
}

/**
 * scan มีหลักฐานจริงไหม — ต้องมีอย่างน้อย 1 cell ที่วัดได้ (n>0 วัน)
 * (DB ว่าง / หุ้น liquid ไม่ถึง MIN_CS_N ทุกวัน → false: verdict H1/H4 ไม่มีข้อมูลรองรับ ห้าม auto-apply)
 */
export function scanHasEvidence(cells: readonly Pick<ScanCell, "n">[]): boolean {
  return cells.some((c) => c.n > 0)
}

/**
 * scan() — สแกนทุกคู่ (form, hold):
 *   H1 pass = มี cell ไหน form<=20 && hold<=10 && ICIR>0.25
 *   H4 pass = ไม่มี cell ไหน form>=160 && ICIR>0.25 (long momentum ตาย = ดี)
 *             — ต้องมี long cell ที่วัดได้จริง (n>0) อย่างน้อย 1 cell: ไม่มีข้อมูล ≠ "ตายแล้ว"
 *             (สอดคล้องกับกรณี DB ว่างที่คืน h4Pass=false)
 *   best    = top-3 cell สายสั้น (form<=20 && hold<=10) ที่วัดได้จริง (n>0) เรียงด้วย ICIR
 * เกณฑ์ตัดสินใช้ค่า ICIR ที่เก็บใน cell (ปัดแล้ว) เพื่อให้ตารางที่ผู้อ่านเห็นสอดคล้องกับ verdict เสมอ
 */
export function scan(piv: ThaiPivots): ScanResult {
  const nD = piv.dates.length
  if (nD === 0) return { cells: [], h1Pass: false, h4Pass: false, best: [], longCells: [] }
  const cells: ScanCell[] = []
  for (const form of FORMS_TH) {
    const sig = momentumSig(piv, form)
    const holds: readonly number[] = form <= 80 ? HOLDS_SHORT : HOLDS_LONG
    for (const hold of holds) {
      const fwd = fwdDemeaned(piv, hold)
      const ic = icPerDate(sig, fwd, piv.nSym)
      cells.push({ form, hold, ...ic })
    }
  }
  const shortCells = cells.filter((c) => c.form <= 20 && c.hold <= 10)
  // H1: สายสั้นต้องมี ICIR > 0.25 อย่างน้อย 1 cell
  const h1Pass = shortCells.some((c) => c.ICIR > 0.25)
  // H4: long momentum ต้อง "ตาย" — ไม่มี cell form>=160 ที่ ICIR ยัง > 0.25 (และต้องวัดได้จริง)
  const longMeasured = cells.filter((c) => c.form >= 160 && c.n > 0)
  const h4Pass = longMeasured.length > 0 && !longMeasured.some((c) => c.ICIR > 0.25)
  const best = shortCells
    .filter((c) => c.n > 0)
    .sort((a, b) => b.ICIR - a.ICIR)
    .slice(0, 3)
  const longCells: LongCell[] = cells
    .filter((c) => c.form >= 160)
    .map((c) => ({ form: c.form, hold: c.hold, meanIC: c.meanIC, ICIR: c.ICIR }))
  return { cells, h1Pass, h4Pass, best, longCells }
}

// ---------- H2: reversal (snap-back) ----------

/** rolling z-score ต่อหุ้น: หน้าต่าง 250 แถวท้าย ต้องมีค่า valid ≥ minValid (100) */
function rollingZ(r5: Mat, nD: number, nSym: number, win: number, minValid: number): Mat {
  const out: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  for (let j = 0; j < nSym; j++) {
    const buf: (number | undefined)[] = []
    for (let i = 0; i < nD; i++) {
      const cur = r5[i][j]
      buf.push(cur)
      if (buf.length > win) buf.shift()
      if (cur === undefined) continue
      let s = 0
      let c = 0
      for (const v of buf) {
        if (v !== undefined) {
          s += v
          c++
        }
      }
      if (c < minValid) continue
      const m = s / c
      // two-pass variance (ddof=1) — มั่นคงกว่าสูตร E[x²]−E[x]²
      let ss = 0
      for (const v of buf) {
        if (v !== undefined) ss += (v - m) * (v - m)
      }
      const sd = Math.sqrt(ss / (c - 1))
      if (sd <= 1e-12) continue
      out[i][j] = (cur - m) / sd
    }
  }
  return out
}

/** pct-rank แบบ cross-section ต่อวัน (ordinal rank หลัง sort — ties ของ float negligible) */
function pctRankPerDate(m: Mat, nD: number, nSym: number): Mat {
  const out: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  for (let i = 0; i < nD; i++) {
    const items: { j: number; v: number }[] = []
    for (let j = 0; j < nSym; j++) {
      const v = m[i][j]
      if (v !== undefined) items.push({ j, v })
    }
    items.sort((a, b) => a.v - b.v)
    items.forEach((it, r) => {
      out[i][it.j] = (r + 1) / items.length
    })
  }
  return out
}

/**
 * reversal() — H2 snap-back:
 *   r5 = close.pct_change(5); z5 = (r5 − rolling250 mean)/rolling250 std
 *   turnPct = pct-rank ของ val เฉลี่ย 20 วัน (cross-section ต่อวัน)
 *   flow = Σ(sign(ret1)·val) 20 วัน / Σ(val) 20 วัน
 *   สัญญาณ: z5<=-2.5 && turnPct>=0.60 && flow<-0.20 && liq && close>1
 *   เทรดจำลอง 5 แท่ง: stop −8% → 'stop' | z5 กลับ ≥ −0.5 → 'revert' | ครบ 5 วัน → 'time'
 *   net = exitPx/entry − 1 − COST_RT ; control = fwd5 ของ "ตลาด" วันสัญญาณ
 *     (เฉลี่ย fwd5 ของหุ้น liq วันเดียวกัน — H2 ถามว่ากลับตัวแล้ว "ชนะตลาด" ไหม)
 *   PASS = n>=10 && winRate>0.53 && edgeVsCtrl>0
 *     (n>=10 เป็นกันชนกัน noise ของ sample เล็ก — ถ้า n < 10 ไม่มีสถิติพอจะเชื่อได้)
 */
export function reversal(piv: ThaiPivots): H2Result {
  const { dates, close, val, liq, nSym } = piv
  const nD = dates.length
  const zero: H2Result = { pass: false, n: 0, winRate: 0, avgNet: 0, edgeVsCtrl: 0, stopPct: 0 }
  if (nD === 0) return zero

  // --- r5 = close.pct_change(5) ---
  const r5: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  for (let i = 5; i < nD; i++) {
    for (let j = 0; j < nSym; j++) {
      const c0 = close[i][j]
      const cf = close[i - 5][j]
      if (c0 !== undefined && cf !== undefined) r5[i][j] = c0 / cf - 1
    }
  }
  // --- z5: สเปกใช้ rolling(250) แบบ pandas (เต็มหน้าต่าง) — เผื่อข้อมูลมีรูจึงยอมให้ valid ≥ 100 จาก 250 ---
  const z5 = rollingZ(r5, nD, nSym, 250, 100)

  // --- valMa20 = rolling mean ของ val (20 วัน, ต้องมีค่า ≥ 10 วัน) ---
  const valMa: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  for (let j = 0; j < nSym; j++) {
    const buf: (number | undefined)[] = []
    for (let i = 0; i < nD; i++) {
      buf.push(val[i][j])
      if (buf.length > 20) buf.shift()
      let s = 0
      let c = 0
      for (const v of buf) {
        if (v !== undefined) {
          s += v
          c++
        }
      }
      if (c >= 10) valMa[i][j] = s / c
    }
  }
  // --- turnPct = pct-rank cross-section ของ valMa20 ---
  const turnPct = pctRankPerDate(valMa, nD, nSym)

  // --- flow = Σ(sign(ret1)·val) / Σ(val) ในหน้าต่าง 20 วัน ---
  const flow: Mat = Array.from({ length: nD }, () => new Array<number | undefined>(nSym).fill(undefined))
  for (let j = 0; j < nSym; j++) {
    const sgnBuf: (number | undefined)[] = [] // sign(ret1) ต่อวัน (undefined = ret1 ยังไม่มี)
    const valBuf: (number | undefined)[] = []
    for (let i = 0; i < nD; i++) {
      let sgn: number | undefined
      if (i >= 1) {
        const c0 = close[i][j]
        const cp = close[i - 1][j]
        if (c0 !== undefined && cp !== undefined) sgn = Math.sign(c0 / cp - 1)
      }
      sgnBuf.push(sgn)
      valBuf.push(val[i][j])
      if (sgnBuf.length > 20) {
        sgnBuf.shift()
        valBuf.shift()
      }
      let num = 0
      let den = 0
      let c = 0
      for (let k = 0; k < sgnBuf.length; k++) {
        const v = valBuf[k]
        if (v !== undefined) {
          den += v
          c++
          const s = sgnBuf[k]
          if (s !== undefined) num += s * v // pandas: NaN ตัวใดตัวหนึ่ง → ข้ามแถวนั้น
        }
      }
      if (c >= 15 && den > 0) flow[i][j] = num / den
    }
  }

  // --- control ของ H2 = fwd5 ของตลาดวันเดียวกัน: เฉลี่ย forward 5-day return ของหุ้น liq ---
  const mktFwd5: (number | undefined)[] = new Array<number | undefined>(nD).fill(undefined)
  for (let i = 0; i < nD; i++) {
    const fut = i + 5 < nD ? close[i + 5] : null
    if (!fut) continue
    let s = 0
    let c = 0
    for (let j = 0; j < nSym; j++) {
      const c0 = close[i][j]
      const cf = fut[j]
      if (c0 !== undefined && cf !== undefined && liq[i][j]) {
        s += cf / c0 - 1
        c++
      }
    }
    if (c > 0) mktFwd5[i] = s / c
  }

  // --- สแกน candidate + จำลองเทรด 5 แท่ง ---
  const nets: number[] = []
  const ctrls: number[] = []
  let stops = 0
  for (let i = 0; i < nD; i++) {
    for (let j = 0; j < nSym; j++) {
      const c = close[i][j]
      if (c === undefined || !liq[i][j] || c <= 1) continue
      const z = z5[i][j]
      const tp = turnPct[i][j]
      const fl = flow[i][j]
      if (z === undefined || tp === undefined || fl === undefined) continue
      if (!(z <= Z_IN) || !(tp >= TURN_MIN) || !(fl < FLOW_MAX)) continue
      // ต้องมีแท่งถัดไปครบ 5 แท่ง (ไม่งั้นทั้ง sim และ control ไม่สมบูรณ์)
      const px: number[] = []
      let ok = true
      for (let k = 1; k <= 5; k++) {
        const p = i + k < nD ? close[i + k][j] : undefined
        if (p === undefined) {
          ok = false
          break
        }
        px.push(p)
      }
      if (!ok) continue
      const ctrl = mktFwd5[i]
      if (ctrl === undefined) continue

      // exit scan วันที่ 1..5: stop −8% ก่อน → แล้ว z5 กลับตัว ≥ −0.5 → ไม่งั้น 'time' ที่แท่ง 5
      let exitPx = px[4]
      let reason = "time"
      for (let k = 0; k < 5; k++) {
        const p = px[k]
        if (p <= c * 0.92) {
          exitPx = p
          reason = "stop"
          break
        }
        const zk = z5[i + 1 + k][j]
        if (zk !== undefined && zk >= -0.5) {
          exitPx = p
          reason = "revert"
          break
        }
      }
      nets.push(exitPx / c - 1 - COST_RT)
      ctrls.push(ctrl)
      if (reason === "stop") stops++
    }
  }

  const n = nets.length
  if (n === 0) return zero
  const winRate = r4(nets.filter((v) => v > 0).length / n)
  const avgNet = r4(mean(nets))
  const edgeVsCtrl = r4(mean(nets) - mean(ctrls))
  const stopPct = r4(stops / n)
  // เกณฑ์ใช้ค่าที่ปัดแล้วใน result เพื่อ self-consistency
  const pass = n >= 10 && winRate > 0.53 && edgeVsCtrl > 0
  return { pass, n, winRate, avgNet, edgeVsCtrl, stopPct }
}

// ---------- H3: turn-of-month ----------

/**
 * tom() — H3 turn-of-month:
 *   market daily return = mean ตามหุ้นที่ liq ในแต่ละวัน
 *   in-window = 3 วันทำการแรกหรือ 3 วันทำการท้ายของเดือน (YYYY-MM), out = ที่เหลือ
 *     เดือนแรก/เดือนสุดท้ายของตัวอย่างอาจไม่ครบเดือน → "3 วันแรก" ของเดือนแรกและ "3 วันท้าย"
 *     ของเดือนสุดท้ายระบุไม่ได้ (อาจเป็นกลางเดือน) — วันกำกวมเหล่านี้ไม่นับเข้ากลุ่มใด
 *   Welch t = (meanIn − meanOut)/sqrt(varIn/nIn + varOut/nOut) — PASS เมื่อ t > 2
 */
export function tom(piv: ThaiPivots): H3Result {
  const { dates, close, liq, nSym } = piv
  const nD = dates.length
  if (nD === 0) return { pass: false, insideMean: 0, outsideMean: 0, t: 0, nIn: 0 }

  // market daily return ต่อวัน = เฉลี่ยหุ้นที่ liq วันนั้น (ต้องมี close วันก่อน)
  const mkt: (number | undefined)[] = new Array<number | undefined>(nD).fill(undefined)
  for (let i = 1; i < nD; i++) {
    const cur = close[i]
    const prev = close[i - 1]
    let s = 0
    let c = 0
    for (let j = 0; j < nSym; j++) {
      if (!liq[i][j]) continue
      const p0 = prev[j]
      const p1 = cur[j]
      if (p0 === undefined || p1 === undefined) continue
      s += p1 / p0 - 1
      c++
    }
    if (c > 0) mkt[i] = s / c
  }

  // จัดกลุ่มตามเดือน (YYYY-MM) → ตำแหน่งในเดือน 0..e-k-1
  const inR: number[] = []
  const outR: number[] = []
  let k = 0
  while (k < nD) {
    const m = dates[k].slice(0, 7)
    let e = k
    while (e < nD && dates[e].slice(0, 7) === m) e++
    const startKnown = k > 0 // เดือนแรกของตัวอย่าง: ไม่รู้ว่าข้อมูลเริ่มที่วันทำการแรกของเดือนจริงไหม
    const endKnown = e < nD // เดือนสุดท้าย: เดือนอาจยังไม่จบ
    for (let idx = k; idx < e; idx++) {
      const v = mkt[idx]
      if (v === undefined) continue
      const fromStart = idx - k
      const fromEnd = e - 1 - idx
      if ((startKnown && fromStart < 3) || (endKnown && fromEnd < 3)) inR.push(v)
      else if (fromStart < 3 || fromEnd < 3) continue // ขอบตัวอย่างที่ระบุตำแหน่งในเดือนไม่ได้
      else outR.push(v)
    }
    k = e
  }

  const nIn = inR.length
  const nOut = outR.length
  if (nIn < 2 || nOut < 2) return { pass: false, insideMean: r3(mean(inR) * 100), outsideMean: r3(mean(outR) * 100), t: 0, nIn }
  const mIn = mean(inR)
  const mOut = mean(outR)
  const se = Math.sqrt(varD1(inR) / nIn + varD1(outR) / nOut)
  const t = se > 1e-12 ? (mIn - mOut) / se : 0
  // PASS ใช้ t ที่ปัด 2dp เพื่อให้เลขที่แสดงตรงกับ verdict
  const pass = r2(t) > TOM_T
  return { pass, insideMean: r3(mIn * 100), outsideMean: r3(mOut * 100), t: r2(t), nIn }
}

// ---------- runner ----------

const ACTIONS_TH = {
  H1_PASS: "เปิด core สั้น (form<=20,hold<=10) ใน shadow",
  H1_FAIL: "ลดน้ำหนักโมเมนตัมเหลือ flow-only",
  H2_PASS: "เปิด snap-back engine shadow",
  H2_FAIL: "park reversal module",
  H3_PASS: "เปิด calendar overlay +0.15x",
  H3_FAIL: "ปิด overlay",
  H4_PASS: "คง tf ยาวเป็น regime indicator",
  H4_FAIL: "สอบสวน tf ยาวใหม่ทันที",
} as const

/**
 * runThaiFit(mode) — รันชุดทดสอบตาม mode (load pivot ครั้งเดียวต่อรัน)
 * และ persist ทุกรันลง ResearchRun (kind 'thai_fit') พร้อม paramsHash ที่ freeze กติกา
 */
export async function runThaiFit(mode: ThaiFitMode = "all"): Promise<ThaiFitReport> {
  if (!["all", "scan", "reversal", "tom"].includes(mode)) {
    throw new Error(`mode ไม่ถูกต้อง: ${mode}`)
  }
  const piv = await loadPivots()

  const includeScan = mode === "all" || mode === "scan"
  const includeRev = mode === "all" || mode === "reversal"
  const includeTom = mode === "all" || mode === "tom"

  const scanRes = includeScan ? scan(piv) : null
  const h1 = scanRes ? { pass: scanRes.h1Pass, best: scanRes.best } : null
  const h4 = scanRes ? { pass: scanRes.h4Pass, longCells: scanRes.longCells } : null
  const h2 = includeRev ? reversal(piv) : null
  const h3 = includeTom ? tom(piv) : null

  // action ภาษาไทยต่อ verdict — ใส่เฉพาะส่วนที่รันจริง
  const actions: Record<string, string> = {}
  if (h1) actions.H1 = h1.pass ? ACTIONS_TH.H1_PASS : ACTIONS_TH.H1_FAIL
  if (h2) actions.H2 = h2.pass ? ACTIONS_TH.H2_PASS : ACTIONS_TH.H2_FAIL
  if (h3) actions.H3 = h3.pass ? ACTIONS_TH.H3_PASS : ACTIONS_TH.H3_FAIL
  if (h4) actions.H4 = h4.pass ? ACTIONS_TH.H4_PASS : ACTIONS_TH.H4_FAIL

  // verdict string เฉพาะส่วนที่ทดสอบ เช่น "H1:PASS H4:FAIL"
  const vbits: string[] = []
  if (h1) vbits.push(`H1:${h1.pass ? "PASS" : "FAIL"}`)
  if (h2) vbits.push(`H2:${h2.pass ? "PASS" : "FAIL"}`)
  if (h3) vbits.push(`H3:${h3.pass ? "PASS" : "FAIL"}`)
  if (h4) vbits.push(`H4:${h4.pass ? "PASS" : "FAIL"}`)

  const report: ThaiFitReport = {
    ranAt: new Date().toISOString(),
    mode,
    h1,
    h2,
    h3,
    h4,
    scan: scanRes ? scanRes.cells : [],
    actions,
  }

  // freeze กติกาลง paramsHash (sha256 hex) — config-as-evidence
  // rules: 2 = control H2 เป็น fwd5 ของตลาด + TOM ไม่นับวันกำกวมขอบตัวอย่าง + H4 ต้องมี long cell ที่วัดได้
  const params = {
    mode,
    rules: 2,
    forms: [...FORMS_TH],
    holds: [...HOLDS_SHORT],
    holdsLong: [...HOLDS_LONG],
    minCsN: MIN_CS_N,
    cost: COST_RT,
    zIn: Z_IN,
    turnMin: TURN_MIN,
    flowMax: FLOW_MAX,
    tomT: TOM_T,
  }
  const paramsHash = createHash("sha256").update(JSON.stringify(params)).digest("hex")
  await db.researchRun.create({
    data: {
      kind: "thai_fit",
      paramsHash,
      params: JSON.stringify(params),
      result: JSON.stringify(report),
      verdict: vbits.join(" "),
    },
  })

  return report
}
