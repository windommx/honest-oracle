/// <reference types="bun-types" />
// bun test — ส่วนที่ต้องใช้ DB ของ slice backtest/วิจัย (ใช้ DB ชั่วคราวจาก preload src/test/setup.ts — schema จริง):
// runBacktest (annualize, ข้อมูล < 2 วัน, วันหยุดซื้อขาย + ต้นทุนสองขา), cache valuePivot/featureCtx หลัง ingest ทับแถวเดิม,
// hash chain ของ emitEvent ตอนยิงพร้อมกัน, และ edge case ของ route (DB ว่าง, body ไม่ใช่ object, ค่าเศษ)
import { beforeAll, describe, expect, it } from "bun:test"
import { existsSync, realpathSync } from "fs"

// preload ชี้ DATABASE_URL ไปไฟล์ชั่วคราวให้ทั้งรอบแล้ว (bun test แชร์ module/Prisma singleton ข้ามไฟล์)
// ป้องกันเขียนผิดไฟล์: ตรวจด้วย PRAGMA database_list ว่า client ชี้ไฟล์ชั่วคราวนั้นจริงก่อนเขียนอะไร
const TMP = process.env.TEST_DB_FILE ?? ""
let ready = false
if (TMP && existsSync(TMP)) {
  const { db } = await import("@/lib/db")
  const list = await db.$queryRaw<{ name: string; file: string }[]>`PRAGMA database_list`
  const main = list.find((r) => r.name === "main")?.file ?? ""
  ready = main !== "" && existsSync(main) && realpathSync(main) === realpathSync(TMP)
  if (!ready) console.warn(`[engine.test] Prisma ชี้ ${main} ไม่ใช่ DB ชั่วคราว — ข้ามเทสต์ที่ใช้ DB`)
} else {
  console.warn("[engine.test] ไม่มี DB ชั่วคราวจาก preload (รันด้วย bun test ที่โฟลเดอร์แอป) — ข้ามเทสต์ที่ใช้ DB")
}

const P = { k: 1, hold: 60, stopPct: 0.5, maxPos: 1, costBps: 0, slipBps: 0 }
const day = (i: number) => {
  const d = new Date(Date.UTC(2025, 0, 1 + i))
  return d.toISOString().slice(0, 10)
}
type Row = { date: string; symbol: string; close: number; open: null; high: null; low: null; val: number }
const row = (i: number, symbol: string, close: number, val = 5e7): Row => ({ date: day(i), symbol, close, open: null, high: null, low: null, val })

function expectFiniteStats(stats: Record<string, number>) {
  for (const [k, v] of Object.entries(stats)) {
    expect(`${k}=${v}`).toBe(`${k}=${Number.isFinite(v) ? v : "NaN"}`)
  }
}

