// leadlag.ts — Cross-Asset Lead-Lag (เวอร์ชัน DAILY PROXY)
// เอกสารต้นทางใช้ futures (S50) เป็นเรดาร์ + Granger causality — ข้อมูลเรามี
// CrossAsset: SPX / USDTHB / GOLD รายวัน จึงคำนวณ lag-correlation แทน:
//   corr(asset t+k, market t) ที่ k = 0..5 — ถ้า |corr| สูงสุดที่ k ≥ 1
//   แปลว่า asset "นำ" ตลาดไทย k วัน (correlation ไม่ใช่เหตุ-ผล — แจ้งใน note เสมอ)

import type { LeadLagRow } from "./types"

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

    const corrAt = (shift: number): number => {
      // pair asset วัน t กับ market วัน t+shift (shift ≥ 0 = asset นำ)
      const pairs: [number, number][] = []
      for (const a of rets) {
        if (shift === 0) {
          const m = mktByDate.get(a.date)
          if (m !== undefined) pairs.push([a.ret, m])
        } else {
          const tIdx = rets.findIndex((x) => x.date === a.date)
          void tIdx
          // ใช้ lookup ตามลำดับวัน: หาวัน market = a.date เลื่อน shift วันในอนาคตของ asset
          const iSelf = rows.findIndex((x) => x.date === a.date)
          const future = rows[iSelf + shift]
          if (!future) continue
          const m = mktByDate.get(future.date)
          if (m !== undefined) pairs.push([a.ret, m])
        }
      }
      if (pairs.length < 60) return NaN
      return pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]))
    }

    const corr0 = corrAt(0)
    let bestLag = 0
    let bestCorr = corr0
    for (let k = 1; k <= 5; k++) {
      const c = corrAt(k)
      if (Number.isFinite(c) && Math.abs(c) > Math.abs(bestCorr)) {
        bestCorr = c
        bestLag = k
      }
    }
    const direction: LeadLagRow["direction"] =
      bestLag >= 1 && Math.abs(bestCorr) > Math.abs(corr0) * 1.1
        ? bestCorr > 0
          ? "leads"
          : "leads"
        : Number.isFinite(corr0)
          ? "lags"
          : "flat"

    const assetNote: Record<string, string> = {
      SPX: "ดัชนีสหรัฐฯ — พรีเมียมริสก์โลก",
      USDTHB: "ค่าเงินบาท (USDTHB ลง = บาทแข็ง = เงินไหลเข้า)",
      GOLD: "ทองคำ — safe haven ตอน risk-off",
    }
    out.push({
      asset,
      corr0: Number.isFinite(corr0) ? corr0 : 0,
      bestLag,
      bestCorr: Number.isFinite(bestCorr) ? bestCorr : 0,
      direction,
      note:
        direction === "leads"
          ? `${asset} มีความสัมพันธ์กับตลาดไทยสูงสุดเมื่อเลื่อน ${bestLag} วัน (r=${bestCorr.toFixed(2)}) — ใช้เป็นเรดาร์ก่อนเปิดตลาดได้ · ${assetNote[asset] ?? ""}`
          : `เคลื่อนพร้อมตลาดรายวัน (r=${corr0.toFixed(2)}) ไม่เห็น lead ชัดในหน้าต่าง 1–5 วัน · ${assetNote[asset] ?? ""}`,
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
