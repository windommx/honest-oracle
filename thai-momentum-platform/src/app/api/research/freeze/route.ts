// GET  /api/research/freeze — สถานะล็อกช่วงเก็บผลจริง + hash ปัจจุบัน + drift (อ่านอย่างเดียว ผู้ชมเปิดได้)
// POST /api/research/freeze
//   {action:"freeze", note}                       → ล็อก config_th / signals_policy / stops_policy / meta_model / prereg
//                                                   ด้วย sha256 ของค่าที่ใช้อยู่ (ล็อกอยู่แล้ว = 409)
//   {action:"unfreeze", confirm:"UNFREEZE", reason} → ปลดล็อก (ไม่มี confirm = 409) — จบ trial ที่ลงทะเบียนไว้
// ทั้งสองบันทึก EventLog "live_freeze" (hash chain) พร้อม hash — การเขียนผ่าน src/proxy.ts (ผู้ดูแล + same-origin + JSON)
// เหตุผลและกลไก: src/lib/research/freeze.ts · docs/research/evidence-protocol.md ขั้น 3

import { NextResponse } from "next/server"
import { emitEvent } from "@/lib/research/events"
import {
  clearLiveFreeze,
  getLiveFreezeStatus,
  LIVE_FREEZE_EVENT,
  normalizeText,
  REASON_MAX,
  UNFREEZE_CONFIRM,
  writeLiveFreeze,
  type LiveFreeze,
  type LiveFreezeStatus,
} from "@/lib/research/freeze"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json<LiveFreezeStatus>(await getLiveFreezeStatus())
  } catch (e) {
    return NextResponse.json({ error: "โหลดสถานะล็อกไม่สำเร็จ: " + (e as Error).message }, { status: 500 })
  }
}

const isUniqueViolation = (e: unknown) => (e as { code?: unknown })?.code === "P2002"

async function freeze(body: Record<string, unknown>) {
  const note = normalizeText(body.note)
  if (!note) {
    return NextResponse.json(
      { error: "ต้องเขียนสมมติฐาน/บันทึก (note) ก่อนล็อก — สมมติฐานหลักข้อเดียว + ตัวชี้วัดหลักตัวเดียว (evidence-protocol ขั้น 3)" },
      { status: 400 },
    )
  }
  const cur = await getLiveFreezeStatus()
  const alreadyFrozen = () =>
    NextResponse.json(
      {
        error: `ล็อกอยู่แล้ว${cur.freeze ? `ตั้งแต่ ${cur.freeze.frozenAt.slice(0, 10)}` : ""} — ต้องปลดล็อกก่อนจึงล็อกชุดใหม่ได้ (การล็อกใหม่ = เริ่ม trial ใหม่)`,
        code: "already_frozen",
      },
      { status: 409 },
    )
  if (cur.frozen) return alreadyFrozen()
  const record: LiveFreeze = {
    v: 1,
    frozenAt: new Date().toISOString(),
    dataDate: cur.current.dataDate,
    note,
    hashes: cur.current.hashes,
    preregHash: cur.current.preregHash,
  }
  try {
    await writeLiveFreeze(record)
  } catch (e) {
    if (isUniqueViolation(e)) return alreadyFrozen() // ล็อกพร้อมกันสองคำขอ — คำขอแรกชนะ
    throw e
  }
  await emitEvent(LIVE_FREEZE_EVENT, "human", { action: "freeze", ...record })
  return NextResponse.json({ ok: true, ...(await getLiveFreezeStatus()) })
}

async function unfreeze(body: Record<string, unknown>) {
  if (body.confirm !== UNFREEZE_CONFIRM) {
    return NextResponse.json(
      {
        error:
          `การปลดล็อก = จบช่วงเก็บผลที่ลงทะเบียนไว้ กติกาที่เปลี่ยนหลังจากนี้นับเป็น trial ใหม่ — ` +
          `ยืนยันโดยส่ง {"confirm":"${UNFREEZE_CONFIRM}"} พร้อมเหตุผล (reason)`,
        code: "confirm_required",
        confirmRequired: UNFREEZE_CONFIRM,
      },
      { status: 409 },
    )
  }
  const reason = normalizeText(body.reason, REASON_MAX)
  if (!reason) {
    return NextResponse.json({ error: "ต้องระบุเหตุผลที่ปลดล็อก (reason) — บันทึกลง EventLog คู่กับการปลดล็อก" }, { status: 400 })
  }
  const cur = await getLiveFreezeStatus()
  const notFrozen = () => NextResponse.json({ error: "ยังไม่ได้ล็อก — ไม่มีอะไรให้ปลดล็อก", code: "not_frozen" }, { status: 409 })
  if (!cur.frozen) return notFrozen()
  if (!(await clearLiveFreeze())) return notFrozen() // ปลดล็อกพร้อมกันสองคำขอ — คำขอแรกชนะ
  await emitEvent(LIVE_FREEZE_EVENT, "human", {
    action: "unfreeze",
    reason,
    frozenAt: cur.freeze?.frozenAt ?? null,
    dataDate: cur.freeze?.dataDate ?? null,
    hashes: cur.freeze?.hashes ?? null,
    current: cur.current.hashes,
    drift: cur.drift.map((d) => d.key),
    corrupt: cur.corrupt,
  })
  return NextResponse.json({ ok: true, ...(await getLiveFreezeStatus()) })
}

export async function POST(req: Request) {
  try {
    let parsed: unknown
    try {
      parsed = await req.json()
    } catch {
      return NextResponse.json({ error: "body ต้องเป็น JSON" }, { status: 400 })
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "body ต้องเป็น JSON object" }, { status: 400 })
    }
    const body = parsed as Record<string, unknown>
    if (body.action === "freeze") return await freeze(body)
    if (body.action === "unfreeze") return await unfreeze(body)
    return NextResponse.json({ error: 'action ต้องเป็น "freeze" หรือ "unfreeze"' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: "บันทึกสถานะล็อกไม่สำเร็จ: " + (e as Error).message }, { status: 500 })
  }
}
