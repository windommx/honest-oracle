/// <reference types="bun-types" />
// bun test — Imported Global Engines: pure logic ของ engine + cache ต่อ data snapshot (DB ใน child process)
import { describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createSchemaDb } from "@/test/schema-db"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join, resolve } from "path"

import type { Mat, ThaiPivots } from "@/lib/research/thai-fit"
import { bestIc, dailyReturns, marketReturns } from "./helpers"
import { alphaVerdict } from "./types"
import { residualMomentumSig } from "./residual-momentum"
import { evalVolManaged } from "./vol-managed"
import { signedFlowSig } from "./signed-flow"
import { evalHmmRegime } from "./hmm-regime"
import { evalTripleBarrier } from "./triple-barrier"
import { evalCsad } from "./csad"

/** LCG + Box-Muller แบบกำหนด seed — ผลคงที่ทุกเครื่อง */
function rng(seed: number) {
  let s = seed >>> 0
  const u = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return (s + 0.5) / 4294967296
  }
  return { u, n: () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()) }
}

/** pivot จากเมทริกซ์ผลตอบแทนรายวัน [day][sym] (วันแรกไม่มีผลตอบแทน) — liq ทุกตัว */
function pivFromReturns(r: number[][], start = 10): ThaiPivots {
  const nD = r.length
  const nSym = r[0]?.length ?? 0
  const close: Mat = []
  let prev = new Array<number>(nSym).fill(start)
  for (let i = 0; i < nD; i++) {
    const row = i === 0 ? prev : prev.map((p, j) => p * (1 + (r[i]?.[j] ?? 0)))
    close.push([...row])
    prev = row
  }
  const d0 = Date.parse("2024-01-01T00:00:00Z")
  return {
    dates: Array.from({ length: nD }, (_, i) => new Date(d0 + i * 86400000).toISOString().slice(0, 10)),
    symbols: Array.from({ length: nSym }, (_, j) => `S${String(j).padStart(2, "0")}`),
    nSym,
    close,
    val: close.map((row) => row.map(() => 5e6)),
    liq: close.map((row) => row.map(() => true)),
  }
}

describe("alphaVerdict / bestIc — ข้อมูลไม่พอ", () => {
  it("n = 0 → INFO (เดิม FAIL จาก ICIR 0 ปลอม)", () => {
    expect(alphaVerdict(0, 0, 0, 0).verdict).toBe("INFO")
    expect(alphaVerdict(0, 0, 0).verdict).toBe("FAIL") // ไม่ส่ง n = พฤติกรรมเดิม
    expect(alphaVerdict(0.05, 0.4, 5, 100).verdict).toBe("PASS")
  })

  it("bestIc ข้าม hold ที่ n = 0 (ICIR 0 ปลอมห้ามชนะ hold ที่วัดได้แต่ติดลบ)", () => {
    const z = { meanIC: 0, ICIR: 0, t: 0, n: 0 }
    const neg = { meanIC: -0.01, ICIR: -0.2, t: -2, n: 50 }
    expect(bestIc([{ hold: 40, ic: z }, { hold: 5, ic: neg }])?.hold).toBe(5)
    expect(bestIc([{ hold: 40, ic: z }])).toBeNull()
  })
})

