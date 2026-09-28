/// <reference types="bun-types" />
// ============================================================
// API smoke test ของ build โปรดักชัน (standalone) — ใช้ใน CI และหลัง deploy
//
//   bun deploy/smoke.ts                                  # เปิด server เอง: คัดลอก db/custom.db → ไฟล์ชั่วคราว
//                                                        #   แล้วรัน node .next/standalone/server.js บน 127.0.0.1
//   bun deploy/smoke.ts --base-url https://oqe.example   # ตรวจ server ที่รันอยู่แล้ว (ส่ง Bearer $OQE_API_TOKEN ถ้ามี)
//   ตัวเลือก: --db <ไฟล์ .db ต้นแบบ | empty> --port 3210 --runtime node|bun --routes /api/a,/api/b --timeout-sec 120
//
// ผ่านเมื่อ: ทุก route ตอบ status ที่คาด · body ของ /api/* เป็น JSON ที่ parse ได้แบบเคร่งครัด (NaN/Infinity ดิบ = ไม่ผ่าน)
//           ไม่มีตัวเลขไม่จำกัด / สตริง "NaN" "Infinity" หลุดออกมา · POST ที่เรียก LLM โดยไม่ตั้งค่า = 503 (ไม่ใช่ 500)
//           server ไม่พิมพ์ error ที่ไม่ได้จัดการ (บรรทัดขึ้นต้น ⨯) ระหว่างทดสอบ
// ============================================================

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const APP_ROOT = path.resolve(import.meta.dir, "..")

export interface RouteSpec {
  route: string
  method?: "GET" | "POST"
  /** status ที่คาด (ค่าเริ่มต้น 200) */
  status?: number
  body?: unknown
}

/** GET ทั้งหมดของแอป (ไม่มี side effect ต่อข้อมูลจริง — รันบนสำเนา DB) + หน้าเว็บ + POST ที่ต้องตอบ 503 เมื่อไม่มี LLM */
export const DEFAULT_ROUTES: RouteSpec[] = [
  { route: "/api/health" },
  { route: "/api" },
  { route: "/api/system" },
  { route: "/api/board" },
  { route: "/api/decision/TSE" },
  { route: "/api/decision/SCB" },
  { route: "/api/analytics/factors" },
  { route: "/api/analytics/dependence" },
  { route: "/api/backtest" },
  { route: "/api/journal" },
  { route: "/api/audit" },
  { route: "/api/synthesis/TSE" },
  { route: "/api/meta-risk/TSE" },
  { route: "/api/apex/TSE" },
  { route: "/api/apex/SCB" },
  { route: "/api/market/quotes" },
  { route: "/api/market/series/TSE?tf=1D&bars=180" },
  { route: "/api/market/series/TSE?tf=1W&bars=750" },
  { route: "/api/analyst/TSE" },
  { route: "/api/decision/NOPE", status: 404 },
  // LLM ไม่ได้ตั้งค่าใน smoke → ต้อง 503 พร้อมข้อความ ไม่ใช่ 500
  { route: "/api/analyst/TSE", method: "POST", body: { question: "ทดสอบ" }, status: 503 },
  { route: "/api/synthesis/TSE", method: "POST", status: 503 },
  { route: "/api/audit", method: "POST", status: 503 },
  { route: "/" },
]

/** หาค่าที่ไม่ควรหลุดออกมาใน JSON: ตัวเลขไม่จำกัด (1e999 → Infinity) และสตริงที่มีคำว่า NaN/Infinity (format เลขพัง) */
export function findNonFinite(value: unknown, at = "$", out: string[] = [], limit = 5): string[] {
  if (out.length >= limit) return out
  if (typeof value === "number") {
    if (!Number.isFinite(value)) out.push(`${at} = ${value}`)
  } else if (typeof value === "string") {
    if (/(^|[^A-Za-z])(NaN|-?Infinity)([^A-Za-z]|$)/.test(value)) out.push(`${at} = ${JSON.stringify(value.slice(0, 80))}`)
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => findNonFinite(v, `${at}[${i}]`, out, limit))
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) findNonFinite(v, `${at}.${k}`, out, limit)
  }
  return out
}

