// GET /api/evidence — Evidence Night Bundle: ผล thai_fit ล่าสุด + config_th
// + ถังผลตอบแทนตาม source ของ Decision (calibration) + ประวัติรัน 5 รอบล่าสุด

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getConfigTh, type ThaiConfig } from "@/lib/config/thai-config"
import type { ThaiFitReport } from "@/lib/research/thai-fit"

export const dynamic = "force-dynamic"

export interface EvidenceBucket {
  source: string
  n: number
  winRate: number | null // ส่วนแบ่ง outcome > 0
  avg: number | null // ค่าเฉลี่ย outcome
}

export interface EvidenceRunRow {
  id: number
  createdAt: string
  verdict: string
}

export interface EvidenceResponse {
  report: ThaiFitReport | null
  config: ThaiConfig
  buckets: EvidenceBucket[]
  runs: EvidenceRunRow[]
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4

export async function GET() {
  try {
    const [runRow, config, decisions, runs] = await Promise.all([
      db.researchRun.findFirst({ where: { kind: "thai_fit" }, orderBy: { createdAt: "desc" } }),
      getConfigTh(),
      // ถังตาม source เฉพาะ decision ที่มีผล verify แล้ว (outcome != null) — ข้อมูลเล็ก reduce ใน memory
      db.decision.findMany({
        where: { outcome: { not: null } },
        select: { source: true, outcome: true },
      }),
      db.researchRun.findMany({
        where: { kind: "thai_fit" },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, createdAt: true, verdict: true },
      }),
    ])

    let report: ThaiFitReport | null = null
    if (runRow) {
      try {
        report = JSON.parse(runRow.result) as ThaiFitReport
      } catch {
        report = null
      }
    }

    const grouped = new Map<string, { n: number; win: number; sum: number }>()
    for (const d of decisions) {
      if (d.outcome === null) continue
      const b = grouped.get(d.source) ?? { n: 0, win: 0, sum: 0 }
      b.n++
      if (d.outcome > 0) b.win++
      b.sum += d.outcome
      grouped.set(d.source, b)
    }
    const buckets: EvidenceBucket[] = [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([source, b]) => ({
        source,
        n: b.n,
        winRate: r4(b.win / b.n),
        avg: r4(b.sum / b.n),
      }))

    const runRows: EvidenceRunRow[] = runs.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      verdict: r.verdict,
    }))

    return NextResponse.json<EvidenceResponse>({ report, config, buckets, runs: runRows })
  } catch (e) {
    return NextResponse.json({ error: "โหลด evidence ไม่สำเร็จ: " + (e as Error).message }, { status: 500 })
  }
}
