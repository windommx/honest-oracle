/// <reference types="bun-types" />
// bun test — data trust layer (pure): ปฏิทิน SET · freshness · reconciliation · corporate action · provenance · inbox · แผน ingest
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import {
  bangkokClock,
  defaultHolidayCalendar,
  expectedLatestSession,
  holidayCoverage,
  isTradingDay,
  nextTradingDay,
  parseHolidayList,
  prevTradingDay,
  tradingDaysBetween,
} from "./calendar"
import { activeUniverse, computeFreshness } from "./freshness"
import { classifySymbol, mergeByPrecedence, reconcileCloses, summarizeRecon, type CloseRow } from "./reconcile"
import { classifyMove, detectCorporateActions } from "./corporate-actions"
import { dataEpoch, evidenceDataLabel, epochSourceIds, provenanceFor, SOURCE_PROVENANCE } from "./provenance"
import { listInbox, moveInboxFiles, parseInboxCsv, parseInboxJson, readInboxFile, sourceFromName } from "./inbox"
import { planIngest, resolveSession } from "./pipeline"

const cal = defaultHolidayCalendar()

describe("ปฏิทินซื้อขาย SET", () => {
  it("เสาร์–อาทิตย์และวันหยุดไม่ใช่วันซื้อขาย", () => {
    expect(isTradingDay("2026-09-23", cal)).toBe(true) // พุธ
    expect(isTradingDay("2026-09-26", cal)).toBe(false) // เสาร์
    expect(isTradingDay("2026-04-13", cal)).toBe(false) // สงกรานต์
    expect(isTradingDay("2026-02-30", cal)).toBe(false) // วันที่ไม่มีจริง
  })

  it("วันซื้อขายก่อน/หลัง ข้ามสงกรานต์ + เสาร์อาทิตย์", () => {
    expect(prevTradingDay("2026-04-16", cal)).toBe("2026-04-10")
    expect(nextTradingDay("2026-04-10", cal)).toBe("2026-04-16")
    expect(tradingDaysBetween("2026-04-10", "2026-04-16", cal)).toBe(1)
    expect(tradingDaysBetween("2026-09-18", "2026-09-23", cal)).toBe(3)
    expect(tradingDaysBetween("2026-09-23", "2026-09-18", cal)).toBe(0)
  })

  it("expected session: ก่อน 17:30 = วันก่อนหน้า · หลัง = วันนี้ · เสาร์ = ศุกร์ · วันหยุด = วันซื้อขายก่อนหน้า", () => {
    expect(expectedLatestSession(new Date("2026-09-23T06:00:00Z"), cal)).toBe("2026-09-22") // 13:00 BKK
    expect(expectedLatestSession(new Date("2026-09-23T11:00:00Z"), cal)).toBe("2026-09-23") // 18:00 BKK
    expect(expectedLatestSession(new Date("2026-09-26T11:00:00Z"), cal)).toBe("2026-09-25") // เสาร์
    expect(expectedLatestSession(new Date("2026-04-13T12:00:00Z"), cal)).toBe("2026-04-10") // สงกรานต์
  })

  it("เวลากรุงเทพข้ามเที่ยงคืน UTC ได้ถูก (ไม่ขึ้นกับ TZ เครื่อง)", () => {
    const c = bangkokClock(new Date("2026-09-22T20:30:00Z"))
    expect(c.date).toBe("2026-09-23")
    expect(c.minutes).toBe(3 * 60 + 30)
  })

  it("ไฟล์วันหยุดของผู้ใช้แทนที่เฉพาะปีที่ระบุ + รายงานวันที่เสีย", () => {
    const { calendar, invalid } = parseHolidayList({ holidays: ["2027-01-01", { date: "2027-04-13", name: "สงกรานต์" }, "31/12/2027", "2027-02-30"] })
    expect(invalid).toEqual(["31/12/2027", "2027-02-30"])
    expect(isTradingDay("2027-01-01", calendar)).toBe(false)
    expect(calendar.names.get("2027-04-13")).toBe("สงกรานต์")
    expect(isTradingDay("2026-04-13", calendar)).toBe(false) // ปี 2026 ยังใช้ค่าตั้งต้น
    expect(calendar.source).toBe("file")
    expect(holidayCoverage("2027-06-01", cal).covered).toBe(false)
    expect(holidayCoverage("2027-06-01", calendar).covered).toBe(true)
  })
})

