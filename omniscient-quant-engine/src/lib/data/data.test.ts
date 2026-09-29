// ============================================================
// ชั้นข้อมูลจริง (pure): ปฏิทิน SET · ความสดของข้อมูล · CSV · Yahoo mapper · ตรวจ/ทำความสะอาดชุดข้อมูล
// + เอนจินทั้งท่อบนชุดข้อมูลแบบ "มีแต่ราคา" (ไม่มีงบ/เงินไหล) — สายที่ขาดข้อมูลต้องงดออกเสียง ไม่ใช่อ่าน 0 เป็นตัวเลขจริง
// ============================================================

import { describe, expect, test } from "bun:test"
import { generateMarket } from "@/lib/quant/market"
import { runBacktest } from "@/lib/quant/engine/backtest"
import { buildPanel, type PanelStockInput } from "@/lib/quant/engine/panel"
import { buildSynthesisDossier } from "@/lib/quant/engine/synthesis"
import { expectedLatestSession, holidayCoverage, isTradingDay, prevTradingDay, tradingDaysBetween } from "./calendar"
import { normalizeDate, parseMetaCsv, parsePriceCsv, splitCsvLine } from "./csv"
import { computeFreshness } from "./freshness"
import { DatasetSchema, estimateBetas, prepareDataset, type DatasetInput } from "./ingest"
import { mapChartToRows, tsToMarketDate, type YahooChartJson } from "./yahoo"

/** ชุดข้อมูลแบบข้อมูลจริง (ราคา + ปริมาณเป็น "จำนวนหุ้น" ไม่มีงบ/เงินไหล) จาก generator — n หุ้นแรก ช่วง bars วันท้าย */
function realLikeDataset(n = 6, bars = 400): DatasetInput {
  const gen = generateMarket(7)
  return {
    source: "test:generator-as-csv",
    license: "test",
    stocks: gen.stocks.slice(0, n).map((s) => {
      const from = s.series.close.length - bars
      return {
        symbol: s.def.symbol,
        name: s.def.name,
        sector: s.def.sector,
        prices: s.series.close.slice(from).map((c, i) => ({
          date: s.series.dates[from + i].toISOString().slice(0, 10),
          open: s.series.open[from + i],
          high: s.series.high[from + i],
          low: s.series.low[from + i],
          close: c,
          volume: Math.round(s.series.volume[from + i] * 1e6), // ล้านหุ้น → จำนวนหุ้น (แบบที่ feed จริงส่งมา)
        })),
      }
    }),
  }
}

describe("data/calendar — ปฏิทิน SET", () => {
  test("วันหยุด/เสาร์อาทิตย์ · สงกรานต์ 2026 · นับวันซื้อขาย", () => {
    expect(isTradingDay("2026-09-28")).toBe(true) // จันทร์
    expect(isTradingDay("2026-09-27")).toBe(false) // อาทิตย์
    expect(isTradingDay("2026-04-14")).toBe(false) // สงกรานต์
    expect(isTradingDay("2026-02-30")).toBe(false) // ไม่มีวันนี้
    expect(prevTradingDay("2026-04-16")).toBe("2026-04-10")
    expect(tradingDaysBetween("2026-04-10", "2026-04-17")).toBe(2) // 16, 17
    expect(tradingDaysBetween("2026-09-28", "2026-09-28")).toBe(0)
  })

  test("expectedLatestSession: ก่อน 17:30 = วันซื้อขายก่อนหน้า · หลัง 17:30 = วันนี้ · เสาร์ = ศุกร์", () => {
    expect(expectedLatestSession(new Date("2026-09-29T03:00:00Z"))).toBe("2026-09-28") // 10:00 BKK อังคาร
    expect(expectedLatestSession(new Date("2026-09-29T11:00:00Z"))).toBe("2026-09-29") // 18:00 BKK
    expect(expectedLatestSession(new Date("2026-10-03T05:00:00Z"))).toBe("2026-10-02") // เสาร์
    expect(holidayCoverage("2026-09-29").covered).toBe(true)
    expect(holidayCoverage("2027-01-04")).toMatchObject({ covered: false })
  })
})

