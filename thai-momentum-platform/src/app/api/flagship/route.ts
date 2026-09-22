import { NextResponse } from "next/server"
import { runFlagshipFunnel } from "@/lib/flagship/funnel"
import type { FlagshipResponse } from "@/lib/flagship/types"

export const dynamic = "force-dynamic"
export const maxDuration = 120

// GET /api/flagship → สัญญาณเรือธง: คัดกรองครบทุกกระบวนการ → อันดับ 1–10
// รวมผลจาก 6 เอนจิน: Signals panel + Regime + GTAA Macro + Circuit Breaker +
// SET Sniper Confluence + IC Harness policy — cache ตาม data fingerprint
export async function GET() {
  try {
    const res: FlagshipResponse = await runFlagshipFunnel()
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
