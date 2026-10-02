import { beforeAll, describe, expect, test } from "bun:test"
import { buildMarketState } from "@/lib/quant/engine/panel"
import type { MarketState } from "@/lib/quant/engine/types"
import { thDate, thMonthTick, thSpan } from "./format"
import { aggregateWeeks, barsFromClose, generateMarketFlows, generateStockFlows } from "./generate"
import { buildFlowDashboard, flowIndexAt, isPartialWeek, RANGE_WEEKS } from "./report"
import { flowEntitiesFromState, flowSource, flowsFromState } from "./service"
import type { FlowBar, FlowGroup } from "./types"

const cents = (x: number) => Math.round(x * 100)
const net = (b: FlowBar, g: FlowGroup) => cents(b.groups[g]!.buy) - cents(b.groups[g]!.sell)
const corr = (a: number[], b: number[]) => {
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
  const ma = m(a)
  const mb = m(b)
  let sab = 0
  let saa = 0
  let sbb = 0
  for (let i = 0; i < a.length; i++) {
    sab += (a[i] - ma) * (b[i] - mb)
    saa += (a[i] - ma) ** 2
    sbb += (b[i] - mb) ** 2
  }
  return sab / Math.sqrt(saa * sbb)
}

let state: MarketState
beforeAll(async () => {
  state = await buildMarketState()
})

describe("flows/generate — เอกลักษณ์ของรายงานประเภทนักลงทุน", () => {
  test("SET ทุกวัน: Σซื้อ = Σขาย = มูลค่ารวม (ตรงเป๊ะระดับ 0.01 ล้านบาท) · Σสุทธิ = 0 · ไม่มีค่าติดลบ · deterministic", () => {
    const { days } = flowsFromState(state, "SET")!
    expect(days.length).toBe(state.dates.length)
    for (const d of days) {
      const gs = Object.values(d.groups)
      expect(gs.length).toBe(4)
      expect(gs.reduce((a, g) => a + cents(g.buy), 0)).toBe(cents(d.value))
      expect(gs.reduce((a, g) => a + cents(g.sell), 0)).toBe(cents(d.value))
      for (const g of gs) {
        expect(g.buy).toBeGreaterThanOrEqual(0)
        expect(g.sell).toBeGreaterThanOrEqual(0)
      }
      expect(d.short).toBeNull()
      expect(d.l).toBeLessThanOrEqual(Math.min(d.o, d.c))
      expect(d.h).toBeGreaterThanOrEqual(Math.max(d.o, d.c))
    }
    const dates = state.dates.map((x) => x.toISOString().slice(0, 10))
    expect(generateMarketFlows(barsFromClose(dates, state.marketClose))).toEqual(days)
    expect(flowsFromState(state, "set")).toBe(flowsFromState(state, "SET")) // cache ต่อ MarketState · ไม่สนตัวพิมพ์
  })

  test("พฤติกรรม: ต่างชาติตามผลตอบแทนตลาด (สัมพันธ์บวก) · รายย่อยสวนทาง (สัมพันธ์ลบ) · สัดส่วนมูลค่าสมจริง", () => {
    const { days } = flowsFromState(state, "SET")!
    const ret = days.map((d, i) => (i ? Math.log(d.c / days[i - 1].c) : 0)).slice(1)
    const x = days.slice(1)
    expect(corr(x.map((d) => net(d, "foreign")), ret)).toBeGreaterThan(0.3)
    expect(corr(x.map((d) => net(d, "retail")), ret)).toBeLessThan(-0.2)
    const total = days.reduce((a, d) => a + d.value, 0)
    const share = (g: FlowGroup) => days.reduce((a, d) => a + (d.groups[g]!.buy + d.groups[g]!.sell) / 2, 0) / total
    expect(share("foreign")).toBeGreaterThan(0.35)
    expect(share("foreign")).toBeLessThan(0.58)
    expect(share("retail")).toBeGreaterThan(0.25)
    const avg = total / days.length
    expect(avg).toBeGreaterThan(30_000)
    expect(avg).toBeLessThan(60_000)
  })

  test("หุ้นรายตัว: NVDR + ผู้ลงทุนอื่น = มูลค่าซื้อขาย ทั้งฝั่งซื้อและขาย · short ≤ มูลค่า · NVDR ตามผลตอบแทนหุ้น", () => {
    for (const st of state.stocks) {
      expect(st.rows.length).toBe(state.dates.length)
      const { entity, days } = flowsFromState(state, st.symbol)!
      expect(entity).toMatchObject({ id: st.symbol, kind: "stock", sector: st.sector, groups: ["nvdr", "others"] })
      for (const d of days) {
        expect(cents(d.groups.nvdr!.buy) + cents(d.groups.others!.buy)).toBe(cents(d.value))
        expect(cents(d.groups.nvdr!.sell) + cents(d.groups.others!.sell)).toBe(cents(d.value))
        for (const g of Object.values(d.groups)) expect(Math.min(g.buy, g.sell)).toBeGreaterThanOrEqual(0)
        expect(d.short!).toBeGreaterThanOrEqual(0)
        expect(d.short!).toBeLessThanOrEqual(d.value)
      }
      const ret = days.map((d, i) => (i && days[i - 1].c > 0 ? Math.log(d.c / days[i - 1].c) : 0)).slice(1)
      expect(corr(days.slice(1).map((d) => net(d, "nvdr")), ret)).toBeGreaterThan(0.2)
    }
    const kb = state.stocks.find((s) => s.symbol === "KBANK")!
    const dates = state.dates.map((x) => x.toISOString().slice(0, 10))
    const bars = { dates, o: kb.ohlcv.open, h: kb.ohlcv.high, l: kb.ohlcv.low, c: kb.rows.map((r) => r.close), volumeM: kb.ohlcv.volume }
    expect(generateStockFlows(bars, "KBANK")).toEqual(flowsFromState(state, "KBANK")!.days)
    expect(flowsFromState(state, "NOPE")).toBeNull()
  })
})

