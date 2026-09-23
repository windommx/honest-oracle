// GET  /api/config/th — อ่าน config กลยุทธ์หุ้นไทย (config-as-data)
// PUT  /api/config/th — แก้ config บางส่วน (human) + ผนวก history + EventLog
//                       ล็อกช่วงเก็บผลจริงอยู่ (src/lib/research/freeze.ts) → 409 code "live_frozen" ไม่แตะ config

import { NextResponse } from "next/server"
import {
  getConfigTh,
  saveConfigTh,
  ConfigValidationError,
  type ThaiConfig,
} from "@/lib/config/thai-config"
import { frozenWriteError, liveFreezeFlag } from "@/lib/research/freeze"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const config: ThaiConfig = await getConfigTh()
    return NextResponse.json({ config })
  } catch (e) {
    return NextResponse.json(
      { error: "โหลด config ไม่สำเร็จ: " + (e as Error).message },
      { status: 500 }
    )
  }
}

export async function PUT(req: Request) {
  try {
    // config_th = กติกาที่ Jev อ่าน — ล็อกอยู่ห้ามแก้ทุกกรณี (ไม่ว่า body จะถูกหรือผิด)
    const freeze = await liveFreezeFlag()
    if (freeze.frozen) {
      return NextResponse.json(
        { error: frozenWriteError("แก้ config_th", freeze), code: "live_frozen", frozenAt: freeze.frozenAt },
        { status: 409 }
      )
    }
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 })
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "body ต้องเป็น JSON object" }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (body.tfWeights !== undefined) patch.tfWeights = body.tfWeights
    if (body.holdDefault !== undefined) patch.holdDefault = body.holdDefault
    if (body.calendarOverlay !== undefined) patch.calendarOverlay = body.calendarOverlay
    if (body.reversalEnabled !== undefined) patch.reversalEnabled = body.reversalEnabled
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { error: "ไม่มีฟิลด์ที่อัปเดตได้ (tfWeights / holdDefault / calendarOverlay / reversalEnabled)" },
        { status: 400 }
      )
    }
    // note ถูกเก็บลง history ใน config (ส่งกลับทุก GET) — จำกัดความยาวกัน payload บวม
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined

    const config: ThaiConfig = await saveConfigTh(patch, "human", note)
    return NextResponse.json({ ok: true, config })
  } catch (e) {
    if (e instanceof ConfigValidationError) {
      return NextResponse.json({ error: e.message }, { status: 400 })
    }
    return NextResponse.json(
      { error: "บันทึก config ไม่สำเร็จ: " + (e as Error).message },
      { status: 500 }
    )
  }
}
