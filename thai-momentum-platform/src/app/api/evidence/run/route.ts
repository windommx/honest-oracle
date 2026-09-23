// POST /api/evidence/run — รัน thai_fit (H1–H4) ตาม mode
//   mode = 'all' → รันครบ + auto-apply verdict ลง config_th (พร้อม audit Decision)
//                  ยกเว้น scan ไม่มีหลักฐานเลย (DB ว่าง / หุ้น liquid < 30 ตัวทุกวัน) → ไม่แตะ config
//                  ยกเว้นล็อกช่วงเก็บผลจริงอยู่ (src/lib/research/freeze.ts) → อ่านอย่างเดียว (frozen=true, applied=false)
//   mode = 'scan' | 'reversal' | 'tom' → รันเฉพาะส่วนนั้น ไม่แตะ config
// ทำไมล็อกแล้ว "รันแบบอ่านอย่างเดียว" ไม่ใช่ 409: route มีเส้นทางไม่ apply อยู่แล้ว (รูปคำตอบเดิม applied:false) ·
// ผลรันเป็นงานวิจัย (ResearchRun — นับเป็น trial ตามโปรโตคอล) ไม่ใช่กติกาที่ Jev อ่าน · 409 จะผลักให้ปลดล็อกเพียงเพื่อดู H1–H4

import { NextResponse } from "next/server"
import { runThaiFit, scanHasEvidence, type ThaiFitMode } from "@/lib/research/thai-fit"
import { applyVerdict, getConfigTh, type ThaiConfig } from "@/lib/config/thai-config"
import { liveFreezeFlag } from "@/lib/research/freeze"
import type { ThaiFitReport } from "@/lib/research/thai-fit"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const MODES: ThaiFitMode[] = ["all", "scan", "reversal", "tom"]

export async function POST(req: Request) {
  try {
    let body: { mode?: string } = {}
    try {
      const parsed: unknown = await req.json()
      // body ว่าง/เสีย/ไม่ใช่ object (เช่น null) → ใช้ค่า default เหมือนกันทุกกรณี
      body = parsed && typeof parsed === "object" ? (parsed as { mode?: string }) : {}
    } catch {
      body = {}
    }
    const mode = (body.mode ?? "all") as ThaiFitMode
    if (!MODES.includes(mode)) {
      return NextResponse.json(
        { error: "mode ต้องเป็น all | scan | reversal | tom" },
        { status: 400 }
      )
    }

    const report: ThaiFitReport = await runThaiFit(mode)
    // เช็กล็อก "หลัง" รันเสร็จ (ก่อน apply ทันที) — ล็อกที่เกิดระหว่างรัน thai_fit ก็ยังกันได้
    const freeze = await liveFreezeFlag()

    if (mode === "all") {
      if (freeze.frozen) {
        const config: ThaiConfig = await getConfigTh()
        return NextResponse.json({
          ok: true,
          report,
          applied: false,
          frozen: true,
          frozenAt: freeze.frozenAt,
          freezeDrift: freeze.freezeDrift,
          config,
          message:
            `🔒 ล็อกช่วงเก็บผลจริงอยู่${freeze.frozenAt ? ` (ตั้งแต่ ${freeze.frozenAt.slice(0, 10)})` : ""} — ` +
            "รันแบบอ่านอย่างเดียว: บันทึกผลรันแล้ว แต่ไม่ auto-apply config_th (ระบบเทรดใช้กติกาที่ล็อกไว้ต่อ)",
        })
      }
      if (!scanHasEvidence(report.scan)) {
        // verdict ที่ได้จาก n=0 ไม่ใช่หลักฐาน — ห้ามเปลี่ยน config ที่ระบบเทรดอ่าน
        const config: ThaiConfig = await getConfigTh()
        return NextResponse.json({
          ok: true,
          report,
          applied: false,
          frozen: false,
          config,
          message:
            "ข้อมูลไม่พอทดสอบ H1/H4 (ไม่มีวันไหนมีหุ้น liquid ครบ 30 ตัว) — ไม่ auto-apply config (คงค่าเดิม)",
        })
      }
      const config: ThaiConfig = await applyVerdict(report)
      return NextResponse.json({ ok: true, report, applied: true, frozen: false, config })
    }
    const config: ThaiConfig = await getConfigTh()
    return NextResponse.json({ ok: true, report, applied: false, frozen: freeze.frozen, config })
  } catch (e) {
    return NextResponse.json(
      { error: "รัน thai_fit ไม่สำเร็จ: " + (e as Error).message },
      { status: 500 }
    )
  }
}
