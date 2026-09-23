/// <reference types="bun-types" />
// bun test ./scripts — scripts/backup-db.ts + scripts/restore-db.ts ผ่าน CLI จริงบน SQLite ชั่วคราว
// (ทุกกรณีตั้ง DATABASE_URL ชี้ไฟล์ใน tmpdir เอง — ไม่แตะ db/custom.db)
import { afterAll, describe, expect, it } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "../src/test/schema-db"
import { resolveSqliteFile } from "./restore-db"

const dir = mkdtempSync(path.join(tmpdir(), "backup-restore-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const BACKUP = path.join(import.meta.dir, "backup-db.ts")
const RESTORE = path.join(import.meta.dir, "restore-db.ts")
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex")

function makeDb(file: string, dates: string[]) {
  createSchemaDb(file)
  const d = new Database(file)
  const ins = d.prepare("INSERT INTO RawDaily (date, symbol, close, val, liq5) VALUES (?, ?, ?, ?, 0)")
  for (const date of dates) for (const s of ["AAA", "BBB"]) ins.run(date, s, 10, 1e6)
  ins.finalize() // statement ค้าง = connection ไม่ปิดจริง (fd ยังเปิด) → restore จะเห็นว่า "มี process ใช้ DB อยู่"
  d.close()
}

function rows(file: string): { n: number; d: string | null } {
  const d = new Database(file, { readonly: true })
  try {
    return d.query("SELECT COUNT(*) AS n, MAX(date) AS d FROM RawDaily").get() as { n: number; d: string | null }
  } finally {
    d.close()
  }
}

function cli(script: string, args: string[], env: Record<string, string>) {
  // PORT ที่ไม่มีใครฟัง → restore ไม่เจอ server ปลอม · TMP_APP_URL ว่าง = ไม่ probe ข้าม container
  const p = Bun.spawnSync([process.execPath, script, ...args], {
    cwd: dir,
    env: { ...process.env, PORT: "39871", TMP_APP_URL: "", NODE_ENV: "test", ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  return { code: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() }
}

describe("resolveSqliteFile — กติกา path ของ Prisma", () => {
  it("สัมพัทธ์นับจากโฟลเดอร์ prisma/ · absolute คงเดิม · ตัด query · ไม่ใช่ file: = null", () => {
    expect(resolveSqliteFile("file:../db/custom.db", "/app/prisma")).toBe("/app/db/custom.db")
    expect(resolveSqliteFile("file:./dev.db", "/app/prisma")).toBe("/app/prisma/dev.db")
    expect(resolveSqliteFile("file:/data/app.db?connection_limit=1", "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile('"file:/data/app.db"', "/app/prisma")).toBe("/data/app.db")
    expect(resolveSqliteFile("postgresql://u:p@h/db")).toBeNull()
    expect(resolveSqliteFile(undefined)).toBeNull()
  })
})

describe("backup-db → restore-db", () => {
  const live = path.join(dir, "live.db")
  const backups = path.join(dir, "backups")
  makeDb(live, ["2026-09-21", "2026-09-22"])
  const env = { DATABASE_URL: `file:${live}`, TMP_BACKUP_DIR: backups }

  const b = cli(BACKUP, ["--reason", "test"], env)
  const backupFile = readdirSync(backups).find((f) => f.startsWith("tmp-backup-"))

  it("backup: exit 0, log JSON 'backup ok', ไฟล์ผ่าน quick_check และข้อมูลครบ", () => {
    expect(b.code).toBe(0)
    const line = JSON.parse(b.out.trim().split("\n").pop() ?? "{}")
    expect(line).toMatchObject({ level: "info", component: "backup", msg: "backup ok", rawRows: 4, latestDate: "2026-09-22" })
    expect(backupFile).toBeDefined()
    expect(rows(path.join(backups, backupFile!))).toEqual({ n: 4, d: "2026-09-22" })
  })

  it("backup: DATABASE_URL ไม่ใช่ SQLite → exit 1", () => {
    const r = cli(BACKUP, [], { DATABASE_URL: "postgresql://u:p@localhost/x", TMP_BACKUP_DIR: backups })
    expect(r.code).toBe(1)
    expect(r.err).toContain("backup failed")
  })

  it("restore ไม่มี --yes = แสดงแผนเท่านั้น (exit 2) ไฟล์ปัจจุบันไม่เปลี่ยน", () => {
    // ข้อมูลเปลี่ยนหลัง backup (เพิ่มวันใหม่)
    const d = new Database(live)
    d.run("INSERT INTO RawDaily (date, symbol, close, val, liq5) VALUES ('2026-09-23', 'AAA', 11, 1e6, 0)")
    d.close()
    const before = sha(live)
    const r = cli(RESTORE, ["--latest"], env)
    expect(r.code).toBe(2)
    expect(r.out).toContain("--yes")
    expect(sha(live)).toBe(before)
  })

  it("restore ปฏิเสธเมื่อมี process อื่นเปิดไฟล์ DB อยู่ (exit 3)", () => {
    const holder = Bun.spawn(["sleep", "30"], { stdin: Bun.file(live), stdout: "ignore", stderr: "ignore" })
    try {
      Bun.sleepSync(200)
      const r = cli(RESTORE, ["--latest", "--yes"], env)
      expect(r.code).toBe(3)
      expect(r.err).toContain("database is in use")
      expect(rows(live).n).toBe(5)
    } finally {
      holder.kill()
    }
  })

  it("restore ไฟล์เสีย → exit 1 และไม่แตะ DB ปัจจุบัน", () => {
    const bad = path.join(dir, "corrupt.db")
    writeFileSync(bad, "not a sqlite file at all")
    const before = sha(live)
    const r = cli(RESTORE, [bad, "--yes"], env)
    expect(r.code).toBe(1)
    expect(sha(live)).toBe(before)
  })

  it("restore --yes: กลับเป็นข้อมูลใน backup + เก็บสำเนา pre-restore ของไฟล์เดิม", async () => {
    await Bun.sleep(300) // ให้ sleep ของกรณีก่อนปิด fd แน่นอน
    const beforeSha = sha(live)
    const r = cli(RESTORE, ["--latest", "--yes"], env)
    expect(r.code).toBe(0)
    expect(rows(live)).toEqual({ n: 4, d: "2026-09-22" })
    const safety = readdirSync(backups).find((f) => f.startsWith("pre-restore-"))
    expect(safety).toBeDefined()
    expect(sha(path.join(backups, safety!))).toBe(beforeSha)
    expect(existsSync(`${live}-journal`)).toBe(false)
    // ไม่มีไฟล์ชั่วคราวค้าง
    expect(readdirSync(dir).filter((f) => f.includes(".restore-"))).toEqual([])
  })
})
