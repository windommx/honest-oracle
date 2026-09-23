// ============================================================
// Signals Engine v2 — "สัญญาณทุกตัวต้องชนะการสอบก่อนจึงมีสิทธิ์ออกเสียง"
//
// Panels:
//  - MarketDay : breadth (b20/b50/b200/thrust + breadthZ), volPct, overlapZ,
//                crossZ → regimeScore/grossMult/label (composite regime ต่อเนื่อง
//                แทน binary risk_on/off)
//  - StockDay  : MFD (money-flow divergence), sector rotation rotZ/rank,
//                symVolPct, mom, meta-score
//
// IC Harness: crossIC (Spearman รายวันแบบ cross-sectional, demean ด้วย
// mean ตลาดของ hold เดียวกัน) + timingCorr (สัญญาณระดับตลาด) + promote()
//
// หลักใช้งาน: risk filters (blockMfd/blockSector/volMult) เปิดเสมอเพราะ
// กันขาดทุนโดยไม่อ้าง alpha — ส่วน alpha (boostMfd/meta-score/grossMult)
// เปิดเฉพาะสัญญาณที่ผ่านเกณฑ์ promote ตาม pre-registered policy
// ============================================================

export type Row = { date: string; symbol: string; close: number; val: number; liq5: number }
export type SnapRow = { date: string; symbol: string; timeframe: number; rank: number }

// ---------- math utils ----------
const mean = (a: number[]): number => a.reduce((s, b) => s + b, 0) / (a.length || 1)
const std = (a: number[]): number => {
  const m = mean(a)
  return Math.sqrt(a.reduce((s, b) => s + (b - m) ** 2, 0) / (a.length || 1))
}
export const clip = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x))
/** ค่าที่ finite เท่านั้น (กัน NaN ปน score) */
export const nz = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback)
const roll = (x: number[], w: number, f: (a: number[]) => number): number[] =>
  x.map((_, i) => (i + 1 < w ? NaN : f(x.slice(i - w + 1, i + 1))))
const cum = (x: number[]): number[] => {
  let s = 0
  return x.map((v) => (s += Number.isFinite(v) ? v : 0))
}
/**
 * percentile ของค่าปัจจุบันในหน้าต่างย้อนหลัง (รวมตัวเอง)
 * ต้องมี ≥ 20 จุดเหมือน zts — percentile จาก 1 จุดได้ 1.0 เสมอ (หุ้น IPO ใหม่ถูกตีเป็น vol สูงสุด)
 * ข้อมูลไม่พอ → NaN แล้วผู้ใช้ nz(…, 0.5) เป็นค่ากลาง
 */
const pctOwn = (x: number[]): number[] =>
  x.map((v, i) => {
    if (!Number.isFinite(v)) return NaN
    const win = x.slice(Math.max(0, i - 250), i + 1).filter(Number.isFinite)
    if (win.length < 20) return NaN
    return win.filter((u) => u <= v).length / win.length
  })
