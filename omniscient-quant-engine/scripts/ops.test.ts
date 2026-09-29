/// <reference types="bun-types" />
// ============================================================
// bun test ./scripts — สคริปต์ ops ผ่าน CLI จริงบน SQLite ชั่วคราว (ไม่แตะ db/custom.db เด็ดขาด)
//   ingest-csv (dry run → จริง) → engine-check → backup-db → ทำ DB เสีย → restore-db (แผน → จริง)
// ============================================================

import { afterAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { generateMarket } from "../src/lib/quant/market"
import { createSchemaDb } from "../src/test/schema-db"
import { inspectSqlite, resolveSqliteFile } from "./sqlite-file"

const dir = mkdtempSync(path.join(tmpdir(), "oqe-ops-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const live = path.join(dir, "live.db")
const backups = path.join(dir, "backups")
const ENV = {
  DATABASE_URL: `file:${live}`,
  OQE_BACKUP_DIR: backups,
  OQE_LLM_PROVIDER: "none",
  OQE_LOG_FORMAT: "json",
  // restore-db ถามหา server ที่ /api/health — ชี้ไปพอร์ตที่ไม่มีใครฟัง
  PORT: "39871",
  OQE_APP_URL: "",
  NODE_ENV: "test",
}

function cli(script: string, args: string[], env: Record<string, string> = ENV) {
  const p = Bun.spawnSync([process.execPath, path.join(import.meta.dir, script), ...args], {
    cwd: dir, // ไม่มี .env ในโฟลเดอร์นี้ — ค่าทั้งหมดมาจาก env ที่ส่งให้เท่านั้น
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = p.stdout.toString()
  const err = p.stderr.toString()
  const lines = `${out}\n${err}`
    .split("\n")
    .filter((l) => l.startsWith("{"))
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>
      } catch {
        return {}
      }
    })
  return { code: p.exitCode, out, err, lines, last: (msg: string) => [...lines].reverse().find((l) => l.msg === msg) }
}

function count(table: string, file = live): number {
  const d = new Database(file, { readonly: true })
  try {
    return (d.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n
  } finally {
    d.close()
  }
}

// CSV แบบข้อมูลจริง: 6 หุ้น × 400 วัน ปริมาณเป็นจำนวนหุ้น ไม่มีงบ/เงินไหล + ไฟล์ metadata
const gen = generateMarket(99)
const picked = gen.stocks.slice(0, 6)
const csv = ["symbol,date,open,high,low,close,volume"]
for (const s of picked) {
  const from = s.series.close.length - 400
  for (let i = from; i < s.series.close.length; i++) {
    csv.push([`${s.def.symbol}.BK`, s.series.dates[i].toISOString().slice(0, 10), s.series.open[i], s.series.high[i], s.series.low[i], s.series.close[i], Math.round(s.series.volume[i] * 1e6)].join(","))
  }
}
const pricesCsv = path.join(dir, "prices.csv")
const metaCsv = path.join(dir, "meta.csv")
writeFileSync(pricesCsv, csv.join("\n"))
writeFileSync(metaCsv, ["symbol,name,sector,theme", ...picked.map((s) => `${s.def.symbol},${s.def.name},${s.def.sector},${s.def.theme}`)].join("\n"))

createSchemaDb(live)
{
  // journal ของผู้ใช้ต้องรอดการนำเข้าข้อมูลตลาด
  const d = new Database(live)
  const now = Date.now()
  d.run(
    "INSERT INTO JournalEntry (id, createdAt, updatedAt, runDate, symbol, signal, gates, price, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ["j1", now, now, now, "PTT", "NO_TRADE", "{}", 33.5, "PLANNED"],
  )
  d.close()
}

describe("resolveSqliteFile — กติกา path ของ Prisma", () => {
  test("สัมพัทธ์นับจาก prisma/ · absolute คงเดิม · ตัด query · ไม่ใช่ file: = null", () => {
    expect(resolveSqliteFile("file:../db/custom.db", "/app/prisma")).toBe("/app/db/custom.db")
    expect(resolveSqliteFile("file:/data/app.db?connection_limit=1", "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile('"file:/data/app.db"', "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile("postgresql://u:p@h/db")).toBeNull()
    expect(resolveSqliteFile(undefined)).toBeNull()
  })
})

describe("ingest-csv → engine-check → backup-db → restore-db", () => {
  test("ingest-csv: ไม่มี --yes = dry run (exit 2) ไม่แตะ DB · ข้อมูลไม่พอ = exit 1", () => {
    const dry = cli("ingest-csv.ts", [pricesCsv, "--source", "test:csv", "--meta", metaCsv])
    expect(dry.code).toBe(2)
    expect(dry.last("dry run ok — เพิ่ม --yes เพื่อแทนที่ข้อมูลจริง")).toBeDefined()
    expect(count("Stock")).toBe(0)
    const shortCsv = path.join(dir, "short.csv")
    writeFileSync(shortCsv, csv.slice(0, 50).join("\n"))
    const bad = cli("ingest-csv.ts", [shortCsv, "--source", "test:short", "--yes"])
    expect(bad.code).toBe(1)
    expect(String(bad.last("ingest rejected")?.stage)).toBe("prepare")
    expect(count("Stock")).toBe(0)
  }, 60_000)

  test("ingest-csv --yes: backup ก่อน → แทนที่ข้อมูล → DataSource kind=real · journal ยังอยู่ · ปริมาณเป็นล้านหุ้น", () => {
    const r = cli("ingest-csv.ts", [pricesCsv, "--source", "test:csv", "--license", "test-only", "--meta", metaCsv, "--yes"])
    expect(r.code).toBe(0)
    const ok = r.last("ingest ok")!
    expect(ok.summary).toMatchObject({ symbols: 6, priceRows: 2400, commonBars: 400 })
    expect(count("Stock")).toBe(6)
    expect(count("Price")).toBe(2400)
    expect(count("JournalEntry")).toBe(1)
    const d = new Database(live, { readonly: true })
    const ds = d.query("SELECT kind, source, license, stocks, prices FROM DataSource ORDER BY createdAt DESC LIMIT 1").get()
    const stock = d.query("SELECT name, sector FROM Stock WHERE symbol = ?").get(picked[0].def.symbol)
    const maxVol = (d.query("SELECT MAX(volume) AS v FROM Price").get() as { v: number }).v
    d.close()
    expect(ds).toEqual({ kind: "real", source: "test:csv", license: "test-only", stocks: 6, prices: 2400 })
    expect(stock).toEqual({ name: picked[0].def.name, sector: picked[0].def.sector })
    expect(maxVol).toBeLessThan(1000) // ล้านหุ้น
    const files = readdirSync(backups).filter((f) => f.startsWith("oqe-backup-") && f.includes("before-ingest"))
    expect(files).toHaveLength(1)
    expect(statSync(path.join(backups, files[0])).mode & 0o777).toBe(0o600)
  }, 60_000)

  test("engine-check: ทั้งท่อทำงานบนข้อมูลที่นำเข้า (มีแต่ราคา) ตัวเลขจำกัด", () => {
    const r = cli("engine-check.ts", [])
    expect(r.code).toBe(0)
    const ok = r.last("engine ok")!
    expect(ok.data).toMatchObject({ kind: "real", source: "test:csv", stocks: 6, days: 400, coverage: { fundamentals: 0, flows: 0 } })
    expect((ok.gates as string[]).length).toBe(5)
  }, 120_000)

  test("backup-db: exit 0 + ไฟล์ผ่าน quick_check · DATABASE_URL ไม่ใช่ SQLite = exit 1", () => {
    const r = cli("backup-db.ts", ["--reason", "nightly"])
    expect(r.code).toBe(0)
    const ok = r.last("backup verified")!
    expect(ok).toMatchObject({ stocks: 6, prices: 2400 })
    expect(inspectSqlite(String(ok.file)).ok).toBe(true)
    const bad = cli("backup-db.ts", [], { ...ENV, DATABASE_URL: "postgresql://u:p@localhost/x" })
    expect(bad.code).toBe(1)
  }, 60_000)

  test("restore-db: --list · ไม่มี --yes = แผน (exit 2) · --yes กู้ข้อมูลคืน + เก็บ pre-restore · ไฟล์เสีย = exit 1", () => {
    const d = new Database(live)
    d.run("DELETE FROM Price")
    d.close()
    expect(count("Price")).toBe(0)

    const list = cli("restore-db.ts", ["--list"])
    expect(list.code).toBe(0)
    expect(list.out).toContain("oqe-backup-")

    const plan = cli("restore-db.ts", ["--latest"])
    expect(plan.code).toBe(2)
    expect(plan.out).toContain("เพิ่ม --yes")
    expect(count("Price")).toBe(0)

    const r = cli("restore-db.ts", ["--latest", "--yes"])
    expect(r.code).toBe(0)
    expect(count("Price")).toBe(2400)
    expect(readdirSync(backups).some((f) => f.startsWith("pre-restore-"))).toBe(true)

    const junk = path.join(dir, "junk.db")
    writeFileSync(junk, "not a database")
    const bad = cli("restore-db.ts", [junk, "--yes"])
    expect(bad.code).toBe(1)
    expect(existsSync(live)).toBe(true)
    expect(count("Price")).toBe(2400)
  }, 60_000)
})
