/// <reference types="bun-types" />
// ============================================================
// API smoke test ของ build โปรดักชัน (standalone) — ใช้ใน CI และหลัง deploy
//
//   bun deploy/smoke.ts                                  # เปิด server เอง: คัดลอก db/custom.db → ไฟล์ชั่วคราว
//                                                        #   แล้วรัน node .next/standalone/server.js บน 127.0.0.1
//   bun deploy/smoke.ts --base-url https://tmp.example.com   # ตรวจ server ที่รันอยู่แล้ว (ส่ง Bearer $TMP_API_TOKEN ถ้ามี)
//   ตัวเลือก: --db <ไฟล์ .db ต้นแบบ> --port 3210 --runtime node|bun --routes /api/a,/api/b --timeout-sec 120
//
// ผ่านเมื่อ: ทุก route ตอบ 200 · body ของ /api/* เป็น JSON ที่ parse ได้แบบเคร่งครัด (NaN/Infinity ดิบ = ไม่ผ่าน)
//           ไม่มีตัวเลขไม่จำกัด / สตริง "NaN" "Infinity" หลุดออกมา · /api/research/importance เรียกซ้ำได้ X-Cache: HIT
//           server ไม่พิมพ์ error ที่ไม่ได้จัดการ (บรรทัดขึ้นต้น ⨯) ระหว่างทดสอบ
// หมายเหตุ runtime: server ต้องรันด้วย node — Next 16.3.6 (Turbopack) + Bun 1.3.11 ล้มทุก route
//   ("Expected CommonJS module to have a function wrapper") · --runtime bun มีไว้ตรวจซ้ำเมื่ออัปเกรด Bun
// ============================================================

import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

const APP_ROOT = path.resolve(import.meta.dir, "..")

/** GET ทั้งหมดของแอป (ไม่มี side effect ต่อข้อมูลจริง — รันบนสำเนา DB) + หน้าเว็บ */
export const DEFAULT_ROUTES = [
  "/api/health",
  "/api/overview",
  "/api/signals",
  "/api/sniper",
  "/api/flagship",
  "/api/gtaa/overview",
  "/api/stops",
  "/api/dates",
  "/api/dq",
  "/api/regime",
  "/api/stats",
  "/api/portfolio",
  "/api/portfolio/allocation",
  "/api/ops/pulse",
  "/api/feed",
  "/api/config/th",
  "/api/map",
  "/api/evidence",
  "/api/report",
  "/api/ai-score",
  "/api/arb/pairs",
  "/api/arb/engines",
  "/api/engines/global",
  "/api/events/audit",
  "/api/jev/decisions",
  "/api/jev/pending",
  "/api/lab/dashboard",
  "/api/research/prereg",
  "/api/research/trial",
  "/api/research/cpcv",
  "/api/research/importance",
  "/api/signals/ab",
  "/api/signals/ic",
  "/api/gtaa/history",
  "/api/gtaa/data",
  "/api/verify",
  "/api/backtest",
  "/api/data/trust",
  "/api/track-record",
  "/api/auth/session",
  "/",
]

const CACHE_ROUTE = "/api/research/importance"

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
  xCache?: string | null
}

/** ตรวจคำตอบ 1 route (pure ต่อ status/body) */
export function checkResponse(route: string, status: number, contentType: string, body: string): string | undefined {
  if (status !== 200) return `HTTP ${status}: ${body.slice(0, 160).replace(/\s+/g, " ")}`
  if (!route.startsWith("/api/")) return body.length > 0 ? undefined : "body ว่าง"
  if (!contentType.includes("application/json")) return `content-type ไม่ใช่ JSON (${contentType})`
  let parsed: unknown
  try {
    parsed = JSON.parse(body) // JSON มาตรฐานไม่มี NaN/Infinity — มีดิบ ๆ = parse ไม่ผ่าน
  } catch (e) {
    return `JSON ไม่ถูกต้อง (${(e as Error).message}) — มี NaN/Infinity ดิบ?`
  }
  const bad = findNonFinite(parsed)
  return bad.length > 0 ? `ค่าที่ไม่จำกัด/NaN: ${bad.join(", ")}` : undefined
}

interface Opts {
  baseUrl?: string
  db: string
  port: number
  runtime: "node" | "bun"
  routes: string[]
  timeoutSec: number
}

