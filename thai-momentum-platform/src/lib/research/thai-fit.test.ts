/// <reference types="bun-types" />
// bun test — Evidence Board (thai-fit H1–H4): pure logic + DB-backed ส่วนที่ต้องใช้ Prisma
// (ส่วน DB รันใน child process กับ SQLite ชั่วคราวของตัวเอง — ไม่แตะ db/custom.db / network
//  และไม่ชน Prisma client ที่ test ไฟล์อื่นอาจสร้างไว้ใน process เดียวกัน)
import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createSchemaDb } from "@/test/schema-db"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

import { buildPivots, reversal, scan, scanHasEvidence, tom, type PivotRow, type ThaiPivots } from "./thai-fit"

/** วันทำการ (จันทร์–ศุกร์) ระหว่าง a..b รวมปลาย — สตริง YYYY-MM-DD (คิดแบบ UTC ล้วน ไม่ขึ้นกับ TZ) */
function weekdays(a: string, b: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${b}T00:00:00Z`)
  for (let t = Date.parse(`${a}T00:00:00Z`); t <= end; t += 86400000) {
    const g = new Date(t).getUTCDay()
    if (g !== 0 && g !== 6) out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** pivot ตรง ๆ จากเมทริกซ์ close (liq ทั้งหมด) */
function pivFromCloses(dates: string[], closes: number[][], liq?: boolean[][], val?: number[][]): ThaiPivots {
  const nSym = closes[0]?.length ?? 0
  return {
    dates,
    symbols: Array.from({ length: nSym }, (_, j) => `S${String(j).padStart(2, "0")}`),
    nSym,
    close: closes.map((r) => [...r]),
    val: val ? val.map((r) => [...r]) : closes.map((r) => r.map(() => 5e6)),
    liq: liq ?? closes.map((r) => r.map(() => true)),
  }
}

describe("buildPivots", () => {
  it("close ≤ 0 / ไม่ finite = ไม่มีข้อมูล (กัน Infinity ไหลเข้า return/demean)", () => {
    const rows: PivotRow[] = [
      { date: "2026-01-05", symbol: "B", close: 10, val: 1, liq5: 1 },
      { date: "2026-01-05", symbol: "A", close: 0, val: 1, liq5: 1 },
      { date: "2026-01-06", symbol: "A", close: 5, val: 2, liq5: 0 },
      { date: "2026-01-06", symbol: "B", close: -3, val: 2, liq5: 1 },
      { date: "2026-01-07", symbol: "A", close: Number.NaN, val: 2, liq5: 1 },
    ]
    const p = buildPivots(rows)
    expect(p.dates).toEqual(["2026-01-05", "2026-01-06", "2026-01-07"])
    expect(p.symbols).toEqual(["A", "B"])
    expect(p.close[0]).toEqual([undefined, 10])
    expect(p.close[1]).toEqual([5, undefined])
    expect(p.close[2][0]).toBeUndefined()
    expect(p.liq[1]).toEqual([false, true])
  })

  it("tom() บนข้อมูลที่มี close = 0 ไม่ได้ Infinity/NaN (เดิม insideMean = Infinity → JSON null)", () => {
    const dates = weekdays("2026-01-01", "2026-03-31")
    const rows: PivotRow[] = []
    dates.forEach((d, i) => {
      for (let j = 0; j < 5; j++) {
        const close = j === 0 && i === 10 ? 0 : 10 + ((i * (j + 1)) % 7) * 0.1
        rows.push({ date: d, symbol: `S${j}`, close, val: 5e6, liq5: 1 })
      }
    })
    const h3 = tom(buildPivots(rows))
    expect(Number.isFinite(h3.insideMean)).toBe(true)
    expect(Number.isFinite(h3.outsideMean)).toBe(true)
    expect(Number.isFinite(h3.t)).toBe(true)
  })
})

describe("tom() — ขอบตัวอย่าง (เดือนแรก/สุดท้ายไม่ครบเดือน)", () => {
  // ข้อมูล 17 ม.ค. – 13 มี.ค. 2024: ม.ค. เริ่มกลางเดือน, มี.ค. จบกลางเดือน
  const dates = weekdays("2024-01-17", "2024-03-13")
  // วัน TOM จริงตามปฏิทิน (3 วันทำการแรก/ท้ายของเดือน) ที่อยู่ในช่วงข้อมูล
  const trueTom = new Set(["2024-01-29", "2024-01-30", "2024-01-31", "2024-02-01", "2024-02-02", "2024-02-05",
    "2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01", "2024-03-04", "2024-03-05"])
  // ทุกหุ้นขึ้น +1% ในวัน TOM จริง, 0% วันอื่น → inside ต้อง = 1%, outside = 0%
  const closes: number[][] = []
  let px = 10
  for (const d of dates) {
    if (closes.length > 0 && trueTom.has(d)) px *= 1.01
    closes.push(Array.from({ length: 6 }, () => px))
  }
  const piv = pivFromCloses(dates, closes)

  it("ไม่นับวันต้นเดือนแรก/ท้ายเดือนสุดท้ายที่ระบุตำแหน่งไม่ได้เป็น turn-of-month", () => {
    const h3 = tom(piv)
    // เดิม: 18–19 ม.ค. (กลางเดือน) + 11–13 มี.ค. (กลางเดือน) ถูกนับเป็น "3 วันแรก/ท้าย" → nIn 17, insideMean ≈ 0.706%
    expect(h3.nIn).toBe(12)
    expect(h3.insideMean).toBeCloseTo(1, 3)
    expect(h3.outsideMean).toBeCloseTo(0, 6)
  })

  it("ผลเหมือนกันทุก TZ ของ server (ตรรกะเป็นสตริง YYYY-MM ล้วน)", () => {
    // รันซ้ำเพื่อยืนยันว่าไม่มี Date local ใด ๆ แทรก — ผลต้องคงที่
    const a = tom(piv)
    const b = tom(pivFromCloses([...dates], closes))
    expect(b).toEqual(a)
  })
})

describe("scan() — ข้อมูลไม่พอ (หุ้น < 30 ตัวต่อวัน)", () => {
  const dates = weekdays("2024-01-01", "2025-08-29") // ~435 วัน
  const closes = dates.map((_, i) => Array.from({ length: 12 }, (_, j) => 10 * (1 + 0.001 * j) ** i * (1 + 0.01 * Math.sin(i * (j + 1)))))
  const res = scan(pivFromCloses(dates, closes))

  it("ทุก cell วัดไม่ได้ (n=0) → ไม่มีหลักฐาน", () => {
    expect(res.cells.length).toBe(22)
    expect(res.cells.every((c) => c.n === 0)).toBe(true)
    expect(scanHasEvidence(res.cells)).toBe(false)
  })

  it("H4 ไม่ PASS จากความว่างเปล่า (สอดคล้องกับกรณี DB ว่าง) และ best ไม่มี cell ปลอม", () => {
    expect(res.h1Pass).toBe(false)
    expect(res.h4Pass).toBe(false) // เดิม true: "ไม่มี cell ไหน ICIR>0.25" เป็นจริงแบบว่างเปล่า
    expect(res.best).toEqual([]) // เดิม top-3 ของ cell n=0 (ICIR 0 ปลอม)
  })

  it("scanHasEvidence จริงเมื่อมีอย่างน้อย 1 cell ที่ n>0", () => {
    expect(scanHasEvidence([{ n: 0 }, { n: 3 }])).toBe(true)
    expect(scanHasEvidence([])).toBe(false)
  })
})

describe("reversal() — control = fwd5 ของตลาดวันเดียวกัน", () => {
  // 12 หุ้น: S00 = หุ้นสัญญาณ (สั่นเล็ก ±0.5% แล้วดิ่ง −4% × 5 วันพร้อม val ×2 แล้วเด้ง +2%/วัน)
  // อีก 11 ตัวนิ่ง (fwd5 = 0) → ตลาด fwd5 = fwd5 ของ S00 / 12 (ทุกตัว liq)
  const nD = 145
  const nSym = 12
  const dates = weekdays("2025-01-01", "2025-12-31").slice(0, nD)
  const V = 5e6
  const closes: number[][] = []
  const vals: number[][] = []
  const liq: boolean[][] = []
  let s = 20
  for (let i = 0; i < nD; i++) {
    if (i >= 1 && i < 130) s *= i % 2 === 1 ? 1.005 : 0.995
    else if (i >= 130 && i <= 134) s *= 0.96
    else if (i >= 135) s *= 1.02
    closes.push([s, ...Array.from({ length: nSym - 1 }, () => 10)])
    vals.push([i >= 130 && i <= 134 ? 2 * V : V, ...Array.from({ length: nSym - 1 }, () => V)])
    // S00 liq เฉพาะวันที่ 134 → เกิดสัญญาณได้วันเดียว
    liq.push([i === 134, ...Array.from({ length: nSym - 1 }, () => true)])
  }
  const piv = pivFromCloses(dates, closes, liq, vals)
  const fwd5S = closes[139][0] / closes[134][0] - 1

  it("edgeVsCtrl = avgNet − ตลาด fwd5 (ไม่ใช่ fwd5 ของหุ้นตัวเอง)", () => {
    const h2 = reversal(piv)
    expect(h2.n).toBe(1)
    const mktFwd5 = fwd5S / nSym
    // เดิม: avgNet − fwd5S (ถามแค่ว่ากฎออกดีกว่าถือเฉย ๆ 5 วันไหม ไม่ใช่ "ชนะตลาด")
    expect(Math.abs(h2.edgeVsCtrl - (h2.avgNet - mktFwd5))).toBeLessThan(2e-4)
    expect(Math.abs(h2.edgeVsCtrl - (h2.avgNet - fwd5S))).toBeGreaterThan(0.01)
  })
})

// ---------------- DB-backed (child process + SQLite ชั่วคราว) ----------------

const ROOT = resolve(import.meta.dir, "../../..")

function withTempDb<T>(seed: (d: Database) => void, code: string): T {
  const dir = mkdtempSync(join(tmpdir(), "thai-fit-test-"))
  try {
    const file = join(dir, "t.db")
    createSchemaDb(file) // schema จริงจาก prisma/schema.prisma (src/test/schema-db.ts)
    const d = new Database(file)
    seed(d)
    d.close()
    const p = Bun.spawnSync([process.execPath, "-e", code], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: `file:${file}` },
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = p.stdout.toString()
    const line = out.split("\n").find((l) => l.startsWith("RESULT "))
    if (!line) throw new Error(`child failed (${p.exitCode}): ${p.stderr.toString()}\n${out}`)
    return JSON.parse(line.slice(7)) as T
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function seedRows(d: Database, nSym: number, dates: string[]) {
  const ins = d.prepare(`INSERT INTO "RawDaily" (date, symbol, close, val, liq5) VALUES (?, ?, ?, ?, 1)`)
  dates.forEach((dt, i) => {
    for (let j = 0; j < nSym; j++) ins.run(dt, `S${String(j).padStart(2, "0")}`, 10 + ((i * 7 + j * 3) % 11) * 0.1, 5e6)
  })
}

describe("loadPivots — fingerprint จับการแก้แถวเดิม (ingest upsert)", () => {
  it("แก้ close ในแถวเดิม (count/maxDate/maxId เท่าเดิม) → pivot ต้องสดใหม่", () => {
    const r = withTempDb<{ before: number; after: number; same: boolean }>(
      (d) => seedRows(d, 4, weekdays("2026-01-05", "2026-01-30")),
      `import { loadPivots } from "@/lib/research/thai-fit"; import { db } from "@/lib/db";
       const p1 = await loadPivots(); const i = p1.dates.length - 1; const j = p1.symbols.indexOf("S01"); const before = p1.close[i][j];
       await db.rawDaily.update({ where: { date_symbol: { date: p1.dates[i], symbol: "S01" } }, data: { close: 999 } });
       const p2 = await loadPivots();
       console.log("RESULT " + JSON.stringify({ before, after: p2.close[i][j], same: p1 === p2 }));`,
    )
    expect(r.before).not.toBe(999)
    expect(r.after).toBe(999) // เดิม: ยังได้ค่าเก่าจาก cache จน restart
    expect(r.same).toBe(false)
  }, 30000)
})

describe("POST /api/evidence/run — ห้าม auto-apply เมื่อไม่มีหลักฐาน", () => {
  it("DB ว่าง: mode all ไม่แตะ config_th (เดิมเปลี่ยนเป็นน้ำหนักสายยาว + hold 10)", () => {
    const r = withTempDb<{ status: number; applied: boolean; msg: string; setting: number; decisions: number; runs: number }>(
      () => {},
      `import { POST } from "@/app/api/evidence/run/route"; import { db } from "@/lib/db";
       const res = await POST(new Request("http://localhost/api/evidence/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "all" }) }));
       const j = await res.json();
       console.log("RESULT " + JSON.stringify({ status: res.status, applied: j.applied, msg: j.message ?? "",
         setting: await db.setting.count(), decisions: await db.decision.count(), runs: await db.researchRun.count() }));`,
    )
    expect(r.status).toBe(200)
    expect(r.applied).toBe(false)
    expect(r.msg).toContain("ไม่ auto-apply")
    expect(r.setting).toBe(0) // config_th ไม่ถูกเขียน
    expect(r.decisions).toBe(0) // ไม่มี audit row ของการ apply ที่ไม่เกิดขึ้น
    expect(r.runs).toBe(1) // ยัง persist ผลรันตามปกติ
  }, 30000)

  it("body = null → ใช้ค่า default (เดิม 500: null is not an object)", () => {
    const r = withTempDb<{ status: number; mode: string }>(
      () => {},
      `import { POST } from "@/app/api/evidence/run/route";
       const res = await POST(new Request("http://localhost/api/evidence/run", { method: "POST", headers: { "content-type": "application/json" }, body: "null" }));
       const j = await res.json();
       console.log("RESULT " + JSON.stringify({ status: res.status, mode: j.report?.mode }));`,
    )
    expect(r.status).toBe(200)
    expect(r.mode).toBe("all")
  }, 30000)
})
