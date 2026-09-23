/// <reference types="bun-types" />
// bun test — เอนจิน feed ส่วนที่ pure (แปลง JSON ของ Yahoo, รายชื่อ, sector, คุณภาพ, แถวจากสคริปต์)
import { afterEach, describe, expect, it } from "bun:test"

import { BLOCKED_AFTER, fetchYahooBatch, fetchYahooDaily, mapChartToRows, tsToMarketDate, type YahooChartJson } from "./yahoo"
import { parseSymbolList, sectorForSymbol, toThSector, FEED_PRESETS } from "./universe"
import { assessSymbol, flagStale, MIN_BARS_WARN } from "./quality"
import { normalizeFeedRows } from "./rows"

// 2026-09-18 03:00 UTC = 10:00 Asia/Bangkok
const T0 = Date.UTC(2026, 8, 18, 3, 0, 0) / 1000
const DAY = 86400

describe("tsToMarketDate", () => {
  it("แปลงตราเวลา UTC เป็นวันที่ของตลาดกรุงเทพ", () => {
    expect(tsToMarketDate(T0, "Asia/Bangkok")).toBe("2026-09-18")
    // 23:30 UTC = 06:30 วันถัดไปที่กรุงเทพ
    expect(tsToMarketDate(Date.UTC(2026, 8, 18, 23, 30) / 1000, "Asia/Bangkok")).toBe("2026-09-19")
  })
})

describe("mapChartToRows", () => {
  const json: YahooChartJson = {
    chart: {
      result: [
        {
          meta: { symbol: "PTT.BK", currency: "THB", exchangeName: "SET", exchangeTimezoneName: "Asia/Bangkok" },
          timestamp: [T0, T0 + DAY, T0 + 2 * DAY, T0 + 2 * DAY + 3600],
          indicators: {
            quote: [
              {
                open: [30, 31, null, 32],
                high: [31, 32, 33, 33],
                low: [29, 30, 31, 31],
                close: [30, null, 32, 32.5],
                volume: [1000, 2000, 3000, 10],
              },
            ],
            adjclose: [{ adjclose: [15, null, 32, 32.5] }],
          },
        },
      ],
      error: null,
    },
  }

  it("ข้ามแถวที่ close ว่าง, ปรับราคาด้วย factor, val ใช้ราคาดิบ, ตัดแท่งซ้ำวัน", () => {
    const { rows, meta } = mapChartToRows("PTT", json, { adjusted: true })
    expect(meta.currency).toBe("THB")
    expect(rows.map((r) => r.date)).toEqual(["2026-09-18", "2026-09-20"])
    // วันแรก factor = 15/30 = 0.5 → OHLC ครึ่งหนึ่ง, val = 30 × 1000 (ราคาดิบ)
    expect(rows[0]).toMatchObject({ symbol: "PTT", close: 15, open: 15, high: 15.5, low: 14.5, val: 30000 })
    // วันที่สาม open เป็น null → คงเป็น null (ไม่เดาแทน)
    expect(rows[1].open).toBeNull()
    expect(rows[1].close).toBe(32)
  })

  it("adjusted=false ใช้ราคาดิบ", () => {
    const { rows } = mapChartToRows("PTT", json, { adjusted: false })
    expect(rows[0].close).toBe(30)
    expect(rows[0].high).toBe(31)
  })

  it("โยน error พร้อมข้อความของ Yahoo เมื่อไม่มี result", () => {
    expect(() => mapChartToRows("XXX", { chart: { result: undefined, error: { code: "Not Found", description: "No data" } } }, { adjusted: true })).toThrow("No data")
  })
})

describe("parseSymbolList", () => {
  it("ตัด .BK, พิมพ์ใหญ่, ไม่ซ้ำ, ขยาย preset, แยกตัวที่รูปแบบผิด", () => {
    const { symbols, invalid } = parseSymbolList("ptt.bk, KBANK\ncpall; ptt bad$$")
    expect(symbols).toEqual(["PTT", "KBANK", "CPALL"])
    expect(invalid).toEqual(["bad$$"])
    const preset = parseSymbolList("SET50, PTT")
    expect(preset.symbols.length).toBe(FEED_PRESETS[0].symbols.length) // PTT อยู่ใน SET50 อยู่แล้ว
  })
})

