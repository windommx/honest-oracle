// ============================================================
// สคริปต์ทดสอบ core กับ SQLite จริง — รันเป็น subprocess โดย core.db.test.ts เท่านั้น
// (bun test ใช้ module registry + globalThis ร่วมกันทุกไฟล์ → client ของ @/lib/db ที่ไฟล์อื่นสร้างไว้ก่อน
//  อาจชี้ db/custom.db; subprocess ที่ตั้ง DATABASE_URL เองแยกขาดได้แน่นอน)
// ใช้: DATABASE_URL=file:/tmp/x.db bun core.db-harness.ts <ingest|routes|seed>  → พิมพ์ JSON บรรทัดสุดท้าย
// ============================================================

import { db } from "@/lib/db"
import * as core from "./core"

const scenario = process.argv[2] ?? ""
const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")

async function guard() {
  // ห้ามเขียน DB ที่ไม่ใช่ไฟล์ชั่วคราวของการทดสอบ (เช่น db/custom.db) เด็ดขาด
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
}

// ---------- ชุดข้อมูลสังเคราะห์ (deterministic) ----------
function weekdays(from: string, n: number, skip: Set<string>): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < n; t += 86_400_000) {
    const d = new Date(t)
    const s = d.toISOString().slice(0, 10)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !skip.has(s)) out.push(s)
  }
  return out
}
function makeRows(dates: string[], nSym: number): core.ParsedCsvRow[] {
  let seed = 7
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
  const rows: core.ParsedCsvRow[] = []
  for (let s = 0; s < nSym; s++) {
    let px = 5 + rnd() * 50
    for (const date of dates) {
      px = Math.max(1, px * (1 + (rnd() - 0.48) * 0.06))
      rows.push({ date, symbol: `S${String(s).padStart(2, "0")}`, close: Math.round(px * 100) / 100, open: null, high: null, low: null, val: 4e6 + Math.round(rnd() * 5e7) })
    }
  }
  return rows
}

// โผใน Snapshot ต้องตรงกับการคำนวณใหม่จาก RawDaily ทุกวัน (tie-aware) — คืนจำนวนวันที่ไม่ตรง
async function staleSnapshotDates(): Promise<number> {
  const raw = await db.rawDaily.findMany()
  const snaps = await db.snapshot.findMany()
  const byDate = new Map<string, typeof raw>()
  for (const r of raw) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r])
  const snapBy = new Map<string, typeof snaps>()
  for (const s of snaps) snapBy.set(`${s.date}|${s.timeframe}`, [...(snapBy.get(`${s.date}|${s.timeframe}`) ?? []), s])
  let bad = 0
  for (const [date, rows] of byDate) {
    let ok = true
    for (const tf of core.TFS) {
      const key = `ret${tf}` as "ret5"
      const el = rows
        .filter((r) => r.close > core.MIN_PRICE && r.liq5 === 1 && r[key] !== null)
        .sort((a, b) => (b[key] as number) - (a[key] as number))
        .slice(0, core.TOPN)
      const got = snapBy.get(`${date}|${tf}`) ?? []
      const er = el.map((r) => r[key]).sort().join(",")
      const gr = got.map((s) => s.ret).sort().join(",")
      if (er !== gr) ok = false
    }
    if (!ok) bad++
  }
  return bad
}

// retN ใน RawDaily ต้องเท่ากับ pctChange ของประวัติทั้งหมด (หลัง backfill/แก้ราคา)
async function wrongRetRows(): Promise<number> {
  const raw = await db.rawDaily.findMany({ orderBy: [{ symbol: "asc" }, { date: "asc" }] })
  const bySym = new Map<string, typeof raw>()
  for (const r of raw) bySym.set(r.symbol, [...(bySym.get(r.symbol) ?? []), r])
  let bad = 0
  for (const rows of bySym.values()) {
    const closes = rows.map((r) => r.close)
    rows.forEach((r, i) => {
      const v = core.pctChange(closes, i, 20)
      if ((v === null ? null : Math.round(v * 100) / 100) !== r.ret20) bad++
    })
  }
  return bad
}

