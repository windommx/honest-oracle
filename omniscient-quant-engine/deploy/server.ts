/// <reference types="bun-types" />
// ============================================================
// เปิด standalone server ของ build โปรดักชันบนสำเนา DB ชั่วคราว — ใช้ร่วมกันโดย deploy/smoke.ts และ deploy/e2e.ts
// ไม่แตะไฟล์ DB ต้นแบบ (db/custom.db) เด็ดขาด · LLM ปิดเสมอ (ทดสอบพฤติกรรม "ไม่มี LLM")
// ============================================================

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

export const APP_ROOT = path.resolve(import.meta.dir, "..")

export interface ServerHandle {
  base: string
  /** stdout + stderr ของ server ทีละบรรทัด */
  log: string[]
  stop: () => void
}

export interface StartOptions {
  /** ไฟล์ .db ต้นแบบ หรือ "empty" = DB เปล่าตาม schema (ทดสอบทาง auto-seed) */
  db: string
  port: number
  runtime: "node" | "bun"
  env?: Record<string, string>
  readyTimeoutMs?: number
}

/** รอจน server รับ connection (ตอบ HTTP ใด ๆ ที่ /api/health) */
export async function waitReady(base: string, headers: Record<string, string>, deadline: number, alive: () => boolean): Promise<boolean> {
  while (Date.now() < deadline) {
    if (!alive()) return false
    try {
      const r = await fetch(`${base}/api/health`, { headers, signal: AbortSignal.timeout(5000) })
      await r.arrayBuffer()
      return true
    } catch {}
    await Bun.sleep(500)
  }
  return false
}

export async function startStandaloneServer(o: StartOptions): Promise<ServerHandle> {
  const entry = path.join(APP_ROOT, ".next", "standalone", "server.js")
  if (!existsSync(entry)) throw new Error(`ไม่พบ ${path.relative(APP_ROOT, entry)} — รัน bun run build ก่อน`)
  const tmp = mkdtempSync(path.join(tmpdir(), "oqe-server-"))
  const dbCopy = path.join(tmp, "server.db")
  if (o.db === "empty") {
    const { createSchemaDb } = await import("../src/test/schema-db")
    createSchemaDb(dbCopy)
  } else {
    if (!existsSync(o.db)) throw new Error(`ไม่พบ DB ต้นแบบ ${o.db}`)
    copyFileSync(o.db, dbCopy)
  }
  const env: Record<string, string | undefined> = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(o.port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: `file:${dbCopy}`,
    NEXT_TELEMETRY_DISABLED: "1",
    OQE_LLM_PROVIDER: "none",
    OQE_BACKUP_DIR: path.join(tmp, "backups"),
    ...o.env,
  }
  const exe = o.runtime === "bun" ? process.execPath : "node"
  const server = Bun.spawn([exe, entry], { cwd: APP_ROOT, env, stdout: "pipe", stderr: "pipe" })
  const log: string[] = []
  for (const stream of [server.stdout, server.stderr]) {
    ;(async () => {
      const reader = (stream as ReadableStream<Uint8Array>).getReader()
      const dec = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        for (const line of dec.decode(value).split("\n")) if (line.trim()) log.push(line)
      }
    })().catch(() => {})
  }
  const stop = () => {
    if (server.exitCode === null) server.kill("SIGTERM")
    rmSync(tmp, { recursive: true, force: true })
  }
  const base = `http://127.0.0.1:${o.port}`
  const ready = await waitReady(base, {}, Date.now() + (o.readyTimeoutMs ?? 90_000), () => server.exitCode === null)
  if (!ready) {
    stop()
    throw new Error(`server ไม่พร้อมภายในเวลาที่กำหนด (${o.runtime}) — log ท้าย:\n${log.slice(-40).join("\n")}`)
  }
  return { base, log, stop }
}
