import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"
import { TH_STRATEGY } from "@/lib/config/thai"
import type { AbBucket, AbResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const COST_BPS = 55 // ต้นทุนรวมต่อขา (commission + slippage) ตาม A/B shadow กติกา

// GET /api/signals/ab?hold=8
// A/B shadow: เทียบ outcome ของกฎเดิม (Decision source='lite' executed buy)
// กับกฎใหม่ (source='lite+v2-shadow') — paired ที่ (date,symbol) เดียวกัน
// กติกาโปรโมท (pre-registered): paired n≥100 และ meanDiff>0 หลัง cost 55bps
export async function GET(req: Request) {
  try {
    const holdRaw = Number(new URL(req.url).searchParams.get("hold") ?? TH_STRATEGY.hold)
    const hold = isFinite(holdRaw) ? Math.min(60, Math.max(2, Math.round(holdRaw))) : TH_STRATEGY.hold

    const rows = await db.decision.findMany({
      where: { question: "Q_ENTRY", action: "buy", source: { in: ["lite", "lite+v2-shadow"] } },
      orderBy: [{ date: "asc" }, { target: "asc" }],
    })
    const pivot = await closePivot()

    const fwdRet = (date: string, symbol: string): number | null => {
      const pi = pivot.dateIdx.get(date)
      const si = pivot.symIdx.get(symbol)
      if (pi === undefined || si === undefined) return null
      if (pi + hold >= pivot.dates.length) return null
      const p0 = pivot.px[pi][si]
      const p1 = pivot.px[pi + hold][si]
      if (!isFinite(p0) || !isFinite(p1) || p0 <= 0) return null
      return (p1 / p0 - 1) * 100
    }

    const bucket = (src: string): AbBucket | null => {
      const rets: number[] = []
      for (const d of rows) {
        if (d.source !== src) continue
        const r = fwdRet(d.date, d.target)
        if (r === null) continue
        rets.push(r - COST_BPS / 100) // ตัด cost เป็น % ต่อรอบ (55bps)
      }
      if (rets.length === 0) return null
      const wins = rets.filter((r) => r > 0).length
      return {
        n: rets.length,
        winRate: wins / rets.length,
        meanRet: rets.reduce((a, b) => a + b, 0) / rets.length,
      }
    }

    const v1 = bucket("lite")
    const v2 = bucket("lite+v2-shadow")

    // paired diff: คู่ (date,symbol) ที่มีทั้งสองถัง
    let paired = { n: 0, meanDiff: 0, winRateDiff: 0 }
    if (v1 && v2) {
      const v1map = new Map<string, number>()
      const v2map = new Map<string, number>()
      for (const d of rows) {
        if (d.source === "lite") v1map.set(d.date + "|" + d.target, fwdRet(d.date, d.target) ?? NaN)
        if (d.source === "lite+v2-shadow")
          v2map.set(d.date + "|" + d.target, fwdRet(d.date, d.target) ?? NaN)
      }
      const diffs: number[] = []
      const v1wins: number[] = []
      const v2wins: number[] = []
      for (const [k, r1] of v1map) {
        const r2 = v2map.get(k)
        if (r2 === undefined || !isFinite(r1) || !isFinite(r2)) continue
        diffs.push(r2 - r1)
        v1wins.push(r1 > 0 ? 1 : 0)
        v2wins.push(r2 > 0 ? 1 : 0)
      }
      if (diffs.length > 0) {
        paired = {
          n: diffs.length,
          meanDiff: diffs.reduce((a, b) => a + b, 0) / diffs.length,
          winRateDiff:
            (v2wins.reduce((a, b) => a + b, 0) / diffs.length) -
            (v1wins.reduce((a, b) => a + b, 0) / diffs.length),
        }
      }
    }

    const readyToPromote = paired.n >= 100 && paired.meanDiff > 0
    // ถังว่างแต่มี decision อยู่แล้ว = ยังวัดผลไม่ได้ (ยังไม่ครบ hold วัน / ไม่มีราคาอ้างอิง) — ไม่ใช่ "ยังไม่ได้รัน Jev"
    const nOf = (src: string): number => rows.filter((d) => d.source === src).length
    const waiting = (n: number, who: string): string =>
      `มี decision ${who} ${n} แถวแล้ว แต่ยังคำนวณผลไม่ได้ — ต้องรอครบ ${hold} วันทำการ (หรือไม่มีราคาของหุ้น/วันนั้น)`
    const message = !v1
      ? nOf("lite") > 0
        ? waiting(nOf("lite"), "กฎเดิม (v1)")
        : "ยังไม่มีถัง v1 (รัน Jev ก่อนเพื่อสร้าง decisions)"
      : !v2
        ? nOf("lite+v2-shadow") > 0
          ? waiting(nOf("lite+v2-shadow"), "shadow (v2)")
          : "ยังไม่มีถัง shadow — รัน Jev เมื่อเปิด Signals v2 แล้วระบบจะ log คู่ขนานให้เอง"
        : readyToPromote
          ? "ผ่านเกณฑ์โปรโมท → เปิด SIGNALS_V2 ถาวรได้"
          : `รอสะสมผล: paired ${paired.n}/100 · meanDiff ${paired.meanDiff.toFixed(2)}% (ต้อง > 0)`

    const res: AbResponse = {
      hold,
      costBps: COST_BPS,
      v1,
      v2,
      paired,
      promotionRule: "paired n≥100 && meanDiff>0 หลัง cost 55bps → โปรโมท V2 ถาวร",
      readyToPromote,
      message,
    }
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