async function ingestScenario() {
  const out: Record<string, unknown> = {}
  out.emptyDq = await core.runDataQualityChecks()

  // สงกรานต์ 2569 (13–15 เม.ย.) เป็นวันหยุด 3 วันทำการ
  const dates = weekdays("2026-01-05", 90, new Set(["2026-04-13", "2026-04-14", "2026-04-15"]))
  const rows = makeRows(dates, 30)
  // (1) นำเข้าช่วงหลังก่อน แล้ว backfill 25 วันแรกทีหลัง
  const cut = dates[25]
  await core.ingestRows(rows.filter((r) => r.date >= cut))
  const bf = await core.ingestRows(rows.filter((r) => r.date < cut))
  out.backfill = { snapDates: bf.snapDates.length, stale: await staleSnapshotDates(), wrongRet: await wrongRetRows() }

  // (2) แก้ราคาปิดย้อนหลัง 1 จุด
  const target = rows.find((r) => r.symbol === "S03" && r.date === dates[30])!
  const fix = await core.ingestRows([{ ...target, close: Math.round(target.close * 1.3 * 100) / 100 }])
  out.correction = { snapDates: fix.snapDates.length, stale: await staleSnapshotDates(), wrongRet: await wrongRetRows() }

  // (3) นำเข้าซ้ำชุดเดิม = ไม่มีอะไรเปลี่ยน
  const snapBefore = await db.snapshot.count()
  const again = await core.ingestRows(rows.filter((r) => !(r.symbol === "S03" && r.date === dates[30])))
  out.idempotent = { updatedRows: again.updatedRows, snapSame: (await db.snapshot.count()) === snapBefore, rawCount: await db.rawDaily.count() }

  // (4) OHLC: มีค่าใหม่ = ทับ, ไม่มี = คงเดิม
  const d = dates[40]
  await core.ingestRows([{ date: d, symbol: "S01", close: 20, open: 19, high: 21, low: 18.5, val: 9e6 }])
  await core.ingestRows([{ date: d, symbol: "S01", close: 20.5, val: 9e6 }])
  const afterCloseOnly = await db.rawDaily.findFirst({ where: { date: d, symbol: "S01" } })
  await core.ingestRows([{ date: d, symbol: "S01", close: 20.5, open: 19.9, val: 9e6 }])
  const afterOpen = await db.rawDaily.findFirst({ where: { date: d, symbol: "S01" } })
  out.ohlc = { closeOnly: afterCloseOnly, newOpen: afterOpen }

  // (5) cache ของ closePivot รู้การเขียนจาก process อื่น (ผู้เขียนตรา data_version)
  const p1 = await core.closePivot()
  const firstId = (await db.rawDaily.findFirst({ orderBy: { id: "asc" } }))!
  const cell = () => p1.px[p1.dateIdx.get(firstId.date)!][p1.symIdx.get(firstId.symbol)!]
  const before = cell()
  await db.$executeRawUnsafe(`UPDATE "RawDaily" SET close = close * 2 WHERE id = ${firstId.id}`)
  await db.$executeRawUnsafe(`UPDATE "Setting" SET value = 'written-by-another-process' WHERE key = 'data_version'`)
  const p3 = await core.closePivot()
  out.fingerprint = { before, after: p3.px[p3.dateIdx.get(firstId.date)!][p3.symIdx.get(firstId.symbol)!], expected: Math.round(before * 2 * 1e6) / 1e6 }

  out.dq = await core.runDataQualityChecks()
  return out
}

