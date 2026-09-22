import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { closePivot, snapshotMembers } from "@/lib/momentum/core"
import { TFS } from "@/lib/momentum/contracts"
import type { GradRow, StatsBucket, StatsResponse, TfStat } from "@/lib/momentum/contracts"

export const dynamic = "force-dynamic"

const HOLD_SET = new Set([5, 10, 20])
const WITHIN = 10
const GRAD_PAIRS: [number, number][] = [
  [5, 10], [5, 20], [5, 40],
  [10, 20], [10, 40],
  [20, 40], [20, 80],
  [40, 80],
  [80, 160],
  [160, 300],
]

const r2 = (x: number) => Math.round(x * 100) / 100
const r3 = (x: number) => Math.round(x * 1000) / 1000

// สถิติของชุด forward returns (%)
function bucket(vals: number[]): StatsBucket {
  const n = vals.length
  if (n === 0) return { n: 0, mean: 0, median: 0, winRate: 0 }
  let sum = 0
  let wins = 0
  for (const v of vals) {
    sum += v
    if (v > 0) wins++
  }
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = n >> 1
  const median = n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  return { n, mean: r2(sum / n), median: r2(median), winRate: r3(wins / n) }
}

// forward return % ของ (dateIdx i, symbolIdx s) ด้วย horizon hold — null ถ้าคำนวณไม่ได้
function fwdRet(px: number[][], nDates: number, i: number, s: number, hold: number): number | null {
  const j = i + hold
  if (j >= nDates) return null
  const p0 = px[i][s]
  const p1 = px[j][s]
  if (!isFinite(p0) || !isFinite(p1) || p0 <= 0 || p1 <= 0) return null
  return (p1 / p0 - 1) * 100
}

// GET /api/stats?hold=10 → สถิติ forward return ต่อ timeframe + control (ทุกหุ้นสภาพคล่อง) + graduation rate
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const h = parseInt(url.searchParams.get("hold") ?? "", 10)
    const hold = HOLD_SET.has(h) ? h : 10

    const [pivot, members] = await Promise.all([closePivot(), snapshotMembers()])
    const { px, dates, dateIdx, symIdx } = pivot
    const nDates = dates.length

    // ---- byTf: forward return ของสมาชิก snapshot แยกตาม timeframe ----
    const fwdByTf = new Map<number, number[]>()
    for (const tf of TFS) fwdByTf.set(tf, [])
    for (const [date, tfMap] of members.tfByDate) {
      const i = dateIdx.get(date)
      if (i === undefined) continue
      for (const [tf, set] of tfMap) {
        const arr = fwdByTf.get(tf)
        if (!arr) continue
        for (const sym of set) {
          const s = symIdx.get(sym)
          if (s === undefined) continue
          const f = fwdRet(px, nDates, i, s, hold)
          if (f !== null) arr.push(f)
        }
      }
    }
    const byTf: TfStat[] = TFS.map((tf) => ({ tf, ...bucket(fwdByTf.get(tf) ?? []) }))

    // ---- control: forward return ของทุกแถวสภาพคล่อง (liq5 = 1) ----
    const liqRows = await db.rawDaily.findMany({
      where: { liq5: 1 },
      select: { date: true, symbol: true },
    })
    const ctrl: number[] = []
    for (const r of liqRows) {
      const i = dateIdx.get(r.date)
      if (i === undefined) continue
      const s = symIdx.get(r.symbol)
      if (s === undefined) continue
      const f = fwdRet(px, nDates, i, s, hold)
      if (f !== null) ctrl.push(f)
    }

    // ---- graduation: อัตราการเลื่อนชั้นจากโผ tf from ไปติดโผ tf to ภายใน 10 วันถัดไป ----
    const snapDates = members.dates
    const datePos = new Map<string, number>()
    snapDates.forEach((d, j) => datePos.set(d, j))
    const tfMembers = new Map<number, [number, string][]>() // tf → [j, symbol][]
    const tfSets = new Map<number, (Set<string> | undefined)[]>() // tf → Set ต่อวัน (index j)
    for (const [date, tfMap] of members.tfByDate) {
      const j = datePos.get(date)
      if (j === undefined) continue
      for (const [tf, set] of tfMap) {
        let arr = tfSets.get(tf)
        if (!arr) {
          arr = new Array<Set<string> | undefined>(snapDates.length)
          tfSets.set(tf, arr)
        }
        arr[j] = set
        let list = tfMembers.get(tf)
        if (!list) {
          list = []
          tfMembers.set(tf, list)
        }
        for (const sym of set) list.push([j, sym])
      }
    }

    const graduation: GradRow[] = GRAD_PAIRS.map(([from, to]) => {
      const mem = tfMembers.get(from) ?? []
      const toSets = tfSets.get(to)
      let grad = 0
      if (mem.length > 0 && toSets) {
        for (const [j, sym] of mem) {
          const end = Math.min(j + WITHIN, snapDates.length - 1)
          for (let k = j + 1; k <= end; k++) {
            const st = toSets[k]
            if (st && st.has(sym)) {
              grad++
              break
            }
          }
        }
      }
      return { from, to, within: WITHIN, rate: mem.length > 0 ? r3(grad / mem.length) : 0 }
    })

    return NextResponse.json<StatsResponse>({
      hold,
      control: bucket(ctrl),
      byTf,
      graduation,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