describe("sector mapping", () => {
  it("แปลงรหัส/ชื่อ sector ของ SET เป็นกลุ่มของแพลตฟอร์ม", () => {
    expect(toThSector("BANK")).toBe("Banking")
    expect(toThSector("Energy & Utilities")).toBe("Energy")
    expect(toThSector("Petrochemicals & Chemicals")).toBe("Material")
    expect(toThSector("Information & Communication Technology")).toBe("ICT")
    expect(toThSector("อะไรก็ไม่รู้")).toBe("Unknown")
  })
  it("sectorForSymbol: override → ตั้งต้น → Unknown", () => {
    expect(sectorForSymbol("PTT")).toBe("Energy")
    expect(sectorForSymbol("ABC", { ABC: "ETRON" })).toBe("Electronic")
    expect(sectorForSymbol("ABC", { ABC: "Banking" })).toBe("Banking")
    expect(sectorForSymbol("ABC", { ABC: "กลุ่มของฉัน" })).toBe("กลุ่มของฉัน")
    expect(sectorForSymbol("ZZZZ")).toBe("Unknown")
  })
})

describe("quality", () => {
  const mk = (n: number, close = 10, val = 1e6) =>
    Array.from({ length: n }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, 1) + i * DAY * 1000).toISOString().slice(0, 10),
      symbol: "AAA",
      close,
      val,
    }))
  it("เตือนประวัติสั้น", () => {
    const r = assessSymbol("AAA", mk(10))
    expect(r.ok).toBe(true)
    expect(r.bars).toBe(10)
    expect(r.warnings.some((w) => w.includes("ประวัติสั้น"))).toBe(true)
  })
  it("เตือนราคากระโดดและมูลค่าซื้อขายเป็น 0", () => {
    const rows = mk(MIN_BARS_WARN + 5, 10, 0)
    rows[20].close = 20
    const r = assessSymbol("AAA", rows)
    expect(r.warnings.some((w) => w.includes("กระโดด"))).toBe(true)
    expect(r.warnings.some((w) => w.includes("มูลค่าซื้อขายเป็น 0"))).toBe(true)
  })
  it("ไม่มีข้อมูล = ok:false", () => {
    expect(assessSymbol("BBB", mk(3)).ok).toBe(false)
  })
  it("flagStale เตือนตัวที่วันล่าสุดตามหลังชุด", () => {
    const a = assessSymbol("AAA", mk(80))
    const b = assessSymbol("BBB", mk(70).map((r) => ({ ...r, symbol: "BBB" })))
    const out = flagStale([a, b])
    expect(out[1].warnings.some((w) => w.includes("ตามหลังชุด"))).toBe(true)
    expect(out[0].warnings.some((w) => w.includes("ตามหลังชุด"))).toBe(false)
  })
})

describe("normalizeFeedRows", () => {
  it("ทิ้งแถวเสีย, ประมาณ val จาก volume, ทำสัญลักษณ์ให้เป็นมาตรฐาน", () => {
    const { rows, dropped } = normalizeFeedRows([
      { date: "2026-09-18", symbol: "ptt.bk", close: 30, volume: 1000 },
      { date: "2026-09-18", symbol: "KBANK", close: 150, val: 5e8, open: 149, high: 151, low: 148 },
      { date: "2026-09-18", symbol: "BAD", close: 0 },
      { date: "", symbol: "X", close: 1 },
    ])
    expect(dropped).toBe(2)
    expect(rows[0]).toMatchObject({ symbol: "PTT", val: 30000, open: null })
    expect(rows[1]).toMatchObject({ symbol: "KBANK", date: "2026-09-18", val: 5e8, high: 151 })
  })

  it("val = null/\"\" (สคริปต์ Python ส่ง None) ใช้ close × volume — เดิม Number(null) = 0 ทำให้ liq5 ตกทั้งตัว", () => {
    const { rows } = normalizeFeedRows([
      { date: "2026-09-18", symbol: "PTT", close: 30, val: null, volume: 1000 },
      { date: "2026-09-18", symbol: "KBANK", close: 150, val: "" as unknown as number, volume: 10 },
      { date: "2026-09-18", symbol: "SCB", close: 100, val: 0, volume: 10 }, // มูลค่า 0 ที่ส่งมาจริง = 0
    ])
    expect(rows.map((r) => r.val)).toEqual([30000, 1500, 0])
  })

  it("แถวที่ไม่ใช่ object ถูกทิ้งแทนที่จะทำให้ทั้งคำขอล้ม", () => {
    const { rows, dropped } = normalizeFeedRows([null, 5, { date: "18/09/2569", symbol: "PTT", close: 30 }] as never)
    expect(dropped).toBe(2)
    expect(rows[0].date).toBe("2026-09-18")
  })
})