describe("residualMomentumSig — สัญญาณต้องไม่เป็นศูนย์ตามนิยาม", () => {
  // r_j = α_j + β_j·m + ε — ต้องจัดอันดับตาม α_j (Σ residual OLS ในหน้าต่างเดียวกัน ≡ 0)
  const g = rng(7)
  const nD = 200
  const nSym = 8
  const alpha = Array.from({ length: nSym }, (_, j) => (j - 3.5) * 0.0006)
  const beta = Array.from({ length: nSym }, (_, j) => 0.6 + 0.1 * j)
  const r: number[][] = []
  for (let i = 0; i < nD; i++) {
    const m = 0.01 * g.n()
    r.push(Array.from({ length: nSym }, (_, j) => alpha[j] + beta[j] * m + 0.002 * g.n()))
  }
  const piv = pivFromReturns(r)
  const rets = dailyReturns(piv)
  const sig = residualMomentumSig(piv, rets, marketReturns(rets))
  const last = sig[nD - 1] as number[]

  it("ค่าไม่ใช่ noise ทศนิยม (เดิมทุกค่า |x| < 1e-12)", () => {
    expect(last.every((v) => v !== undefined)).toBe(true)
    expect(Math.max(...last.map((v) => Math.abs(v)))).toBeGreaterThan(1e-3)
  })

  it("เรียงตาม α จริง", () => {
    const order = last.map((v, j) => ({ v, j })).sort((a, b) => a.v - b.v).map((x) => x.j)
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe("evalVolManaged — ไม่มี look-ahead ในน้ำหนัก", () => {
  // 30 หุ้นสั่นเล็ก ๆ แล้วตลาดพัง −10% ทั้งกระดานในวันที่ 100
  const nD = 120
  const nSym = 30
  const r = Array.from({ length: nD }, (_, t) =>
    Array.from({ length: nSym }, (_, j) => (t === 100 ? -0.1 : 0.003 * Math.sin(t * (j + 1) * 0.7))),
  )
  const piv = pivFromReturns(r)
  const e = evalVolManaged(piv, dailyReturns(piv))

  it("วันพังใช้น้ำหนักที่ตั้งจาก σ̂ ก่อนวันพัง (เดิม σ̂ รวมวันพังแล้ว → w หดเหลือ ~0.38 ในวันเดียวกัน)", () => {
    expect(e.stats.worstDayRaw).toBeCloseTo(-0.1, 4)
    // ก่อนพัง σ̂ ต่ำ → w ติดเพดาน 1.5 → วันพังหลังสเกล = −15% (เดิม ≈ −3.9%)
    expect(e.stats.worstDayManaged as number).toBeLessThanOrEqual(-0.1)
  })

  it("lastWeight = w ของรอบถัดไปจาก σ̂ ล่าสุด (หลังพังต้องต่ำกว่า 1)", () => {
    expect(e.stats.lastWeight as number).toBeLessThan(1)
  })

  it("ไม่มีข้อมูล → INFO (เดิม WEAK จาก Sharpe 0 → 0)", () => {
    const empty: ThaiPivots = { dates: [], symbols: [], nSym: 0, close: [], val: [], liq: [] }
    expect(evalVolManaged(empty, []).verdict).toBe("INFO")
  })
})

describe("signedFlowSig — sign(0) = 0", () => {
  it("หุ้นราคานิ่งทั้งหน้าต่าง = flow 0 (เดิม −1 = เทขายเต็มที่)", () => {
    const nD = 12
    const r = Array.from({ length: nD }, (_, t) => [0, t % 2 === 0 ? 0.01 : -0.01])
    const piv = pivFromReturns(r)
    const sig = signedFlowSig(piv, dailyReturns(piv))
    expect(sig[nD - 1][0]).toBe(0)
  })
})

describe("evalHmmRegime — posterior ของวันล่าสุด", () => {
  it("60 วันท้ายเป็นช่วงเครียด → สถานะวันนี้ต้องเป็น STRESS (เดิมใช้การกระจายของวันแรก → CALM)", () => {
    const g = rng(11)
    const mkt: number[] = []
    for (let i = 0; i < 250; i++) mkt.push(0.001 + 0.004 * g.n())
    for (let i = 0; i < 60; i++) mkt.push(-0.004 + 0.025 * g.n())
    const e = evalHmmRegime(mkt)
    expect(e.stats.stateNow).toBe("STRESS")
    expect(e.stats.pStressNow as number).toBeGreaterThan(50)
  })
})

describe("evalTripleBarrier — ไม่ติดป้ายไม้ที่กำแพงเวลาเกินปลายข้อมูล", () => {
  it("ไม่ชนกำแพงราคาและ horizon ไม่ครบ → ไม่นับเป็น timeout", () => {
    // ราคาแกว่ง +0.2%/−0.2% สลับ → ไม่มีวันชน +2σ / −1.5σ → ทุกไม้ต้องเป็น timeout ครบ 10 แท่ง
    const nD = 60
    const r = Array.from({ length: nD }, (_, t) => Array.from({ length: 25 }, () => (t % 2 === 1 ? 0.002 : 1 / 1.002 - 1)))
    const piv = pivFromReturns(r)
    const e = evalTripleBarrier(piv, dailyReturns(piv))
    // วันเข้า 20..49 (30 วัน × top-20) เท่านั้นที่เห็นครบ 10 แท่ง — เดิมนับถึงวัน 58 (780 ไม้)
    expect(e.stats.nSamples).toBe(600)
    expect(e.stats.pctTimeout).toBe(100)
    expect(e.stats.avgHoldBars).toBe(10)
  })

  it("ไม่มีไม้ → INFO (เดิม FAIL 'EV −1.10%' ทั้งที่ n = 0)", () => {
    const empty: ThaiPivots = { dates: [], symbols: [], nSym: 0, close: [], val: [], liq: [] }
    expect(evalTripleBarrier(empty, []).verdict).toBe("INFO")
  })
})

describe("evalCsad — ข้อมูลไม่พอ", () => {
  it("ไม่มีวันเลย → INFO (เดิม FAIL t = 0.00)", () => {
    expect(evalCsad([], []).verdict).toBe("INFO")
  })
})

// ---------------- DB-backed: cache ต่อ data snapshot ----------------

const ROOT = resolve(import.meta.dir, "../../../..")

describe("runGlobalEngines — cache ไม่ค้างเมื่อชุดหุ้นเปลี่ยนแต่ช่วงวันเท่าเดิม", () => {
  it("เพิ่มหุ้นใหม่ในวันเดิม → รายงานต้องคำนวณใหม่ (เดิม key = จำนวนวัน:วันล่าสุด → ค้าง)", () => {
    const dir = mkdtempSync(join(tmpdir(), "engines-test-"))
    try {
      const file = join(dir, "t.db")
      createSchemaDb(file) // schema จริงจาก prisma/schema.prisma (src/test/schema-db.ts)
      const d = new Database(file)
      const ins = d.prepare(`INSERT INTO "RawDaily" (date, symbol, close, val, liq5) VALUES (?, ?, ?, ?, 1)`)
      const d0 = Date.parse("2026-01-05T00:00:00Z")
      for (let i = 0; i < 30; i++) {
        const dt = new Date(d0 + i * 86400000).toISOString().slice(0, 10)
        for (let j = 0; j < 3; j++) ins.run(dt, `S${j}`, 10 + ((i + j) % 5) * 0.1, 5e6)
      }
      d.close()
      const code = `import { runGlobalEngines } from "@/lib/research/global-engines/evaluate"; import { db } from "@/lib/db";
        const a = await runGlobalEngines();
        const dates = [...new Set((await db.rawDaily.findMany({ select: { date: true } })).map((r) => r.date))];
        await db.rawDaily.createMany({ data: dates.map((date) => ({ date, symbol: "NEW", close: 20, val: 5e6, liq5: 1 })) });
        const b = await runGlobalEngines();
        console.log("RESULT " + JSON.stringify({ a: a.symbols, b: b.symbols, datesA: a.dates, datesB: b.dates }));`
      const p = Bun.spawnSync([process.execPath, "-e", code], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: `file:${file}` },
        stdout: "pipe",
        stderr: "pipe",
      })
      const line = p.stdout.toString().split("\n").find((l) => l.startsWith("RESULT "))
      if (!line) throw new Error(`child failed: ${p.stderr.toString()}`)
      const r = JSON.parse(line.slice(7)) as { a: number; b: number; datesA: number; datesB: number }
      expect(r.datesA).toBe(r.datesB)
      expect(r.a).toBe(3)
      expect(r.b).toBe(4)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 30000)
})
