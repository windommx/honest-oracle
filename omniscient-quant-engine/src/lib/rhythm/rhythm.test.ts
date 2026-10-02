import { beforeAll, describe, expect, test } from "bun:test"
import { evaluateGates } from "@/lib/quant/engine/gates"
import { buildMarketState } from "@/lib/quant/engine/panel"
import { START_T, type MarketState } from "@/lib/quant/engine/types"
import { normalTwoSideP, std } from "@/lib/quant/stats"
import {
  computeBreadth,
  computeDayMap,
  computeGateBlockMatrix,
  computeSeasonality,
  computeSectors,
  GATE_BLOCK_CATEGORIES,
  kmeans,
  MAX_SECTORS,
  nEffective,
  OTHER_SECTOR,
  rhythmWindow,
  summarizeGateBlocks,
  type GateBlockMatrix,
} from "./compute"
import { getRhythm, rhythmBase, rhythmFromState, rhythmSummary } from "./service"
import type { BreadthPanel, DayMapPanel, SectorPanel } from "./types"

// ข้อมูลจำลองของแพลตฟอร์ม (deterministic ตาม seed ของ RULES) — ไม่แตะ DB
let state: MarketState
let t0: number
let t1: number
let breadth: BreadthPanel
let sectors: SectorPanel
let dayMap: DayMapPanel
let matrix: GateBlockMatrix

const key = (d: Date) => d.toISOString().slice(0, 10)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

beforeAll(async () => {
  state = await buildMarketState()
  ;({ t0, t1 } = rhythmWindow(state)!)
  breadth = computeBreadth(state, t0, t1)
  sectors = computeSectors(state, t0, t1)
  dayMap = computeDayMap(state, t0, t1)
  matrix = computeGateBlockMatrix(state, t0, t1)
}, 120_000)

describe("rhythm — หน้าต่างวิเคราะห์", () => {
  test("เริ่มหลัง warm-up (START_T) ถึงวันล่าสุด · ข้อมูลสั้นเกิน → null", () => {
    expect(t0).toBe(Math.max(START_T, state.dates.length - 756))
    expect(t1).toBe(state.dates.length - 1)
    expect(rhythmWindow({ ...state, dates: state.dates.slice(0, START_T + 30) })).toBeNull()
  })
})

describe("rhythm/breadth — ความกว้าง + หุ้นเคลื่อนแรงพร้อมกัน", () => {
  test("ค่าวันล่าสุดตรงกับการนับด้วยมือ (ma20Gap > 0 และ |ret| > 2σ ของ 60 วันก่อนหน้า)", () => {
    const n = state.stocks.length
    expect(breadth.days.length).toBe(t1 - t0 + 1)
    for (const t of [t0, Math.floor((t0 + t1) / 2), t1]) {
      const d = breadth.days[t - t0]
      expect(d.date).toBe(key(state.dates[t]))
      const above = state.stocks.filter((s) => s.rows[t].ma20Gap > 0).length
      expect(d.breadth).toBeCloseTo((above / n) * 100, 1)
      const ext = state.stocks.filter((s) => {
        const sd = std(s.rows.slice(t - 60, t).map((r) => r.ret1))
        return Math.abs(s.rows[t].ret1) > 2 * sd
      }).length
      expect(d.extreme).toBe(ext)
      expect(d.marketRet).toBeCloseTo((state.marketClose[t] / state.marketClose[t - 1] - 1) * 100, 2)
    }
    for (const d of breadth.days) {
      expect(d.breadth).toBeGreaterThanOrEqual(0)
      expect(d.breadth).toBeLessThanOrEqual(100)
      expect(Number.isInteger(d.extreme)).toBe(true)
      expect(d.extreme).toBeLessThanOrEqual(n)
    }
  })

  test("วันพุ่ง ≤ 3 วัน เรียงจากมากไปน้อยและห่างกัน ≥ 10 วันทำการ · มัธยฐาน ≤ p90 ≤ สูงสุด รายเดือน", () => {
    const idx = breadth.spikes.map((s) => breadth.days.findIndex((d) => d.date === s.date))
    expect(breadth.spikes.length).toBeGreaterThan(0)
    expect(breadth.spikes.length).toBeLessThanOrEqual(3)
    for (let i = 1; i < breadth.spikes.length; i++) expect(breadth.spikes[i].extreme).toBeLessThanOrEqual(breadth.spikes[i - 1].extreme)
    for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) expect(Math.abs(idx[i] - idx[j])).toBeGreaterThanOrEqual(10)
    const top = Math.max(...breadth.days.map((d) => d.extreme))
    expect(breadth.spikes[0].extreme).toBe(top)
    for (const m of breadth.monthly) {
      expect(m.median).toBeLessThanOrEqual(m.p90)
      expect(m.p90).toBeLessThanOrEqual(m.max)
    }
    expect(sum(breadth.monthly.map((m) => m.n))).toBe(breadth.days.length)
  })

  test("ช่วง risk-off ครอบคลุมทุกวัน risk-off พอดี · จุดเปลี่ยนล่าสุดตรงกับ regime ของ state", () => {
    const inSpans = breadth.days.filter((d) => breadth.riskOffSpans.some((s) => d.date >= s.start && d.date <= s.end))
    expect(inSpans.every((d) => d.riskOff)).toBe(true)
    expect(inSpans.length).toBe(breadth.days.filter((d) => d.riskOff).length)
    if (breadth.regimeShift) {
      const t = state.dates.findIndex((d) => key(d) === breadth.regimeShift!.date)
      expect(state.regime[t]).toBe(breadth.regimeShift.to)
      expect(state.regime[t - 1]).not.toBe(breadth.regimeShift.to)
      expect(breadth.regimeShift.daysAgo).toBe(t1 - t)
      for (let u = t + 1; u <= t1; u++) expect(state.regime[u]).toBe(state.regime[t])
    }
  })

  test("ปฏิทิน: ≤ 52 สัปดาห์ เริ่มวันจันทร์ · 5 ช่อง/สัปดาห์ · สัปดาห์สุดท้ายมีวันล่าสุด", () => {
    expect(breadth.calendar.length).toBeLessThanOrEqual(52)
    for (const w of breadth.calendar) {
      expect(new Date(`${w.week}T00:00:00Z`).getUTCDay()).toBe(1)
      expect(w.days.length).toBe(5)
    }
    const last = breadth.calendar[breadth.calendar.length - 1].days.filter(Boolean).at(-1)!
    expect(last.date).toBe(breadth.latest.date)
    expect(last.breadth).toBe(breadth.latest.breadth)
  })
})

