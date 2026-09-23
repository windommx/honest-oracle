// GET /api/gtaa/overview — ภาพรวมโมดูล GTAA Rotation (Faber)
// คืน: แหล่งข้อมูล, ผล backtest config default, สัญญาณเดือนล่าสุด, self-test, quality gate,
//      สถานะมหภาค (macro gate) + ระดับความพร้อม (readiness) ของโมดูล

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { loadPanel } from "@/lib/gtaa/data"
import { runBacktest } from "@/lib/gtaa/backtest"
import { runSelfTests } from "@/lib/gtaa/selftest"
import { checkQuality } from "@/lib/gtaa/quality"
import { computeMacroState } from "@/lib/gtaa/macro"
import { GTAA_UNIVERSE } from "@/lib/gtaa/defaults"
import { configHash } from "@/lib/gtaa/store"
import { DEFAULT_GTAA_CONFIG, type GtaaOverview, type GtaaReadiness } from "@/lib/gtaa/types"

export const dynamic = "force-dynamic"

const FETCH_NOTE =
  "sandbox นี้บล็อก egress ไปยังผู้ให้บริการข้อมูลการเงิน (Yahoo 429 · Stooq ปิด CSV endpoint) — ใช้ช่องทางอัปโหลด CSV หรือรัน `bun run gtaa -- fetch` บนเครื่องที่เน็ตปกติแล้ว commit ไฟล์ data/gtaa/panel.json"

/**
 * ระดับความพร้อม (ลงทะเบียนล่วงหน้า):
 * - experimental : ข้อมูลสังเคราะห์ / self-test ไม่ผ่าน / quality ไม่ผ่าน — ห้ามใช้ตัวเลขตัดสินใจจริง
 * - verified     : ข้อมูลจริง + quality PASS + self-test ผ่านทั้งหมด
 * - certified    : verified + มี snapshot สัญญาณใน tracking log ตรงเดือนปิดข้อมูลล่าสุด (มนุษย์กำลังใช้จริง)
 */
async function computeReadiness(args: {
  isReal: boolean
  selfTestsPass: boolean
  qualityOk: boolean | null
  latestDecisionMonth: string
  defaultConfigHash: string
}): Promise<GtaaReadiness> {
  const reasons: string[] = []
  let level: GtaaReadiness["level"] = "verified"

  if (!args.isReal) {
    level = "experimental"
    reasons.push("ข้อมูลยังเป็น synthetic — หาข้อมูลจริงผ่านชั้นข้อมูลก่อน")
  }
  if (!args.selfTestsPass) {
    level = "experimental"
    reasons.push("self-test ไม่ผ่านทั้งหมด — ห้ามใช้ตัวเลขจาก engine")
  }
  if (args.qualityOk === false) {
    level = "experimental"
    reasons.push("quality gate ไม่ผ่าน — ข้อมูลมีรู/กระโดดผิดปกติ")
  }
  if (level === "verified") reasons.push("ข้อมูลจริง + quality PASS + self-test ผ่านทั้งหมด")

  // certified = มี snapshot สัญญาณลง tracking log ตรงเดือนปิดข้อมูลล่าสุด (มนุษย์กำลังติดตามจริง)
  if (level === "verified" && args.latestDecisionMonth !== "—") {
    try {
      const snap = await db.gtaaSignal.findUnique({
        where: { decisionMonth_configHash: { decisionMonth: args.latestDecisionMonth, configHash: args.defaultConfigHash } },
        select: { id: true },
      })
      if (snap) {
        level = "certified"
        reasons.push(`มี snapshot สัญญาณเดือน ${args.latestDecisionMonth} ใน tracking log — สัญญาณถูกใช้ตามพิธี`)
      } else {
        reasons.push(`ยังไม่ได้บันทึก snapshot เดือน ${args.latestDecisionMonth} — กด "บันทึกสัญญาณเดือนนี้" เพื่อขึ้นระดับ certified`)
      }
    } catch {
      // DB ไม่พร้อม — คงระดับ verified (ไม่ทำให้โมดูลพัง)
    }
  }
  return { level, reasons }
}

export async function GET() {
  try {
    const { panel, fromFile } = await loadPanel()
    const cfg = DEFAULT_GTAA_CONFIG
    const run = runBacktest(panel, cfg)
    const selfTests = runSelfTests()
    const quality = fromFile ? checkQuality(panel) : null
    const macro = computeMacroState(panel, cfg)

    const readiness = await computeReadiness({
      isReal: panel.meta.source !== "synthetic",
      selfTestsPass: selfTests.every((t) => t.pass),
      qualityOk: quality ? quality.ok : null,
      latestDecisionMonth: run.lastDecisionMonth,
      defaultConfigHash: configHash(cfg),
    })

    const overview: GtaaOverview = {
      source: panel.meta,
      config: cfg,
      universe: GTAA_UNIVERSE,
      run,
      selfTests,
      selfTestPass: selfTests.filter((t) => t.pass).length,
      selfTestTotal: selfTests.length,
      quality,
      fetchNote: FETCH_NOTE,
      macro,
      readiness,
    }
    return NextResponse.json(overview)
  } catch (err) {
    console.error("[api/gtaa/overview]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    )
  }
}