describe("data/freshness", () => {
  const now = new Date("2026-09-29T11:00:00Z") // 18:00 BKK อังคาร → ควรมีข้อมูลถึง 2026-09-29
  test("ข้อมูลจริง: สด / ตามหลัง 1 วัน / ค้าง · หุ้นที่ราคาจริงเก่ากว่าวันล่าสุดถูกรายงาน", () => {
    expect(computeFreshness({ now, kind: "real", dbLatest: "2026-09-29" }).status).toBe("fresh")
    expect(computeFreshness({ now, kind: "real", dbLatest: "2026-09-28" })).toMatchObject({ status: "lagging", lagSessions: 1 })
    const stale = computeFreshness({
      now,
      kind: "real",
      dbLatest: "2026-09-22",
      lastDateBySymbol: new Map([["PTT", "2026-09-22"], ["XYZ", "2026-09-15"]]),
    })
    expect(stale).toMatchObject({ status: "stale", lagSessions: 5 })
    expect(stale.staleSymbols).toEqual([{ symbol: "XYZ", lastDate: "2026-09-15", lagSessions: 5 }])
    expect(stale.notes.join(" ")).toContain("ค้าง")
  })
  test("ข้อมูลจำลอง: ไม่ประเมินความสด (วันที่เป็นแค่ป้าย) · DB ว่าง = empty", () => {
    const syn = computeFreshness({ now, kind: "synthetic", dbLatest: "2025-01-02" })
    expect(syn).toMatchObject({ status: "synthetic", lagSessions: null })
    expect(syn.notes[0]).toContain("ข้อมูลจำลอง")
    expect(computeFreshness({ now, kind: null, dbLatest: null }).status).toBe("empty")
  })
})

describe("data/csv", () => {
  test("normalizeDate: ISO / YYYYMMDD / DD/MM/YYYY / ปี พ.ศ. · วันที่ไม่มีจริง = null", () => {
    expect(normalizeDate("2026-09-25")).toBe("2026-09-25")
    expect(normalizeDate("20260925")).toBe("2026-09-25")
    expect(normalizeDate("2026/9/5")).toBe("2026-09-05")
    expect(normalizeDate("25/09/2026")).toBe("2026-09-25")
    expect(normalizeDate("25/09/2569")).toBe("2026-09-25")
    expect(normalizeDate("2026-09-25T00:00:00+07:00")).toBe("2026-09-25")
    expect(normalizeDate("2026-02-30")).toBeNull()
    expect(normalizeDate("yesterday")).toBeNull()
  })

  test("parsePriceCsv: หัวแบบ AmiBroker, ตัวคั่น ; , quote, .BK, เลขมี , · บรรทัดเสียถูกข้ามพร้อมเหตุผล", () => {
    const text = [
      "﻿<TICKER>;<DTYYYYMMDD>;<OPEN>;<HIGH>;<LOW>;<CLOSE>;<VOL>",
      'PTT.BK;20260924;33.0;33.5;32.75;"33.25";"41,234,500"',
      "PTT.BK;20260925;33.25;33.75;33.0;33.5;38000000",
      "AOT;20260925;60;61;59.5;60.5;n/a",
      "AOT;bad-date;60;61;59.5;60.5;1",
      "AOT;20260926;60;61;59.5;-1;1",
      "",
    ].join("\r\n")
    const r = parsePriceCsv(text)
    expect(r.rows).toBe(3)
    expect([...r.bySymbol.keys()].sort()).toEqual(["AOT", "PTT"])
    expect(r.bySymbol.get("PTT")![0]).toEqual({ date: "2026-09-24", open: 33, high: 33.5, low: 32.75, close: 33.25, volume: 41234500 })
    expect(r.bySymbol.get("AOT")![0].volume).toBe(0)
    expect(r.issues.map((i) => i.line)).toEqual([5, 6])
    expect(parsePriceCsv("foo,bar\n1,2").issues[0].message).toContain("symbol")
    expect(splitCsvLine('a,"b,""c""",d', ",")).toEqual(["a", 'b,"c"', "d"])
  })

  test("parseMetaCsv: symbol,name,sector,theme,beta", () => {
    const m = parseMetaCsv("symbol,name,sector,theme,beta\nptt,PTT PCL,Energy,Energy-Chain,0.98\nAOT,Airports,,,")
    expect(m.get("PTT")).toEqual({ symbol: "PTT", name: "PTT PCL", sector: "Energy", theme: "Energy-Chain", beta: 0.98 })
    expect(m.get("AOT")).toEqual({ symbol: "AOT", name: "Airports", sector: undefined, theme: undefined, beta: undefined })
  })
})

