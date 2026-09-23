// /api/gtaa/snapshot — บันทึกสัญญาณเดือนล่าสุดลง tracking log (DB)
// POST   → upsert GtaaSignal (decisionMonth × configHash) + EventLog  → { saved, id, decisionMonth, configHash, macro }
// DELETE → ลบ snapshot ตาม id (แก้ความผิดพลาดอย่างเปิดเผย — ยิง audit event ทุกครั้ง)

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import { loadPanel } from "@/lib/gtaa/data"
import { computeMacroState } from "@/lib/gtaa/macro"
import { persistSignalSnapshot } from "@/lib/gtaa/store"
import { sanitizeConfig } from "@/lib/gtaa/defaults"
import type { GtaaSnapshotRequest, GtaaSnapshotResponse } from "@/lib/gtaa/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    // body ต้องเป็นออบเจ็กต์ — JSON "null"/ตัวเลข/ข้อความ = ใช้ config default (ไม่ใช่ 500)
    const raw = (await req.json().catch(() => null)) as unknown
    const body = (raw && typeof raw === "object" ? raw : {}) as GtaaSnapshotRequest
    const cfg = sanitizeConfig(body.config)
    const { panel } = await loadPanel()
    const macro = computeMacroState(panel, cfg)
    const result = await persistSignalSnapshot(panel, cfg, { actor: "user", macro })
    const response: GtaaSnapshotResponse = {
      saved: true,
      id: result.id,
      decisionMonth: result.decisionMonth,
      configHash: result.configHash,
      updated: result.updated,
      macro,
    }
    return NextResponse.json(response)
  } catch (err) {
    console.error("[api/gtaa/snapshot POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const id = Number(new URL(req.url).searchParams.get("id") ?? "0")
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "ต้องระบุ id ที่ถูกต้อง" }, { status: 400 })
    }
    const row = await db.gtaaSignal.findUnique({ where: { id } })
    if (!row) return NextResponse.json({ error: "ไม่พบ snapshot นี้" }, { status: 404 })
    await db.gtaaSignal.delete({ where: { id } })
    await emitEvent("gtaa", "user", {
      type: "signal_snapshot_delete",
      id,
      decisionMonth: row.decisionMonth,
      configHash: row.configHash,
    })
    return NextResponse.json({ deleted: true, id })
  } catch (err) {
    console.error("[api/gtaa/snapshot DELETE]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "internal error" }, { status: 500 })
  }
}
