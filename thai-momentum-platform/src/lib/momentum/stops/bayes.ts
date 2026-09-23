// ============================================================
// Bayesian Stop-Loss Engine (ตามกรอบงานวิจัย Zambelli)
// ------------------------------------------------------------
// แก่น: เรียนรู้ "ระยะ stop ที่เหมาะสม" จากพฤติกรรม drawdown ของระบบเอง
//   1) bin MAE (maximum adverse excursion) แยก Winners / Losers → f_W(b), f_L(b) (Laplace smoothing)
//   2) Bayes: P(L|b) = f_L(b)·P(L) / (f_L(b)·P(L) + f_W(b)·P(W))
//   3) EV ถือต่อที่ bin b: EV_hold(b) = P(W|b)·μ_W(b) + P(L|b)·μ_L(b)
//   4) EV ของกลยุทธ์ที่ stop s: E[R|s] = Σ_{b<s} P(b)·EV_hold(b) + Σ_{b≥s} P(b)·L̄(b,s) → s* = argmax
//      L̄(b,s) = ผลจริงของเทรดที่ถูก stop (fill="close", ค่าเริ่มต้นตั้งแต่ 2026-09-23): ราคาปิดของ
//      "วันแรกที่ราคาปิดทะลุ s" จาก path รายวันของเทรดนั้น − cost (≤ −s−cost เสมอ — gap ลงลึกกว่า stop
//      ก็รับผลจริง ตรงกับ live Jev ที่ปิด ณ ราคาปิด และ walk-forward ใน stops/engine.ts)
//      เทรดที่ไม่มี path รายวัน (dailyPath ≠ true) → ไม่รู้ว่า stop ทำงานวันไหน/ราคาเท่าไร → ใช้ EV_hold(b)
//      = เท่ากับไม่มี stop (ไม่ให้เครดิต ไม่ลงโทษ — นับไว้ใน nNoPathEvidence) · ทุกเทรดไม่มี path → เส้น E[R|s]
//      แบน → sOpt = null (วัดไม่ได้ = ไม่แต่ง s*)
//      fill="level" = สูตรเดิมของกรอบ Zambelli (−s−cost พอดีทุกเทรด) เก็บไว้เทียบเท่านั้น — มองโลกสวยเมื่อ
//      ราคา gap และให้เครดิต stop กับเทรดที่ไม่มีหลักฐาน path (เหตุที่ demo เคย adopt stop 1–1.5%)
//   5) กฎหน้างาน: ถือต่อเมื่อ EV_hold(b_now) > 0 · ปิดเมื่อ ≤ 0 · s* เป็น backstop แข็ง
//
// T method = 1 obs ต่อเทรด (histogram คมแต่บาง)
// R method = obs จากทุกบาร์ระหว่างถือ (drawdown ณ ขณะนั้น, ผลจบเทรด) — ข้อมูลหนา ใช้ bin กว้างกัน obs ซ้ำ
//
// กับดักที่ล็อกไว้ในโค้ดนี้:
//   - Laplace smoothing (prior 0.5) + shrinkage μ เข้าหาค่าเฉลี่ยรวมเมื่อ bin บาง
//   - recency weight w = 0.995^Δวันทำการ (regime เปลี่ยน → posterior เก่าหลง)
//   - ถังบาง (< MIN_TRADES) → ผู้เรียกต้อง fallback ไป pooled (ดู stops/engine.ts)
//   - R mode ใช้ bin กว้างกว่า (1.5%) กัน obs ภายในเทรด correlated
//   - หน่วย: mae/dd = ทศนิยม (0.08 = −8%) · ret = % หลังต้นทุน (ตาม convention TradeRow)
//   - ไม่มี observation เลย → ไม่มี posterior: sOpt/evOpt = null, evCurve ว่าง (ไม่แต่งตัวเลขจาก prior)
// ============================================================

import { TH_STRATEGY } from "@/lib/config/thai"

/** ต้นทุน round-trip (ทศนิยม) = 2 ขา × (commission + slippage) — ค่าเดียวกับ COST_RT ของ stops/engine.ts */
export const DEFAULT_COST_RT = (2 * (TH_STRATEGY.costBps + TH_STRATEGY.slipBpsBase)) / 1e4