async function routesScenario() {
  const out: Record<string, unknown> = {}
  const post = (body: unknown) =>
    new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) })
  const ingestRoute = await import("@/app/api/ingest/route")
  const feedIngest = await import("@/app/api/feed/ingest/route")
  const datesRoute = await import("@/app/api/dates/route")

  out.csvNull = (await ingestRoute.POST(post("null"))).status
  out.csvBad = (await ingestRoute.POST(post({ csv: "foo,bar\n1,2" }))).status
  // TSV วางจาก Excel + วันที่ไทย พ.ศ. (วัน/เดือน)
  const dates = weekdays("2026-06-01", 30, new Set())
  const thaiDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${+iso.slice(0, 4) + 543}`
  const tsv = ["date\tsymbol\tclose\tvalue", ...dates.map((iso, i) => `${thaiDate(iso)}\tptt\t${30 + i * 0.1}\t"5,000,000"`)].join("\n")
  const csvRes = await ingestRoute.POST(post({ csv: tsv }))
  out.csvTsv = { status: csvRes.status, body: await csvRes.json(), dates: (await db.rawDaily.findMany({ where: { symbol: "PTT" }, select: { date: true, val: true } })).slice(0, 2) }

  const d = (await (await datesRoute.GET()).json()) as { dates: string[]; count: number; latest: string | null }
  out.dates = { first: d.dates[0], latest: d.latest, count: d.count, len: d.dates.length }

  // feed/ingest: sectors ผิดชนิด + แถว null ต้องไม่ทำให้ล้ม · replaceDemo ล้าง CrossAsset สังเคราะห์
  await db.crossAsset.createMany({ data: [{ date: "2026-06-01", asset: "SPX", close: 1500 }, { date: "2026-06-01", asset: "GOLD", close: 1100 }] })
  await db.setting.create({ data: { key: core.CROSS_ASSET_SOURCE_KEY, value: "synthetic" } })
  const feedRows = [null, ...dates.map((date, i) => ({ date, symbol: "KBANK", close: 150 + i, val: null, volume: 100000 }))]
  const r1 = await feedIngest.POST(post({ source: "test", rows: feedRows, sectors: { KBANK: 1 }, replaceDemo: true, confirm: "REPLACE" }))
  out.feedReplace = { status: r1.status, body: await r1.json(), crossLeft: await db.crossAsset.count(), val: (await db.rawDaily.findFirst({ where: { symbol: "KBANK" } }))?.val }
  // ข้อมูลจริงจาก fetch:cross (ป้าย yahoo) ต้องคงอยู่
  await db.crossAsset.create({ data: { date: "2026-06-01", asset: "SPX", close: 6000 } })
  await db.setting.upsert({ where: { key: core.CROSS_ASSET_SOURCE_KEY }, create: { key: core.CROSS_ASSET_SOURCE_KEY, value: "yahoo" }, update: { value: "yahoo" } })
  const r2 = await feedIngest.POST(post({ source: "test", rows: feedRows.slice(1), replaceDemo: true, confirm: "REPLACE" }))
  out.feedKeepReal = { status: r2.status, crossLeft: await db.crossAsset.count() }
  out.feedEmpty = (await feedIngest.POST(post({ rows: [] }))).status
  return out
}

async function seedScenario() {
  const stats = await core.seedDemoData({ days: 150.5, symbols: 40 })
  const dates = (await db.rawDaily.groupBy({ by: ["date"], orderBy: { date: "asc" } })).map((r) => r.date)
  const weekdayGaps = dates.slice(1).filter((dd, i) => core.missingWeekdays(dates[i], dd) > 0).length
  const weekend = dates.filter((dd) => [0, 6].includes(new Date(`${dd}T00:00:00Z`).getUTCDay())).length
  const syms = (await db.symbolMeta.findMany({ take: 5 })).map((s) => s.symbol)
  let recomputed = 0
  for (const s of syms) recomputed += await core.recomputeSymbol(s)
  return {
    stats,
    nDates: dates.length,
    unique: new Set(dates).size === dates.length,
    weekdayGaps,
    weekend,
    last: dates[dates.length - 1],
    bangkokToday: core.bangkokDate(new Date()),
    positions: await db.position.count(),
    recomputed,
    crossSource: (await db.setting.findUnique({ where: { key: core.CROSS_ASSET_SOURCE_KEY } }))?.value ?? null,
    dataVersion: !!(await db.setting.findUnique({ where: { key: "data_version" } })),
  }
}

await guard()
const result =
  scenario === "ingest" ? await ingestScenario() : scenario === "routes" ? await routesScenario() : scenario === "seed" ? await seedScenario() : { error: `unknown scenario ${scenario}` }
console.log(JSON.stringify(result))
await db.$disconnect()
process.exit(0)
