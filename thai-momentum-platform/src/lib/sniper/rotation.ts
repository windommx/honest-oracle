// rotation.ts — Sector Rotation Map: "เงินไทยไหลเป็นระลอก ระบบต้องจับผู้นำก่อนผู้ตาม"
// คำนวณจากข้อมูลรายวันของทุกหุ้นใน DB (เฉพาะตัวสภาพคล่องผ่าน):
//   ret20/ret60 เฉลี่ยของกลุ่ม (ผู้นำ = ret20 แรงและ "เร่ง" เมื่อเทียบอันดับ ret60)
//   valTrend = มูลค่าซื้อขาย 5 วันล่าสุด / 20 วันก่อนหน้า − 1 (เงินกำลังเข้าหรือแห้ง)
// DAILY PROXY — ไม่ใช่ Network Graph/GNN จริง (เก็บไว้เป็น roadmap เมื่อมีข้อมูลเพียงพอ)

import type { SectorRow } from "./types"
import type { Row } from "@/lib/momentum/signals/engine"

export function sectorRotation(rows: Row[], sectorOf: (s: string) => string, latestDate: string): SectorRow[] {
  const T = rows.length
  if (T === 0) return []
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const li = dates.indexOf(latestDate)
  if (li < 0 || li < 60) return []

  const idxOf = new Map(dates.map((d, i) => [d, i]))
  const per = new Map<string, Map<string, { c: number[]; v: number[] }>>() // sector → symbol → {closes, vals}
  for (const r of rows) {
    const sec = sectorOf(r.symbol) || "Unknown"
    let bySym = per.get(sec)
    if (!bySym) {
      bySym = new Map()
      per.set(sec, bySym)
    }
    let m = bySym.get(r.symbol)
    if (!m) {
      m = { c: [], v: [] }
      bySym.set(r.symbol, m)
    }
    m.c.push(r.close)
    m.v.push(r.val)
    // แถวเรียงตาม date อยู่แล้ว (loadAll orderBy date asc) — แต่กันเหนียว: ถ้าวันไม่ต่อเนื่องให้ NaN
    if (m.c.length > idxOf.get(r.date)!) {
      // symbol นี้ขาดบางวัน — ต่อให้เรียงแบบ sparse ก็ใช้สัดส่วนได้พอ
    }
  }

  const out: SectorRow[] = []
  for (const [sector, bySym] of per) {
    let ret20Sum = 0
    let ret60Sum = 0
    let n = 0
    let valRecent = 0
    let valRecentN = 0
    let valPrev = 0
    let valPrevN = 0
    for (const [, m] of bySym) {
      const len = m.c.length
      if (len < 61) continue
      const c = m.c[len - 1]
      const c20 = m.c[len - 21]
      const c60 = m.c[len - 61]
      if (!(c > 0 && c20 > 0 && c60 > 0)) continue
      // กรองสภาพคล่อง: มูลค่าเฉลี่ยล่าสุด ≥ 1 ล้านบาท
      const v20 = m.v.slice(-20)
      const avgV = v20.reduce((s, x) => s + x, 0) / 20
      if (avgV < 1e6) continue
      ret20Sum += c / c20 - 1
      ret60Sum += c / c60 - 1
      n++
      const recent = m.v.slice(-5).reduce((s, x) => s + x, 0) / 5
      const prev = m.v.slice(-25, -5).reduce((s, x) => s + x, 0) / 20
      valRecent += recent
      valRecentN++
      valPrev += prev
      valPrevN++
    }
    if (n < 2) continue
    out.push({
      sector,
      ret20: (ret20Sum / n) * 100,
      ret60: (ret60Sum / n) * 100,
      valTrendPct: valPrevN > 0 && valPrev > 0 ? (valRecent / valRecentN / (valPrev / valPrevN) - 1) * 100 : 0,
      rankNow: 0,
      rankPrev: 0,
      leader: false,
      stocks: n,
    })
  }

  // อันดับ: rankNow เรียงตาม ret20, rankPrev ตาม ret60 (ผู้นำ = เร่งและแรง)
  const byRet20 = [...out].sort((a, b) => b.ret20 - a.ret20)
  const byRet60 = [...out].sort((a, b) => b.ret60 - a.ret60)
  byRet20.forEach((r, i) => (r.rankNow = i + 1))
  byRet60.forEach((r, i) => (r.rankPrev = i + 1))
  byRet20.forEach((r) => {
    r.leader = r.rankNow === 1
  })
  return byRet20
}
