// ============================================================
// สคริปต์ทดสอบด่านลบข้อมูล + backup กับ SQLite จริง — รันเป็น subprocess โดย destructive.db.test.ts เท่านั้น
// (route เขียน/ลบข้อมูล → ต้องมี DB ของตัวเอง ไม่ใช้ DB ร่วมของ bun test process หลัก)
// ใช้: DATABASE_URL=file:/tmp/x.db TMP_BACKUP_DIR=/tmp/b bun destructive.db-harness.ts  → พิมพ์ JSON บรรทัดสุดท้าย
// ============================================================

import { Database } from "bun:sqlite"
import { existsSync, readdirSync } from "node:fs"
import path from "node:path"
import { db } from "@/lib/db"

const expectedFile = (process.env.DATABASE_URL ?? "").replace(/^file:/, "")
const backupDir = process.env.TMP_BACKUP_DIR ?? ""

async function guard() {
  // ห้ามเขียน DB ที่ไม่ใช่ไฟล์ชั่วคราวของการทดสอบ (เช่น db/custom.db) เด็ดขาด
  const list = (await db.$queryRawUnsafe(`PRAGMA database_list`)) as { name: string; file: string }[]
  const main = list.find((d) => d.name === "main")?.file ?? ""
  if (!expectedFile || main !== expectedFile) throw new Error(`guard: connected to "${main}", expected "${expectedFile}"`)
  if (!backupDir || !backupDir.startsWith(path.dirname(expectedFile))) throw new Error(`guard: TMP_BACKUP_DIR "${backupDir}" ต้องอยู่ในโฟลเดอร์ชั่วคราวของ test`)
}

const post = (body: unknown) =>
  new Request("http://localhost/api/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

const listBackups = (dir = backupDir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".db")).sort() : [])

function countIn(file: string, sql: string): number {
  const d = new Database(file, { readonly: true })
  try {
    return (d.query(sql).get() as { c: number }).c
  } finally {
    d.close()
  }
}

function weekdays(from: string, n: number): string[] {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); out.length < n; t += 86_400_000) {
    const d = new Date(t)
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10))
  }
  return out
}

