/// <reference types="bun-types" />
// ============================================================
// preload ของ bun test (ตั้งใน bunfig.toml) — รันก่อนโหลดไฟล์ test ใด ๆ
// ปัญหาที่กัน: bun โหลด .env อัตโนมัติ (DATABASE_URL → db/custom.db) และ bun test ใช้ module registry/globalThis
// ร่วมกันทุกไฟล์ — ไฟล์แรกที่ import @/lib/db จะผูก Prisma client ของทั้งรอบ ถ้าชี้ db/custom.db ก็เขียนทับข้อมูลจริงได้
// ทางแก้: ชี้ DATABASE_URL ไป DB ชั่วคราว (schema จริง ว่างเปล่า) ตั้งแต่ก่อนไฟล์ใดจะ import
// test ในโปรเซสเดียวกันใช้ไฟล์นี้ร่วมกัน (อ่านได้จาก TEST_DB_FILE) · test ที่ต้องการ DB แยกให้รันใน subprocess
// ============================================================

import { afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "./schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "tmp-bun-test-"))
const file = path.join(dir, "test.db")
createSchemaDb(file)
process.env.DATABASE_URL = `file:${file}`
process.env.TEST_DB_FILE = file
// hook ใน preload = global afterAll (หลัง test ทุกไฟล์จบ)
afterAll(() => rmSync(dir, { recursive: true, force: true }))
