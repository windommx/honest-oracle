// GET /api/ops/pulse — Operations Pulse ของ Command Center
// คืน: วันที่ผู้ใช้ (ICT), นับถอยหลังสู่รอบตัดสินใจ GTAA ถัดไป (สิ้นเดือน),
//      เช็กลิสต์ประจำเดือนแบบ "ลงทะเบียนล่วงหน้า" (ทุกเกณฑ์โชว์ตรง ๆ ไม่มีกล่องดำ)
//      + สุขภาพ audit chain + ความสดของข้อมูล
// ออกแบบให้เบา: query นับเท่านั้น (ไม่รัน backtest / ไม่คำนวณหนัก)

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditEvents } from "@/lib/research/events"
import { runDataQualityChecks } from "@/lib/momentum/core"
import { ictDate } from "@/lib/platform/dates"

export const dynamic = "force-dynamic"

export interface OpsChecklistItem {
  id: string
  label: string
  done: boolean
  detail: string
  tab: string
}

export interface OpsPulseResponse {
  today: string // YYYY-MM-DD (Asia/Bangkok)
  /** รอบตัดสินใจ GTAA ถัดไป = วันสุดท้ายของเดือนปัจจุบัน (ปฏิทิน — ไม่รวมวันหยุด SET) */
  nextRebalance: { month: string; date: string; daysLeft: number }
  checklist: OpsChecklistItem[]
  audit: { total: number; brokenAt: number | null; ok: boolean }
  dataFresh: { latestDate: string | null; daysStale: number | null }
  /** จำนวนข้อเช็กลิสต์ที่ผ่าน (ผู้ใช้เห็นตัวเลขเดียวจบ) */
  doneCount: number
  tookMs: number
}

function todayICT(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function monthICT(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(
    new Date(),
  )
}

/** วันสุดท้ายของเดือน (ปฏิทิน) ในรูป YYYY-MM-DD */
function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number)
  const d = new Date(Date.UTC(y, m, 0)) // เดือนถัดไป, day 0 = วันสุดท้ายของเดือน m
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number | null {
  const t1 = new Date(`${a}T00:00:00Z`).getTime()
  const t2 = new Date(`${b}T00:00:00Z`).getTime()
  if (!isFinite(t1) || !isFinite(t2)) return null
  return Math.round((t2 - t1) / 86_400_000)
}

