import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import type { EngineRow, EnginesResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// GET /api/arb/engines
// สถานะ Alpha Stack v3 ทั้ง 4 engine + allocator — ตาม staging ต้นทุนข้อมูล
// Engine ไหนยังไม่มีข้อมูล = STANDBY (ไม่มีการเปิดทุนเดา ๆ ตาม pre-registered gates)
export async function GET() {
  const t0 = Date.now()
  try {
    const [futures, options, cross] = await Promise.all([
      db.futuresDaily.count().catch(() => 0),
      db.optionsDaily.count().catch(() => 0),
      db.crossAsset.count().catch(() => 0),
    ])

    const engines: EngineRow[] = [
      {
        key: "momentum",
        name: "Momentum core (Jev)",
        status: "ACTIVE",
        corrVsCore: "1.0",
        expected: "10-20%",
        maxDD: "-20%",
        capacity: "5-30 ลบ.",
        detail: "กลไกหลักของแพลตฟอร์ม — คัด top-30 ข้าม 7 timeframe + Jev decision brain",
        gates: [
          { label: "ข้อมูล RawDaily + Snapshot", pass: true },
          { label: "ผ่าน profit-engine GO/NO-GO", pass: null },
          { label: "PAPER mode ≥ 8-12 สัปดาห์", pass: null },
        ],
      },
      {
        key: "pairs",
        name: "Pairs Stat-Arb",
        status: "SHADOW",
        corrVsCore: "~0.2",
        expected: "6-12%",
        maxDD: "-10%",
        capacity: "3-10 ลบ.",
        detail: "ใช้ RawDaily เดิม 100% — shadow 8 สัปดาห์ก่อนเปิดทุน (ดู /api/arb/pairs)",
        gates: [
          { label: "realized Sharpe > 0.8 (shadow 8 สัปดาห์)", pass: null },
          { label: "hit rate > 52%", pass: null },
          { label: "hl คงที่ระหว่าง train/valid", pass: null },
        ],
      },
      {
        key: "basis",
        name: "Basis / Calendar Spread",
        status: futures > 0 ? "SHADOW" : "STANDBY",
        corrVsCore: "~0.1",
        expected: "4-8%",
        maxDD: "-5%",
        capacity: "10-50 ลบ.",
        detail:
          futures > 0
            ? "มีข้อมูล FuturesDaily แล้ว — ตรวจ basis z-calibration ก่อนเปิดทุน"
            : "ต้องเพิ่มตาราง FuturesDaily + ingest CSV จาก TFEX (combo margin ~1/10 ของ outright)",
        gates: [
          { label: "Ingest FuturesDaily (TFEX CSV)", pass: futures > 0 ? true : false },
          { label: "basis z-calibration ตรง", pass: null },
          { label: "q buffer ±0.5% กันปันผลพิเศษ", pass: null },
        ],
      },
      {
        key: "parity",
        name: "Parity + Dividend Arb",
        status: options > 0 ? "SHADOW" : "STANDBY",
        corrVsCore: "~0.0",
        expected: "2-4% (ล็อก)",
        maxDD: "-2%",
        capacity: "5-20 ลบ.",
        detail:
          options > 0
            ? "มี OptionsDaily — รัน alert engine 1 ฤดูปันผล (เม.ย.-พ.ค. / ส.ค.-ก.ย.) ก่อนเปิดทุน"
            : "ต้องมี OptionsDaily chain (executable bid/ask) + dividend forecast จาก payout 5 ปี",
        gates: [
          { label: "Ingest OptionsDaily", pass: options > 0 ? true : false },
          { label: "alert-only 1 ฤดูปันผล → นับ actionable + locked bps จริง", pass: null },
        ],
      },
      {
        key: "vrp",
        name: "VRP Iron Condor",
        status: options > 0 ? "SHADOW" : "STANDBY",
        corrVsCore: "~-0.1",
        expected: "6-12%",
        maxDD: "-12% (มีเพดาน)",
        capacity: "5-20 ลบ.",
        detail:
          options > 0
            ? "defined-risk เท่านั้น (condor) — risk/trade ≤ 1% equity, ไม่เปิดตอน risk_off"
            : "ต้องมี OptionsDaily (IV chain) — และวัด VRP จริง > 0 ต่อเนื่อง 3 เดือน",
        gates: [
          { label: "Ingest OptionsDaily", pass: options > 0 ? true : false },
          { label: "IV30 − realized30 > 0 ต่อเนื่อง 3 เดือน", pass: null },
          { label: "ivPct ≥ 0.45 ก่อนเปิดไม้", pass: null },
        ],
      },
    ]

    const res: EnginesResponse = {
      engines,
      allocator: {
        status: "LOCKED",
        unlock: "≥3 engines ผ่าน gate + weekly returns รวม ≥ 8 สัปดาห์",
        note: "alloc.ts พร้อม: HRP (cluster order → recursive bisection) + Kelly vector f*=0.5·Σ⁻¹μ — ปรับน้ำหนักรายเดือนจาก weekly returns ใน events เท่านั้น",
      },
      counts: { crossAsset: cross, futures, options },
      tookMs: Date.now() - t0,
    }
    return NextResponse.json(res)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