describe("rhythm/seasonality — วัน × เดือน", () => {
  test("SET proxy: ทุกวันถูกนับครั้งเดียว · ค่าเฉลี่ยช่องตรงกับการคำนวณมือ · t มีเครื่องหมายเดียวกับค่าเฉลี่ย", () => {
    const s = computeSeasonality(state, "SET")!
    expect(s.rows).toEqual(["จ.", "อ.", "พ.", "พฤ.", "ศ."])
    expect(s.cols.length).toBe(12)
    expect(sum(s.cells.flat().map((c) => c.n))).toBe(s.nDays)
    expect(sum(s.byMonth.map((m) => m.n))).toBe(s.nDays)
    expect(sum(s.byWeekday.map((m) => m.n))).toBe(s.nDays)
    const mon = [] as number[]
    for (let t = 1; t < state.dates.length; t++) {
      const d = state.dates[t]
      if (d.getUTCDay() === 1 && d.getUTCMonth() === 0) mon.push((state.marketClose[t] / state.marketClose[t - 1] - 1) * 100)
    }
    expect(s.cells[0][0].n).toBe(mon.length)
    expect(s.cells[0][0].value!).toBeCloseTo(mon.reduce((a, b) => a + b, 0) / mon.length, 3)
    for (const m of [...s.byMonth, ...s.byWeekday]) {
      if (m.tStat !== null && m.mean !== null && m.mean !== 0) expect(Math.sign(m.tStat)).toBe(Math.sign(m.mean))
      // q ของ BH ≥ p ดิบเสมอ (ปรับแล้วเข้มขึ้นเท่านั้น)
      if (m.tStat !== null) {
        expect(m.q!).toBeGreaterThanOrEqual(normalTwoSideP(m.tStat) - 1e-3)
        expect(m.q!).toBeLessThanOrEqual(1)
      }
    }
    // |t| ≥ 2 ที่ไม่ผ่าน FDR ต้องบอกว่าอาจเป็นความบังเอิญ
    const tested = [...s.byMonth, ...s.byWeekday].filter((m) => m.tStat !== null)
    if (tested.some((m) => Math.abs(m.tStat!) >= 2) && tested.every((m) => m.q! >= 0.1)) expect(s.title).toContain("อาจเป็นความบังเอิญ")
    expect(s.title).toContain("SET proxy")
    expect(s.basis).toContain("ไม่ใช่กฎซื้อขาย")
  })

  test("หุ้นรายตัวใช้ผลตอบแทนของหุ้นนั้น · สัญลักษณ์ไม่รู้จัก → null", () => {
    const s = computeSeasonality(state, "TSE")!
    expect(s.symbol).toBe("TSE")
    expect(s.label.startsWith("TSE · ")).toBe(true)
    const st = state.stocks.find((x) => x.symbol === "TSE")!
    const all = st.rows.slice(1).map((r) => r.ret1 * 100)
    expect(s.overallMean).toBeCloseTo(all.reduce((a, b) => a + b, 0) / all.length, 3)
    expect(computeSeasonality(state, "NOPE")).toBeNull()
  })
})