describe("flows/aggregateWeeks", () => {
  const day = (date: string, c: number, value: number, buy: number): FlowBar => ({
    date,
    o: c - 1,
    h: c + 2,
    l: c - 2,
    c,
    value,
    groups: { foreign: { buy, sell: value - buy }, retail: { buy: value - buy, sell: buy } },
    short: null,
  })

  test("จันทร์–ศุกร์เป็นหนึ่งสัปดาห์ · วันหยุดทำให้สัปดาห์สั้น · OHLC/ผลรวมถูกต้อง · เอกลักษณ์คงอยู่", () => {
    const days = [
      day("2026-09-07", 10, 100.1, 60.05), // จันทร์
      day("2026-09-08", 12, 100.2, 40.1),
      day("2026-09-10", 11, 100.3, 50.15), // พฤหัส (พุธหยุด) — ศุกร์หยุดด้วย
      day("2026-09-14", 13, 100.4, 70.2), // จันทร์ถัดไป
      day("2026-09-15", 9, 100.5, 30.25),
    ]
    const w = aggregateWeeks(days)
    expect(w.length).toBe(2)
    expect(w[0]).toMatchObject({ start: "2026-09-07", date: "2026-09-10", days: 3, o: 9, c: 11, h: 14, l: 8, value: 300.6 })
    expect(w[0].groups.foreign).toEqual({ buy: 150.3, sell: 150.3 })
    expect(w[1]).toMatchObject({ start: "2026-09-14", date: "2026-09-15", days: 2, c: 9 })
    for (const x of w) {
      const gs = Object.values(x.groups)
      expect(gs.reduce((a, g) => a + cents(g.buy), 0)).toBe(cents(x.value))
      expect(gs.reduce((a, g) => a + cents(g.sell), 0)).toBe(cents(x.value))
    }
    expect(isPartialWeek(w)).toBe(true) // สัปดาห์สุดท้าย 2 วัน (อังคาร) < สัปดาห์ก่อน 3 วัน
    expect(isPartialWeek(aggregateWeeks([...days, day("2026-09-16", 9, 1, 0.5), day("2026-09-18", 9, 1, 0.5)]))).toBe(false) // จบวันศุกร์
  })

  test("ขึ้นสัปดาห์ใหม่เมื่อข้อมูลเว้นช่วง ≥ 7 วัน แม้วันในสัปดาห์เดินหน้า", () => {
    const w = aggregateWeeks([day("2026-09-07", 10, 1, 0.5), day("2026-09-15", 10, 1, 0.5)])
    expect(w.map((x) => x.days)).toEqual([1, 1])
  })
})

