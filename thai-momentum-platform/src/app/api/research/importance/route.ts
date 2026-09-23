import { NextResponse } from "next/server"
import { TH_STRATEGY } from "@/lib/config/thai"
import type { ImportanceResponse } from "@/lib/momentum/contracts"
import { purgedPermutationImportanceCached } from "@/lib/research/importance"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// GET /api/research/importance?hold=8&nRepeats=3
// → Purged Permutation Importance ของฟีเจอร์ meta v2 คำนวณข้าม CPCV paths
//   (standardize ด้วยสถิติ train, permute ทีละฟีเจอร์, วัด AUC drop)
// ผลถูก cache ในโปรเซสต่อ (ลายนิ้วมือข้อมูล × hold × nRepeats) — ครั้งแรกหลังข้อมูลเปลี่ยน ≈ 5 วินาที ครั้งต่อไป ≈ ms
// body เหมือนเดิมทุกไบต์ (tookMs = เวลาคำนวณจริงของผลนั้น) · header X-Cache: HIT | MISS บอกว่ามาจาก cache หรือไม่
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

    const { result, cache } = await purgedPermutationImportanceCached({ hold, nRepeats })
    return NextResponse.json<ImportanceResponse>(result, {
      headers: { "X-Cache": cache === "hit" ? "HIT" : "MISS" },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