describe("data/yahoo — mapChartToRows (ไม่ใช้เครือข่าย)", () => {
  // 2026-09-24/25 เปิดตลาด 10:00 BKK = 03:00 UTC · แท่งสุดท้ายซ้ำวันเดียวกัน (intraday) ต้องถูกตัด
  const ts = [Date.UTC(2026, 8, 24, 3) / 1000, Date.UTC(2026, 8, 25, 3) / 1000, Date.UTC(2026, 8, 25, 8) / 1000, Date.UTC(2026, 8, 26, 3) / 1000]
  const json: YahooChartJson = {
    chart: {
      result: [
        {
          meta: { currency: "THB", exchangeName: "SET", exchangeTimezoneName: "Asia/Bangkok" },
          timestamp: ts,
          indicators: {
            quote: [{ open: [10, 11, null, 12], high: [10.5, 11.5, 11.6, 12.5], low: [9.5, 10.5, 10.4, 11.5], close: [10, 11, 11.2, null], volume: [1000, null, 5, 7] }],
            adjclose: [{ adjclose: [9, 11, 11.2, null] }],
          },
        },
      ],
    },
  }
  test("adjusted: คูณ OHLC ด้วย adjclose/close · ข้าม close ว่าง · เก็บแท่งแรกของวัน · ปริมาณว่าง = 0", () => {
    const { rows, currency } = mapChartToRows(json, { adjusted: true })
    expect(currency).toBe("THB")
    expect(rows).toEqual([
      { date: "2026-09-24", open: 9, high: 9.45, low: 8.55, close: 9, volume: 1000 },
      { date: "2026-09-25", open: 11, high: 11.5, low: 10.5, close: 11, volume: 0 },
    ])
    expect(mapChartToRows(json, { adjusted: false }).rows[0].close).toBe(10)
    expect(tsToMarketDate(ts[0], "Asia/Bangkok")).toBe("2026-09-24")
    expect(() => mapChartToRows({ chart: { error: { code: "Not Found", description: "No data found" } } }, { adjusted: true })).toThrow("No data found")
  })
})

