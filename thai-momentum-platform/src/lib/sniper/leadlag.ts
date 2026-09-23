// leadlag.ts — Cross-Asset Lead-Lag (เวอร์ชัน DAILY PROXY)
// เอกสารต้นทางใช้ futures (S50) เป็นเรดาร์ + Granger causality — ข้อมูลเรามี
// CrossAsset: SPX / USDTHB / GOLD รายวัน จึงคำนวณ lag-correlation แทน:
//   corr(asset t, market t+k) ที่ k = 0..5 — ถ้า |corr| สูงสุดที่ k ≥ 1
//   แปลว่า asset "นำ" ตลาดไทย k วัน (correlation ไม่ใช่เหตุ-ผล — แจ้งใน note เสมอ)
//
// เกณฑ์นัยสำคัญ (ตัดสินเมื่อ 2026-09-23 — docs/research/methodology.md):
//   ติดป้าย "leads" (= ใช้เป็นเรดาร์ได้) ต้องผ่านครบ 3 ข้อ: bestLag ≥ 1 · |r_lag| > 1.1·|r_0| ·
//   |r_lag| ≥ 2/√n (≈ นัยสำคัญ 95% สองทางของ r ภายใต้ H0: ρ = 0 — se(r) ≈ 1/√n, n = จำนวนคู่ที่ใช้ที่ lag นั้น)
//   ไม่ผ่านเกณฑ์นัยสำคัญ → ไม่ติดป้าย lead และ note บอก "ยังไม่มีนัยสำคัญ (|r| < 2/√n)"
//   การเคลื่อนพร้อมกันวันเดียวกัน ("lags") ใช้เกณฑ์เดียวกันกับ r_0 — ไม่ผ่าน → "flat"
//   หมายเหตุ: สแกน 5 lag = ทดสอบหลายครั้ง (โอกาสเจอ lead ปลอมสูงกว่า 5%) — เกณฑ์ 1.1·|r_0| ช่วยกรองอีกชั้น

import type { LeadLagRow } from "./types"

/** เกณฑ์ |r| ขั้นต่ำที่ถือว่ามีนัยสำคัญ ≈ 95% (สองทาง) สำหรับ n คู่ — 2/√n */
export function corrSignificanceFloor(n: number): number {
  return n > 0 ? 2 / Math.sqrt(n) : Infinity
}

export function crossAssetLeadLag(
  crossRows: { date: string; asset: string; close: number }[],
  mkt: { date: string; ret: number }[],
): LeadLagRow[] {
  const out: LeadLagRow[] = []
  const mktByDate = new Map(mkt.map((m) => [m.date, m.ret]))

  const byAsset = new Map<string, { date: string; close: number }[]>()
  for (const r of crossRows) {
    const a = byAsset.get(r.asset) ?? []
    a.push({ date: r.date, close: r.close })
    byAsset.set(r.asset, a)
  }

  for (const [asset, rows] of byAsset) {
    rows.sort((a, b) => a.date.localeCompare(b.date))
    const rets: { date: string; ret: number }[] = []
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].close > 0) rets.push({ date: rows[i].date, ret: rows[i].close / rows[i - 1].close - 1 })
    }
    if (rets.length < 80) continue
    // index ของวันในปฏิทินของ asset (วันซ้ำ → ใช้ตัวแรก เหมือน findIndex เดิม)
    const rowIdx = new Map<string, number>()
    rows.forEach((x, i) => {
      if (!rowIdx.has(x.date)) rowIdx.set(x.date, i)
    })

    const corrAt = (shift: number): { r: number; n: number } => {
      // pair asset วัน t กับ market วัน t+shift (shift ≥ 0 = asset นำ) — เลื่อนตามปฏิทินของ asset
      const pairs: [number, number][] = []
      for (const a of rets) {
        const iSelf = rowIdx.get(a.date)
        if (iSelf === undefined) continue
        const future = shift === 0 ? rows[iSelf] : rows[iSelf + shift]
        if (!future) continue
        const m = mktByDate.get(future.date)
        if (m !== undefined) pairs.push([a.ret, m])
      }
      if (pairs.length < 60) return { r: NaN, n: pairs.length }
      return { r: pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1])), n: pairs.length }
    }

    const c0 = corrAt(0)
    const corr0 = c0.r
    // วันที่ของ asset กับตลาดไทยทับกันไม่พอ (< 60 คู่) = วัดไม่ได้ — ไม่ออกแถว (เดิมออก r=0 ปลอม + โน้ต "r=NaN")
    if (!Number.isFinite(corr0)) continue
    let bestLag = 0
    let bestCorr = corr0
    let bestN = c0.n
    for (let k = 1; k <= 5; k++) {
      const c = corrAt(k)
      if (Number.isFinite(c.r) && Math.abs(c.r) > Math.abs(bestCorr)) {
        bestCorr = c.r
        bestLag = k
        bestN = c.n
      }
    }
    const floor0 = corrSignificanceFloor(c0.n)
    const floorLag = corrSignificanceFloor(bestN)
    const leadCandidate = bestLag >= 1 && Math.abs(bestCorr) > Math.abs(corr0) * 1.1
    const leadSignificant = leadCandidate && Math.abs(bestCorr) >= floorLag
    const sameDaySignificant = Math.abs(corr0) >= floor0
    const direction: LeadLagRow["direction"] = leadSignificant ? "leads" : sameDaySignificant ? "lags" : "flat"

    const assetNote: Record<string, string> = {
      SPX: "ดัชนีสหรัฐฯ — พรีเมียมริสก์โลก",
      USDTHB: "ค่าเงินบาท (USDTHB ลง = บาทแข็ง = เงินไหลเข้า)",
      GOLD: "ทองคำ — safe haven ตอน risk-off",
    }
    const aNote = assetNote[asset] ?? ""
    const notSig = (r: number, n: number, floor: number) =>
      `ยังไม่มีนัยสำคัญ (|r| < 2/√n: |${r.toFixed(2)}| < ${floor.toFixed(2)}, n=${n})`
    const sameDayTxt = sameDaySignificant
      ? `เคลื่อนพร้อมตลาดรายวัน (r=${corr0.toFixed(2)}, n=${c0.n})`
      : `ความสัมพันธ์วันเดียวกัน ${notSig(corr0, c0.n, floor0)}`
    out.push({
      asset,
      corr0,
      bestLag,
      bestCorr,
      direction,
      note: leadSignificant
        ? `${asset} มีความสัมพันธ์กับตลาดไทยสูงสุดเมื่อเลื่อน ${bestLag} วัน (r=${bestCorr.toFixed(2)}, n=${bestN} ≥ เกณฑ์ 2/√n = ${floorLag.toFixed(2)}) — ใช้เป็นเรดาร์ก่อนเปิดตลาดได้ (สหสัมพันธ์ ไม่ใช่เหตุ-ผล) · ${aNote}`
        : leadCandidate
          ? `lead ${bestLag} วัน ${notSig(bestCorr, bestN, floorLag)} — ยังไม่ใช้เป็นเรดาร์ · ${sameDayTxt} · ${aNote}`
          : `${sameDayTxt} ไม่เห็น lead ชัดในหน้าต่าง 1–5 วัน · ${aNote}`,
    })
  }
  return out
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < 8) return NaN
  const ma = a.reduce((s, v) => s + v, 0) / n
  const mb = b.reduce((s, v) => s + v, 0) / n
  let cov = 0
  let va = 0
  let vb = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma
    const db = b[i] - mb
    cov += da * db
    va += da * da
    vb += db * db
  }
  const den = Math.sqrt(va * vb) || 1e-9
  return cov / den
}
