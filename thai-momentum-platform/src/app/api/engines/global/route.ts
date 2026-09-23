// GET /api/engines/global — Global Engine Imports
// คืนผลทดสอบ engines ที่นำเข้าจากงานวิจัย/สนามทั่วโลก ทดสอบบนข้อมูล SET จริง
// ด้วยเกณฑ์ preregistered (ธรรมเนียมเดียวกับ Evidence Night)
// Cache: in-process ต่อ data snapshot (ผูกกับ pivot ของ loadPivots — fingerprint ข้อมูลเปลี่ยน = คำนวณใหม่) ที่ evaluate.ts

import { NextResponse } from "next/server"
import { runGlobalEngines } from "@/lib/research/global-engines/evaluate"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const report = await runGlobalEngines()
    return NextResponse.json(report)
  } catch (err) {
    console.error("[api/engines/global]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "internal error" },
      { status: 500 },
    )
  }
}