describe("freshness monitor", () => {
  const last = new Map([
    ["AAA", "2026-09-22"],
    ["BBB", "2026-09-21"],
    ["CCC", "2026-09-08"], // ค้าง 10 วัน (ยังอยู่ใน active window)
    ["DDD", "2026-08-10"], // เลิกเทรด — หลุด active universe
  ])
  it("active universe ตัดหุ้นที่ไม่มีแท่งเกิน 20 วันซื้อขาย", () => {
    expect(activeUniverse(last, "2026-09-22", cal)).toEqual(["AAA", "BBB", "CCC"])
  })
  it("ความค้างรายตัว + % อัปเดต + สถานะรวม", () => {
    const f = computeFreshness({ now: new Date("2026-09-23T06:00:00Z"), lastDateBySymbol: last, calendar: cal })
    expect(f.expectedSession).toBe("2026-09-22")
    expect(f.status).toBe("fresh")
    expect(f.universeSize).toBe(3)
    expect(f.pctUpdated).toBe(33.3)
    expect(f.counts).toEqual({ fresh: 1, lagging: 1, stale: 1, missing: 0 })
    expect(f.laggards.map((r) => [r.symbol, r.lagSessions])).toEqual([
      ["CCC", 10],
      ["BBB", 1],
    ])
  })
  it("universe กำหนดเอง: ตัวที่ไม่มีข้อมูล = missing · DB ตามหลัง 2 วัน = stale", () => {
    const f = computeFreshness({ now: new Date("2026-09-24T11:00:00Z"), lastDateBySymbol: last, universe: ["AAA", "ZZZ"], calendar: cal })
    expect(f.expectedSession).toBe("2026-09-24")
    expect(f.lagSessions).toBe(2)
    expect(f.status).toBe("stale")
    expect(f.counts.missing).toBe(1)
    expect(f.pctUpdated).toBe(0)
  })
  it("DB ว่าง = empty (ไม่ใช่ 'สด')", () => {
    const f = computeFreshness({ now: new Date(), lastDateBySymbol: new Map(), calendar: cal })
    expect(f.status).toBe("empty")
    expect(f.pctUpdated).toBeNull()
  })
})

const series = (sym: string, closes: number[], start = "2026-09-01"): CloseRow[] => {
  const out: CloseRow[] = []
  let d = start
  for (const c of closes) {
    while (!isTradingDay(d, cal)) d = nextTradingDay(d, cal)
    out.push({ date: d, symbol: sym, close: c })
    d = nextTradingDay(d, cal)
  }
  return out
}