function parseArgs(argv: string[]): Opts {
  const get = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const runtime = get("--runtime") === "bun" ? "bun" : "node"
  const routes = get("--routes")
  return {
    baseUrl: get("--base-url")?.replace(/\/+$/, ""),
    db: path.resolve(get("--db") ?? path.join(APP_ROOT, "db", "custom.db")),
    port: Number(get("--port") ?? process.env.SMOKE_PORT ?? 3210),
    runtime,
    routes: routes ? routes.split(",").map((r) => r.trim()).filter(Boolean) : DEFAULT_ROUTES,
    timeoutSec: Number(get("--timeout-sec") ?? 120),
  }
}

async function get(url: string, timeoutSec: number, headers: Record<string, string>) {
  const t0 = performance.now()
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutSec * 1000), redirect: "manual" })
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
  const token = process.env.TMP_API_TOKEN?.trim()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  const base = o.baseUrl ?? `http://127.0.0.1:${o.port}`
  let server: ReturnType<typeof Bun.spawn> | null = null
  let tmp: string | null = null
  const serverLog: string[] = []

  const cleanup = () => {
    if (server && server.exitCode === null) server.kill("SIGTERM")
    if (tmp) rmSync(tmp, { recursive: true, force: true })
  }
  // cast: overload "memoryPressure" ของ bun-types บัง overload สัญญาณของ @types/node ใน tsc
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
      if (!existsSync(o.db)) {
        console.error(`ไม่พบ DB ต้นแบบ ${o.db}`)
        return 1
      }
      tmp = mkdtempSync(path.join(tmpdir(), "tmp-smoke-"))
      const dbCopy = path.join(tmp, "smoke.db")
      copyFileSync(o.db, dbCopy) // ไม่แตะไฟล์ต้นแบบ (db/custom.db) เด็ดขาด
      const env: Record<string, string | undefined> = {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(o.port),
        HOSTNAME: "127.0.0.1",
        DATABASE_URL: `file:${dbCopy}`,
        TMP_BACKUP_DIR: path.join(tmp, "backups"),
        NEXT_TELEMETRY_DISABLED: "1",
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
      console.log(`server พร้อม: ${base} (${o.runtime}, DB สำเนาของ ${path.relative(APP_ROOT, o.db) || o.db})`)
    }

    const results: RouteResult[] = []
    for (const route of o.routes) {
      try {
        const { res, body, ms } = await get(`${base}${route}`, o.timeoutSec, headers)
        const problem = checkResponse(route, res.status, res.headers.get("content-type") ?? "", body)
        results.push({ route, status: res.status, ms, bytes: body.length, ok: !problem, problem, xCache: res.headers.get("x-cache") })
      } catch (e) {
        results.push({ route, status: 0, ms: 0, bytes: 0, ok: false, problem: (e as Error).message })
      }
    }

    // cache ของ importance: เรียกซ้ำต้องได้จาก cache (X-Cache: HIT) และ body เดิม
    if (o.routes.includes(CACHE_ROUTE)) {
      const first = results.find((r) => r.route === CACHE_ROUTE)
      try {
        const { res, ms } = await get(`${base}${CACHE_ROUTE}`, o.timeoutSec, headers)
        const hit = res.headers.get("x-cache") === "HIT"
        results.push({
          route: `${CACHE_ROUTE} (ซ้ำ)`,
          status: res.status,
          ms,
          bytes: 0,
          ok: res.status === 200 && hit,
          problem: hit ? undefined : `คาดว่า X-Cache: HIT แต่ได้ ${res.headers.get("x-cache")} (ครั้งแรก ${first?.ms ?? "?"} ms)`,
          xCache: res.headers.get("x-cache"),
        })
      } catch (e) {
        results.push({ route: `${CACHE_ROUTE} (ซ้ำ)`, status: 0, ms: 0, bytes: 0, ok: false, problem: (e as Error).message })
      }
    }

    for (const r of results) {
      const mark = r.ok ? "PASS" : "FAIL"
      const cache = r.xCache ? ` [${r.xCache}]` : ""
      console.log(`${mark}  ${String(r.status).padStart(3)}  ${String(r.ms).padStart(6)} ms  ${r.route}${cache}${r.problem ? `  ← ${r.problem}` : ""}`)
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