export interface RouteResult {
  route: string
  status: number
  ms: number
  bytes: number
  ok: boolean
  problem?: string
}

/** ตรวจคำตอบ 1 route (pure ต่อ status/body) */
export function checkResponse(spec: RouteSpec, status: number, contentType: string, body: string): string | undefined {
  const expected = spec.status ?? 200
  if (status !== expected) return `HTTP ${status} (คาด ${expected}): ${body.slice(0, 160).replace(/\s+/g, " ")}`
  if (!spec.route.startsWith("/api")) return body.length > 0 ? undefined : "body ว่าง"
  if (!contentType.includes("application/json")) return `content-type ไม่ใช่ JSON (${contentType})`
  let parsed: unknown
  try {
    parsed = JSON.parse(body) // JSON มาตรฐานไม่มี NaN/Infinity — มีดิบ ๆ = parse ไม่ผ่าน
  } catch (e) {
    return `JSON ไม่ถูกต้อง (${(e as Error).message}) — มี NaN/Infinity ดิบ?`
  }
  const bad = findNonFinite(parsed)
  if (bad.length > 0) return `ค่าที่ไม่จำกัด/NaN: ${bad.join(", ")}`
  if (expected === 503) {
    const p = parsed as { error?: string; detail?: string }
    if (p.error !== "llm_unavailable" || !p.detail) return `503 ต้องเป็น llm_unavailable พร้อม detail — ได้ ${body.slice(0, 120)}`
  }
  return undefined
}

interface Opts {
  baseUrl?: string
  db: string
  port: number
  runtime: "node" | "bun"
  routes: RouteSpec[]
  timeoutSec: number
}

function parseArgs(argv: string[]): Opts {
  const get = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const runtime = get("--runtime") === "bun" ? "bun" : "node"
  const routes = get("--routes")
  const dbArg = get("--db")
  return {
    baseUrl: get("--base-url")?.replace(/\/+$/, ""),
    db: dbArg === "empty" ? "empty" : path.resolve(dbArg ?? path.join(APP_ROOT, "db", "custom.db")),
    port: Number(get("--port") ?? process.env.SMOKE_PORT ?? 3210),
    runtime,
    routes: routes ? routes.split(",").map((r) => r.trim()).filter(Boolean).map((route) => ({ route })) : DEFAULT_ROUTES,
    timeoutSec: Number(get("--timeout-sec") ?? 120),
  }
}

async function call(base: string, spec: RouteSpec, timeoutSec: number, headers: Record<string, string>) {
  const t0 = performance.now()
  const init: RequestInit = { headers: { ...headers }, signal: AbortSignal.timeout(timeoutSec * 1000), redirect: "manual", method: spec.method ?? "GET" }
  if (spec.method === "POST") {
    init.headers = { ...headers, "Content-Type": "application/json", Origin: base }
    init.body = JSON.stringify(spec.body ?? {})
  }
  const res = await fetch(`${base}${spec.route}`, init)
  const body = await res.text()
  return { res, body, ms: Math.round(performance.now() - t0) }
}

