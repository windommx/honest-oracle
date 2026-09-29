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

import path from "node:path"
import { APP_ROOT, startStandaloneServer, type ServerHandle } from "./server"

export interface RouteSpec {
  route: string
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"
  /** status ที่คาด (ค่าเริ่มต้น 200) */
  status?: number
  body?: unknown
  /** header ที่ต้องมีในคำตอบ (ชื่อตัวพิมพ์เล็ก) */
  headers?: string[]
  /** ตรวจเพิ่มบน JSON ที่ parse แล้ว — คืนข้อความเมื่อไม่ผ่าน */
  expect?: (json: Record<string, unknown>) => string | undefined
  /** เส้นทาง /api ที่ตอบเป็นไฟล์ (ไม่ใช่ JSON) เช่น "text/markdown" — ตรวจ content-type + body ไม่ว่าง แทน JSON */
  contentType?: string
}

const TINY_DATASET = {
  source: "smoke",
  stocks: [{ symbol: "AAA", prices: [{ date: "2026-09-25", close: 10, volume: 1000 }] }],
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
  // ความซื่อตรงของงานวิจัย + ที่มาของข้อมูล + ประวัติการกระทำ
  { route: "/api/rules", expect: (j) => (typeof j.hash === "string" && (j.hash as string).length === 64 ? undefined : "ไม่มี rules hash") },
  { route: "/api/data/provenance", expect: (j) => (["synthetic", "real", "unknown"].includes(String(j.kind)) && typeof j.label === "string" ? undefined : "provenance ไม่ครบ") },
  { route: "/api/research/robustness?seeds=11", expect: (j) => (Array.isArray(j.runs) && (j.runs as unknown[]).length === 1 ? undefined : "robustness ไม่มี run") },
  { route: "/api/research/robustness?seeds=abc", status: 400 },
  { route: "/api/audit-log?limit=5" },
  { route: "/api/audit-log?limit=0", status: 400 },
  // เส้นทางแก้ข้อมูล: validation → 400/404/422 (ไม่ใช่ 500) · ทำงานบนสำเนา DB เท่านั้น
  { route: "/api/journal", method: "POST", status: 400, body: { symbol: "", price: -1 } },
  { route: "/api/journal", method: "POST", status: 201, body: { symbol: "TSE", signal: "NO_TRADE", price: 1.2, status: "SKIPPED", notes: "smoke" } },
  { route: "/api/journal", method: "PATCH", status: 404, body: { id: "nope", status: "CLOSED" } },
  { route: "/api/journal?id=nope", method: "DELETE", status: 404 },
  { route: "/api/rules", method: "POST", status: 201, body: { note: "smoke" }, expect: (j) => (j.matchesRegistered === true ? undefined : "ล็อกแล้วแต่ไม่ตรง") },
  { route: "/api/system", method: "POST", status: 400, body: { force: "yes" } },
  { route: "/api/data/ingest", method: "POST", status: 400, body: TINY_DATASET },
  { route: "/api/data/ingest", method: "POST", status: 422, body: { ...TINY_DATASET, dryRun: true } },
  // LLM ไม่ได้ตั้งค่าใน smoke → ต้อง 503 พร้อมข้อความ ไม่ใช่ 500
  { route: "/api/analyst/TSE", method: "POST", body: { question: "ทดสอบ" }, status: 503 },
  { route: "/api/synthesis/TSE", method: "POST", status: 503 },
  { route: "/api/audit", method: "POST", status: 503 },
  { route: "/", headers: ["content-security-policy", "x-content-type-options", "referrer-policy", "x-frame-options"] },
  { route: "/terms" },
  { route: "/api/flows", expect: (j) => (Array.isArray(j.sectors) && (j.sectors as unknown[]).length >= 1 && Array.isArray(j.market) ? undefined : "ไม่มีรายชื่อหุ้น") },
  {
    route: "/api/flows/SET?range=1y&index=retail",
    expect: (j) =>
      Array.isArray(j.series) && (j.series as unknown[]).length === 52 && (j.table as { rows?: unknown[] } | undefined)?.rows?.length === 4 && j.indexGroup === "retail" ? undefined : "SET ต้องมี 52 สัปดาห์ + 4 ประเภทนักลงทุน",
  },
  { route: "/api/flows/TSE?range=6m&index=foreign", expect: (j) => (j.indexGroup === "nvdr" && j.short !== null ? undefined : "หุ้นรายตัวต้องใช้ NVDR + มี short sale") },
  { route: "/api/flows/NOPE", status: 404 },
  {
    route: "/api/research/deep/TSE",
    expect: (j) =>
      Array.isArray(j.sections) && (j.sections as unknown[]).length === 11 && Array.isArray(j.caveats) && Array.isArray(j.strands) && (j.strands as unknown[]).length === 13
        ? undefined
        : "Deep Research ต้องมี 11 หัวข้อ + 13 สาย + ข้อจำกัด",
  },
  { route: "/api/research/deep/SCB?format=md", contentType: "text/markdown" },
  { route: "/api/research/deep/NOPE", status: 404 },
  { route: "/api/research/deep/TSE?format=pdf", status: 400 },
  { route: "/api/research/deep/TSE", method: "POST", body: {}, status: 503 },
  { route: "/api/flows/SET?range=10y", status: 400 },
  { route: "/api/meta", expect: (j) => ((j.access as { canWrite?: unknown } | undefined)?.canWrite === true && typeof (j.data as { label?: unknown } | undefined)?.label === "string" ? undefined : "meta ไม่ครบ") },
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
export function checkResponse(spec: RouteSpec, status: number, contentType: string, body: string, headers?: Headers): string | undefined {
  const expected = spec.status ?? 200
  if (status !== expected) return `HTTP ${status} (คาด ${expected}): ${body.slice(0, 160).replace(/\s+/g, " ")}`
  const missing = (spec.headers ?? []).filter((h) => !headers?.get(h))
  if (missing.length) return `ไม่มี header: ${missing.join(", ")}`
  if (!spec.route.startsWith("/api")) return body.length > 0 ? undefined : "body ว่าง"
  if (spec.contentType) {
    if (!contentType.includes(spec.contentType)) return `content-type ไม่ใช่ ${spec.contentType} (${contentType})`
    return body.trim().length > 0 ? undefined : "body ว่าง"
  }
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
  if (spec.expect && parsed && typeof parsed === "object") return spec.expect(parsed as Record<string, unknown>)
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
  if (spec.method && spec.method !== "GET") {
    // คำขอแก้ข้อมูลแบบเดียวกับ browser: same-origin + JSON (CSRF guard) · DELETE ไม่มี body
    init.headers = { ...headers, Origin: base, ...(spec.method !== "DELETE" ? { "Content-Type": "application/json" } : {}) }
    if (spec.method !== "DELETE") init.body = JSON.stringify(spec.body ?? {})
  }
  const res = await fetch(`${base}${spec.route}`, init)
  const body = await res.text()
  return { res, body, ms: Math.round(performance.now() - t0) }
}

async function main(): Promise<number> {
  const o = parseArgs(process.argv.slice(2))
  const token = process.env.OQE_API_TOKEN?.trim()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}

  let base = o.baseUrl ?? `http://127.0.0.1:${o.port}`
  let server: ServerHandle | null = null
  ;(process as unknown as NodeJS.EventEmitter).on("SIGINT", () => {
    server?.stop()
    process.exit(130)
  })

  try {
    if (!o.baseUrl) {
      try {
        server = await startStandaloneServer({ db: o.db, port: o.port, runtime: o.runtime })
      } catch (e) {
        console.error((e as Error).message)
        return 1
      }
      base = server.base
      console.log(`server พร้อม: ${base} (${o.runtime}, DB ${o.db === "empty" ? "เปล่า → auto-seed" : `สำเนาของ ${path.relative(APP_ROOT, o.db) || o.db}`})`)
    }

    const results: RouteResult[] = []
    for (const spec of o.routes) {
      const label = `${spec.method ?? "GET"} ${spec.route}`
      try {
        const { res, body, ms } = await call(base, spec, o.timeoutSec, headers)
        const problem = checkResponse(spec, res.status, res.headers.get("content-type") ?? "", body, res.headers)
        results.push({ route: label, status: res.status, ms, bytes: body.length, ok: !problem, problem })
      } catch (e) {
        results.push({ route: label, status: 0, ms: 0, bytes: 0, ok: false, problem: (e as Error).message })
      }
    }

    for (const r of results) {
      const mark = r.ok ? "PASS" : "FAIL"
      console.log(`${mark}  ${String(r.status).padStart(3)}  ${String(r.ms).padStart(6)} ms  ${r.route}${r.problem ? `  ← ${r.problem}` : ""}`)
    }

    const serverErrors = (server?.log ?? []).filter((l) => /^\s*⨯/.test(l))
    if (serverErrors.length > 0) {
      console.error(`server พิมพ์ error ที่ไม่ได้จัดการ ${serverErrors.length} บรรทัด:\n${serverErrors.slice(0, 10).join("\n")}`)
    }
    const failed = results.filter((r) => !r.ok)
    const total = results.reduce((s, r) => s + r.ms, 0)
    console.log(`\n${results.length - failed.length}/${results.length} ผ่าน · รวม ${(total / 1000).toFixed(1)} วินาที`)
    return failed.length === 0 && serverErrors.length === 0 ? 0 : 1
  } finally {
    server?.stop()
  }
}

if (import.meta.main) {
  main().then((code) => process.exit(code))
}