export interface BayesTrade {
  ret: number // % หลังต้นทุน round-trip (>0 = winner)
  mae: number // ทศนิยม ≥0 (close-based)
  path?: { d: string; p: number }[] // p = close/entryPx (สำหรับ R method + ราคาปิดวันทะลุ stop)
  /**
   * true = path มีราคาปิด "ครบทุกวันที่หุ้นมีราคา" ระหว่างถือ (caller ตรวจกับปฏิทินจริง เช่น loadClosedTrades)
   * — ใช้หาราคาปิดวันแรกที่ทะลุ stop ได้ · false/ไม่ระบุ = path บาง (เช่น seed เก่าเก็บแค่วันเข้า+วันออก)
   * → ไม่รู้ว่า stop จะทำงานวันไหน/ราคาเท่าไร จึง "ไม่ให้เครดิต stop" กับเทรดนั้น (ดู buildPosterior)
   */
  dailyPath?: boolean
  weight?: number // recency weight (default 1) — คำนวณโดย caller จากจำนวนวันทำการ
}

/**
 * วิธีเติมราคาของเทรดที่ถูก stop (ใช้ร่วมกันทั้ง E[R|s] ที่นี่ และ walk-forward ใน stops/engine.ts)
 * - "close" (ค่าเริ่มต้น — ตรง live Jev ที่ปิด ณ ราคาปิด และตรง runBacktest): ขายที่ราคาปิดของวันแรกที่ปิดทะลุ stop
 * - "level" (เดิม — เก็บไว้เทียบผลเท่านั้น): สมมติขายได้ที่ระดับ stop (1 − s) พอดีแม้ราคาปิด gap ลงลึกกว่า
 */
export type StopFill = "close" | "level"

export interface PosteriorOptions {
  mode?: "T" | "R"
  bin?: number // T default 0.01, R default 0.015
  maxDD?: number // เพดาน bin สุดท้าย (default 0.25)
  cost?: number // ต้นทุน round-trip (ทศนิยม) ของเทรดที่ถูก stop (default DEFAULT_COST_RT)
  fill?: StopFill // default "close"
}

export interface Posterior {
  mode: "T" | "R"
  fill: StopFill
  /**
   * fill="close": จำนวนเทรดที่ MAE ≥ bin แรก (ถูก stop ได้ที่บาง s) แต่หาราคาปิดวันทะลุจาก path ไม่ได้
   * (path ไม่ใช่รายวัน หรือ path ไม่ถึงระดับ MAE ที่บันทึก) → สาขา stop ใช้ EV_hold(b) แทน (ไม่ให้เครดิต stop)
   */
  nNoPathEvidence: number
  bin: number
  bins: number[]
  pL: number[]
  evHold: number[]
  pBin: number[]
  histW: number[]
  histL: number[]
  pW: number
  nTrades: number
  nObs: number
  evNoStop: number
  evCurve: { s: number; ev: number }[]
  sOpt: number | null
  evOpt: number | null
}

/**
 * index ของ bin สำหรับ drawdown/MAE x (ทศนิยม) — floor(x/bin) + กันเศษ float ที่ขอบ bin
 * (1 − 0.9 = 0.09999999999999998 → ต้องได้ bin 10 เหมือน MAE ที่บันทึกเป็น 0.1 ไม่ใช่ bin 9)
 * ใช้ที่เดียวกันทุกจุด (MAE · dd ราย bar ของ R · ราคาปิดวันทะลุ · liveExit) ให้ "ถึง bin k" ⇔ "stop ที่ s_k ทำงาน"
 */
export function binIndex(x: number, bin: number, nb: number): number {
  return Math.min(nb - 1, Math.max(0, Math.floor(Math.max(0, x) / bin + 1e-9)))
}

/**
 * ราคาปิด (p = close/entryPx) ของ "วันแรกที่ราคาปิดทะลุ stop" ต่อระดับ k = 1..kMax (s_k = k·bin)
 * ใช้ binIndex เดียวกับ MAE เพื่อให้ "ถูก stop ที่ k" ⇔ bin ของ MAE ≥ k สอดคล้องกันเป๊ะ
 * คืน array ยาว kMax+1 (index 0 ไม่ใช้) — ช่องที่ path ไปไม่ถึง = NaN
 */
export function firstBreachCloses(
  path: { d: string; p: number }[],
  bin: number,
  nb: number,
  kMax: number
): number[] {
  const out = new Array<number>(kMax + 1).fill(NaN)
  if (kMax < 1) return out
  // เรียงตามวันที่ (ISO YYYY-MM-DD เรียงแบบ string ได้) — ไม่พึ่งลำดับใน JSON
  const pts = path
    .filter((x) => !!x && typeof x.d === "string" && typeof x.p === "number" && isFinite(x.p) && x.p > 0)
    .slice()
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
  let kNext = 1
  for (const pt of pts) {
    if (kNext > kMax) break
    const b = binIndex(1 - pt.p, bin, nb)
    // ทุกระดับ k ที่ยังไม่ถูกทะลุและ ≤ bin ของวันนี้ → ถูก stop วันนี้ที่ราคาปิดวันนี้
    for (; kNext <= Math.min(b, kMax); kNext++) out[kNext] = pt.p
  }
  return out
}

