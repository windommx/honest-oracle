/// <reference types="bun-types" />
// bun test — runBacktest: กติกาการออกที่ตัดสินเมื่อ 2026-09-23 (DB ชั่วคราวจาก preload src/test/setup.ts)
//   (1) หุ้นหยุดซื้อขาย/ไม่มีราคาครบ NO_PRICE_EXIT_DAYS วันทำการ → บังคับปิดที่ราคาปิดล่าสุดที่มี (เดิมค้างตลอดไป)
//   (2) stop ขายที่ "ราคาปิดวันที่ทะลุ" (gap ลงลึกกว่า stop ได้ผลจริง) — ล็อกพฤติกรรมที่ถูกอยู่แล้วให้ตรงกับ live
import { beforeAll, describe, expect, it } from "bun:test"
import { existsSync, realpathSync } from "fs"

const TMP = process.env.TEST_DB_FILE ?? ""
let ready = false
if (TMP && existsSync(TMP)) {
  const { db } = await import("@/lib/db")
  const list = await db.$queryRaw<{ name: string; file: string }[]>`PRAGMA database_list`
  const main = list.find((r) => r.name === "main")?.file ?? ""
  ready = main !== "" && existsSync(main) && realpathSync(main) === realpathSync(TMP)
  if (!ready) console.warn(`[engine.exits.test] Prisma ชี้ ${main} ไม่ใช่ DB ชั่วคราว — ข้ามเทสต์ที่ใช้ DB`)
} else {
  console.warn("[engine.exits.test] ไม่มี DB ชั่วคราวจาก preload — ข้ามเทสต์ที่ใช้ DB")
}

const day = (i: number) => new Date(Date.UTC(2025, 2, 3 + i)).toISOString().slice(0, 10)
type Row = { date: string; symbol: string; close: number; open: null; high: null; low: null; val: number }
const row = (i: number, symbol: string, close: number): Row => ({ date: day(i), symbol, close, open: null, high: null, low: null, val: 5e7 })

describe.skipIf(!ready)("runBacktest — การออกเมื่อไม่มีราคา / gap ทะลุ stop", async () => {
  const { db } = await import("@/lib/db")
  const { runBacktest } = await import("./engine")
  const { ingestRows, invalidateDataCache } = await import("./core")
  const { NO_PRICE_EXIT_DAYS } = await import("@/lib/jev/exit")
  const P = { k: 1, hold: 5, stopPct: 0.5, maxPos: 1, costBps: 30, slipBps: 40 } // 70bps ต่อขา

  async function resetMarket() {
    await db.snapshot.deleteMany()
    await db.rawDaily.deleteMany()
    invalidateDataCache()
  }
  beforeAll(resetMarket)

  it("หยุดซื้อขายหลังวันที่ 5: ปิดวันที่ 5+10 ที่ราคาปิดล่าสุด (12.5) และคืนช่องให้สัญญาณถัดไป", async () => {
    await resetMarket()
    const rows: Row[] = []
    for (let i = 0; i <= 30; i++) {
      rows.push(row(i, "AAA", 10)) // ทำให้ปฏิทินข้อมูลมีทุกวัน
      rows.push(row(i, "CCC", 20 + i * 0.1))
      if (i <= 5) rows.push(row(i, "BBB", 10 + 0.5 * i)) // 10, 10.5, 11, 11.5, 12, 12.5 แล้วหายไป
    }
    await ingestRows(rows)
    const signals = new Map([
      [day(1), new Set(["BBB"])], // ซื้อวันที่ 2 ที่ 11
      [day(16), new Set(["CCC"])], // ช่องว่างหลัง BBB ถูกบังคับปิด → ซื้อวันที่ 17
    ])
    const full = await runBacktest(P, signals)
    expect(NO_PRICE_EXIT_DAYS).toBe(10)
    const bbb = full.trades.find((t) => t.symbol === "BBB")
    expect(bbb).toBeDefined() // เดิม: ไม่มีเทรด BBB เลย (ถือค้างตลอดไป)
    expect(bbb).toMatchObject({ entryDate: day(2), exitDate: day(15), entryPx: 11, exitPx: 12.5, reason: "time", delisted: true })
    expect(bbb!.ret).toBeCloseTo((12.5 / 11 - 1 - 0.014) * 100, 2)
    expect(bbb!.note).toContain("หยุดซื้อขาย/ไม่มีราคา 10 วัน — ปิดที่ราคาล่าสุดที่มี")
    expect(full.delistExits).toBe(1)
    // ช่อง maxPos = 1 ว่างแล้ว → CCC เข้าได้ และออกตาม hold ปกติ (เดิม CCC ไม่เคยได้เข้า)
    const ccc = full.trades.find((t) => t.symbol === "CCC")
    expect(ccc).toMatchObject({ entryDate: day(17), exitDate: day(22), reason: "time" })
    expect(ccc!.delisted).toBeUndefined()
    // equity วันบังคับปิด: ราคาถูก mark ถึง 12.5 ไปแล้ว → เหลือแค่ต้นทุนขาออก 0.7%
    const eq = new Map(full.equity.map((p) => [p.date, p.strategy]))
    expect(eq.get(day(15))! / eq.get(day(14))!).toBeCloseTo(1 - 0.007, 3)
  })

  it("หยุดพักสั้นกว่า 10 วัน: ไม่บังคับปิด — ออกตาม hold ในวันแรกที่มีราคากลับมา (พฤติกรรมเดิมคงอยู่)", async () => {
    await resetMarket()
    const rows: Row[] = []
    for (let i = 0; i <= 20; i++) {
      rows.push(row(i, "AAA", 10))
      if (i < 4 || i > 8) rows.push(row(i, "BBB", i > 8 ? 13 : 10)) // หายวันที่ 4–8 (5 วัน) แล้วกลับมาที่ 13
    }
    await ingestRows(rows)
    const full = await runBacktest(P, new Map([[day(1), new Set(["BBB"])]]))
    expect(full.trades).toEqual([
      { symbol: "BBB", entryDate: day(2), exitDate: day(9), entryPx: 10, exitPx: 13, ret: 28.6, reason: "time" },
    ])
    expect(full.delistExits).toBe(0)
  })

  it("gap ลงทะลุ stop: ขายที่ราคาปิดวัน gap (7.0 → −31.4%) ไม่ใช่ราคา stop (9.1) — ตรงกับ live Jev", async () => {
    await resetMarket()
    const rows: Row[] = []
    for (let i = 0; i <= 10; i++) {
      rows.push(row(i, "AAA", 10))
      rows.push(row(i, "BBB", i <= 3 ? 10 : 7))
    }
    await ingestRows(rows)
    const full = await runBacktest({ ...P, stopPct: 0.09, hold: 8 }, new Map([[day(1), new Set(["BBB"])]]))
    expect(full.trades).toEqual([
      { symbol: "BBB", entryDate: day(2), exitDate: day(4), entryPx: 10, exitPx: 7, ret: -31.4, reason: "stop" },
    ])
  })
})