describe("rhythm/sectors — สัดส่วนมูลค่าซื้อขาย + N_eff", () => {
  test("N_eff = 1/Σs²: เท่ากันทุกหมวด = จำนวนหมวด · หมวดเดียว = 1", () => {
    expect(nEffective([1, 1, 1, 1])).toBeCloseTo(4, 10)
    expect(nEffective([5, 0, 0])).toBeCloseTo(1, 10)
    expect(nEffective([])).toBe(0)
  })

  test("ลำดับหมวดคงที่ตามจักรวาล · สัดส่วน rolling รวม ≈ 100 · ตรงกับการคำนวณมือของวันล่าสุด", () => {
    expect(sectors.sectors.map((s) => s.key)).toEqual([...new Set(state.stocks.map((s) => s.sector))])
    expect(sum(sectors.sectors.map((s) => s.nStocks))).toBe(state.stocks.length)
    expect(sectors.rolling.length).toBe(t1 - t0 + 1)
    for (const r of sectors.rolling) expect(Math.abs(sum(r.shares) - 100)).toBeLessThan(0.6)
    const val = (sector: string, t: number) =>
      state.stocks.filter((s) => s.sector === sector).reduce((a, s) => a + s.ohlcv.volume[t] * s.rows[t].close, 0)
    const tot = sectors.sectors.map((s) => {
      let v = 0
      for (let t = t1 - 19; t <= t1; t++) v += val(s.key, t)
      return v
    })
    const all = sum(tot)
    sectors.sectors.forEach((_, k) => expect(sectors.latest.shares[k]).toBeCloseTo((tot[k] / all) * 100, 1))
    expect(sectors.latest.nEff).toBeGreaterThanOrEqual(1)
    expect(sectors.latest.nEff).toBeLessThanOrEqual(sectors.sectors.length)
  })

  test("เกิน 6 หมวด → 5 หมวดมูลค่าสูงสุด + หมวดอื่น ๆ (ไม่สร้างสีเกินชุดที่ตรวจแล้ว)", () => {
    const many = { ...state, stocks: state.stocks.map((s) => ({ ...s, sector: `S-${s.symbol}` })) }
    const p = computeSectors(many, t0, t1)
    expect(p.sectors.length).toBe(MAX_SECTORS)
    expect(p.sectors[MAX_SECTORS - 1]).toMatchObject({ key: OTHER_SECTOR, label: "หมวดอื่น ๆ", nStocks: state.stocks.length - (MAX_SECTORS - 1) })
    expect(sum(p.sectors.map((s) => s.nStocks))).toBe(state.stocks.length)
    for (const r of p.rolling) expect(Math.abs(sum(r.shares) - 100)).toBeLessThan(0.6)
    expect(p.basis).toContain("หมวดอื่น ๆ")
  })

  test("รายเดือน ≤ 12 เดือน: มูลค่าและขนาดเงินไหลรวม ≈ 100% · N_eff อยู่ในช่วง [1, K]", () => {
    expect(sectors.hasFlows).toBe(true)
    expect(sectors.monthly.length).toBeLessThanOrEqual(12)
    for (const m of sectors.monthly) {
      expect(Math.abs(sum(m.value) - 100)).toBeLessThan(0.6)
      expect(Math.abs(sum(m.flow!) - 100)).toBeLessThan(0.6)
      expect(m.flowNet!.length).toBe(sectors.sectors.length)
      for (const ne of [m.nEffValue, m.nEffFlow!]) {
        expect(ne).toBeGreaterThanOrEqual(1)
        expect(ne).toBeLessThanOrEqual(sectors.sectors.length + 1e-9)
      }
    }
  })
})