describe("sectorForSymbol กับ overrides ที่ผิดชนิด", () => {
  it("ค่าที่ไม่ใช่ข้อความไม่ทำให้ ingest ล้ม (เดิม TypeError หลังเขียน RawDaily ไปแล้ว)", () => {
    expect(sectorForSymbol("PTT", { PTT: 1 } as unknown as Record<string, string>)).toBe("Energy")
    expect(sectorForSymbol("ABC", { ABC: null } as unknown as Record<string, string>)).toBe("Unknown")
    expect(sectorForSymbol("ABC", { ABC: "x".repeat(500) }).length).toBe(40)
  })
})

describe("Yahoo fetch — retry / ถูกบล็อก / งบเวลา", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })
  const mockFetch = (status: number) => {
    let calls = 0
    globalThis.fetch = (async () => {
      calls++
      return new Response("nope", { status })
    }) as unknown as typeof fetch
    return () => calls
  }

  it("403 (ถูกบล็อก) ไม่ถอยหลังลองซ้ำ — ลอง 2 host แล้วจบทันที", async () => {
    const calls = mockFetch(403)
    const t0 = Date.now()
    await expect(fetchYahooDaily("PTT", "1y", { adjusted: true })).rejects.toThrow("HTTP 403")
    expect(calls()).toBe(2)
    expect(Date.now() - t0).toBeLessThan(1000) // เดิมถอยหลัง 1.5+3+4.5 วินาทีต่อตัว
  })

  it("503 (ชั่วคราว) ลองครบ 3 รอบ × 2 host", async () => {
    const calls = mockFetch(503)
    await expect(fetchYahooDaily("PTT", "1y", { adjusted: true, retryDelayMs: 0 })).rejects.toThrow("HTTP 503")
    expect(calls()).toBe(6)
  })

  it("ชุดใหญ่ที่ถูกบล็อกหยุดหลัง 3 ตัวแรก และรายงาน blocked", async () => {
    const calls = mockFetch(403)
    const syms = Array.from({ length: 53 }, (_, i) => `S${i}`)
    const res = await fetchYahooBatch(syms, "1y", { adjusted: true, delayMs: 0 })
    expect(res.blocked).toBe(true)
    expect(res.reports).toHaveLength(53)
    expect(calls()).toBe(BLOCKED_AFTER * 2)
    expect(res.reports.slice(BLOCKED_AFTER).every((r) => !r.ok && (r.error ?? "").startsWith("ข้าม"))).toBe(true)
  })

  it("404 (ไม่พบสัญลักษณ์) ไม่นับว่าเครือข่ายถูกบล็อก", async () => {
    mockFetch(404)
    const res = await fetchYahooBatch(["AAA", "BBB", "CCC", "DDD"], "1y", { adjusted: true, delayMs: 0 })
    expect(res.blocked).toBe(false)
    expect(res.reports.every((r) => (r.error ?? "").startsWith("ไม่พบสัญลักษณ์"))).toBe(true)
  })

  it("เลยงบเวลา → ตัวที่เหลือรายงานว่าข้าม (route ไม่ timeout ทั้งคำขอ)", async () => {
    const calls = mockFetch(403)
    const res = await fetchYahooBatch(["AAA", "BBB"], "1y", { adjusted: true, delayMs: 0, deadline: Date.now() - 1 })
    expect(calls()).toBe(0)
    expect(res.reports.map((r) => r.error?.startsWith("ข้าม"))).toEqual([true, true])
  })
})
