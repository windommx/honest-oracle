// ============================================================
// GET /api/portfolio/allocation — แปลงพอร์ตกระดาษเป็นน้ำหนักแบบ risk-based
// modes: equal | invvol | hrp | hrp_bl (HRP + Black-Litterman Idzorek)
// (Task 7-2-b, backend-allocation)
//
// หน่วยของตัวเลข (สำคัญ):
//  - HRP ใช้ DAILY covariance ตรง ๆ — HRP เป็น scale-invariant ต่อ scalar
//    (corr และ inverse-variance weights ไม่เปลี่ยนตามตัวคูณ)
//  - Black-Litterman ต้องการหน่วยเดียวกันทั้ง Σ, Π, Q → ใช้ ANNUAL:
//    Σ_ann = daily cov × 252, Π = δ·Σ_ann·w_mkt, Q รายปีจาก n_tf
// ============================================================

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"
import type {
  AllocationCluster,
  AllocationMode,
  AllocationResponse,
  AllocationRow,
  BlViewRow,
} from "@/lib/momentum/contracts"
import { runHRP } from "@/lib/portfolio/hrp"
import { blackLittermanIdzorek } from "@/lib/portfolio/blacklitterman"
import { matvec } from "@/lib/portfolio/linalg"
import { observedReturns } from "@/lib/portfolio/returns"

export const dynamic = "force-dynamic"

const MODES: AllocationMode[] = ["equal", "invvol", "hrp", "hrp_bl"]
const TAU = 0.05
const RISK_AVERSION = 3.0
const MAX_ASSETS = 12
const TRADING_DAYS = 252

/** ปัด 4 ตำแหน่ง + บังคับผลรวม = 1 เป๊ะ (เศษที่เหลือเติมให้ตัวที่ใหญ่สุด) */
function roundWeights(ws: number[]): number[] {
  const r = ws.map((w) => Math.round(Math.max(0, w) * 10000) / 10000)
  if (r.length === 0) return r
  const sum = r.reduce((a, b) => a + b, 0)
  const diff = Math.round((1 - sum) * 10000) / 10000
  if (diff !== 0) {
    let bi = 0
    for (let i = 1; i < r.length; i++) if (r[i] > r[bi]) bi = i
    r[bi] = Math.round((r[bi] + diff) * 10000) / 10000
  }
  return r
}

