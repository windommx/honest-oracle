import { NextResponse } from "next/server"
import { TH_STRATEGY } from "@/lib/config/thai"
import type { ImportanceResponse } from "@/lib/momentum/contracts"
import { purgedPermutationImportance } from "@/lib/research/importance"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/research/importance?hold=8&nRepeats=3
// → Purged Permutation Importance ของฟีเจอร์ meta v2 คำนวณข้าม CPCV paths
//   (standardize ด้วยสถิติ train, permute ทีละฟีเจอร์, วัด AUC drop)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const num = (key: string, d: number, min: number, max: number): number => {
      const raw = url.searchParams.get(key)
      if (raw === undefined || raw === null || raw === "") return d
      const v = Number(raw)
      if (!isFinite(v) || v < min || v > max) return d
      return v
    }
    const hold = Math.round(num("hold", TH_STRATEGY.hold, 2, 60))
    const nRepeats = Math.round(num("nRepeats", 3, 1, 10))

    const result = await purgedPermutationImportance({ hold, nRepeats })
    return NextResponse.json<ImportanceResponse>(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
