/// <reference types="bun-types" />
// bun test — ด่านยืนยันก่อนลบ (seed / replaceDemo) + backup (VACUUM INTO) กับ SQLite จริง
// รันใน subprocess ที่มี DATABASE_URL / TMP_BACKUP_DIR ของตัวเอง (route เขียน/ลบข้อมูล — ห้ามใช้ DB ร่วมของ process หลัก)
import { afterAll, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "@/test/schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "security-db-test-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(): any {
  const file = path.join(dir, "guards.db")
  createSchemaDb(file)
  const proc = Bun.spawnSync([process.execPath, path.join(import.meta.dir, "destructive.db-harness.ts")], {
    cwd: dir,
    env: { ...process.env, DATABASE_URL: `file:${file}`, TMP_BACKUP_DIR: path.join(dir, "backups"), TZ: "Asia/Bangkok", NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const out = proc.stdout.toString().trim().split("\n").pop() ?? ""
  if (proc.exitCode !== 0) throw new Error(`harness failed: ${proc.stderr.toString().slice(-2000)}`)
  return JSON.parse(out)
}

describe("ด่านยืนยันก่อนลบข้อมูล + backup", () => {
  const r = run()

  it("POST /api/seed บน DB ว่าง: ไม่ต้องยืนยัน ไม่มี backup (ไม่มีอะไรให้เสีย)", () => {
    expect(r.seedEmpty.status).toBe(200)
    expect(r.seedEmpty.ok).toBe(true)
    expect(r.seedEmpty.backup).toBeNull()
    expect(r.seedEmpty.files).toBe(0)
    expect(r.seedEmpty.raw).toBeGreaterThan(0)
  })

  it("POST /api/seed บน DB ที่มีข้อมูล ไม่ส่ง confirm / confirm ผิด → 409 ภาษาไทย และไม่มีอะไรถูกลบ", () => {
    expect(r.seedNoConfirm.status).toBe(409)
    expect(r.seedNoConfirm.code).toBe("confirm_required")
    expect(r.seedNoConfirm.confirmRequired).toBe("RESET")
    expect(r.seedNoConfirm.error).toContain("ลบข้อมูลเดิมทั้งหมด")
    expect(r.seedNoConfirm.existingRaw).toBeGreaterThan(0)
    expect(r.seedNoConfirm.rawSame).toBe(true)
    expect(r.seedNoConfirm.markKept).toBe(1)
    expect(r.seedNoConfirm.files).toBe(0)
    expect(r.seedWrongConfirm).toEqual({ status: 409, markKept: 1 })
  })

  it('confirm:"RESET" → สำรอง DB ก่อนลบ (ไฟล์สมบูรณ์ มีข้อมูลก่อน seed ครบ) แล้ว seed ใหม่', () => {
    const s = r.seedConfirm
    expect(s.status).toBe(200)
    expect(s.ok).toBe(true)
    expect(s.files).toBe(1)
    expect(s.backupFileShown).toMatch(/tmp-backup-\d{8}T\d{9}Z-seed-[0-9a-f]{4}\.db$/)
    expect(s.backupBytes).toBeGreaterThan(0)
    expect(s.integrity).toBe("ok")
    expect(s.backupRaw).toBe(s.rawBefore)
    expect(s.backupDecisions).toBe(s.decBefore)
    expect(s.backupMark).toBe(1) // ข้อมูลที่ seed ลบไปยังอยู่ใน backup
    expect(s.liveMark).toBe(0) // seed ลบจริงหลังสำรองแล้ว
    expect(JSON.parse(s.seedEvent).backup).toContain("tmp-backup-")
  })

  it('POST /api/feed/ingest replaceDemo: ไม่ confirm → 409 · confirm:"REPLACE" → สำรองแล้วล้าง · DB ว่างไม่ต้องยืนยัน', () => {
    expect(r.replaceNoConfirm).toEqual({ status: 409, confirmRequired: "REPLACE", rawSame: true })
    expect(r.replaceConfirm.status).toBe(200)
    expect(r.replaceConfirm.replacedDemo).toBe(true)
    expect(r.replaceConfirm.backup).toBe(true)
    expect(r.replaceConfirm.newFiles).toBe(1)
    expect(r.replaceConfirm.symbols).toEqual(["REALX"])
    expect(r.replaceConfirm.notes.join(" ")).toContain("สำรองฐานข้อมูล")
    expect(r.plainFeed).toEqual({ status: 200, hasBackupField: false })
    expect(r.replaceEmpty).toEqual({ status: 200, backup: null })
  })

  it("POST /api/ingest: ต่อท้ายวันใหม่ไม่สำรอง · ทับช่วงวันที่เดิมสำรองก่อน (ไม่ต้องยืนยัน)", () => {
    expect(r.ingestAppend).toEqual({ status: 200, backup: null })
    expect(r.ingestOverwrite.status).toBe(200)
    expect(r.ingestOverwrite.backup).toBe(true)
    expect(r.ingestOverwrite.newFiles).toBe(1)
    expect(r.ingestOverwrite.message).toContain("สำรอง DB")
  })

  it("backupDatabase: เก็บ N ไฟล์ล่าสุด · ปฏิเสธ path ที่มีเครื่องหมายคำพูด · ไม่ใช่ SQLite = null", () => {
    expect(r.prune.made).toBe(4)
    expect(r.prune.left.length).toBe(2)
    expect(r.prune.newestKept).toBe(true)
    for (const f of r.prune.left) expect(f).toMatch(/^tmp-backup-\d{8}T\d{9}Z-prune-test-[0-9a-f]{4}\.db$/)
    expect(r.unsafe).toEqual({ result: null, dirCreated: false })
    expect(r.nonSqlite).toBeNull()
  })

  it("ตำแหน่งเริ่มต้น: <app>/data/backups (standalone ถอยออกจาก .next/standalone) · TMP_BACKUP_DIR ทับได้", () => {
    expect(r.paths).toEqual({
      standalone: "/srv/app",
      plain: "/srv/app",
      defaultDir: "/srv/app/data/backups",
      envDir: "/var/backups/tmp",
    })
  })
})
