import { NextResponse } from "next/server"
import { getPanelCached, readSignalsPolicy } from "@/lib/momentum/signals/io"
import type { SignalsResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET /api/signals → panel ล่าสุด + series ย้อนหลัง 250 วัน สำหรับ UI tab "สัญญาณ"
export async function GET() {
  const t0 = Date.now()
  try {
    const panel = await getPanelCached()
    const policy = await readSignalsPolicy()
    const market = panel.market.slice(-250)
    const latestDate = panel.dates[panel.dates.length - 1] ?? null
    const last = panel.market[panel.market.length - 1]

    const stockToday = latestDate
      ? (panel.byDateStock.get(latestDate) ?? []).slice(0, 60)
      : []

    const last180 = panel.dates.slice(-180)
    const startIdx = panel.dates.length - last180.length
    const sectors = panel.sectors.map((s) => ({
      name: s.name,
      rotZ: s.rotZ,
      rank: s.rank,
      share: s.series.slice(startIdx).map((v, i) => ({ date: last180[i], v: isFinite(v) ? v : 0 })),
    }))

    const res: SignalsResponse = {
      latest: latestDate,
      market,
      stockToday,
      sectors,
      label: last?.label ?? "neutral",
      regimeScore: last?.regimeScore ?? 0,
      grossMult: last?.grossMult ?? 1,
      policy: policy
        ? {
            promoted: policy.promoted,
            weights: policy.weights as unknown as Record<string, number>,
            v2: policy.v2,
            updatedAt: policy.updatedAt,
          }
        : null,
      tookMs: Date.now() - t0,
    }
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