describe("cross-source reconciliation (> 0.5% = ติดธง)", () => {
  const base = [10, 10.2, 10.1, 10.4, 10.3, 10.6, 10.5, 10.8]
  it("ตรงกัน = match · ต่าง 0.4% ไม่ติดธง", () => {
    const r = reconcileCloses({ source: "yahoo", rows: series("PTT", base.map((c) => c * 1.004)) }, { source: "db", rows: series("PTT", base) })
    expect(r.counts.match).toBe(1)
    expect(r.flagged).toBe(0)
  })
  it("ช่วงต้นต่างคงที่ 3% แล้วตรงกัน = rebased (ปันผลถูกปรับย้อนหลัง) พร้อมวันที่ขอบ", () => {
    const inc = series("PTT", base.map((c, i) => (i < 5 ? c * 0.97 : c)))
    const r = reconcileCloses({ source: "yahoo", rows: inc }, { source: "db", rows: series("PTT", base) })
    expect(r.bySymbol[0].kind).toBe("rebased")
    expect(r.bySymbol[0].basisChangeDate).toBe(inc[5].date)
    expect(r.flagged).toBe(5)
    expect(summarizeRecon(r).rebased).toEqual(["PTT"])
  })
  it("ต่างคงที่ทุกวัน = rescaled (คนละฐานราคา) · ต่างแบบสุ่ม = conflict", () => {
    const resc = reconcileCloses({ source: "set", rows: series("KBANK", base.map((c) => c * 2)) }, { source: "db", rows: series("KBANK", base) })
    expect(resc.bySymbol[0].kind).toBe("rescaled")
    const noisy = base.map((c, i) => c * (1 + (i % 2 ? 0.03 : -0.02)))
    const conf = reconcileCloses({ source: "csv", rows: series("SCB", noisy) }, { source: "db", rows: series("SCB", base) })
    expect(conf.bySymbol[0].kind).toBe("conflict")
    expect(conf.flaggedPairs[0].symbol).toBe("SCB")
  })
  it("classifySymbol: ช่วงท้ายต่าง (ไม่ใช่ prefix) = conflict ไม่ใช่ rebased", () => {
    const pairs = series("X", base).map((r, i) => ({ date: r.date, symbol: "X", a: i >= 5 ? r.close * 0.97 : r.close, b: r.close, diffPct: 0 }))
    expect(classifySymbol(pairs).kind).toBe("conflict")
  })
  it("ผสานหลายแหล่ง: Settrade (ทางการ) ชนะ Yahoo วัน/หุ้นเดียวกัน · กลุ่มแหล่งหลักอยู่ท้าย", () => {
    const y = series("PTT", [30, 31, 32]).map((r) => ({ ...r, val: 1 }))
    const s = series("PTT", [30.5]).map((r) => ({ ...r, val: 2 }))
    const m = mergeByPrecedence([
      { source: "yahoo", rows: y },
      { source: "settrade", rows: s },
    ])
    expect(m.rows).toHaveLength(3)
    expect(m.rows[0]).toMatchObject({ close: 30.5, val: 2 })
    expect(m.chosen).toEqual({ settrade: 1, yahoo: 2 })
    expect(m.overlaps).toBe(1)
    expect(m.groups.map((g) => g.source)).toEqual(["settrade", "yahoo"])
  })
})

describe("corporate action (เกินเพดาน/พื้น ±30% ของ SET)", () => {
  it("จำแนกชนิด: ÷2 = split-like · ×10 = reverse · −40% = drop · +40% = jump", () => {
    expect(classifyMove(100, 50)).toEqual({ kind: "split-like", splitFactor: 2 })
    expect(classifyMove(1, 10)).toEqual({ kind: "reverse-split-like", splitFactor: 10 })
    expect(classifyMove(100, 60)).toEqual({ kind: "drop", splitFactor: null })
    expect(classifyMove(10, 14)).toEqual({ kind: "jump", splitFactor: null })
  })
  it("ชนเพดานพอดี +30% (และ +30.2% จากปัดเศษ adjusted) ไม่ติดธง · +31% ติดธง", () => {
    expect(detectCorporateActions(series("A", [10, 13, 16.926]))).toHaveLength(0)
    const f = detectCorporateActions(series("B", [10, 13.1]))
    expect(f).toHaveLength(1)
    expect(f[0]).toMatchObject({ symbol: "B", changePct: 31, kind: "jump" })
  })
  it("เทียบราคาปิดล่าสุดที่มี (ข้ามช่วงพักการซื้อขาย) + นับวันที่หายไป + กรอง since", () => {
    const rows = [...series("C", [20], "2026-08-03"), ...series("C", [10], "2026-09-01")]
    const f = detectCorporateActions(rows, { calendar: cal })
    expect(f).toHaveLength(1)
    expect(f[0].kind).toBe("split-like")
    expect(f[0].gapSessions).toBeGreaterThanOrEqual(5)
    expect(f[0].note).toContain("หยุดพัก")
    expect(detectCorporateActions(rows, { since: "2026-09-02" })).toHaveLength(0)
  })
})