/** z-score ตามเวลา (ต้องมีหน้าต่าง ≥ 20 จุดจึงมีความหมาย ไม่งั้นคืน 0 · ค่าวันนี้วัดไม่ได้ (NaN) = 0 ไม่มีข้อมูล) */
const zts = (x: number[], i: number, w = 250): number => {
  if (!Number.isFinite(x[i])) return 0
  const win = x.slice(Math.max(0, i - w), i + 1).filter(Number.isFinite)
  if (win.length < 20) return 0
  const m = mean(win)
  const sd = std(win) || 1e-9
  return (x[i] - m) / sd
}
/** z-score cross-sectional ต่อแถวอาร์เรย์เดียว (กลุ่มตัวอย่างเดียวกัน) */
const zcs = (x: number[]): number[] => {
  const ok = x.filter(Number.isFinite)
  if (ok.length < 3) return x.map(() => NaN)
  const m = mean(ok)
  const sd = std(ok) || 1e-9
  return x.map((v) => (Number.isFinite(v) ? (v - m) / sd : NaN))
}
/** average-rank cross-sectional (0..1), NaN ทิ้ง — ค่าที่เท่ากันได้ rank เฉลี่ยของกลุ่ม (ไม่ตัดสินเสมอตามลำดับชื่อหุ้น) */
const rankcs = (x: number[]): number[] => {
  const ok = x.map((v, i) => [v, i] as const).filter(([v]) => Number.isFinite(v))
  ok.sort((a, b) => a[0] - b[0])
  const r = new Array<number>(x.length).fill(NaN)
  for (let k = 0; k < ok.length; ) {
    let j = k
    while (j + 1 < ok.length && ok[j + 1][0] === ok[k][0]) j++
    const avg = (k + j + 2) / 2 / ok.length // rank (1-based) เฉลี่ยของตำแหน่ง k..j
    for (let t = k; t <= j; t++) r[ok[t][1]] = avg
    k = j + 1
  }
  return r
}
export const pearson = (a: number[], b: number[]): number => {
  const p = a.map((v, i) => [v, b[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  if (p.length < 8) return NaN
  const xa = p.map((q) => q[0])
  const ya = p.map((q) => q[1])
  const mx = mean(xa)
  const my = mean(ya)
  const cov = xa.reduce((s, v, i) => s + (v - mx) * (ya[i] - my), 0)
  return cov / ((Math.sqrt(xa.reduce((s, v) => s + (v - mx) ** 2, 0)) * Math.sqrt(ya.reduce((s, v) => s + (v - my) ** 2, 0))) || 1e-9)
}
/** Spearman = Pearson ของ rank — จัด rank ภายในคู่ที่ใช้ได้ทั้งสองฝั่งเท่านั้น (NaN ฝั่งเดียวต้องไม่ขยับ rank อีกฝั่ง) */
export const spearman = (a: number[], b: number[]): number => {
  const p = a.map((v, i) => [v, b[i]] as const).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y))
  return pearson(rankcs(p.map((q) => q[0])), rankcs(p.map((q) => q[1])))
}

// ---------- index ----------
interface Sym {
  symbol: string
  dates: string[]
  close: number[]
  val: number[]
}
function indexBySymbol(rows: Row[]): Map<string, Sym> {
  const m = new Map<string, Row[]>()
  for (const r of rows) {
    const a = m.get(r.symbol)
    if (a) a.push(r)
    else m.set(r.symbol, [r])
  }
  const out = new Map<string, Sym>()
  for (const [symbol, rs] of m) {
    rs.sort((a, b) => a.date.localeCompare(b.date))
    out.set(symbol, {
      symbol,
      dates: rs.map((r) => r.date),
      close: rs.map((r) => r.close),
      val: rs.map((r) => r.val),
    })
  }
  return out
}

function symFeat(s: Sym) {
  const c = s.close
  const ret1 = c.map((v, i) => (i ? v / c[i - 1] - 1 : NaN))
  const ret20 = c.map((v, i) => (i >= 20 ? v / c[i - 20] - 1 : NaN))
  // Money flow: sign(ret1) × มูลค่าซื้อขาย → flowRatio 20 วัน = Σflow / Σval
  const flow = ret1.map((d, i) => (Number.isFinite(d) ? Math.sign(d) * s.val[i] : 0))
  const cF = cum(flow)
  const cV = cum(s.val)
  // Σval = 0 (ไม่มีมูลค่าซื้อขาย เช่นไฟล์นำเข้าไม่มีคอลัมน์ val) = ไม่มีข้อมูลเงินไหล → NaN
  // (เดิม 0/1 = 0 ทำให้ทุกตัวเสมอกัน แล้ว flowRank/MFD ถูกตัดสินตามลำดับชื่อหุ้น)
  const flowRatio = flow.map((_, i) => {
    if (i < 20) return NaN
    const v = cV[i] - cV[i - 20]
    return v > 0 ? (cF[i] - cF[i - 20]) / v : NaN
  })
  const vol20 = roll(ret1, 20, std).map((v) => v * Math.sqrt(252))
  return { ret1, ret20, flowRatio, symVolPct: pctOwn(vol20) }
}

// ---------- panels ----------
export type RegimeLabel = "risk_on" | "risk_off" | "neutral"

export interface MarketDay {
  date: string
  b20: number
  b50: number
  b200: number
  thrust: number
  breadthZ: number
  volPct: number
  overlapZ: number
  crossZ: number
  regimeScore: number
  grossMult: number
  label: RegimeLabel
}

export interface StockDay {
  date: string
  symbol: string
  mfd: number // priceRank − flowRank (สูง = distribution, ต่ำ = accumulation)
  priceRank: number // rank ของ ret20 cross-sectional วันนั้น (0..1)
  flowRank: number // rank ของ flowRatio cross-sectional วันนั้น (0..1)
  rotZ: number
  sectorRank: number // 1 = sector แรงสุดของวัน
  sector: string
  symVolPct: number
  mom: number
  score: number
}

export interface PanelSector {
  name: string
  series: number[] // share20 ต่อวัน (สัดส่วนมูลค่าซื้อขายของ sector)
  rotZ: number // ล่าสุด
  rank: number // ล่าสุด (1 = ดีสุด)
}

export interface Panel {
  dates: string[]
  market: MarketDay[]
  stock: Map<string, StockDay[]>
  byDateStock: Map<string, StockDay[]>
  sectors: PanelSector[]
}

export function buildPanel(
  rows: Row[],
  snap: SnapRow[],
  sectorOf: (s: string) => string,
  crossZ: Map<string, number>,
  weights: { mom: number; mfd: number; sec: number; vol: number }
): Panel {
  const idx = indexBySymbol(rows)
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const dPos = new Map(dates.map((d, i) => [d, i]))

  // per-symbol features → date buckets
  interface DayEntry {
    symbol: string
    ret1: number
    ret20: number
    flowRatio: number
    symVolPct: number
    val: number
  }
  const day = new Map<string, DayEntry[]>()
  for (const s of idx.values()) {
    const f = symFeat(s)
    s.dates.forEach((d, i) => {
      const a = day.get(d) ?? []
      a.push({
        symbol: s.symbol,
        ret1: f.ret1[i],
        ret20: f.ret20[i],
        flowRatio: f.flowRatio[i],
        symVolPct: f.symVolPct[i],
        val: s.val[i],
      })
      day.set(d, a)
    })
  }

  // ---------- sector rotation ----------
  const secDates = new Map<string, Map<string, { v: number; r: number[] }>>()
  for (const d of dates) {
    const m = new Map<string, { v: number; r: number[] }>()
    for (const e of day.get(d) ?? []) {
      const sec = sectorOf(e.symbol)
      const o = m.get(sec) ?? { v: 0, r: [] }
      o.v += e.val
      if (Number.isFinite(e.ret20)) o.r.push(e.ret20)
      m.set(sec, o)
    }
    secDates.set(d, m)
  }
  const sectors = [...new Set(rows.map((r) => sectorOf(r.symbol)))]
  const secVal = new Map<string, number[]>(
    sectors.map((sec) => [sec, dates.map((d) => secDates.get(d)?.get(sec)?.v ?? 0)])
  )
  const mktVal = dates.map((d) => (day.get(d) ?? []).reduce((s, e) => s + e.val, 0))
  const mv20 = roll(mktVal, 20, mean)
  const mv60 = roll(mktVal, 60, mean)
  const share20 = new Map<string, number[]>()
  const share60 = new Map<string, number[]>()
  const secRet = new Map<string, number[]>()
  for (const sec of sectors) {
    share20.set(sec, roll(secVal.get(sec) ?? [], 20, mean).map((v, i) => v / (mv20[i] || 1)))
    share60.set(sec, roll(secVal.get(sec) ?? [], 60, mean).map((v, i) => v / (mv60[i] || 1)))
    secRet.set(
      sec,
      dates.map((d) => {
        const r = secDates.get(d)?.get(sec)?.r
        return r && r.length > 0 ? mean(r) : NaN // ไม่มี ret20 เลย = ไม่มีข้อมูล (เดิม mean([]) = 0)
      })
    )
  }
  const rotByDate = new Map<string, Map<string, { rotZ: number; rank: number }>>()
  dates.forEach((d, i) => {
    const sr = sectors.map((sec) => secRet.get(sec)![i])
    // Δshare ต้องมีทั้ง share20 และ share60 — เดิม nz(share60)=0 ช่วง 60 วันแรก ทำให้ Δshare = share20
    // (จัดอันดับ sector ตามขนาดล้วน ๆ สำหรับผู้ใช้ที่มีประวัติสั้น) → ขาดข้อมูล = NaN (zcs ไม่นับ)
    const dl = sectors.map((sec) => share20.get(sec)![i] - share60.get(sec)![i])
    const z1 = zcs(sr)
    const z2 = zcs(dl)
    const rot = sectors.map((sec, k) => 0.6 * nz(z1[k]) + 0.4 * nz(z2[k]))
    const rk = rankcs(rot).map((r) => Math.round((1 - (r || 0.5)) * sectors.length) + 1)
    rotByDate.set(d, new Map(sectors.map((sec, k) => [sec, { rotZ: rot[k], rank: rk[k] }])))
  })

  // ---------- market level ----------
  const mktRet = dates.map((d) =>
    mean(
      (day.get(d) ?? [])
        .filter((e) => Number.isFinite(e.ret1))
        .map((e) => e.ret1)
    )
  )
  const vol20 = roll(mktRet, 20, std).map((v) => v * Math.sqrt(252))
  const volPct = pctOwn(vol20)
  const bArr = breadthArrays(idx, dates, dPos)
  const ov = overlapArrays(snap, dates)
  const market: MarketDay[] = dates.map((d, i) => {
    const breadthZ =
      0.5 * zts(bArr.b20, i) + 0.3 * zts(bArr.b50, i) + 0.2 * zts(bArr.thrust, i, 60)
    const cz = crossZ.get(d) ?? 0
    const vp = nz(volPct[i], 0.5) // ช่วงแรกยังไม่มี percentile → กลาง
    const ovz = nz(ov.z[i])
    const score = 0.35 * breadthZ + 0.25 * cz + 0.2 * (1 - 2 * vp) + 0.2 * ovz
    return {
      date: d,
      b20: bArr.b20[i],
      b50: bArr.b50[i],
      b200: bArr.b200[i],
      thrust: bArr.thrust[i],
      breadthZ,
      volPct: vp,
      overlapZ: ovz,
      crossZ: cz,
      regimeScore: score,
      grossMult: clip(0.25 + (0.75 * (score + 1)) / 2, 0.25, 1.25),
      label: score > 0.5 ? "risk_on" : score < -0.5 ? "risk_off" : "neutral",
    }
  })

  // ---------- stock level (เฉพาะตัวที่ติดโผ snapshot ของวันนั้น) ----------
  const ntf = new Map<string, number>()
  for (const s of snap) ntf.set(s.date + "|" + s.symbol, (ntf.get(s.date + "|" + s.symbol) ?? 0) + 1)
  const streak = streakMap(snap, dates)
  const byDateStock = new Map<string, StockDay[]>()
  for (const d of dates) {
    const list = day.get(d) ?? []
    const pr = rankcs(list.map((e) => e.ret20))
    const fr = rankcs(list.map((e) => e.flowRatio))
    const out: StockDay[] = []
    list.forEach((e, k) => {
      const key = d + "|" + e.symbol
      const n = ntf.get(key)
      if (!n) return
      const sec = sectorOf(e.symbol)
      const rz = rotByDate.get(d)?.get(sec) ?? { rotZ: 0, rank: sectors.length + 1 }
      const mom = (0.7 * Math.min(n, 7)) / 7 + (0.3 * Math.min(streak.get(key) ?? 1, 10)) / 10
      const prK = pr[k] || 0.5
      const frK = Number.isFinite(fr[k]) ? fr[k] || 0.5 : 0.5
      const mfd = Number.isFinite(fr[k]) ? prK - frK : 0
      const score =
        weights.mom * mom +
        weights.mfd * -mfd +
        weights.sec * nz(rz.rotZ) +
        weights.vol * (1 - 2 * nz(e.symVolPct, 0.5))
      out.push({
        date: d,
        symbol: e.symbol,
        mfd,
        priceRank: prK,
        flowRank: frK,
        rotZ: rz.rotZ,
        sectorRank: rz.rank,
        sector: sec,
        symVolPct: nz(e.symVolPct, 0.5),
        mom,
        score,
      })
    })
    byDateStock.set(d, out.sort((a, b) => b.score - a.score))
  }
  const stock = new Map<string, StockDay[]>()
  for (const [d, list] of byDateStock)
    for (const s of list) {
      const a = stock.get(s.symbol) ?? []
      a.push(s)
      stock.set(s.symbol, a)
    }

  const lastRot = dates.length > 0 ? rotByDate.get(dates[dates.length - 1]) : undefined
  const sectorPanels: PanelSector[] = sectors.map((sec) => ({
    name: sec,
    series: share20.get(sec) ?? dates.map(() => NaN),
    rotZ: nz(lastRot?.get(sec)?.rotZ ?? 0),
    rank: lastRot?.get(sec)?.rank ?? sectors.length + 1,
  }))

  return { dates, market, stock, byDateStock, sectors: sectorPanels }
}

// breadth: % หุ้นเหนือ MA20/50/200 ต่อวัน + thrust5 = b20(d) − b20(d−5)
// ตัวหารนับเฉพาะหุ้นที่มี MA ของหน้าต่างนั้นแล้ว — หุ้น IPO ที่ประวัติยังไม่ถึง w วัน
// ไม่มีทั้ง "เหนือ" และ "ใต้" MA จึงต้องไม่ถูกนับเป็นหุ้นใต้เส้น (เดิมดึง breadth ลง)
// ยังไม่มีหุ้นตัวไหนมี MA ของหน้าต่างนั้นเลย (ช่วง warm-up / ประวัติสั้นกว่า 200 วัน) = NaN "วัดไม่ได้"
// ไม่ใช่ 0% — เดิมเลข 0 ปลอมทาสีแดงทั้งคอลัมน์และไหลเข้าหน้าต่าง z-score ของ breadthZ ไปอีกเกือบปี
function breadthArrays(
  idx: Map<string, Sym>,
  dates: string[],
  dPos: Map<string, number>
): { b20: number[]; b50: number[]; b200: number[]; thrust: number[] } {
  const n20 = dates.map(() => 0)
  const n50 = dates.map(() => 0)
  const n200 = dates.map(() => 0)
  const a20 = dates.map(() => 0)
  const a50 = dates.map(() => 0)
  const a200 = dates.map(() => 0)
  for (const s of idx.values()) {
    const ma = [20, 50, 200].map((w) => roll(s.close, w, mean))
    s.dates.forEach((d, i) => {
      const p = dPos.get(d)
      if (p === undefined) return
      if (Number.isFinite(ma[0][i])) {
        n20[p]++
        a20[p] += s.close[i] > ma[0][i] ? 1 : 0
      }
      if (Number.isFinite(ma[1][i])) {
        n50[p]++
        a50[p] += s.close[i] > ma[1][i] ? 1 : 0
      }
      if (Number.isFinite(ma[2][i])) {
        n200[p]++
        a200[p] += s.close[i] > ma[2][i] ? 1 : 0
      }
    })
  }
  const f = (x: number[], n: number[]): number[] => x.map((v, i) => (n[i] > 0 ? v / n[i] : NaN))
  const B20 = f(a20, n20)
  const B50 = f(a50, n50)
  const B200 = f(a200, n200)
  return {
    b20: B20,
    b50: B50,
    b200: B200,
    thrust: B20.map((v, i) => (i >= 5 && Number.isFinite(v) && Number.isFinite(B20[i - 5]) ? v - B20[i - 5] : NaN)),
  }
}

// overlap ratio (สัญญาณเดิม): repeat = 1 − unique/rows จาก snapshot รวมทุก tf
function overlapArrays(snap: SnapRow[], dates: string[]): { rep: number[]; z: number[] } {
  const m = new Map<string, { rows: number; u: Set<string> }>()
  for (const s of snap) {
    const o = m.get(s.date) ?? { rows: 0, u: new Set<string>() }
    o.rows++
    o.u.add(s.symbol)
    m.set(s.date, o)
  }
  const rep = dates.map((d) => {
    const o = m.get(d)
    return o && o.rows > 0 ? 1 - o.u.size / o.rows : NaN
  })
  return { rep, z: rep.map((_, i) => zts(rep, i)) }
}

// streak: จำนวนวันทำการต่อเนื่องที่ติดโผ (union ทุก tf) นับถึงวัน d
function streakMap(snap: SnapRow[], dates: string[]): Map<string, number> {
  const pv = new Map<string, Set<string>>()
  for (const s of snap) {
    const st = pv.get(s.date) ?? new Set<string>()
    st.add(s.symbol)
    pv.set(s.date, st)
  }
  const cs = new Map<string, number>()
  const out = new Map<string, number>()
  for (const d of dates) {
    const st = pv.get(d) ?? new Set<string>()
    for (const sym of new Set([...cs.keys(), ...st])) {
      if (st.has(sym)) {
        const cur = (cs.get(sym) ?? 0) + 1
        cs.set(sym, cur)
        out.set(d + "|" + sym, cur)
      } else {
        cs.delete(sym)
      }
    }
  }
  return out
}

// ---------- Composite Regime + Gates ----------
export const SIGNS: Record<string, 1 | -1> = { mom: 1, mfd: -1, sec: 1, vol: -1 }

export const GATES = {
  blockMfd: 0.45, // distribution → ห้ามซื้อ (risk filter: เปิดทันที)
  boostMfd: -0.3, // accumulation → size ×1.25 (alpha: เปิดเมื่อผ่าน IC)
  boostMult: 1.25,
  blockSectorBottom: 2, // sector อันดับท้าย 2 → ห้ามซื้อ (risk filter)
  volSizeMult: (p: number): number => (p > 0.8 ? 0.7 : 1),
  volStopMult: (p: number): number => (p > 0.8 ? 0.8 : 1),
}

export function compositeRegime(
  breadthZ: number,
  crossZ: number,
  volPct: number,
  overlapZ: number
): { score: number; grossMult: number; label: RegimeLabel } {
  const score = 0.35 * breadthZ + 0.25 * crossZ + 0.2 * (1 - 2 * volPct) + 0.2 * overlapZ
  return {
    score,
    grossMult: clip(0.25 + (0.75 * (score + 1)) / 2, 0.25, 1.25),
    label: score > 0.5 ? "risk_on" : score < -0.5 ? "risk_off" : "neutral",
  }
}

// ---------- IC Harness : สอบสัญญาณก่อนให้สิทธิ์ ----------
export interface IcSummary {
  meanIC: number
  ICIR: number
  t: number
  n: number
  hit: number
}

export const summarize = (ics: number[]): IcSummary => {
  const ok = ics.filter(Number.isFinite)
  const m = mean(ok)
  const sd = std(ok)
  // ICIR ต้องมี ≥ 2 จุดและ sd > 0 — เดิม sd=0 → หาร 1e-9 ได้ ICIR/t ระดับ 1e8 (n=1 ก็แสดงเลขมหาศาล)
  const ir = ok.length >= 2 && sd > 1e-12 ? m / sd : 0
  return {
    meanIC: m,
    ICIR: ir,
    t: ir * Math.sqrt(ok.length),
    n: ok.length,
    hit: mean(ok.map((v) => (v > 0 ? 1 : 0))),
  }
}

/** เกณฑ์โปรโมตตาม pre-registered policy: |IC|>0.02, |ICIR|>0.25, n≥120, เครื่องหมายตรง */
export const promote = (r: IcSummary, sign: 1 | -1): boolean =>
  Math.abs(r.meanIC) > 0.02 && Math.abs(r.ICIR) > 0.25 && r.n >= 120 && Math.sign(r.meanIC) === sign

/**
 * forward return ตามปฏิทินตลาด: close ของ "วันทำการที่ +hold" ใน dates (ปฏิทินรวมของ panel)
 * หุ้นที่ไม่มีราคาในวันปลายทาง (พักการซื้อขาย / เลิกเทรด) = ไม่มี forward return
 * (เดิมเลื่อน hold "แถว" ของหุ้นตัวนั้น → ข้ามช่วงพักการซื้อขายไปไกลกว่า hold วันทำการ)
 * คืน Map date → (symbol → ret)
 */
function fwdByDate(dates: string[], rows: Row[], hold: number): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  const h = Math.floor(hold)
  if (!(h >= 1)) return out
  const dPos = new Map(dates.map((d, i) => [d, i]))
  const px = new Map<string, number>()
  for (const r of rows) px.set(r.date + "|" + r.symbol, r.close)
  for (const r of rows) {
    const p = dPos.get(r.date)
    if (p === undefined || p + h >= dates.length || !(r.close > 0)) continue
    const c1 = px.get(dates[p + h] + "|" + r.symbol)
    if (c1 === undefined || !Number.isFinite(c1)) continue
    let m = out.get(r.date)
    if (!m) {
      m = new Map<string, number>()
      out.set(r.date, m)
    }
    m.set(r.symbol, c1 / r.close - 1)
  }
  return out
}