describe("data/ingest — ตรวจ + ทำความสะอาด (pure)", () => {
  test("ชุดข้อมูลแบบข้อมูลจริง: ผ่าน · ปริมาณแปลงเป็นล้านหุ้น · beta ถูกประมาณ · เตือนว่าไม่มีงบ/เงินไหล", () => {
    const p = prepareDataset(DatasetSchema.parse(realLikeDataset()))
    expect(p.errors).toEqual([])
    expect(p.ok).toBe(true)
    expect(p.summary).toMatchObject({ symbols: 6, priceRows: 2400, commonBars: 400, withFundamentals: 0, withFlows: 0, betaEstimated: 6 })
    for (const s of p.stocks) {
      expect(s.beta).toBeGreaterThanOrEqual(0.2)
      expect(s.beta).toBeLessThanOrEqual(2.5)
      expect(s.prices.every((r) => r.volume < 1000)).toBe(true) // ล้านหุ้น ไม่ใช่จำนวนหุ้น
      expect(s.prices.every((r) => r.low <= Math.min(r.open, r.close) && r.high >= Math.max(r.open, r.close))).toBe(true)
    }
    expect(p.warnings.some((w) => w.includes("ไม่มีงบการเงิน"))).toBe(true)
    expect(p.warnings.some((w) => w.includes("ไม่มีเงินไหล"))).toBe(true)
  })

  test("ปฏิเสธ: หุ้นน้อยกว่า 5 · สัญลักษณ์ซ้ำ · ช่วงร่วมสั้นกว่า 300 วัน (บอกตัวที่เริ่มช้า)", () => {
    const few = realLikeDataset(3)
    expect(prepareDataset(DatasetSchema.parse(few)).errors[0]).toContain("อย่างน้อย 5")
    const dup = realLikeDataset(6)
    dup.stocks[1] = { ...dup.stocks[1], symbol: dup.stocks[0].symbol }
    expect(prepareDataset(DatasetSchema.parse(dup)).errors).toContain(`สัญลักษณ์ซ้ำ: ${dup.stocks[0].symbol}`)
    const late = realLikeDataset(6)
    late.stocks[2] = { ...late.stocks[2], prices: late.stocks[2].prices.slice(150) }
    const r = prepareDataset(DatasetSchema.parse(late))
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toContain(late.stocks[2].symbol)
    expect(r.summary?.commonBars).toBe(250)
  })

  test("ทำความสะอาด: วันซ้ำใช้แถวหลัง · high<low ถูกตัด · high/low ไม่ครอบถูกขยาย · วันเสาร์อาทิตย์เยอะ = เตือน timezone", () => {
    const ds = realLikeDataset(5)
    const s0 = ds.stocks[0].prices
    s0.push({ ...s0[s0.length - 1], close: s0[s0.length - 1].close * 1.01 }) // วันซ้ำ
    s0[10] = { ...s0[10], high: 1, low: 2 } // high < low
    const c11 = s0[11].close
    s0[11] = { ...s0[11], open: c11, high: c11 * 1.02, low: c11 * 1.01 } // low สูงกว่า open/close → ขยาย low ลงมาครอบ
    ds.stocks[1].prices = ds.stocks[1].prices.map((p) => ({ ...p, date: new Date(Date.parse(`${p.date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) }))
    const p = prepareDataset(DatasetSchema.parse(ds))
    const w = p.warnings.join(" | ")
    expect(w).toContain("วันที่ซ้ำ 1 แถว")
    expect(w).toContain("high < low ทิ้ง 1 แถว")
    expect(w).toContain("ขยาย high/low")
    expect(w).toContain("timezone")
    const last = p.stocks[0].prices.at(-1)!
    expect(last.close).toBeCloseTo(s0[s0.length - 1].close, 8)
  })

  test("schema: สัญลักษณ์/วันที่/ราคาไม่ถูกต้องถูกปฏิเสธก่อนถึงขั้นเตรียม", () => {
    const base = realLikeDataset(5)
    expect(DatasetSchema.safeParse({ ...base, stocks: [{ ...base.stocks[0], symbol: "bad symbol!" }] }).success).toBe(false)
    expect(DatasetSchema.safeParse({ ...base, stocks: [{ ...base.stocks[0], prices: [{ date: "2026-13-01", close: 1 }] }] }).success).toBe(false)
    expect(DatasetSchema.safeParse({ ...base, stocks: [{ ...base.stocks[0], prices: [{ date: "2026-09-25", close: -1 }] }] }).success).toBe(false)
    expect(DatasetSchema.safeParse({ ...base, source: "" }).success).toBe(false)
  })

  test("estimateBetas: หุ้นที่เคลื่อนสองเท่าของตลาดได้ beta สูงกว่าหุ้นที่เคลื่อนครึ่งเดียว", () => {
    const dates = Array.from({ length: 120 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10))
    const mkt = dates.map((_, i) => Math.sin(i / 3) * 0.01)
    const series = (k: number) => {
      let px = 100
      return new Map(dates.map((d, i) => [d, (px *= 1 + k * mkt[i])]))
    }
    const b = estimateBetas(new Map([["HI", series(2)], ["LO", series(0.5)], ["MID", series(1)]]))
    expect(b.get("HI")!).toBeGreaterThan(b.get("MID")!)
    expect(b.get("MID")!).toBeGreaterThan(b.get("LO")!)
  })
})

describe("เอนจินบนชุดข้อมูลแบบมีแต่ราคา", () => {
  test("panel + walk-forward ทำงานครบ ไม่มี NaN · สายเงินไหล/มูลค่า/พื้นฐาน งดออกเสียง (น้ำหนัก 0) แทนการอ่าน 0 เป็นข้อมูลจริง", () => {
    const p = prepareDataset(DatasetSchema.parse(realLikeDataset(6, 400)))
    const state = buildPanel(p.stocks as PanelStockInput[])
    expect(state.stocks.every((s) => s.coverage?.fundamentals === false && s.coverage?.flows === false)).toBe(true)
    expect(state.dates).toHaveLength(400)
    const bt = runBacktest(state)
    for (const v of Object.values(bt.metrics).flat()) expect(Number.isFinite(v)).toBe(true)
    const d = buildSynthesisDossier(state, state.stocks[0].symbol, undefined, bt)!
    for (const key of ["FLOW", "VALUATION", "FUNDAMENTAL"]) {
      const strand = d.strands.find((x) => x.key === key)!
      expect(strand).toMatchObject({ vote: "NEUTRAL", effWeight: 0, trusted: false, value: "ไม่มีข้อมูล" })
    }
    expect(d.strands).toHaveLength(13)
    expect(Number.isFinite(d.score)).toBe(true)
  })
})
