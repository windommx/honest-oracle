import { NextResponse } from "next/server"
import { loadAll, loadSectorOf, dataKey } from "@/lib/momentum/signals/io"
import { backtestPair, getCachedScan } from "@/lib/momentum/arb/pairs"
import type { PairsResponse, PairBacktestRow } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const COST_PER_LEG_BPS = 55 // 30 commission + 25 slippage ต่อขา — รอบเต็ม = 4 ขา

// GET /api/arb/pairs
// สแกนคู่ cointegrated ทั้งกระดาน (same-sector, corr pre-filter → OU half-life)
// + backtest dollar-neutral พร้อมต้นทุนจริง 4 ขา ให้คู่ที่ผ่านเกณฑ์
export async function GET() {
  const t0 = Date.now()
  try {
    const [{ rows }, sectorOf] = await Promise.all([loadAll(), loadSectorOf()])
    if (rows.length === 0) {
      const empty: PairsResponse = {
        scanned: 0,
        tested: 0,
        pairs: [],
        backtest: [],
        costPerLegBps: COST_PER_LEG_BPS,
        tookMs: Date.now() - t0,
        message: "ยังไม่มีข้อมูล — seed ข้อมูลก่อน (POST /api/seed)",
      }
      return NextResponse.json(empty)
    }

    const key = await dataKey()
    const scan = getCachedScan(key, rows, sectorOf)

    // backtest คู่ที่ดีที่สุด (สแกนเรียงตาม |z| อยู่แล้ว) — จำกัด 8 คู่แรกเพื่อเวลาตอบ
    const backtest: PairBacktestRow[] = []
    for (const p of scan.pairs.slice(0, 8)) {
      const spread = p.logA.map((v, i) => v - p.beta * p.logB[i])
      const bt = backtestPair(spread, p.hl, { costPerLegBps: COST_PER_LEG_BPS })
      backtest.push({
        a: p.a,
        b: p.b,
        trades: bt.trades,
        winRate: bt.winRate,
        avgGross: bt.avgGross,
        avgNet: bt.avgNet,
        totalNet: bt.totalNet,
      })
    }

    const res: PairsResponse = {
      scanned: scan.scanned,
      tested: scan.tested,
      pairs: scan.pairs.map((p) => ({
        a: p.a,
        b: p.b,
        sector: p.sector,
        corr: p.corr,
        beta: p.beta,
        hl: p.hl,
        z: p.z,
        mu: p.mu,
        sd: p.sd,
        action: p.action,
      })),
      backtest,
      costPerLegBps: COST_PER_LEG_BPS,
      tookMs: Date.now() - t0,
      message:
        scan.tested === 0
          ? "ไม่พบคู่ที่ผ่านเกณฑ์ OU half-life (3-40 วัน) ในชุดข้อมูลนี้ — ปกติของตลาด side-way"
          : `พบ ${scan.tested} คู่ cointegrated (จาก ${scan.scanned} คู่ที่ผ่าน corr pre-filter)`,
    }
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