export async function GET() {
  const t0 = Date.now()
  try {
    const today = todayICT()
    const month = monthICT()
    const rebalanceDate = lastDayOfMonth(month)
    const daysLeft = daysBetween(today, rebalanceDate) ?? 0

    const [latestSnap, pendingGates, lastEvidence, latestGtaaSnap, audit, dq] = await Promise.all([
      db.snapshot.aggregate({ _max: { date: true } }),
      db.pendingGate.count({ where: { status: "pending" } }),
      db.researchRun.findFirst({
        where: { kind: "thai_fit" },
        orderBy: { createdAt: "desc" },
        select: { id: true, verdict: true, createdAt: true },
      }),
      db.gtaaSignal.findFirst({
        orderBy: [{ decisionMonth: "desc" }],
        select: { decisionMonth: true, createdAt: true },
      }),
      auditEvents().catch(() => null),
      runDataQualityChecks().catch(() => null),
    ])

    const latestDate = latestSnap._max.date
    const daysStale = latestDate ? daysBetween(latestDate, today) : null

    // ---- เช็กลิสต์รายเดือน (เกณฑ์ลงทะเบียนล่วงหน้า — แสดงเหตุผลตรง ๆ ทุกข้อ) ----
    const checklist: OpsChecklistItem[] = []

    // 1) ข้อมูลสด — snapshot ล่าสุดห่าง ≤ 7 วัน
    const dataOk = daysStale !== null && daysStale <= 7
    checklist.push({
      id: "data-fresh",
      label: "ข้อมูลราคาสด (≤ 7 วัน)",
      done: dataOk,
      detail:
        latestDate == null
          ? "ยังไม่มีข้อมูลในระบบ"
          : dataOk
            ? `ถึง ${latestDate} (ห่าง ${daysStale} วัน)`
            : `ล้าสุด — ถึง ${latestDate} (ห่าง ${daysStale} วัน)`,
      tab: "data",
    })

    // 2) Data Quality — ไม่มี flag
    checklist.push({
      id: "dq-clean",
      label: "Data Quality ผ่าน",
      done: dq != null && dq.flags.length === 0,
      detail:
        dq == null
          ? "ตรวจ DQ ไม่สำเร็จ — เปิดแท็บข้อมูลดูสถานะ"
          : dq.flags.length === 0
            ? "ไม่มี flag"
            : `${dq.flags.length} ข้อ: ${dq.flags[0]}`,
      tab: "data",
    })

    // 3) Human Gate ว่าง — ไม่มีคำสั่งค้างอนุมัติ
    checklist.push({
      id: "gates-clear",
      label: "คิว Human Gate ว่าง",
      done: pendingGates === 0,
      detail: pendingGates === 0 ? "ไม่มีคำสั่งค้างอนุมัติ" : `ค้างอนุมัติ ${pendingGates} รายการ`,
      tab: "portfolio",
    })

    // 4) Evidence Night — รัน thai_fit ภายใน 30 วัน (อายุนับตามปฏิทินกรุงเทพทั้งสองฝั่ง — today เป็น ICT
    //    จึงต้องแปลง createdAt เป็นวันที่ ICT ด้วย ไม่ใช่วันที่ UTC ที่ช้ากว่า 1 วันช่วง 00:00–06:59 น.)
    const evidenceAge = lastEvidence ? daysBetween(ictDate(lastEvidence.createdAt), today) : null
    const evidenceOk = evidenceAge !== null && evidenceAge <= 30
    checklist.push({
      id: "evidence-night",
      label: "Evidence Night (≤ 30 วัน)",
      done: evidenceOk,
      detail:
        lastEvidence == null
          ? "ยังไม่เคยรัน thai_fit"
          : evidenceOk
            ? `รันล่าสุด ${evidenceAge} วันก่อน (verdict ${lastEvidence.verdict})`
            : `เกินกำหนด — รันล่าสุด ${evidenceAge} วันก่อน (verdict ${lastEvidence.verdict})`,
      tab: "evidence",
    })

    // 5) GTAA snapshot — บันทึกสัญญาณเดือนปัจจุบันใน tracking log
    const snapMonth = latestGtaaSnap?.decisionMonth ?? null
    const snapFresh = snapMonth === month
    checklist.push({
      id: "gtaa-snapshot",
      label: "บันทึกสัญญาณ GTAA เดือนนี้",
      done: snapFresh,
      detail:
        snapMonth == null
          ? "ยังไม่มี snapshot ใน tracking log"
          : snapFresh
            ? `มี snapshot เดือน ${snapMonth} แล้ว`
            : `ล่าสุดเป็นเดือน ${snapMonth} — เดือน ${month} ยังไม่บันทึก`,
      tab: "gtaa",
    })

    // 6) Audit chain — hash chain ไม่ขาด
    const auditOk = audit != null && audit.total > 0 && audit.brokenAt === null
    checklist.push({
      id: "audit-ok",
      label: "Audit chain ต่อเนื่อง",
      done: auditOk,
      detail:
        audit == null
          ? "ตรวจไม่สำเร็จ"
          : audit.total === 0
            ? "ยังไม่มี event ในระบบ"
            : audit.brokenAt !== null
              ? `chain ขาดที่ event #${audit.brokenAt}`
              : `${audit.total} events ต่อเนื่อง`,
      tab: "evidence",
    })

    const doneCount = checklist.filter((c) => c.done).length

    return NextResponse.json<OpsPulseResponse>({
      today,
      nextRebalance: { month, date: rebalanceDate, daysLeft },
      checklist,
      audit: { total: audit?.total ?? 0, brokenAt: audit?.brokenAt ?? null, ok: auditOk },
      dataFresh: { latestDate, daysStale },
      doneCount,
      tookMs: Date.now() - t0,
    })
  } catch (e) {
    return NextResponse.json({ error: "โหลด ops pulse ไม่สำเร็จ: " + (e as Error).message }, { status: 500 })
  }
}