export function buildPosterior(trades: BayesTrade[], o: PosteriorOptions = {}): Posterior {
  const mode = o.mode ?? "T"
  const fill: StopFill = o.fill === "level" ? "level" : "close"
  const bin = o.bin ?? (mode === "R" ? 0.015 : 0.01)
  const maxDD = o.maxDD ?? 0.25
  const cost = typeof o.cost === "number" && isFinite(o.cost) && o.cost >= 0 ? o.cost : DEFAULT_COST_RT
  const nb = Math.ceil(maxDD / bin) + 1 // bin สุดท้าย = overflow (≥ maxDD)
  const bins: number[] = Array.from({ length: nb }, (_, i) => i * bin)

  const wOf = (t: BayesTrade): number =>
    typeof t.weight === "number" && isFinite(t.weight) && t.weight > 0 ? t.weight : 1

  // ---------- observations ----------
  // T: 1 obs ต่อเทรด · R: 1 obs ต่อบาร์ระหว่างถือ (dd ณ ขณะนั้น, ผลจบเทรด)
  const obs: { b: number; win: boolean; r: number; w: number }[] = []
  const maeW = new Array<number>(nb).fill(0) // P(bin) — ถ่วงต่อ "เทรด" เสมอ (ทั้ง T และ R)
  // สาขา stop แบบ fill="close": ราคาปิดวันทะลุต่อระดับ k ของเทรดที่มี path รายวัน (null = ไม่มีหลักฐาน path)
  const stopInfo: { w: number; maeB: number; breach: number[] | null }[] = []
  let nNoPathEvidence = 0
  for (const t of trades) {
    const w = wOf(t)
    const win = t.ret > 0
    const r = t.ret / 100
    const maeB = binIndex(t.mae, bin, nb)
    maeW[maeB] += w
    if (fill === "close" && maeB >= 1) {
      const breach =
        t.dailyPath === true && Array.isArray(t.path) ? firstBreachCloses(t.path, bin, nb, maeB) : null
      if (!breach || breach.slice(1).some((x) => !Number.isFinite(x))) nNoPathEvidence++
      stopInfo.push({ w, maeB, breach })
    }
    if (mode === "T") {
      obs.push({ b: maeB, win, r, w })
    } else {
      const path = Array.isArray(t.path) ? t.path : []
      for (const pt of path) {
        if (!isFinite(pt.p) || pt.p <= 0) continue
        const dd = Math.max(0, 1 - pt.p)
        obs.push({ b: binIndex(dd, bin, nb), win, r, w })
      }
    }
  }

  const totalW = obs.reduce((s, x) => s + x.w, 0)
  let winW = 0
  let retW = 0
  let losW = 0
  for (const x of obs) {
    if (x.win) {
      winW += x.w
      retW += x.r * x.w
    } else {
      losW += x.r * x.w
    }
  }
  const pW = totalW > 0 ? winW / totalW : 0

  // ---------- histogram (Laplace) + μ shrinkage ----------
  const fW = new Array<number>(nb).fill(0.5)
  const fL = new Array<number>(nb).fill(0.5)
  const sW = new Array<number>(nb).fill(0)
  const sL = new Array<number>(nb).fill(0)
  const nW = new Array<number>(nb).fill(0)
  const nL = new Array<number>(nb).fill(0)
  for (const x of obs) {
    if (x.win) {
      fW[x.b] += x.w
      sW[x.b] += x.r * x.w
      nW[x.b] += x.w
    } else {
      fL[x.b] += x.w
      sL[x.b] += x.r * x.w
      nL[x.b] += x.w
    }
  }
  const tW = fW.reduce((a, b) => a + b, 0)
  const tL = fL.reduce((a, b) => a + b, 0)

  // shrinkage: bin บาง → ดึง μ เข้าหาค่าเฉลี่ยรวม (K0 = น้ำหนัก prior เทียบเท่า 3 obs)
  const gW = winW > 0 ? retW / winW : 0.02
  const gL = totalW - winW > 0 ? losW / (totalW - winW) : -0.06
  const K0 = 3

  const maeSum = maeW.reduce((a, b) => a + b, 0)
  const pL: number[] = []
  const evHold: number[] = []
  const pBin: number[] = []
  const histW: number[] = []
  const histL: number[] = []
  for (let b = 0; b < nb; b++) {
    const lw = fW[b] / tW
    const ll = fL[b] / tL
    const pl = (ll * (1 - pW)) / (ll * (1 - pW) + lw * pW + 1e-12)
    const muW = (sW[b] + K0 * gW) / (nW[b] + K0)
    const muL = (sL[b] + K0 * gL) / (nL[b] + K0)
    pL.push(pl)
    evHold.push((1 - pl) * muW + pl * muL)
    pBin.push(maeSum > 0 ? maeW[b] / maeSum : 1 / nb)
    histW.push(fW[b] - 0.5)
    histL.push(fL[b] - 0.5)
  }
  const hwSum = histW.reduce((a, b) => a + b, 0)
  const hlSum = histL.reduce((a, b) => a + b, 0)
  for (let b = 0; b < nb; b++) {
    histW[b] = hwSum > 0 ? histW[b] / hwSum : 0
    histL[b] = hlSum > 0 ? histL[b] / hlSum : 0
  }

  // ---------- EV ของกลยุทธ์ที่ stop s ----------
  // evHold มาจาก ret "หลังต้นทุน round-trip" — สาขา stop ต้องอยู่หน่วยเดียวกัน (หัก cost round-trip)
  // fill="close" (ค่าเริ่มต้น): E[R|s_k] = evNoStop + Σ_{เทรดมีหลักฐาน path, MAE bin ≥ k} w·(p_ทะลุ(k) − 1 − cost − EV_hold(b))/Σw
  //   = สาขา stop ใช้ราคาปิดวันแรกที่ทะลุจริง (ตรง live + walk-forward) · เทรดไม่มีหลักฐาน path ได้ EV_hold(b)
  //   (ไม่ให้เครดิต stop) — ใช้ evNoStop ตัวเดียวกัน + ส่วนปรับ จึงได้ค่าเท่ากันเป๊ะเมื่อไม่มีหลักฐานเลย (ไม่เกิด s* จาก float noise)
  // fill="level" (เดิม): สาขา stop = −s − cost พอดีทุกเทรด
  // ไม่มี observation → ไม่มี posterior ให้หา argmax (evCurve ว่าง, sOpt = null)
  const noObs = obs.length === 0
  const evNoStop = noObs ? 0 : pBin.reduce((s, pb, b) => s + pb * evHold[b], 0)
  const evCurve: { s: number; ev: number }[] = noObs ? [] : [{ s: maxDD, ev: evNoStop }] // จุดแรก = ไม่มี stop (plot ที่ maxDD)
  const adj = new Array<number>(nb).fill(0)
  if (fill === "close") {
    for (const x of stopInfo) {
      if (!x.breach) continue
      for (let k = 1; k <= x.maeB; k++) {
        const pb = x.breach[k]
        if (Number.isFinite(pb)) adj[k] += x.w * (pb - 1 - cost - evHold[x.maeB])
      }
    }
  }
  let best = { s: null as number | null, ev: evNoStop }
  for (let k = 1; k < nb && !noObs; k++) {
    const s = bins[k]
    let ev = 0
    if (fill === "level") {
      for (let b = 0; b < nb; b++) ev += pBin[b] * (b >= k ? -s - cost : evHold[b])
    } else {
      ev = evNoStop + (maeSum > 0 ? adj[k] / maeSum : 0)
    }
    evCurve.push({ s, ev })
    if (ev > best.ev) best = { s, ev }
  }

  return {
    mode,
    fill,
    nNoPathEvidence,
    bin,
    bins,
    pL,
    evHold,
    pBin,
    histW,
    histL,
    pW,
    nTrades: trades.length,
    nObs: obs.length,
    evNoStop,
    evCurve,
    sOpt: best.s,
    evOpt: best.s === null ? null : best.ev,
  }
}

// ---------- กฎหน้างาน ----------
export interface LiveExitResult {
  bin: number
  pL: number | null
  evHold: number | null
  exit: boolean
}

/** ถือต่อเมื่อ EV_hold > 0 · ปิดเมื่อ ≤ 0 (posterior ว่าง → ไม่ตัดสิน, คืน null) */
export function liveExit(p: Posterior, dNow: number): LiveExitResult {
  const nb = p.bins.length
  const b = binIndex(dNow, p.bin, nb)
  if (p.nTrades === 0 || p.nObs === 0) return { bin: b, pL: null, evHold: null, exit: false }
  return { bin: b, pL: p.pL[b], evHold: p.evHold[b], exit: p.evHold[b] <= 0 }
}

/** s_live = s* × 0.85 — MAE จากราคาปิดต่ำกว่าความแรง intraday จริง จึงต้องกันชน (จนกว่าจะ ingest H/L) */
export function liveBackstop(p: Posterior): number | null {
  if (p.sOpt === null) return null
  return Math.min(p.sOpt * 0.85, (p.bins.length - 1) * p.bin)
}