describe("provenance + licensing", () => {
  it("หาแหล่งจากชื่อที่ ingest บันทึก · แหล่งไม่รู้จัก = known false", () => {
    expect(provenanceFor("set-20260923").id).toBe("set")
    expect(provenanceFor("settrade").official).toBe(true)
    expect(provenanceFor("yahoo").commercialUse).toBe("no")
    expect(provenanceFor("fixture-real-like").known).toBe(false)
    expect(Object.values(SOURCE_PROVENANCE).every((s) => s.terms.length > 20 && s.license.length > 5)).toBe(true)
  })
  it("ยุคข้อมูลเริ่มที่ seed / replaceDemo ล่าสุด + ประวัติ ingest ต่อแหล่ง", () => {
    const ev = [
      { id: 1, kind: "seed", payload: "{}", ts: "2026-09-01T00:00:00Z" },
      { id: 2, kind: "ingest", payload: JSON.stringify({ kind: "feed", source: "fixture-x", replacedDemo: true, insertedRaw: 100, latestDate: "2026-09-10" }), ts: "2026-09-10T00:00:00Z" },
      { id: 3, kind: "ingest", payload: JSON.stringify({ kind: "feed", source: "yahoo", insertedRaw: 5, latestDate: "2026-09-11" }), ts: "2026-09-11T00:00:00Z" },
      { id: 4, kind: "ingest", payload: JSON.stringify({ kind: "history", insertedRaw: 7 }), ts: "2026-09-12T00:00:00Z" },
    ]
    const e = dataEpoch(ev)
    expect(e.startEventId).toBe(2)
    expect(e.startKind).toBe("replace-demo")
    expect(e.latestSource).toBe("csv")
    expect(epochSourceIds(e).sort()).toEqual(["csv", "fixture-x", "yahoo"])
    expect(e.sources.find((s) => s.source === "fixture-x")?.rows).toBe(100)
  })
  it("ป้ายหลักฐาน: REAL ต้องทุกแหล่งในยุครู้จัก · fixture ปน = UNVERIFIED_SOURCE · seed = SYNTHETIC", () => {
    const real = { isSynthetic: false, dataLabel: "REAL (feed: yahoo)" }
    expect(evidenceDataLabel(real, ["yahoo", "set"])).toBe("REAL")
    expect(evidenceDataLabel(real, ["fixture-real-like", "yahoo"])).toBe("UNVERIFIED_SOURCE")
    expect(evidenceDataLabel({ isSynthetic: true, dataLabel: "SYNTHETIC (demo seed)" }, [])).toBe("SYNTHETIC")
    expect(evidenceDataLabel({ isSynthetic: true, dataLabel: "MIXED — demo seed + feed: yahoo (ยังมีหุ้นจำลองปน)" }, ["yahoo"])).toBe("MIXED")
    expect(evidenceDataLabel({ isSynthetic: true, dataLabel: "NO DATA — ยังไม่มีข้อมูลตลาด" }, [])).toBe("NO_DATA")
  })
})

