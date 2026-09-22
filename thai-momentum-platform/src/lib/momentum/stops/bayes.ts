// ============================================================
// Bayesian Stop-Loss Engine (ตามกรอบงานวิจัย Zambelli)
// ------------------------------------------------------------
// แก่น: เรียนรู้ "ระยะ stop ที่เหมาะสม" จากพฤติกรรม drawdown ของระบบเอง
//   1) bin MAE (maximum adverse excursion) แยก Winners / Losers → f_W(b), f_L(b) (Laplace smoothing)
//   2) Bayes: P(L|b) = f_L(b)·P(L) / (f_L(b)·P(L) + f_W(b)·P(W))
//   3) EV ถือต่อที่ bin b: EV_hold(b) = P(W|b)·μ_W(b) + P(L|b)·μ_L(b)
//   4) EV ของกลยุทธ์ที่ stop s: E[R|s] = Σ_{b<s} P(b)·EV_hold(b) + Σ_{b≥s} P(b)·(−s−cost) → s* = argmax
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
// ============================================================

export interface BayesTrade {
  ret: number // % หลังต้นทุน round-trip (>0 = winner)
  mae: number // ทศนิยม ≥0 (close-based)
  path?: { d: string; p: number }[] // p = close/entryPx (สำหรับ R method)
  weight?: number // recency weight (default 1) — คำนวณโดย caller จากจำนวนวันทำการ
}

export interface PosteriorOptions {
  mode?: "T" | "R"
  bin?: number // T default 0.01, R default 0.015
  maxDD?: number // เพดาน bin สุดท้าย (default 0.25)
}

export interface Posterior {
  mode: "T" | "R"
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

export function buildPosterior(trades: BayesTrade[], o: PosteriorOptions = {}): Posterior {
  const mode = o.mode ?? "T"
  const bin = o.bin ?? (mode === "R" ? 0.015 : 0.01)
  const maxDD = o.maxDD ?? 0.25
  const nb = Math.ceil(maxDD / bin) + 1 // bin สุดท้าย = overflow (≥ maxDD)
  const bins: number[] = Array.from({ length: nb }, (_, i) => i * bin)

  const wOf = (t: BayesTrade): number =>
    typeof t.weight === "number" && isFinite(t.weight) && t.weight > 0 ? t.weight : 1

  // ---------- observations ----------
  // T: 1 obs ต่อเทรด · R: 1 obs ต่อบาร์ระหว่างถือ (dd ณ ขณะนั้น, ผลจบเทรด)
  const obs: { b: number; win: boolean; r: number; w: number }[] = []
  const maeW = new Array<number>(nb).fill(0) // P(bin) — ถ่วงต่อ "เทรด" เสมอ (ทั้ง T และ R)
  for (const t of trades) {
    const w = wOf(t)
    const win = t.ret > 0
    const r = t.ret / 100
    const maeB = Math.min(nb - 1, Math.max(0, Math.floor(t.mae / bin)))
    maeW[maeB] += w
    if (mode === "T") {
      obs.push({ b: maeB, win, r, w })
    } else {
      const path = Array.isArray(t.path) ? t.path : []
      for (const pt of path) {
        if (!isFinite(pt.p) || pt.p <= 0) continue
        const dd = Math.max(0, 1 - pt.p)
        obs.push({ b: Math.min(nb - 1, Math.max(0, Math.floor(dd / bin))), win, r, w })
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
  // ret ทั้งชุดเป็น "หลังต้นทุน round-trip" อยู่แล้ว — เทรดที่ถูก stop ที่ s จบที่ −s
  // (close-based fill ที่ระดับ stop) โดยต้นทุน round-trip เท่าเดิมทุก arm จึงไม่ต้องหักเพิ่ม
  const evNoStop = pBin.reduce((s, pb, b) => s + pb * evHold[b], 0)
  const evCurve: { s: number; ev: number }[] = [{ s: maxDD, ev: evNoStop }] // จุดแรก = ไม่มี stop (plot ที่ maxDD)
  let best = { s: null as number | null, ev: evNoStop }
  for (let k = 1; k < nb; k++) {
    const s = bins[k]
    let ev = 0
    for (let b = 0; b < nb; b++) {
      ev += pBin[b] * (b >= k ? -s : evHold[b])
    }
    evCurve.push({ s, ev })
    if (ev > best.ev) best = { s, ev }
  }

  return {
    mode,
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
  const b = Math.min(nb - 1, Math.max(0, Math.floor(Math.max(0, dNow) / p.bin)))
  if (p.nTrades === 0) return { bin: b, pL: null, evHold: null, exit: false }
  return { bin: b, pL: p.pL[b], evHold: p.evHold[b], exit: p.evHold[b] <= 0 }
}

/** s_live = s* × 0.85 — MAE จากราคาปิดต่ำกว่าความแรง intraday จริง จึงต้องกันชน (จนกว่าจะ ingest H/L) */
export function liveBackstop(p: Posterior): number | null {
  if (p.sOpt === null) return null
  return Math.min(p.sOpt * 0.85, (p.bins.length - 1) * p.bin)
}