describe("rhythm/dayMap — PCA + k-means", () => {
  test("k-means แยกกลุ่มที่แยกกันชัดได้ถูกต้อง", () => {
    const pts = [
      ...Array.from({ length: 20 }, (_, i) => [0 + (i % 5) * 0.01, 0 + (i % 3) * 0.01]),
      ...Array.from({ length: 20 }, (_, i) => [10 + (i % 5) * 0.01, 10 + (i % 3) * 0.01]),
    ]
    const r = kmeans(pts, 2, 1, 4)
    expect(new Set(r.assign.slice(0, 20)).size).toBe(1)
    expect(new Set(r.assign.slice(20)).size).toBe(1)
    expect(r.assign[0]).not.toBe(r.assign[20])
  })

  test("ทุกวันอยู่ในกลุ่มเดียว · กลุ่มเรียงตามขนาด · ป้ายไม่ซ้ำ · วันล่าสุดตรงจุดสุดท้าย", () => {
    expect(dayMap.points.length).toBe(t1 - t0 + 1)
    expect(dayMap.clusters.length).toBe(5)
    expect(sum(dayMap.clusters.map((c) => c.n))).toBe(dayMap.points.length)
    for (let i = 1; i < dayMap.clusters.length; i++) expect(dayMap.clusters[i].n).toBeLessThanOrEqual(dayMap.clusters[i - 1].n)
    expect(new Set(dayMap.clusters.map((c) => c.label)).size).toBe(5)
    dayMap.clusters.forEach((c) => expect(dayMap.points.filter((p) => p.c === c.id).length).toBe(c.n))
    const last = dayMap.points[dayMap.points.length - 1]
    expect(dayMap.latest).toEqual({ date: last.date, cluster: last.c, x: last.x, y: last.y })
    expect(dayMap.latest.date).toBe(key(state.dates[t1]))
    expect(dayMap.title).toContain(dayMap.clusters[last.c].label)
  })

  test("แกน PCA: อธิบายความแปรปรวนรวม ≤ 100% · ตัวแปรที่ถ่วงมากสุดเป็นบวก · ผลลัพธ์คงที่ทุกครั้ง (seed คงที่)", () => {
    const [a, b] = dayMap.axes
    expect(a.explained).toBeGreaterThan(0)
    expect(a.explained).toBeGreaterThanOrEqual(b.explained)
    expect(a.explained + b.explained).toBeLessThanOrEqual(100)
    for (const ax of dayMap.axes) {
      expect(ax.top.length).toBe(3)
      expect(ax.top[0].loading).toBeGreaterThan(0)
    }
    expect(JSON.stringify(computeDayMap(state, t0, t1))).toBe(JSON.stringify(dayMap))
    expect(dayMap.basis).toContain("ไม่ใช่สัญญาณซื้อขาย")
  })

  test("ผลตอบแทนล่วงหน้า 5 วันของกลุ่ม = ค่าเฉลี่ยจาก marketClose จริง", () => {
    const c = dayMap.clusters[0]
    const xs: number[] = []
    dayMap.points.forEach((p, i) => {
      const t = t0 + i
      if (p.c === c.id && t + 5 <= t1) xs.push((state.marketClose[t + 5] / state.marketClose[t] - 1) * 100)
    })
    expect(c.nFwd).toBe(xs.length)
    expect(c.fwd5!).toBeCloseTo(xs.reduce((a, b) => a + b, 0) / xs.length, 2)
    expect(dayMap.baseline.nFwd).toBe(t1 - t0 + 1 - 5)
  })
})

