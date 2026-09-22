import { NextResponse } from "next/server"
import { emitEvent } from "@/lib/research/events"
import {
  freezePrereg,
  getPrereg,
  parseTrialParams,
  resetPrereg,
} from "@/lib/research/prereg"
import type { PreregResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

// GET /api/research/prereg → กติกาที่ freeze ไว้ (null = ยังไม่ล็อก)
export async function GET() {
  try {
    const prereg = await getPrereg()
    return NextResponse.json<PreregResponse>({ prereg })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/research/prereg
//  body: { reset: true }                  → ล็อกใหม่ (ลบของเดิม)
//  body: { params: {...} } | {}           → freeze ด้วยพารามิเตอร์ที่ให้ (หรือ default)
export async function POST(req: Request) {
  try {
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      body = {}
    }
    if (body.reset === true) {
      await resetPrereg()
      await emitEvent("research", "human", { action: "prereg_reset" })
      return NextResponse.json<PreregResponse>({ prereg: null })
    }
    const raw = (body.params ?? {}) as Record<string, unknown>
    const { params, errors } = parseTrialParams(raw)
    if (!params) {
      return NextResponse.json({ error: `พารามิเตอร์ไม่ถูกต้อง: ${errors.join(", ")}` }, { status: 400 })
    }
    const prereg = await freezePrereg(params)
    await emitEvent("research", "human", {
      action: "prereg_freeze",
      hash: prereg.hash.slice(0, 12),
      params,
    })
    return NextResponse.json<PreregResponse>({ prereg })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