describe("flows/report", () => {
  test("วันที่ไทยแบบตายตัว (ปี พ.ศ.) ไม่พึ่ง locale ของเครื่อง", () => {
    expect(thDate("2026-09-25")).toBe("25 ก.ย. 69")
    expect(thSpan("2026-09-21", "2026-09-25")).toBe("21–25 ก.ย. 69")
    expect(thSpan("2026-09-28", "2026-10-02")).toBe("28 ก.ย. – 2 ต.ค. 69")
    expect(thMonthTick("2027-01-04")).toBe("ม.ค. 70")
  })

  test("flowIndexAt: ต่ำสุด = 0 สูงสุด = 100 · ประวัติไม่พอ = null · แบน = 50 · minWeeks ใช้ข้อมูลเท่าที่มี", () => {
    const v = [5, 1, 9, 3]
    expect(flowIndexAt(v, 2, 3)).toBe(100)
    expect(flowIndexAt(v, 3, 3)).toBe(25)
    expect(flowIndexAt(v, 1, 3)).toBeNull()
    expect(flowIndexAt([2, 2, 2], 2, 3)).toBe(50)
    expect(flowIndexAt(v, 3, 10)).toBeNull()
    expect(flowIndexAt(v, 3, 10, 4)).toBe(25)
  })

  test("แดชบอร์ด SET: ช่วงที่เลือก · สะสมเริ่มที่ต้นช่วง · ตารางใช้สัปดาห์ที่ครบ · ช่วงเวลาคำนวณจากรายวัน", () => {
    const f = flowsFromState(state, "SET")!
    const d = buildFlowDashboard(f.entity, f.days, "1y", "foreign", flowSource(f.entity))
    const weeks = aggregateWeeks(f.days)
    expect(d.series.length).toBe(Math.min(RANGE_WEEKS["1y"], weeks.length))
    expect(d.series[0].cum.foreign).toBe(d.series[0].net.foreign!)
    const sumNet = d.series.reduce((a, p) => a + cents(p.net.foreign!), 0)
    expect(cents(d.series.at(-1)!.cum.foreign!)).toBe(sumNet)
    // Σ สุทธิทุกกลุ่มในตาราง = 0 · % ซื้อรวม = 100
    expect(d.table.rows.reduce((a, r) => a + cents(r.net), 0)).toBe(0)
    expect(d.table.rows.reduce((a, r) => a + r.pctBuy, 0)).toBeCloseTo(100, 0)
    expect(d.table.rows.map((r) => r.key)).toEqual(["foreign", "institution", "prop", "retail"])
    const lastDay = f.days.at(-1)!
    const col = (k: string) => d.periods.columns.findIndex((c) => c.key === k)
    const foreignRow = d.periods.rows.find((r) => r.key === "foreign")!
    expect(foreignRow.values[col("1D")]).toBe(net(lastDay, "foreign") / 100)
    const ytd = f.days.filter((x) => x.date.startsWith(lastDay.date.slice(0, 4))).reduce((a, x) => a + net(x, "foreign"), 0)
    expect(cents(foreignRow.values[col("YTD")]!)).toBe(ytd)
    expect(d.periods.rows.find((r) => r.key === "value")!.kind).toBe("value")
    if (d.partialWeek) {
      expect(d.week.end < d.partialWeek.start).toBe(true)
      expect(d.series.at(-1)!.date).toBe(d.partialWeek.end)
    } else expect(d.week.end).toBe(d.lastDate)
    for (const p of d.series) {
      for (const k of ["flowIndex6m", "flowIndex36m"] as const) {
        const v = p[k]
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(100)
        }
      }
    }
    expect(d.flowIndex.group).toBe("นักลงทุนต่างประเทศ")
    // สรุปจากตัวเลข: กลุ่มที่สุทธิมากที่สุดของสัปดาห์ · สัปดาห์ติดต่อกันตรงกับอนุกรม · Flow Index ตรงกับมาตรวัด
    const top = [...d.table.rows].sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0]
    expect(d.insights[0]).toStartWith("สัปดาห์ ")
    expect(d.insights[0]).toContain(top.label)
    const end = d.series.findIndex((p) => p.date === d.week.end)
    const sign = Math.sign(d.series[end].net.foreign!)
    let n = 0
    for (let i = end; i >= 0 && Math.sign(d.series[i].net.foreign!) === sign; i--) n++
    if (n >= 2) expect(d.insights.some((t) => t.includes(`ติดต่อกัน ${n} สัปดาห์`))).toBe(true)
    else expect(d.insights.some((t) => t.includes("ติดต่อกัน"))).toBe(false)
    expect(d.insights.at(-1)).toContain(`Flow Index 6 เดือนของนักลงทุนต่างประเทศ = ${d.flowIndex.m6.toFixed(0)}`)
    expect(d.flowIndex.weeks36).toBe(Math.min(156, weeks.length))
    expect(d.short).toBeNull()
    const three = buildFlowDashboard(f.entity, f.days, "3y", "retail", flowSource(f.entity))
    expect(three.series.length).toBe(Math.min(156, weeks.length))
    expect(three.series.at(-1)!.flowIndex36m).not.toBeNull()
  })

  test("แดชบอร์ดหุ้น: แถว NVDR/ผู้ลงทุนอื่นหักล้างกัน · มี short sale · รายชื่อครบทุกหุ้น", () => {
    const f = flowsFromState(state, "PTT")!
    const d = buildFlowDashboard(f.entity, f.days, "6m", "nvdr", flowSource(f.entity))
    expect(d.series.length).toBe(26)
    expect(cents(d.table.rows[0].net) + cents(d.table.rows[1].net)).toBe(0)
    expect(d.short).not.toBeNull()
    expect(d.short!.pctValue).toBeGreaterThan(0)
    expect(d.short!.pctValue).toBeLessThan(30)
    expect(d.series.every((p) => p.shortPct !== null)).toBe(true)
    expect(d.periods.rows.map((r) => r.key)).toEqual(["nvdr", "others", "short", "shortPct", "value"])
    expect(d.insights[0]).toContain("NVDR")
    expect(d.insights.at(-1)).toStartWith("Flow Index 6 เดือนของ NVDR = ") // เว้นวรรคก่อนชื่อละติน
    expect(d.insights.join(" ")).not.toMatch(/[\u0E00-\u0E7F]NVDR|NVDR[\u0E00-\u0E7F]/)
    expect(d.insights.some((t) => t.startsWith(`Short sale ${d.short!.pctValue.toFixed(1)}%`))).toBe(true)
    const list = flowEntitiesFromState(state)
    expect(list.market).toEqual([{ id: "SET", name: "SET (ทั้งตลาด)" }])
    expect(list.sectors.flatMap((s) => s.stocks.map((x) => x.id)).sort()).toEqual(state.stocks.map((s) => s.symbol).sort())
    expect(list.lastDate).toBe(f.days.at(-1)!.date)
  })
})