function std(xs: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / n
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (n - 1)
  return Math.sqrt(Math.max(0, v))
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const notes: string[] = []
  try {
    // ---------- params ----------
    const modeParam = req.nextUrl.searchParams.get("mode")
    const mode: AllocationMode = (modeParam ?? "hrp") as AllocationMode
    if (!MODES.includes(mode)) {
      return NextResponse.json(
        { error: "mode ต้องเป็น equal | invvol | hrp | hrp_bl" },
        { status: 400 }
      )
    }
    // Number(null) === 0 (ไม่ใช่ NaN) → ต้องเช็ค null ก่อน ไม่งั้น default 60 จะกลายเป็น 20
    const lbParam = req.nextUrl.searchParams.get("lookback")
    const lbRaw = lbParam === null ? NaN : Number(lbParam)
    const lookback = Math.min(250, Math.max(20, Number.isFinite(lbRaw) ? Math.round(lbRaw) : 60))

    // ไม่มีน้ำหนัก → ไม่อ้าง "น้ำหนักรวม 1.00" (weights ว่าง รวมได้ 0)
    const emptyResponse = (why: string): NextResponse =>
      NextResponse.json<AllocationResponse>({
        mode,
        lookback,
        nAssets: 0,
        weights: [],
        clusters: [],
        effN: 0,
        views: null,
        tau: TAU,
        riskAversion: RISK_AVERSION,
        notes: [...notes, why],
        tookMs: Date.now() - t0,
      })

    // ---------- 1) universe: พอร์ตจริงก่อน ถ้าไม่มีใช้ชุดหุ้นติดโผมากที่สุด ----------
    const positions = await db.position.findMany({
      orderBy: [{ entryDate: "desc" }, { symbol: "asc" }],
    })
    let syms: string[]
    if (positions.length > 0) {
      syms = positions.map((p) => p.symbol)
      if (syms.length > MAX_ASSETS) {
        syms = syms.slice(0, MAX_ASSETS)
        notes.push(`มีสถานะเกิน ${MAX_ASSETS} ตัว — ใช้ ${MAX_ASSETS} รายการล่าสุดตาม entryDate`)
      }
    } else {
      const maxSnap = await db.snapshot.aggregate({ _max: { date: true } })
      const latestSnap = maxSnap._max.date
      if (!latestSnap)
        return emptyResponse("ยังไม่มีทั้งสถานะและข้อมูล snapshot — ไม่มีอะไรให้จัดน้ำหนัก")
      const rows = await db.snapshot.findMany({
        where: { date: latestSnap },
        select: { symbol: true, rank: true },
      })
      const agg = new Map<string, { nTf: number; bestRank: number }>()
      for (const r of rows) {
        const a = agg.get(r.symbol) ?? { nTf: 0, bestRank: Number.MAX_SAFE_INTEGER }
        a.nTf += 1
        a.bestRank = Math.min(a.bestRank, r.rank)
        agg.set(r.symbol, a)
      }
      syms = [...agg.entries()]
        .sort(
          (x, y) =>
            y[1].nTf - x[1].nTf || x[1].bestRank - y[1].bestRank || x[0].localeCompare(y[0])
        )
        .slice(0, 8)
        .map((e) => e[0])
      notes.push("ยังไม่มีสถานะจริง — ใช้ชุดหุ้นที่ติดโผมากที่สุดวันล่าสุด")
    }

    // ---------- 2) sector จาก SymbolMeta (fallback "Unknown") ----------
    const metaRows = await db.symbolMeta.findMany({ where: { symbol: { in: syms } } })
    const sectorMap = new Map(metaRows.map((m) => [m.symbol, m.sector]))

    // ---------- 3) ผลตอบแทนรายวันจาก closePivot (หน้าต่าง lookback) ----------
    const pivot = await closePivot()
    if (pivot.dates.length < 2) return emptyResponse("ข้อมูลราคาไม่พอ (ต้องมีอย่างน้อย 2 วันทำการ)")
    const endIdx = pivot.dates.length - 1
    const priceStart = Math.max(0, endIdx - lookback) // ราคา lookback+1 วันท้ายสุด
    const nRet = endIdx - priceStart
    if (nRet < 2) return emptyResponse("ข้อมูลราคาไม่พอ (ต้องมีอย่างน้อย 2 วันทำการ)")

    const rets = new Map<string, number[]>() // NaN = ขาด (หุ้นพักเทรด/ยังไม่เข้าตลาด)
    const noPrice: string[] = []
    for (const s of syms) {
      const si = pivot.symIdx.get(s)
      if (si === undefined) {
        noPrice.push(s)
        continue
      }
      // วันที่กลับมาเทรดเทียบราคาปิดล่าสุดที่มี (เดิมคู่ NaN→ราคา ถูกทิ้ง ทำให้ gap ช่วงพักหายจาก vol/corr)
      rets.set(s, observedReturns(pivot.px, si, priceStart + 1, endIdx))
    }
    if (noPrice.length > 0) notes.push(`ไม่มีราคาในระบบ: ${noPrice.join(", ")}`)

    const dropped: string[] = []
    for (const [s, col] of rets) {
      const missing = col.filter((v) => !isFinite(v)).length
      if (missing / col.length > 0.3) dropped.push(s)
    }
    for (const s of dropped) rets.delete(s)
    if (dropped.length > 0)
      notes.push(`ตัด ${dropped.join(", ")} ออกเพราะราคาขาดเกิน 30% ของหน้าต่าง lookback`)

    const kept = [...rets.keys()]
    if (kept.length < 2)
      return emptyResponse("หุ้นที่มีข้อมูลพอเหลือน้อยกว่า 2 ตัว — ไม่คำนวณน้ำหนัก")
    const n = kept.length

    // จุดที่ขาดแทนด้วย 0 ตาม convention เดิมของ /api/portfolio
    const R: number[][] = kept.map((s) => rets.get(s)!.map((v) => (isFinite(v) ? v : 0)))

    // ---------- 4) covariance รายวัน (หาร N−1) + annual ×252 สำหรับ BL ----------
    const mean = R.map((col) => col.reduce((a, b) => a + b, 0) / nRet)
    const covD: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        let acc = 0
        for (let t = 0; t < nRet; t++) acc += (R[i][t] - mean[i]) * (R[j][t] - mean[j])
        const c = acc / (nRet - 1)
        covD[i][j] = c
        covD[j][i] = c
      }
    }
    const sigmaAnn = covD.map((row) => row.map((v) => v * TRADING_DAYS))

    // ---------- 5) vol20 (% รายวัน) = std ของ daily returns 20 วันล่าสุด ----------
    const vol20 = kept.map((s) => {
      const col = rets.get(s)!
      const last20 = col.slice(-20).filter((v) => isFinite(v))
      const base = last20.length >= 2 ? last20 : col.filter((v) => isFinite(v))
      return Math.round(std(base) * 100 * 100) / 100
    })

    // ---------- 6) น้ำหนักตาม mode ----------
    const wEqual = () => kept.map(() => 1 / n)
    const wInvVol = () => {
      const iv = kept.map((_, i) => {
        const s = Math.sqrt(Math.max(0, covD[i][i]))
        return s > 0 ? 1 / s : 0
      })
      const sum = iv.reduce((a, b) => a + b, 0)
      return sum > 0 ? iv.map((v) => v / sum) : wEqual()
    }

    const hrpRes = mode === "hrp" || mode === "hrp_bl" ? runHRP(covD) : null
    if ((mode === "hrp" || mode === "hrp_bl") && hrpRes === null)
      notes.push("HRP คำนวณไม่สำเร็จ (covariance มีปัญหา) — ใช้ invvol แทน")

    let weights: number[] // ก่อนปัด
    let hrpWeights: number[] | null = null // ก่อนปัด (null = ไม่ได้รัน HRP)
    let clusters: AllocationCluster[] = []
    let views: BlViewRow[] | null = null

    if (mode === "equal") {
      weights = wEqual()
    } else if (mode === "invvol") {
      weights = wInvVol()
    } else if (hrpRes !== null) {
      weights = hrpRes.weights
      hrpWeights = hrpRes.weights
      clusters = hrpRes.clusters.map((idxs, k) => ({
        id: k + 1,
        symbols: idxs
          .slice()
          .sort((a, b) => a - b)
          .map((i) => kept[i]),
      }))
    } else {
      weights = wInvVol()
      clusters = []
    }

    // ---- ชั้น Black-Litterman (mode = hrp_bl) ----
    if (mode === "hrp_bl" && hrpRes !== null) {
      // Π = δ·Σ_ann·w_mkt โดย w_mkt = น้ำหนัก HRP เอง — ใช้พอร์ต risk-based ของเรา
      // เป็น equilibrium จุดเริ่ม (แทน market-cap weights ที่ไม่มีในบริบทพอร์ตหุ้นไทยเล็ก)
      const wMkt = hrpRes.weights
      const pi = matvec(sigmaAnn, wMkt).map((v) => v * RISK_AVERSION)

      // view จากโมเมนตัม: m_i = จำนวน timeframe ที่ติดโผวันล่าสุด (n_tf)
      // Q_i = 0.04 + 0.03·m_i (annual; ติดครบ 7 โผ = 25%/ปี, ฐาน 4%)
      // conf_i = min(0.85, 0.4 + 0.08·m_i)
      // สร้างเฉพาะ m_i ≥ 2 — เริ่มจาก view จำนวนไม่มากและมั่นใจจริง
      const maxSnap = await db.snapshot.aggregate({ _max: { date: true } })
      const nTfMap = new Map<string, number>()
      if (maxSnap._max.date) {
        const rows = await db.snapshot.findMany({
          where: { date: maxSnap._max.date },
          select: { symbol: true },
        })
        for (const r of rows) nTfMap.set(r.symbol, (nTfMap.get(r.symbol) ?? 0) + 1)
      }
      const blViews = kept
        .map((s, i) => ({ s, i, m: nTfMap.get(s) ?? 0 }))
        .filter((x) => x.m >= 2)
        .map((x) => ({
          symbolIdx: x.i,
          q: Math.min(0.35, Math.max(0.02, 0.04 + 0.03 * x.m)),
          confidence: Math.min(0.85, 0.4 + 0.08 * x.m),
        }))
      notes.push(
        `มี view ${blViews.length} ตัว จาก ${n} หุ้น (เฉพาะ n_tf ≥ 2): Q = 4% + 3%×n_tf ต่อปี, conf = 0.4 + 0.08×n_tf`
      )

      const bl = blackLittermanIdzorek({
        sigma: sigmaAnn,
        pi,
        views: blViews,
        tau: TAU,
        riskAversion: RISK_AVERSION,
      })
      if (bl !== null) {
        weights = bl.weights
        views = blViews.map((v, k) => ({
          symbol: kept[v.symbolIdx],
          pi: Math.round(pi[v.symbolIdx] * 10000) / 10000,
          q: Math.round(v.q * 10000) / 10000,
          muBl: Math.round(bl.muBl[v.symbolIdx] * 10000) / 10000,
          omega: Math.round(bl.omega[k] * 10000) / 10000,
          confidence: Math.round(v.confidence * 100) / 100,
        }))
      } else {
        notes.push("คำนวณ Black-Litterman ไม่สำเร็จ (singular) — ใช้น้ำหนัก HRP แทน")
      }
    }

    // ---------- 7) effN = 1/(wᵀρw) จาก correlation ของหน้าต่างเดียวกัน ----------
    let effN = n
    {
      const w = weights
      let quad = 0
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const di = covD[i][i]
          const dj = covD[j][j]
          const rho = di > 0 && dj > 0 ? covD[i][j] / Math.sqrt(di * dj) : 0
          quad += w[i] * rho * w[j]
        }
      }
      if (quad > 0) effN = 1 / quad
      effN = Math.min(n, Math.max(1, effN))
    }

    // ---------- 8) ปัด + normalize + เรียง ----------
    const wFinal = roundWeights(weights)
    const hFinal = hrpWeights === null ? null : roundWeights(hrpWeights)
    const rows: AllocationRow[] = kept
      .map((s, i) => ({
        symbol: s,
        sector: sectorMap.get(s) ?? "Unknown",
        weight: wFinal[i],
        hrpWeight: hFinal === null ? (mode === "hrp" ? wFinal[i] : null) : hFinal[i],
        vol20: vol20[i],
      }))
      .sort((a, b) => b.weight - a.weight || a.symbol.localeCompare(b.symbol))

    notes.push("น้ำหนักรวม 1.00")

    return NextResponse.json<AllocationResponse>({
      mode,
      lookback,
      nAssets: n,
      weights: rows,
      clusters,
      effN: Math.round(effN * 10) / 10,
      views,
      tau: TAU,
      riskAversion: RISK_AVERSION,
      notes,
      tookMs: Date.now() - t0,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