/**
 * Cross-sectional IC รายวัน: signal ของตัวที่ติดโผวัน d เทียบ forward return
 * hold วันข้างหน้า (demean ด้วย mean ของ universe ทั้งกลางวันเดียวกัน)
 */
export function crossIC(
  panel: Panel,
  get: (s: StockDay) => number,
  hold: number,
  rows: Row[]
): IcSummary {
  const fwd = fwdByDate(panel.dates, rows, hold)
  const ics: number[] = []
  for (const d of panel.dates) {
    const list = panel.byDateStock.get(d) ?? []
    if (list.length < 5) continue
    const fm = fwd.get(d)
    if (!fm) continue
    const dayMean = mean([...fm.values()])
    const sig = list.map(get)
    const fr = list.map((s) => {
      const v = fm.get(s.symbol)
      return v === undefined ? NaN : v - dayMean
    })
    const ic = spearman(sig, fr)
    if (Number.isFinite(ic)) ics.push(ic)
  }
  return summarize(ics)
}

/** timing correlation — สำหรับสัญญาณระดับตลาด (breadthZ/crossZ/volPct/overlapZ) */
export function timingCorr(
  panel: Panel,
  get: (m: MarketDay) => number,
  hold: number,
  rows: Row[]
): { corr: number; n: number; t: number } {
  const fwd = fwdByDate(panel.dates, rows, hold)
  const xs: number[] = []
  const ys: number[] = []
  for (const m of panel.market) {
    const f = fwd.get(m.date)
    if (!f || f.size === 0) continue
    xs.push(get(m))
    ys.push(mean([...f.values()]))
  }
  const r = pearson(xs, ys)
  return {
    corr: r,
    n: xs.length,
    t: r * Math.sqrt(xs.length / (1 - r * r || 1e-9)),
  }
}