describe.skipIf(!ready)("backtest slice (DB ชั่วคราว)", async () => {
  const { db } = await import("@/lib/db")
  const { runBacktest, valuePivot } = await import("./engine")
  const { closePivot, ingestRows, invalidateDataCache } = await import("./core")
  const { buildMetaPanel } = await import("@/lib/research/features")
  const { emitEvent, auditEvents } = await import("@/lib/research/events")
  const backtestRoute = await import("@/app/api/backtest/route")
  const trialRoute = await import("@/app/api/research/trial/route")
  const cpcvRoute = await import("@/app/api/research/cpcv/route")
  const preregRoute = await import("@/app/api/research/prereg/route")

  const post = (path: string, body: string) =>
    new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body })

  // DB ชั่วคราวใช้ร่วมกันทั้งรอบ test → เริ่มชุดนี้จากตารางว่างเสมอ (ไม่ขึ้นกับลำดับไฟล์)
  beforeAll(async () => {
    await db.$transaction([
      db.snapshot.deleteMany(),
      db.rawDaily.deleteMany(),
      db.researchRun.deleteMany(),
      db.backtestRun.deleteMany(),
      db.eventLog.deleteMany(),
      db.setting.deleteMany(),
      db.decision.deleteMany(),
    ])
    invalidateDataCache()
  })

  async function resetMarket() {
    await db.snapshot.deleteMany()
    await db.rawDaily.deleteMany()
    invalidateDataCache()
  }

  it("DB ว่าง: runBacktest ไม่มี NaN/วันที่ undefined · trial/CPCV ตอบ 400 ข้อความไทย ไม่บันทึกผลสมมติ", async () => {
    const full = await runBacktest(P, new Map())
    expectFiniteStats(full.stats as unknown as Record<string, number>)
    expect(full.equity).toEqual([])

    const tr = await trialRoute.POST()
    expect(tr.status).toBe(400)
    expect(((await tr.json()) as { error: string }).error).toContain("ข้อมูล")
    const cp = await cpcvRoute.POST(post("/api/research/cpcv", "{}"))
    expect(cp.status).toBe(400)
    expect(await db.researchRun.count()).toBe(0)
  })

  it("body เป็น JSON null ไม่ทำให้ route พังเป็น 500", async () => {
    expect((await backtestRoute.POST(post("/api/backtest", "null"))).status).toBe(400) // ข้อมูลไม่พอ ไม่ใช่ 500
    expect((await cpcvRoute.POST(post("/api/research/cpcv", "null"))).status).toBe(400)
    const pr = await preregRoute.POST(post("/api/research/prereg", "null"))
    expect(pr.status).toBe(200)
    await preregRoute.POST(post("/api/research/prereg", JSON.stringify({ reset: true })))
  })

  it("prereg: ล็อกแล้วเปลี่ยนกติกาเงียบ ๆ ไม่ได้ (409) · ล็อกซ้ำกติกาเดิมไม่เลื่อน frozenAt · reset แล้วล็อกใหม่ได้", async () => {
    const freeze = async (params: Record<string, unknown>) =>
      preregRoute.POST(post("/api/research/prereg", JSON.stringify({ params })))
    const a = (await (await freeze({})).json()) as { prereg: { hash: string; frozenAt: string } }
    const again = await freeze({})
    expect(again.status).toBe(200)
    expect(((await again.json()) as { prereg: { frozenAt: string } }).prereg.frozenAt).toBe(a.prereg.frozenAt)
    const changed = await freeze({ hold: 20 })
    expect(changed.status).toBe(409)
    expect(((await (await preregRoute.GET()).json()) as { prereg: { hash: string } }).prereg.hash).toBe(a.prereg.hash)
    await preregRoute.POST(post("/api/research/prereg", JSON.stringify({ reset: true })))
    const fresh = await freeze({ hold: 20 })
    expect(fresh.status).toBe(200)
    await preregRoute.POST(post("/api/research/prereg", JSON.stringify({ reset: true })))
  })

  it("ข้อมูล 1 วัน: stats ทุกตัวเป็นตัวเลขจริง และ equity มีวันที่", async () => {
    await resetMarket()
    await ingestRows([row(0, "AAA", 10)])
    const full = await runBacktest(P, new Map())
    expectFiniteStats(full.stats as unknown as Record<string, number>)
    expect(full.equity).toEqual([{ date: day(0), strategy: 1, benchmark: 1 }])
  })

  it("CAGR annualize ด้วยจำนวนช่วงผลตอบแทน N−1 (ไม่ใช่ N)", async () => {
    await resetMarket()
    const N = 11
    await ingestRows(Array.from({ length: N }, (_, i) => row(i, "AAA", 100 * Math.pow(1.001, i))))
    const full = await runBacktest(P, new Map())
    // benchmark = AAA ตัวเดียว → +0.1% ทุกวัน → CAGR = 1.001^252 − 1 ไม่ว่าชุดข้อมูลยาวเท่าไร
    expect(full.stats.benchTotal).toBeCloseTo(Math.pow(1.001, N - 1) - 1, 4)
    expect(full.stats.benchCagr).toBeCloseTo(Math.pow(1.001, 252) - 1, 3)
    expect(full.stats.cagr).toBe(0) // ไม่มีสัญญาณ = ถือเงินสด
    expect(full.equity.at(-1)?.date).toBe(day(N - 1))
  })

  it("หุ้นหยุดซื้อขายระหว่างถือ: ไม่มี NaN, ผลตอบแทนข้ามช่องว่างถูกนับ, ต้นทุนหักสองขาทั้งในเทรดและ equity", async () => {
    await resetMarket()
    const rows: Row[] = []
    for (let i = 0; i < 9; i++) {
      rows.push(row(i, "AAA", 10))
      if (i !== 3 && i !== 4) rows.push(row(i, "BBB", i >= 5 ? 12 : 10)) // BBB หยุดซื้อขาย 2 วัน แล้วกลับมาที่ 12
    }
    await ingestRows(rows)
    // สัญญาณปิดวันที่ 1 → ซื้อราคาปิดวันที่ 2 (T+1) · ZZZ ไม่มีในข้อมูล → ข้าม
    const signals = new Map([[day(1), new Set(["BBB", "ZZZ"])]])
    const params = { ...P, hold: 2, costBps: 30, slipBps: 40 } // 70bps ต่อขา
    const full = await runBacktest(params, signals)
    // ครบ 2 วันที่วันที่ 4 แต่วันที่ 3-4 ไม่มีราคา → ออกวันแรกที่มีราคา (วันที่ 5)
    expect(full.trades).toEqual([
      { symbol: "BBB", entryDate: day(2), exitDate: day(5), entryPx: 10, exitPx: 12, ret: 18.6, reason: "time" },
    ])
    for (const p of full.equity) {
      expect(Number.isFinite(p.strategy)).toBe(true)
      expect(Number.isFinite(p.benchmark)).toBe(true)
    }
    // วันเข้า −0.7% · วันออก +20% −0.7% → 0.993 × 1.193
    expect(full.equity.at(-1)?.strategy).toBeCloseTo(0.993 * 1.193, 4)
    expect(full.stats.exposure).toBeLessThanOrEqual(1)
  })

  it("valuePivot/buildMetaPanel เห็นข้อมูลใหม่หลัง ingest ทับแถวเดิม (จำนวนแถว/วันล่าสุดเท่าเดิม)", async () => {
    await resetMarket()
    const N = 90
    const HOLD = 5
    const syms = ["AAA", "BBB", "CCC", "DDD"]
    const rows: Row[] = []
    for (let i = 0; i < N; i++) {
      syms.forEach((s, k) => {
        const px = (5 + k) * Math.exp(0.002 * (k + 1) * i + 0.03 * Math.sin(i * (0.7 + k * 0.3)))
        rows.push(row(i, s, Math.round(px * 1000) / 1000, 5e7 * (1 + 0.3 * Math.cos(i + k))))
      })
    }
    await ingestRows(rows)

    const vp0 = await valuePivot()
    const panel0 = await buildMetaPanel(HOLD)
    const labelDate = day(N - 1 - HOLD)
    const before = panel0.rows.find((r) => r.date === labelDate && r.symbol === "BBB")
    expect(before).toBeDefined()

    const count0 = await db.rawDaily.count()
    const last = rows.find((r) => r.date === day(N - 1) && r.symbol === "BBB")!
    await ingestRows([{ ...last, close: last.close * 1.5, val: last.val * 3 }]) // แก้แท่งล่าสุดทับของเดิม
    expect(await db.rawDaily.count()).toBe(count0)

    const pivot = await closePivot()
    const si = pivot.symIdx.get("BBB")!
    const vp1 = await valuePivot()
    expect(vp1).not.toBe(vp0)
    expect(vp1.val[N - 1][si]).toBeCloseTo(last.val * 3, 0)

    const after = (await buildMetaPanel(HOLD)).rows.find((r) => r.date === labelDate && r.symbol === "BBB")!
    const truth = (pivot.px[N - 1][si] / pivot.px[N - 1 - HOLD][si] - 1) * 100
    expect(after.fwd).toBeCloseTo(truth, 6)
    expect(after.fwd).not.toBeCloseTo(before!.fwd, 3)
  })

  it("route: k/hold/maxPos เศษถูกปัด (maxPos 1.5 เดิมถือได้ 2 ตัว × 1/1.5 = gross 133%) · CPCV hold เศษไม่พัง", async () => {
    const res = await backtestRoute.POST(post("/api/backtest", JSON.stringify({ k: 1.2, hold: 2.5, maxPos: 1.5 })))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { params: { k: number; hold: number; maxPos: number }; stats: { exposure: number } }
    expect(body.params).toMatchObject({ k: 1, hold: 3, maxPos: 2 })
    expect(body.stats.exposure).toBeLessThanOrEqual(1)

    const cp = await cpcvRoute.POST(post("/api/research/cpcv", JSON.stringify({ hold: 10.5 })))
    expect(cp.status).toBe(400) // panel เล็ก → ข้อมูลไม่พอ (เดิม 500: px[i + 10.5] undefined)
    expect(((await cp.json()) as { error: string }).error).toContain("ข้อมูลไม่พอ")
    const bad = await cpcvRoute.POST(post("/api/research/cpcv", JSON.stringify({ nGroups: 4, nTestGroups: 4 })))
    expect(bad.status).toBe(400)
  })

  it("emitEvent ยิงพร้อมกันไม่ทำให้ hash chain แตกกิ่ง · audit จับการแก้ payload/prevHash ย้อนหลังได้", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => emitEvent("research", "system", { i })))
    await Promise.all([emitEvent("a", "system", {}), emitEvent("b", "system", { bad: BigInt(1) }), emitEvent("c", "system", {})])
    const ok = await auditEvents(5)
    expect(ok.ok).toBe(true)
    expect(ok.brokenAt).toBeNull()
    const events = await db.eventLog.findMany({ orderBy: { id: "asc" } })
    expect(events.some((e) => e.kind === "b")).toBe(false) // payload ที่ serialize ไม่ได้ถูกทิ้ง ไม่ค้าง lock
    expect(events.at(-1)?.kind).toBe("c")
    for (let i = 1; i < events.length; i++) expect(events[i].prevHash).toBe(events[i - 1].hash)

    const victim = events[Math.floor(events.length / 2)]
    await db.eventLog.update({ where: { id: victim.id }, data: { payload: '{"i":999}' } })
    expect((await auditEvents(1)).brokenAt).toBe(victim.id)
    await db.eventLog.update({ where: { id: victim.id }, data: { payload: victim.payload, prevHash: "x" } })
    expect((await auditEvents(1)).brokenAt).toBe(victim.id)
    await db.eventLog.update({ where: { id: victim.id }, data: { prevHash: victim.prevHash } })
    expect((await auditEvents(1)).ok).toBe(true)
  })
})
