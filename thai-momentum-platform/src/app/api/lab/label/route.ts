import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const LABELS = new Set(["ENTER_LONG", "NO_TRADE"])
const REASONS = new Set([
  "TRIG_WEAK",
  "ZONE_THIN",
  "REGIME_BORDER",
  "NEWS_OVERHANG",
  "FOMO_URGE",
  "FEAR_URGE",
  "DATA_GAP",
  "OTHER",
])
const GUTS = new Set(["ENTER", "NO_TRADE", ""])

// POST /api/lab/label
// body { logKey, gut, label, reason, confLabel } — พิธี 5 นาที/สัปดาห์ (ground truth มนุษย์)
export async function POST(req: Request) {
  try {
    const raw: unknown = await req.json().catch(() => null)
    const body = (raw !== null && typeof raw === "object" ? raw : {}) as {
      logKey?: unknown
      gut?: unknown
      label?: unknown
      reason?: unknown
      confLabel?: unknown
    }

    // ---- validate ทีละชั้น (ข้อความไทยกลับไปให้ UI แสดง) ----
    if (typeof body.logKey !== "string" || body.logKey.length === 0) {
      return NextResponse.json({ error: "ต้องส่ง logKey ของ ShadowLog ที่ต้องการ label" }, { status: 400 })
    }
    const log = await db.shadowLog.findUnique({ where: { key: body.logKey } })
    if (!log) {
      return NextResponse.json({ error: `ไม่พบ ShadowLog key=${body.logKey}` }, { status: 400 })
    }
    if (typeof body.label !== "string" || !LABELS.has(body.label)) {
      return NextResponse.json({ error: "label ต้องเป็น ENTER_LONG หรือ NO_TRADE" }, { status: 400 })
    }
    if (typeof body.reason !== "string" || !REASONS.has(body.reason)) {
      return NextResponse.json(
        { error: "reason ต้องเป็น TRIG_WEAK | ZONE_THIN | REGIME_BORDER | NEWS_OVERHANG | FOMO_URGE | FEAR_URGE | DATA_GAP | OTHER" },
        { status: 400 }
      )
    }
    const gut = typeof body.gut === "string" && GUTS.has(body.gut) ? body.gut : ""
    const confLabel = typeof body.confLabel === "number" && Number.isInteger(body.confLabel) ? body.confLabel : NaN
    if (!(confLabel >= 1 && confLabel <= 5)) {
      return NextResponse.json({ error: "confLabel ต้องเป็นจำนวนเต็ม 1-5" }, { status: 400 })
    }

    await db.edgeLabel.upsert({
      where: { logKey: log.key },
      create: {
        logKey: log.key,
        date: log.date,
        asset: log.asset,
        rule: log.ruleAction,
        nimble: log.nimbleAction,
        gut,
        label: body.label,
        reason: body.reason,
        confLabel,
      },
      update: {
        gut,
        label: body.label,
        reason: body.reason,
        confLabel,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: `บันทึก label ไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 })
  }
}