/** รอจน server รับ connection (ตอบ HTTP ใด ๆ ที่ /api/health — สถานะจริงตรวจใน route check ถัดไป) */
async function waitReady(base: string, headers: Record<string, string>, deadline: number, alive: () => boolean): Promise<boolean> {
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

async function main(): Promise<number> {
  const o = parseArgs(process.argv.slice(2))
  const token = process.env.OQE_API_TOKEN?.trim()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  const base = o.baseUrl ?? `http://127.0.0.1:${o.port}`
  let server: ReturnType<typeof Bun.spawn> | null = null
  let tmp: string | null = null
  const serverLog: string[] = []

  const cleanup = () => {
    if (server && server.exitCode === null) server.kill("SIGTERM")
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  }
  ;(process as unknown as NodeJS.EventEmitter).on("SIGINT", () => {
    cleanup()
    process.exit(130)
  })

  try {
    if (!o.baseUrl) {
      const entry = path.join(APP_ROOT, ".next", "standalone", "server.js")
      if (!existsSync(entry)) {
        console.error(`ไม่พบ ${path.relative(APP_ROOT, entry)} — รัน bun run build ก่อน`)
        return 1
      }
      tmp = mkdtempSync(path.join(tmpdir(), "oqe-smoke-"))
      const dbCopy = path.join(tmp, "smoke.db")
      if (o.db === "empty") {
        // DB เปล่าตาม schema จริง — API แรกที่ถูกเรียกจะ seed ข้อมูลจำลองเอง (ทดสอบทาง auto-seed)
        const { createSchemaDb } = await import("../src/test/schema-db")
        createSchemaDb(dbCopy)
      } else {
        if (!existsSync(o.db)) {
          console.error(`ไม่พบ DB ต้นแบบ ${o.db}`)
          return 1
        }
        copyFileSync(o.db, dbCopy) // ไม่แตะไฟล์ต้นแบบ (db/custom.db) เด็ดขาด
      }
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(o.port),
        HOSTNAME: "127.0.0.1",
        DATABASE_URL: `file:${dbCopy}`,
        NEXT_TELEMETRY_DISABLED: "1",
        // smoke ต้องเห็นพฤติกรรม "ไม่มี LLM" เสมอ ไม่ว่าเครื่องที่รันจะมีคีย์หรือไม่
        OQE_LLM_PROVIDER: "none",
      }
      const exe = o.runtime === "bun" ? process.execPath : "node"
      server = Bun.spawn([exe, entry], { cwd: APP_ROOT, env, stdout: "pipe", stderr: "pipe" })
      for (const stream of [server.stdout, server.stderr]) {
        ;(async () => {
          const reader = (stream as ReadableStream<Uint8Array>).getReader()
          const dec = new TextDecoder()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            for (const line of dec.decode(value).split("\n")) if (line.trim()) serverLog.push(line)
          }
        })().catch(() => {})
      }
      const proc = server
      const ready = await waitReady(base, headers, Date.now() + 90_000, () => proc.exitCode === null)
      if (!ready) {
        console.error(`server ไม่พร้อมภายใน 90 วินาที (${o.runtime}) — log ท้าย:\n${serverLog.slice(-40).join("\n")}`)
        return 1
      }
      console.log(`server พร้อม: ${base} (${o.runtime}, DB ${o.db === "empty" ? "เปล่า → auto-seed" : `สำเนาของ ${path.relative(APP_ROOT, o.db) || o.db}`})`)
    }

    const results: RouteResult[] = []
    for (const spec of o.routes) {
      const label = `${spec.method ?? "GET"} ${spec.route}`
      try {
        const { res, body, ms } = await call(base, spec, o.timeoutSec, headers)
        const problem = checkResponse(spec, res.status, res.headers.get("content-type") ?? "", body)
        results.push({ route: label, status: res.status, ms, bytes: body.length, ok: !problem, problem })
      } catch (e) {
        results.push({ route: label, status: 0, ms: 0, bytes: 0, ok: false, problem: (e as Error).message })
      }
    }

    for (const r of results) {
      const mark = r.ok ? "PASS" : "FAIL"
      console.log(`${mark}  ${String(r.status).padStart(3)}  ${String(r.ms).padStart(6)} ms  ${r.route}${r.problem ? `  ← ${r.problem}` : ""}`)
    }

    const serverErrors = serverLog.filter((l) => /^\s*⨯/.test(l))
    if (serverErrors.length > 0) {
      console.error(`server พิมพ์ error ที่ไม่ได้จัดการ ${serverErrors.length} บรรทัด:\n${serverErrors.slice(0, 10).join("\n")}`)
    }
    const failed = results.filter((r) => !r.ok)
    const total = results.reduce((s, r) => s + r.ms, 0)
    console.log(`\n${results.length - failed.length}/${results.length} ผ่าน · รวม ${(total / 1000).toFixed(1)} วินาที`)
    return failed.length === 0 && serverErrors.length === 0 ? 0 : 1
  } finally {
    cleanup()
  }
}

if (import.meta.main) {
  main().then((code) => process.exit(code))
}
