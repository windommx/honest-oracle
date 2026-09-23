import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot, snapshotMembers } from "@/lib/momentum/core"
import {
  computeGroupExposure,
  computeSectorExposure,
  getSectorMap,
  sectorOf,
} from "@/lib/risk/sector"
import { TH_RISK } from "@/lib/config/thai"
import type { PortfolioResponse, PositionRow } from "@/lib/momentum/contracts"
import { heldPeriodReturn, lastKnownIndex, observedReturns } from "@/lib/portfolio/returns"

export const dynamic = "force-dynamic"

// GET /api/portfolio → สถานะพอร์ตกระดาษ + ความเสี่ยง (effN, weekly DD, kill switch, sector exposure)
export async function GET() {
  try {
    const positions = await db.position.findMany({ orderBy: { symbol: "asc" } })
    if (positions.length === 0) {
      return NextResponse.json<PortfolioResponse>({
        positions: [],
        totals: null,
        risk: {
          effN: null,
          weeklyDD: null,
          killSwitch: false,
          maxWeeklyDD: TH_RISK.maxWeeklyDD,
        },
        sectorExposure: [],
        groupExposure: [],
      })
    }

    const sectorMap = await getSectorMap()

    const pivot = await closePivot()
    const { dates: snapDates, tfByDate } = await snapshotMembers()
    const latest = snapDates[snapDates.length - 1] ?? null
    const latestMembers = latest ? (tfByDate.get(latest) ?? new Map<number, Set<string>>()) : new Map<number, Set<string>>()
    const pi = latest ? pivot.dateIdx.get(latest) : undefined

    const rows: PositionRow[] = []
    for (const p of positions) {
      const si = pivot.symIdx.get(p.symbol)
      // หุ้นพัก/หยุดซื้อขายวันล่าสุด → ใช้ราคาปิดล่าสุดที่มีจริง (mark-to-last-trade) ไม่ใช่ราคาเข้า (P&L 0% ปลอม)
      const lk = pi !== undefined && si !== undefined ? lastKnownIndex(pivot.px, si, pi) : -1
      const lastPx = lk >= 0 && si !== undefined ? pivot.px[lk][si] : p.entryPx
      const ei = pivot.dateIdx.get(p.entryDate)
      const daysHeld = ei !== undefined && pi !== undefined ? pi - ei : 0
      let nTfToday = 0
      for (const set of latestMembers.values()) if (set.has(p.symbol)) nTfToday++
      rows.push({
        symbol: p.symbol,
        entryDate: p.entryDate,
        entryPx: p.entryPx,
        slots: p.slots,
        stop: p.stop,
        lastPx: Math.round(lastPx * 100) / 100,
        pnlPct: Math.round((lastPx / p.entryPx - 1) * 10000) / 100,
        daysHeld,
        inAnyList: nTfToday > 0,
        nTfToday,
        sector: sectorOf(sectorMap, p.symbol),
      })
    }

    const totalSlots = rows.reduce((a, r) => a + r.slots, 0)
    const totals = {
      slots: Math.round(totalSlots * 100) / 100,
      positions: rows.length,
      avgPnl:
        Math.round(
          rows.reduce((a, r) => a + r.pnlPct * r.slots, 0) / (totalSlots || 1) * 100
        ) / 100,
    }

    // ---- Risk overlay ----
    // weeklyDD: ผลตอบแทน 5 วันทำการล่าสุดของพอร์ต (ถ่วงน้ำหนักด้วย slots) — นับเฉพาะช่วงที่ถือจริง:
    // สถานะที่เพิ่งเข้าภายใน 5 วันใช้ราคาเข้าเป็นฐาน (ไม่เอาการร่วงก่อนซื้อมาทริกเกอร์ kill switch)
    // หุ้นพัก/หยุดซื้อขายใช้ราคาปิดล่าสุดที่มีทั้งปลายและฐาน (ไม่หลุดจากการคำนวณ)
    const weeklyDD: number | null = pi !== undefined ? heldPeriodReturn(positions, pivot, pi, 5) : null

    // effN = 1/(wᵀCw) จาก correlation ของผลตอบแทน 60 วันของหุ้นในพอร์ต
    let effN: number | null = null
    if (positions.length >= 2 && pi !== undefined) {
      const syms = positions.map((p) => p.symbol)
      const sIdx = syms.map((s) => pivot.symIdx.get(s))
      const start = Math.max(1, pi - 60)
      // วันที่ไม่มีราคา = 0 (convention เดิม) แต่วันที่กลับมาเทรดเทียบราคาปิดล่าสุดที่มี — gap ช่วงพักไม่หาย
      const rets: number[][] = sIdx.map((si) =>
        si === undefined
          ? new Array<number>(pi - start + 1).fill(0)
          : observedReturns(pivot.px, si, start, pi).map((v) => (isFinite(v) ? v : 0))
      )
      const n = rets.length
      const means = rets.map((r) => r.reduce((x, y) => x + y, 0) / r.length)
      const cors: number[][] = Array.from({ length: n }, () => new Array(n).fill(1))
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          let cov = 0
          let va = 0
          let vb = 0
          for (let t = 0; t < rets[a].length; t++) {
            const da = rets[a][t] - means[a]
            const db = rets[b][t] - means[b]
            cov += da * db
            va += da * da
            vb += db * db
          }
          const c = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0
          cors[a][b] = c
          cors[b][a] = c
        }
      }
      const w = positions.map((p) => p.slots / (totalSlots || 1))
      let quad = 0
      for (let a = 0; a < n; a++)
        for (let b = 0; b < n; b++) quad += w[a] * cors[a][b] * w[b]
      effN = quad > 0 ? Math.round((1 / quad) * 10) / 10 : null
    }

    return NextResponse.json<PortfolioResponse>({
      positions: rows,
      totals,
      risk: {
        effN,
        weeklyDD: weeklyDD === null ? null : Math.round(weeklyDD * 10000) / 10000,
        killSwitch: weeklyDD !== null && weeklyDD <= TH_RISK.maxWeeklyDD,
        maxWeeklyDD: TH_RISK.maxWeeklyDD,
      },
      sectorExposure: computeSectorExposure(
        rows.map((r) => ({ symbol: r.symbol, slots: r.slots })),
        sectorMap
      ),
      groupExposure: computeGroupExposure(
        rows.map((r) => ({ symbol: r.symbol, slots: r.slots })),
        sectorMap
      ),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
