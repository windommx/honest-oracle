import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot, snapshotMembers, zScore } from "@/lib/momentum/core"
import type { RegimePoint, RegimeResponse } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

const FWD = 10

const r2 = (x: number) => Math.round(x * 100) / 100
const r3 = (x: number) => Math.round(x * 1000) / 1000

// GET /api/regime?days=250 → ซีรีส์ repeat ratio (ความซ้ำซ้อนของสมาชิกข้ามโผ) + forward return ตลาด 10 วัน
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const d = parseInt(url.searchParams.get("days") ?? "", 10)
    const days = Math.min(600, Math.max(1, isFinite(d) ? d : 250))

    const [members, snapCounts, pivot] = await Promise.all([
      snapshotMembers(),
      db.snapshot.groupBy({ by: ["date"], _count: { _all: true } }),
      closePivot(),
    ])
    const rowsByDate = new Map<string, number>()
    for (const c of snapCounts) rowsByDate.set(c.date, c._count._all)

    const snapDates = members.dates

    // repeat ratio ต่อวัน = 1 - unique/rows (สูง = โผซ้ำซ้อนมาก = ตลาดโหมโหล)
    const repeat: number[] = []
    for (const date of snapDates) {
      const rows = rowsByDate.get(date) ?? 0
      const uniq = members.byDate.get(date)?.size ?? 0
      repeat.push(rows > 0 ? 1 - uniq / rows : 0)
    }

    // mktFwd10: mean forward 10d return % ของทั้งตลาด ณ วันนั้น (null = ไม่มีข้อมูลอนาคต)
    const nSym = pivot.symbols.length
    const fwd10: (number | null)[] = []
    for (const date of snapDates) {
      const pi = pivot.dateIdx.get(date)
      if (pi === undefined || pi + FWD >= pivot.dates.length) {
        fwd10.push(null)
        continue
      }
      const now = pivot.px[pi]
      const fut = pivot.px[pi + FWD]
      let sum = 0
      let n = 0
      for (let s = 0; s < nSym; s++) {
        const a = now[s]
        const b = fut[s]
        if (isFinite(a) && isFinite(b) && a > 0 && b > 0) {
          sum += (b / a - 1) * 100
          n++
        }
      }
      fwd10.push(n > 0 ? sum / n : null)
    }

    // correlation ระหว่าง repeat กับ mktFwd10 (ใช้ค่าดิบ ก่อนปัด)
    let corr = 0
    const xs: number[] = []
    const ys: number[] = []
    for (let j = 0; j < snapDates.length; j++) {
      const y = fwd10[j]
      if (y !== null) {
        xs.push(repeat[j])
        ys.push(y)
      }
    }
    if (xs.length >= 30) {
      let mx = 0
      let my = 0
      for (let i = 0; i < xs.length; i++) {
        mx += xs[i]
        my += ys[i]
      }
      mx /= xs.length
      my /= ys.length
      let cov = 0
      let vx = 0
      let vy = 0
      for (let i = 0; i < xs.length; i++) {
        const dx = xs[i] - mx
        const dy = ys[i] - my
        cov += dx * dy
        vx += dx * dx
        vy += dy * dy
      }
      const den = Math.sqrt(vx * vy)
      corr = den > 0 ? cov / den : 0
      if (!isFinite(corr)) corr = 0
    }

    const full: RegimePoint[] = new Array(snapDates.length)
    for (let j = 0; j < snapDates.length; j++) {
      const y = fwd10[j]
      full[j] = {
        date: snapDates[j],
        repeat: r3(repeat[j]),
        repeatZ: r2(zScore(repeat, j)),
        mktFwd10: y === null ? null : r2(y),
      }
    }

    return NextResponse.json<RegimeResponse>({
      series: full.slice(-days),
      corr: r3(corr),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