describe("rhythm/gates — ด่านแรกที่ไม่ผ่าน", () => {
  test("ตรงกับ evaluateGates ของเอนจิน (สุ่มตรวจหุ้น-วัน)", () => {
    const samples = [
      [0, t0],
      [3, t0 + 100],
      [7, t0 + 250],
      [12, t1 - 40],
      [state.stocks.length - 1, t1],
    ]
    for (const [si, t] of samples) {
      const ev = evaluateGates(state, state.stocks[si].symbol, t, { light: true })
      const c = matrix.cat[si][t - t0]
      if (ev.signal === "NO_TRADE") {
        const first = (["g1", "g2", "g3", "g4", "g5"] as const).findIndex((g) => !ev.gates[g])
        expect(c).toBe(first)
      } else {
        expect(c).toBe(5)
        expect(matrix.kind[si][t - t0]).toBe(ev.signal === "ENTRY_PULLBACK" ? 1 : 2)
      }
    }
  })

  test("ทุกหุ้น: นับครบทุกหุ้น-วัน · รายเดือนรวมเท่ายอดรวม · สัญญาณ = pullback + momentum · สัดส่วนรวม ≈ 100", () => {
    const p = summarizeGateBlocks(state, matrix, "ALL")!
    const nDays = t1 - t0 + 1
    expect(p.scope).toBe("ALL")
    expect(p.overall.total).toBe(state.stocks.length * nDays)
    expect(sum(p.months.map((m) => m.total))).toBe(p.overall.total)
    expect(p.overall.counts.SIGNAL).toBe(p.overall.pullback + p.overall.momentum)
    for (const m of p.months) {
      expect(m.counts.SIGNAL).toBe(m.pullback + m.momentum)
      expect(Math.abs(sum(Object.values(m.shares)) - 100)).toBeLessThan(0.6)
    }
    expect(p.categories.map((c) => c.key)).toEqual(GATE_BLOCK_CATEGORIES.map((c) => c.key))
    expect(p.title).toMatch(/ติดด่าน G\d/)
  })

  test("รายหุ้น: นับเฉพาะวันของหุ้นนั้น · ไม่รู้จัก → null", () => {
    const p = summarizeGateBlocks(state, matrix, "TSE")!
    expect(p.scope).toBe("TSE")
    expect(p.overall.total).toBe(t1 - t0 + 1)
    expect(p.title.startsWith("TSE: ")).toBe(true)
    expect(summarizeGateBlocks(state, matrix, "NOPE")).toBeNull()
  })
})

describe("rhythm/service", () => {
  test("cache ต่อ MarketState · SET = ตลาด/ทุกหุ้น · หุ้นรายตัว = ฤดูกาลและด่านของหุ้นนั้น · ไม่รู้จัก → unknown_symbol", () => {
    const b = rhythmBase(state)!
    expect(rhythmBase(state)).toBe(b)
    const data = { kind: "synthetic", label: "ทดสอบ" }
    const set = rhythmFromState(state, "SET", data)
    expect(set.ok).toBe(true)
    if (!set.ok) return
    expect(set.data.symbol).toBe("SET")
    expect(set.data.gates.scope).toBe("ALL")
    expect(set.data.seasonality.symbol).toBe("SET")
    expect(set.data.nDays).toBe(t1 - t0 + 1)
    expect(set.data.asOf).toBe(key(state.dates[t1]))
    expect(set.data.symbols.length).toBe(state.stocks.length)
    const tse = rhythmFromState(state, "tse", data)
    expect(tse.ok && tse.data.gates.scope === "TSE" && tse.data.seasonality.symbol === "TSE").toBe(true)
    expect(tse.ok && tse.data.breadth).toBe(set.data.breadth) // แผงระดับตลาดใช้ร่วมกัน
    expect(rhythmFromState(state, "NOPE", data)).toEqual({ ok: false, reason: "unknown_symbol" })
    const short = { ...state, dates: state.dates.slice(0, START_T + 10) }
    expect(rhythmFromState(short, "SET", data)).toEqual({ ok: false, reason: "insufficient_data" })
  })

  test("สรุปย่อของ Command Center: ตัวเลขตรงกับผลเต็ม · ด่านที่บล็อกของเดือนล่าสุด", () => {
    const full = rhythmFromState(state, "SET", { kind: "synthetic", label: "ทดสอบ" })
    if (!full.ok) throw new Error(full.reason)
    const sm = rhythmSummary(full.data)
    expect(sm.findings).toEqual([full.data.breadth.title, full.data.seasonality.title, full.data.sectors.title, full.data.dayMap.title, full.data.gates.title])
    expect(sm.breadth.value).toBe(full.data.breadth.latest.breadth)
    expect(sm.dayType.label).toBe(full.data.dayMap.clusters[full.data.dayMap.latest.cluster].label)
    expect(sm.dayType.recent.length).toBe(5)
    const m = full.data.gates.months[full.data.gates.months.length - 1]
    expect(sm.gates.month).toBe(m.month)
    expect(sm.gates.top.share).toBe(Math.max(m.shares.G1, m.shares.G2, m.shares.G3, m.shares.G4, m.shares.G5))
  })

  test("getRhythm ใช้ข้อมูลใน DB + ป้ายที่มาของข้อมูล", async () => {
    const r = await getRhythm("SET")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.data.kind).toBe("synthetic")
      expect(r.data.data.label).toContain("ข้อมูลจำลอง")
    }
  }, 120_000)
})