describe("inbox (ไฟล์จาก settfex / Settrade)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "inbox-test-"))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it("เดาแหล่งจากชื่อไฟล์", () => {
    expect(sourceFromName("set-20260923.csv")).toBe("set")
    expect(sourceFromName("settrade-20260923.json")).toBe("settrade")
    expect(sourceFromName("mydata.csv")).toBeNull()
  })
  it("JSON {source, rows} + แจ้งว่า replaceDemo ถูกเพิกเฉย · array ตรง ๆ · JSON เสีย", () => {
    const a = parseInboxJson(JSON.stringify({ source: "settrade", replaceDemo: true, rows: [{ date: "2026-09-23", symbol: "ptt.bk", close: 30, volume: 10 }, { date: "", symbol: "X", close: 1 }] }), "external")
    expect(a.source).toBe("settrade")
    expect(a.rows).toEqual([{ date: "2026-09-23", symbol: "PTT", close: 30, open: null, high: null, low: null, val: 300 }])
    expect(a.dropped).toBe(1)
    expect(a.notes[0]).toContain("replaceDemo")
    expect(parseInboxJson(JSON.stringify([{ date: "2026-09-23", symbol: "KBANK", close: 150, val: 1e9 }]), "external").rows).toHaveLength(1)
    expect(parseInboxJson("{oops", "external").error).toContain("JSON เสีย")
  })
  it("CSV รูปแบบของ fetch_set_feed.py (date,symbol,open,high,low,close,val)", () => {
    const r = parseInboxCsv("date,symbol,open,high,low,close,val\n2026-09-23,PTT,,,,30.25,1500000000\n", "set")
    expect(r.rows[0]).toMatchObject({ date: "2026-09-23", symbol: "PTT", close: 30.25, open: null, val: 1.5e9 })
  })
  it("list/read/move: ไฟล์ sector ข้าง ๆ ติดไปด้วย · ชื่อซ้ำไม่ทับของเดิม", async () => {
    writeFileSync(path.join(dir, "set-20260923.csv"), "date,symbol,close,val\n2026-09-23,PTT,30,1000000\n")
    writeFileSync(path.join(dir, "set-20260923.sectors.json"), JSON.stringify({ PTT: "Energy" }))
    writeFileSync(path.join(dir, "settrade-20260923.json"), JSON.stringify({ source: "settrade", rows: [] }))
    writeFileSync(path.join(dir, "notes.txt"), "ignore me")
    const files = await listInbox(dir)
    expect(files.map((f) => f.name)).toEqual(["set-20260923.csv", "settrade-20260923.json"])
    const csv = await readInboxFile(files[0])
    expect(csv.source).toBe("set")
    expect(csv.sectors).toEqual({ PTT: "Energy" })
    const empty = await readInboxFile(files[1])
    expect(empty.rows).toHaveLength(0)
    const dest = path.join(dir, "archive", "2026-09-23")
    await moveInboxFiles([files[0]], dest)
    writeFileSync(path.join(dir, "set-20260923.csv"), "date,symbol,close,val\n2026-09-23,PTT,30,1000000\n")
    await moveInboxFiles([{ ...files[0], sectorsPath: null }], dest)
    expect(readdirSync(dest).sort()).toEqual(["set-20260923.1.csv", "set-20260923.csv", "set-20260923.sectors.json"])
    expect(existsSync(path.join(dir, "set-20260923.csv"))).toBe(false)
  })
})

describe("สายพานรายวัน — ส่วน pure", () => {
  it("resolveSession: --date วันเสาร์ = error (เว้น --force) · ไม่ระบุ: เสาร์ → ศุกร์ (นอกเวลา) · หลัง 17:30 = วันนี้", () => {
    expect(resolveSession({ now: new Date("2026-09-23T11:00:00Z"), date: "2026-09-26", force: false, calendar: cal }).error).toContain("ไม่ใช่วันซื้อขาย")
    expect(resolveSession({ now: new Date("2026-09-23T11:00:00Z"), date: "2026-09-26", force: true, calendar: cal }).error).toBeNull()
    const sat = resolveSession({ now: new Date("2026-09-26T05:00:00Z"), date: null, force: false, calendar: cal })
    expect(sat).toMatchObject({ session: "2026-09-25", todayTrading: false, offHours: true })
    const eve = resolveSession({ now: new Date("2026-09-23T11:00:00Z"), date: null, force: false, calendar: cal })
    expect(eve).toMatchObject({ session: "2026-09-23", offHours: false })
  })
  it("planIngest: แถวใหม่/แถวที่เปลี่ยนเท่านั้น · OHLC ว่างไม่นับว่าเปลี่ยน · แถวซ้ำในชุดแถวหลังชนะ", () => {
    const db = [
      { date: "2026-09-22", symbol: "PTT", close: 30, val: 100, open: 29, high: 31, low: 28 },
      { date: "2026-09-22", symbol: "KBANK", close: 150, val: 100, open: null, high: null, low: null },
    ]
    const p = planIngest(
      [
        { date: "2026-09-22", symbol: "PTT", close: 30, val: 100, open: null, high: null, low: null }, // เหมือนเดิม (OHLC ว่าง)
        { date: "2026-09-22", symbol: "KBANK", close: 151, val: 100 }, // เปลี่ยน
        { date: "2026-09-23", symbol: "PTT", close: 30.5, val: 120 },
        { date: "2026-09-23", symbol: "PTT", close: 30.75, val: 120 }, // ซ้ำ — แถวหลังชนะ
      ],
      db,
    )
    expect({ newRows: p.newRows, changedRows: p.changedRows, unchanged: p.unchanged }).toEqual({ newRows: 1, changedRows: 1, unchanged: 1 })
    expect(p.rows.find((r) => r.date === "2026-09-23")?.close).toBe(30.75)
  })
})
