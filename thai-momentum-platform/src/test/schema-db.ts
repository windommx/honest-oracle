/// <reference types="bun-types" />
// ============================================================
// DB ชั่วคราวสำหรับ bun test — schema สร้างจาก prisma/schema.prisma จริง
// (ไม่เขียน DDL เองในแต่ละไฟล์ test ซึ่งจะเพี้ยนไปจาก schema เมื่อมีการเพิ่มคอลัมน์/ตาราง)
// ใช้ `prisma migrate diff --from-empty --to-schema-datamodel` — ทำงาน offline ด้วย schema engine ที่ติดตั้งมากับ prisma
// DDL ถูก cache ตาม hash ของ schema ไว้ใน tmpdir → subprocess และไฟล์ test อื่นไม่ต้องเรียก prisma ซ้ำ
// ============================================================

import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const APP_ROOT = path.resolve(import.meta.dir, "../..")
const SCHEMA = path.join(APP_ROOT, "prisma", "schema.prisma")
const PRISMA_CLI = path.join(APP_ROOT, "node_modules", "prisma", "build", "index.js")

let ddlMemo: string | null = null

/** DDL (SQLite) ของทุกตารางใน schema.prisma */
export function schemaDdl(): string {
  if (ddlMemo !== null) return ddlMemo
  const schema = readFileSync(SCHEMA, "utf8")
  const hash = createHash("sha256").update(schema).digest("hex").slice(0, 16)
  const cache = path.join(tmpdir(), `tmp-prisma-schema-${hash}.sql`)
  if (existsSync(cache)) {
    ddlMemo = readFileSync(cache, "utf8")
    return ddlMemo
  }
  const proc = Bun.spawnSync(
    [process.execPath, PRISMA_CLI, "migrate", "diff", "--from-empty", "--to-schema-datamodel", SCHEMA, "--script"],
    { cwd: APP_ROOT, stdout: "pipe", stderr: "pipe", env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } }
  )
  const ddl = proc.stdout.toString()
  if (proc.exitCode !== 0 || !ddl.includes("CREATE TABLE")) {
    throw new Error(`สร้าง DDL จาก schema.prisma ไม่สำเร็จ (prisma migrate diff): ${proc.stderr.toString().slice(-1500)}`)
  }
  // เขียนแบบ atomic — test ที่รันพร้อมกันหลายโปรเซสจะไม่อ่านเจอไฟล์ครึ่งเดียว
  const tmp = `${cache}.${process.pid}.tmp`
  writeFileSync(tmp, ddl)
  renameSync(tmp, cache)
  ddlMemo = ddl
  return ddl
}

/** สร้างไฟล์ SQLite ว่างที่มีครบทุกตารางตาม schema.prisma */
export function createSchemaDb(file: string): void {
  const db = new Database(file, { create: true })
  try {
    db.exec(schemaDdl())
  } finally {
    db.close()
  }
}
