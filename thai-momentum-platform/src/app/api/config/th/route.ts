// GET  /api/config/th — อ่าน config กลยุทธ์หุ้นไทย (config-as-data)
// PUT  /api/config/th — แก้ config บางส่วน (human) + ผนวก history + EventLog

import { NextResponse } from "next/server"
import {
  getConfigTh,
  saveConfigTh,
  ConfigValidationError,
  type ThaiConfig,
} from "@/lib/config/thai-config"

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
    let body: Record<string, unknown> = {}
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 })
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
    const note = typeof body.note === "string" ? body.note : undefined

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