async function main() {
  const out: Record<string, unknown> = {}
  const seedRoute = await import("@/app/api/seed/route")
  const feedIngest = await import("@/app/api/feed/ingest/route")
  const ingestRoute = await import("@/app/api/ingest/route")
  const { appRoot, backupDatabase, defaultBackupDir } = await import("@/lib/ops/backup")

  // (1) DB ว่าง → seed ได้เลยโดยไม่ต้องยืนยัน และไม่มีอะไรต้องสำรอง
  const r0 = await seedRoute.POST(post({ days: 120, symbols: 40 }))
  const b0 = await r0.json()
  out.seedEmpty = { status: r0.status, ok: b0.ok, backup: b0.backup, files: listBackups().length, raw: await db.rawDaily.count() }

  // (2) มีข้อมูลแล้ว → ไม่ส่ง confirm = 409 และไม่มีอะไรถูกลบ
  await db.decision.create({ data: { date: "2026-01-02", question: "Q_MARK", target: "MARK", action: "keep", conf: 0.5 } })
  const rawBefore = await db.rawDaily.count()
  const decBefore = await db.decision.count()
  const r1 = await seedRoute.POST(post({ days: 120, symbols: 40 }))
  const b1 = await r1.json()
  out.seedNoConfirm = {
    status: r1.status,
    code: b1.code,
    confirmRequired: b1.confirmRequired,
    error: b1.error,
    existingRaw: b1.existing?.rawDaily,
    rawSame: (await db.rawDaily.count()) === rawBefore,
    markKept: await db.decision.count({ where: { question: "Q_MARK" } }),
    files: listBackups().length,
  }
  const r2 = await seedRoute.POST(post({ days: 120, symbols: 40, confirm: "reset" }))
  out.seedWrongConfirm = { status: r2.status, markKept: await db.decision.count({ where: { question: "Q_MARK" } }) }

  // (3) confirm:"RESET" → สำรองก่อน (backup มีข้อมูลก่อนลบ) แล้วค่อย seed ใหม่
  const r3 = await seedRoute.POST(post({ days: 120, symbols: 40, confirm: "RESET" }))
  const b3 = await r3.json()
  const files3 = listBackups()
  const bfile = b3.backup ? path.join(backupDir, path.basename(b3.backup.file)) : ""
  out.seedConfirm = {
    status: r3.status,
    ok: b3.ok,
    backupFileShown: b3.backup?.file ?? null,
    backupBytes: b3.backup?.bytes ?? 0,
    files: files3.length,
    backupRaw: bfile ? countIn(bfile, `select count(*) c from "RawDaily"`) : -1,
    backupMark: bfile ? countIn(bfile, `select count(*) c from "Decision" where question = 'Q_MARK'`) : -1,
    backupDecisions: bfile ? countIn(bfile, `select count(*) c from "Decision"`) : -1,
    rawBefore,
    decBefore,
    liveMark: await db.decision.count({ where: { question: "Q_MARK" } }),
    integrity: bfile ? (new Database(bfile, { readonly: true }).query("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check : null,
    seedEvent: (await db.eventLog.findFirst({ where: { kind: "seed" }, orderBy: { id: "desc" } }))?.payload ?? null,
  }

  // (4) feed/ingest replaceDemo — ไม่ confirm = 409 · confirm:"REPLACE" = สำรองแล้วล้าง
  const dates = weekdays("2026-03-02", 30)
  const rows = dates.map((date, i) => ({ date, symbol: "REALX", close: 20 + i * 0.1, val: 5e6 }))
  const rawBeforeReplace = await db.rawDaily.count()
  const f1 = await feedIngest.POST(post({ source: "test", rows, replaceDemo: true }))
  const fb1 = await f1.json()
  out.replaceNoConfirm = { status: f1.status, confirmRequired: fb1.confirmRequired, rawSame: (await db.rawDaily.count()) === rawBeforeReplace }
  const filesBefore = listBackups().length
  const f2 = await feedIngest.POST(post({ source: "test", rows, replaceDemo: true, confirm: "REPLACE" }))
  const fb2 = await f2.json()
  const syms = (await db.rawDaily.groupBy({ by: ["symbol"] })).map((r) => r.symbol)
  out.replaceConfirm = {
    status: f2.status,
    replacedDemo: fb2.replacedDemo,
    backup: !!fb2.backup,
    newFiles: listBackups().length - filesBefore,
    symbols: syms,
    notes: fb2.notes,
  }
  // ไม่มี replaceDemo = พฤติกรรมเดิมทุกอย่าง (ไม่มีฟิลด์ backup)
  const more = weekdays("2026-04-13", 5).map((date, i) => ({ date, symbol: "REALY", close: 10 + i, val: 3e6 }))
  const f3 = await feedIngest.POST(post({ source: "test", rows: more }))
  const fb3 = await f3.json()
  out.plainFeed = { status: f3.status, hasBackupField: "backup" in fb3 }
  // DB ว่างแล้ว replaceDemo = ไม่ต้องยืนยัน
  await db.snapshot.deleteMany()
  await db.rawDaily.deleteMany()
  await db.position.deleteMany()
  await db.trade.deleteMany()
  await db.backtestRun.deleteMany()
  await db.pendingGate.deleteMany()
  const f4 = await feedIngest.POST(post({ source: "test", rows, replaceDemo: true }))
  out.replaceEmpty = { status: f4.status, backup: (await f4.json()).backup ?? null }

  // (5) /api/ingest — วันใหม่ต่อท้าย = ไม่สำรอง · ทับช่วงวันที่เดิม = สำรองก่อนเขียนทับ (ไม่ต้องยืนยัน)
  const newDates = weekdays("2026-05-04", 3)
  const csvNew = ["date,symbol,close", ...newDates.map((d, i) => `${d},REALX,${30 + i}`)].join("\n")
  const i1 = await ingestRoute.POST(post({ csv: csvNew }))
  const ib1 = await i1.json()
  out.ingestAppend = { status: i1.status, backup: ib1.backup ?? null }
  const csvFix = ["date,symbol,close", `${dates[5]},REALX,99.5`].join("\n")
  const filesBeforeFix = listBackups().length
  const i2 = await ingestRoute.POST(post({ csv: csvFix }))
  const ib2 = await i2.json()
  out.ingestOverwrite = { status: i2.status, backup: !!ib2.backup, newFiles: listBackups().length - filesBeforeFix, message: ib2.message }

  // (6) backupDatabase โดยตรง — เก็บ N ล่าสุด · path อันตราย · ไม่ใช่ SQLite
  const pruneDir = path.join(backupDir, "prune")
  const made: (string | null)[] = []
  for (let i = 0; i < 4; i++) made.push((await backupDatabase({ reason: "Prune Test!", dir: pruneDir, keep: 2 }))?.file ?? null)
  out.prune = { made: made.filter(Boolean).length, left: listBackups(pruneDir), newestKept: listBackups(pruneDir).includes(path.basename(made[3] ?? "")) }
  const unsafeDir = path.join(backupDir, "it's")
  out.unsafe = { result: await backupDatabase({ dir: unsafeDir }), dirCreated: existsSync(unsafeDir) }
  const saved = process.env.DATABASE_URL
  process.env.DATABASE_URL = "postgresql://user:pass@localhost/db"
  out.nonSqlite = await backupDatabase({ dir: pruneDir })
  process.env.DATABASE_URL = saved
  out.paths = {
    standalone: appRoot("/srv/app/.next/standalone"),
    plain: appRoot("/srv/app"),
    defaultDir: defaultBackupDir({}, "/srv/app/.next/standalone"),
    envDir: defaultBackupDir({ TMP_BACKUP_DIR: "/var/backups/tmp" }, "/srv/app"),
  }
  return out
}

await guard()
const result = await main()
console.log(JSON.stringify(result))
await db.$disconnect()
process.exit(0)
