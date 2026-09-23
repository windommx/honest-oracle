import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot } from "@/lib/momentum/core"
import type { VerifyBucket, VerifyResponse } from "@/lib/momentum/contracts"
import { forwardReturnPct } from "@/lib/portfolio/returns"

export const dynamic = "force-dynamic"

const round3 = (x: number) => Math.round(x * 1000) / 1000

// GET /api/verify?hold=10 → เติม outcome (forward return %) ให้ Q_ENTRY ที่ executed แล้ว
// และสรุป calibration ของ conf เป็น bucket + Brier score
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const raw = Number.parseInt(url.searchParams.get("hold") ?? "", 10)
    const hold = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 300) : 10

    const pivot = await closePivot()

    // 1) เติม outcome ให้ decision ที่ยังไม่มีผล
    const open = await db.decision.findMany({
      where: { question: "Q_ENTRY", executed: true, outcome: null },
    })
    for (const d of open) {
      const i = pivot.dateIdx.get(d.date)
      const s = pivot.symIdx.get(d.target)
      if (i === undefined || s === undefined) continue
      // ราคาปลายทาง = ราคาปิดล่าสุดที่มีจริงภายใน (i, i+hold] — หุ้นพักการซื้อขายวันครบกำหนด
      // หรือหยุดซื้อขายกลางทางเคยไม่ถูกวัดผลตลอดไป (calibration เอียงแบบ survivorship)
      const fwd = forwardReturnPct(pivot.px, i, s, hold)
      if (fwd === null) continue
      const outcome = round3(fwd)
      await db.decision.update({ where: { id: d.id }, data: { outcome } })
    }

    // 2) bucket calibration จากทุก Q_ENTRY ที่มี outcome แล้ว
    const scored = (
      await db.decision.findMany({ where: { question: "Q_ENTRY", outcome: { not: null } } })
    ).filter((r) => r.outcome !== null)

    const defs: { range: string; lo: number; hi: number; last: boolean }[] = [
      { range: "<0.50", lo: 0, hi: 0.5, last: false },
      { range: "0.50–0.69", lo: 0.5, hi: 0.7, last: false },
      { range: "0.70–0.84", lo: 0.7, hi: 0.85, last: false },
      { range: "0.85+", lo: 0.85, hi: 1.0001, last: true },
    ]
    const buckets: VerifyBucket[] = defs.map((def) => {
      const rows = scored.filter((r) => r.conf >= def.lo && (def.last ? r.conf <= def.hi : r.conf < def.hi))
      const n = rows.length
      const wins = rows.filter((r) => (r.outcome as number) > 0).length
      return {
        range: def.range,
        n,
        winRate: n > 0 ? round3(wins / n) : null,
        avgConf: n > 0 ? round3(rows.reduce((a, r) => a + r.conf, 0) / n) : 0,
      }
    })

    // 3) Brier score: mean((conf - hit)^2), hit = outcome > 0
    let brier: number | null = null
    if (scored.length > 0) {
      const sum = scored.reduce((a, r) => {
        const hit = (r.outcome as number) > 0 ? 1 : 0
        return a + (r.conf - hit) ** 2
      }, 0)
      brier = Math.round((sum / scored.length) * 10000) / 10000
    }

    return NextResponse.json<VerifyResponse>({ buckets, brier, total: scored.length })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
