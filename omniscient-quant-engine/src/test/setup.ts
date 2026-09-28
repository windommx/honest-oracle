/// <reference types="bun-types" />
// ============================================================
// preload ของ bun test (ตั้งใน bunfig.toml) — รันก่อนโหลดไฟล์ test ใด ๆ
// ปัญหาที่กัน: bun โหลด .env อัตโนมัติ (DATABASE_URL → db/custom.db) และ bun test ใช้ module registry/globalThis
// ร่วมกันทุกไฟล์ — ไฟล์แรกที่ import @/lib/db จะผูก Prisma client ของทั้งรอบ ถ้าชี้ db/custom.db ก็เขียนทับข้อมูล demo ได้
// ทางแก้: ชี้ DATABASE_URL ไป DB ชั่วคราว (schema จริง ว่างเปล่า) ตั้งแต่ก่อนไฟล์ใดจะ import
// เอนจินจะ seed ข้อมูลจำลอง (deterministic) ลง DB นี้เองใน test ที่ต้องการ
// ============================================================

import { afterAll } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createSchemaDb } from "./schema-db"

const dir = mkdtempSync(path.join(tmpdir(), "oqe-bun-test-"))
const file = path.join(dir, "test.db")
createSchemaDb(file)
process.env.DATABASE_URL = `file:${file}`
process.env.TEST_DB_FILE = file
// NODE_ENV เป็น readonly ใน type ของ Next — กำหนดผ่าน Object.assign (bun test ตั้ง "test" ให้อยู่แล้ว แต่ล็อกไว้ให้ชัด)
Object.assign(process.env, { NODE_ENV: "test" })
// ไม่ให้ test ไปเจอ .z-ai-config / คีย์ LLM ของเครื่องที่รันโดยบังเอิญ — test ของชั้น LLM ส่ง env เองทั้งหมด
process.env.OQE_LLM_PROVIDER = "none"
// hook ใน preload = global afterAll (หลัง test ทุกไฟล์จบ)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

// ---------- DOM สำหรับ component test (React Testing Library) ----------
// happy-dom แทนที่ global ของ Node หลายตัว (fetch/Request/Response/Headers/AbortSignal) ด้วยของตัวเอง —
// test ของชั้น LLM/security ต้องใช้ของ Node จริง จึงเก็บไว้ก่อนแล้วคืนค่าหลังลงทะเบียน (document/window ยังเป็นของ happy-dom)
const nodeGlobals = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  FormData: globalThis.FormData,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  TextEncoder: globalThis.TextEncoder,
  TextDecoder: globalThis.TextDecoder,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  queueMicrotask: globalThis.queueMicrotask,
  structuredClone: globalThis.structuredClone,
}
GlobalRegistrator.register({ url: "http://localhost:3000", width: 1440, height: 900 })
Object.assign(globalThis, nodeGlobals)
