/// <reference types="bun-types" />
// ============================================================
// ตัวตั้งเวลางานประจำของแพลตฟอร์ม — ใช้แทน cron ใน container (service "scheduler" ของ docker-compose.yml)
// ไม่มี dependency · เวลาทั้งหมดเป็นเวลาไทย (Asia/Bangkok = UTC+7 ตลอดปี ไม่มี DST) ไม่ขึ้นกับ TZ ของเครื่อง
//
// งานเริ่มต้น
//   daily   จ.–ศ. 18:30  bun scripts/daily.ts                       (SET ปิด 16:40 + เผื่อ feed อัปเดตราคาปิด)
//   backup  ทุกวัน 02:30 bun scripts/backup-db.ts --reason nightly
// ปรับด้วย env
//   TMP_DAILY_AT=18:30  TMP_DAILY_DAYS=1-5   TMP_DAILY_CMD="bun scripts/daily.ts"
//   TMP_BACKUP_AT=02:30 TMP_BACKUP_DAYS=0-6  TMP_BACKUP_CMD="bun scripts/backup-db.ts --reason nightly"
//   TMP_JOB_RETRIES=2 (ครั้ง) · TMP_JOB_RETRY_DELAY_MIN=20 · TMP_JOB_TIMEOUT_MIN=90
//   TMP_DAILY_RETRY_CODES=1,3,5,124 — exit code ของ daily ที่ลองใหม่ได้ (1 ไม่คาดคิด · 3 ดึงข้อมูลไม่ได้ · 5 ข้อมูลยังไม่ขยับ
//     · 124 timeout) — 2 argument ผิด / 4 คุณภาพข้อมูลวิกฤต / 6 สมอง Jev ล้ม ไม่ลองซ้ำ (ต้องมีคนดู)
//   TMP_APP_URL=http://app:3000 → หลัง daily สำเร็จ เรียก GET รายงานหนักล่วงหน้าให้ cache ของ server อุ่น
//     (ใช้ Authorization: Bearer $TMP_API_TOKEN · เปลี่ยนรายการด้วย TMP_WARM_PATHS=/api/a,/api/b)
//   TMP_SCHEDULER_HEARTBEAT=/tmp/scheduler.alive → เขียนเวลาทุก ≤60 วินาที ทั้งตอนรอและตอนรันงาน (healthcheck ของ compose ตรวจ)
//   TMP_PING_DAILY_URL / TMP_PING_BACKUP_URL → dead-man's switch (เช่น healthchecks.io): งานสำเร็จ GET <url>
//     ล้มเหลว GET <url>/fail — บริการภายนอกแจ้งเตือนเองเมื่องานล้มหรือไม่ได้รันตามเวลา
// วันหยุดนักขัตฤกษ์ของ SET: scripts/daily.ts ตรวจปฏิทินเองแล้วข้าม (exit 0) — ตั้งเวลาแค่ จ.–ศ. ก็พอ
//
// รัน
//   bun deploy/scheduler.ts               loop ตลอดไป (SIGTERM/SIGINT = หยุดอย่างสุภาพ: ส่งสัญญาณต่อให้งานที่รันอยู่แล้วรอ)
//   bun deploy/scheduler.ts --once daily  รันงานเดียวทันทีแล้วออก (exit code ตามงาน)
//   bun deploy/scheduler.ts --plan        พิมพ์เวลารอบถัดไปของทุกงานแล้วออก
//   bun deploy/scheduler.ts --with-server โหมด all-in-one (image target aio สำหรับ Fly/Render ที่ disk ผูกกับ service เดียว):
//                                         รัน node .next/standalone/server.js เป็น child + loop งานใน process เดียว
//                                         server ตาย = scheduler ออกด้วย exit code เดียวกัน (ให้แพลตฟอร์ม restart ทั้งชุด)
// ============================================================

import { writeFileSync } from "node:fs"
import path from "node:path"
import { createLogger } from "../src/lib/ops/log"

const log = createLogger("scheduler")
const APP_ROOT = path.resolve(import.meta.dir, "..")
const BKK_OFFSET_MS = 7 * 3_600_000
const DAY_MS = 86_400_000

export interface JobSpec {
  name: string
  /** ชั่วโมง/นาทีตามเวลาไทย */
  hour: number
  minute: number
  /** วันในสัปดาห์ที่รัน (0 = อาทิตย์ … 6 = เสาร์) ตามเวลาไทย */
  days: ReadonlySet<number>
  cmd: string[]
  retries: number
  /** exit code ที่ลองใหม่ได้ — ว่าง = ทุก code ที่ไม่ใช่ 0 */
  retryOn: ReadonlySet<number>
  retryDelayMs: number
  timeoutMs: number
  /** GET path เหล่านี้ที่ TMP_APP_URL หลังงานสำเร็จ */
  warmPaths: string[]
  /** URL ของ dead-man's switch (สำเร็จ = GET url · ล้มเหลว = GET url/fail) — null = ไม่ใช้ */
  pingUrl: string | null
}

/** "18:30" → {hour, minute} · รูปแบบผิด = throw (ตั้งค่าผิดต้องล้มตั้งแต่เริ่ม ไม่ใช่เงียบ) */
export function parseTime(s: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  const hour = m ? Number(m[1]) : NaN
  const minute = m ? Number(m[2]) : NaN
  if (!m || hour > 23 || minute > 59) throw new Error(`เวลาไม่ถูกต้อง "${s}" (ต้องเป็น HH:MM เวลาไทย)`)
  return { hour, minute }
}

/** "1-5" | "0-6" | "1,3,5" | "6" → เซตวันในสัปดาห์ (0 = อาทิตย์) */
export function parseDays(s: string): Set<number> {
  const out = new Set<number>()
  for (const part of s.split(",").map((p) => p.trim()).filter(Boolean)) {
    const r = /^(\d)(?:-(\d))?$/.exec(part)
    if (!r) throw new Error(`วันไม่ถูกต้อง "${s}" (ใช้ 0-6 โดย 0 = อาทิตย์ เช่น 1-5 หรือ 1,3,5)`)
    const a = Number(r[1])
    const b = r[2] === undefined ? a : Number(r[2])
    if (a > 6 || b > 6 || b < a) throw new Error(`ช่วงวันไม่ถูกต้อง "${part}"`)
    for (let d = a; d <= b; d++) out.add(d)
  }
  if (out.size === 0) throw new Error("ต้องระบุอย่างน้อย 1 วัน")
  return out
}

/** "1,3,5" → เซต exit code · ค่าเสียถูกข้าม */
export function parseCodes(s: string): Set<number> {
  return new Set(
    s
      .split(",")
      .map((p) => Number(p.trim()))
      .filter((n) => Number.isInteger(n) && n > 0 && n < 256)
  )
}

/** คำสั่งแบบแยกด้วยช่องว่าง (ไม่ผ่าน shell — ไม่รองรับ quote/pipe โดยตั้งใจ) */
export function splitCommand(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean)
}

/** เวลารอบถัดไป (หลัง now อย่างเคร่งครัด) ของงานตามเวลาไทย */
export function nextRunAt(now: Date, spec: Pick<JobSpec, "hour" | "minute" | "days">): Date {
  const bkkNow = now.getTime() + BKK_OFFSET_MS // "นาฬิกาไทย" แทนด้วยเวลา UTC ที่เลื่อน +7 ชม.
  const midnight = Math.floor(bkkNow / DAY_MS) * DAY_MS
  for (let i = 0; i <= 7; i++) {
    const day = midnight + i * DAY_MS
    const at = day + spec.hour * 3_600_000 + spec.minute * 60_000
    if (at <= bkkNow) continue
    if (!spec.days.has(new Date(day).getUTCDay())) continue
    return new Date(at - BKK_OFFSET_MS)
  }
  throw new Error("ไม่พบรอบถัดไปใน 7 วัน (days ว่าง?)")
}

/** แสดงเวลาเป็นเวลาไทยแบบอ่านง่าย เช่น "2026-09-23 18:30 (Wed)" */
export function formatBangkok(d: Date): string {
  const t = new Date(d.getTime() + BKK_OFFSET_MS)
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][t.getUTCDay()]
  return `${t.toISOString().slice(0, 16).replace("T", " ")} (${wd})`
}

const DEFAULT_WARM_PATHS = ["/api/health", "/api/overview", "/api/signals", "/api/sniper", "/api/flagship", "/api/research/importance"]

export function loadJobs(env: Record<string, string | undefined> = process.env): JobSpec[] {
  const num = (v: string | undefined, d: number, min: number) => {
    const n = Number(v)
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= min ? n : d
  }
  const retries = Math.floor(num(env.TMP_JOB_RETRIES, 2, 0))
  const retryDelayMs = num(env.TMP_JOB_RETRY_DELAY_MIN, 20, 0) * 60_000
  const timeoutMs = num(env.TMP_JOB_TIMEOUT_MIN, 90, 1) * 60_000
  const warm = env.TMP_WARM_PATHS?.trim()
  const url = (v: string | undefined) => (v && /^https?:\/\//.test(v.trim()) ? v.trim().replace(/\/+$/, "") : null)
  const daily = parseTime(env.TMP_DAILY_AT || "18:30")
  const backup = parseTime(env.TMP_BACKUP_AT || "02:30")
  return [
    {
      name: "daily",
      ...daily,
      days: parseDays(env.TMP_DAILY_DAYS || "1-5"),
      cmd: splitCommand(env.TMP_DAILY_CMD || "bun scripts/daily.ts"),
      retries,
      retryOn: parseCodes(env.TMP_DAILY_RETRY_CODES || "1,3,5,124"),
      retryDelayMs,
      timeoutMs,
      warmPaths: warm ? warm.split(",").map((p) => p.trim()).filter((p) => p.startsWith("/")) : DEFAULT_WARM_PATHS,
      pingUrl: url(env.TMP_PING_DAILY_URL),
    },
    {
      name: "backup",
      ...backup,
      days: parseDays(env.TMP_BACKUP_DAYS || "0-6"),
      cmd: splitCommand(env.TMP_BACKUP_CMD || "bun scripts/backup-db.ts --reason nightly"),
      retries: Math.min(retries, 1),
      retryOn: new Set<number>(),
      retryDelayMs: Math.min(retryDelayMs, 10 * 60_000),
      timeoutMs: Math.min(timeoutMs, 30 * 60_000),
      warmPaths: [],
      pingUrl: url(env.TMP_PING_BACKUP_URL),
    },
  ]
}

// ---------------- runtime ----------------

let stopping = false
let wake: (() => void) | null = null
let child: ReturnType<typeof Bun.spawn> | null = null
let server: ReturnType<typeof Bun.spawn> | null = null
let serverExit: number | null = null
let serverDied = false

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(done, Math.max(0, ms))
    function done() {
      clearTimeout(t)
      wake = null
      resolve()
    }
    wake = done
  })
}

/** รอแบบเขียน heartbeat ทุก ≤ 60 วินาที (ตื่นทันทีเมื่อได้ SIGTERM) */
async function sleepWithHeartbeat(ms: number) {
  const until = Date.now() + ms
  while (!stopping && Date.now() < until) {
    heartbeat()
    await sleep(Math.min(60_000, until - Date.now()))
  }
}

function heartbeat() {
  const file = process.env.TMP_SCHEDULER_HEARTBEAT
  if (!file) return
  try {
    writeFileSync(file, new Date().toISOString())
  } catch (e) {
    log.warn("heartbeat write failed", { file, error: e })
  }
}

/** รันคำสั่ง 1 ครั้ง (stdout/stderr ของงานออกตรงไปที่ log ของ container) → exit code (124 = timeout) */
async function runOnce(job: JobSpec, attempt: number): Promise<number> {
  const t0 = Date.now()
  log.info("job start", { job: job.name, attempt, cmd: job.cmd.join(" ") })
  let timedOut = false
  try {
    child = Bun.spawn(job.cmd, { cwd: APP_ROOT, env: process.env, stdout: "inherit", stderr: "inherit" })
  } catch (e) {
    log.error("job spawn failed", { job: job.name, error: e })
    return 127
  }
  const proc = child
  const beat = setInterval(heartbeat, 60_000) // งานยาว (ดึงข้อมูล 5 ปี) ไม่ทำให้ healthcheck คิดว่า scheduler ค้าง
  const killer = setTimeout(() => {
    timedOut = true
    log.error("job timeout — sending SIGTERM", { job: job.name, timeoutMin: job.timeoutMs / 60_000 })
    proc.kill("SIGTERM")
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGKILL")
    }, 30_000).unref?.()
  }, job.timeoutMs)
  const code = await proc.exited
  clearTimeout(killer)
  clearInterval(beat)
  child = null
  const exitCode = timedOut ? 124 : code
  const fields = { job: job.name, attempt, exitCode, tookSec: Math.round((Date.now() - t0) / 1000) }
  if (exitCode === 0) log.info("job done", fields)
  else log.error("job failed", fields)
  return exitCode
}

async function runWithRetries(job: JobSpec): Promise<number> {
  let code = 1
  for (let attempt = 1; attempt <= job.retries + 1; attempt++) {
    code = await runOnce(job, attempt)
    if (code === 0 || stopping) break
    if (job.retryOn.size > 0 && !job.retryOn.has(code)) {
      log.error("job failed — not retrying this exit code", { job: job.name, exitCode: code })
      break
    }
    if (attempt <= job.retries) {
      log.warn("job retry scheduled", { job: job.name, inMin: job.retryDelayMs / 60_000 })
      await sleepWithHeartbeat(job.retryDelayMs)
      if (stopping) break
    }
  }
  if (code === 0 && job.warmPaths.length > 0) await warmUp(job.warmPaths)
  if (job.pingUrl && !stopping) await ping(job, code)
  return code
}

/** แจ้งผลงานไปยัง dead-man's switch — ล้มก็แค่เตือน (ไม่ทำให้งานล้ม) */
async function ping(job: JobSpec, code: number) {
  const target = code === 0 ? job.pingUrl! : `${job.pingUrl}/fail`
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(10_000) })
    await res.arrayBuffer()
    log.info("ping sent", { job: job.name, ok: code === 0, status: res.status })
  } catch (e) {
    log.warn("ping failed", { job: job.name, error: e })
  }
}

/** GET รายงานหนักล่วงหน้า — server คำนวณ/cache ครั้งแรกหลังข้อมูลเปลี่ยน ผู้ใช้คนแรกไม่ต้องรอ */
async function warmUp(paths: string[]) {
  const base = process.env.TMP_APP_URL?.trim().replace(/\/+$/, "")
  if (!base) return
  const token = process.env.TMP_API_TOKEN?.trim()
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  for (const p of paths) {
    const t0 = Date.now()
    try {
      const res = await fetch(`${base}${p}`, { headers, signal: AbortSignal.timeout(180_000) })
      await res.arrayBuffer()
      const fields = { path: p, status: res.status, ms: Date.now() - t0 }
      if (res.ok) log.info("warm-up", fields)
      else log.warn("warm-up non-200", { ...fields, hint: res.status === 401 || res.status === 403 ? "ตั้ง TMP_API_TOKEN ให้ตรงกับ server" : undefined })
    } catch (e) {
      log.warn("warm-up failed", { path: p, error: e })
    }
  }
}

async function loop(jobs: JobSpec[]) {
  const due = new Map<string, Date>()
  const start = new Date()
  for (const j of jobs) due.set(j.name, nextRunAt(start, j))
  log.info("scheduler started", {
    jobs: jobs.map((j) => ({ name: j.name, cmd: j.cmd.join(" "), next: formatBangkok(due.get(j.name)!) })),
  })
  while (!stopping) {
    // งานที่ถึงเวลาก่อนสุด — งานที่เลยเวลาระหว่างรองานอื่นจะรันทันทีต่อจากนั้น (ไม่ถูกข้ามไปวันถัดไป)
    const job = [...jobs].sort((a, b) => due.get(a.name)!.getTime() - due.get(b.name)!.getTime())[0]
    const at = due.get(job.name)!
    log.info("waiting", { job: job.name, at: at.toISOString(), bangkok: formatBangkok(at) })
    await sleepWithHeartbeat(at.getTime() - Date.now())
    if (stopping) break
    heartbeat()
    await runWithRetries(job)
    due.set(job.name, nextRunAt(new Date(), job))
  }
  log.info("scheduler stopped")
}

function onSignal(sig: string) {
  if (stopping) return
  stopping = true
  log.warn("shutdown requested", { signal: sig, runningJob: child ? "yes (forwarding signal)" : "no" })
  if (child) child.kill(sig === "SIGINT" ? "SIGINT" : "SIGTERM")
  if (server && server.exitCode === null) server.kill("SIGTERM")
  wake?.()
}

/** โหมด all-in-one: server เว็บเป็น child ของ scheduler (ใช้ node — Bun 1.3.11 รัน standalone ของ Next 16.3.6 ไม่ได้) */
function startServer() {
  const entry = path.join(APP_ROOT, ".next", "standalone", "server.js")
  server = Bun.spawn(["node", entry], { cwd: path.dirname(entry), env: process.env, stdout: "inherit", stderr: "inherit" })
  log.info("server started", { pid: server.pid, port: process.env.PORT ?? "3000" })
  server.exited.then((code) => {
    serverExit = code
    if (stopping) return
    serverDied = true
    log.error("server exited — stopping scheduler so the platform restarts the container", { exitCode: code })
    onSignal("SIGTERM")
  })
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const jobs = loadJobs()
  if (argv.includes("--plan")) {
    const now = new Date()
    for (const j of jobs) console.log(`${j.name.padEnd(7)} ${formatBangkok(nextRunAt(now, j))}  ${j.cmd.join(" ")}`)
    return 0
  }
  const onceIdx = argv.indexOf("--once")
  if (onceIdx >= 0) {
    const name = argv[onceIdx + 1]
    const job = jobs.find((j) => j.name === name)
    if (!job) {
      console.error(`ไม่รู้จักงาน "${name ?? ""}" — มี: ${jobs.map((j) => j.name).join(", ")}`)
      return 2
    }
    return runWithRetries({ ...job, retries: 0 })
  }
  // cast: overload "memoryPressure" ของ bun-types บัง overload สัญญาณของ @types/node ใน tsc
  const signals = process as unknown as NodeJS.EventEmitter
  signals.on("SIGTERM", () => onSignal("SIGTERM"))
  signals.on("SIGINT", () => onSignal("SIGINT"))
  const withServer = argv.includes("--with-server")
  if (withServer) startServer()
  await loop(jobs)
  if (withServer && server) {
    await Promise.race([server.exited, Bun.sleep(15_000)])
    if (server.exitCode === null) server.kill("SIGKILL")
    // server ตายเอง = ล้มเหลวเสมอ (แม้ exit 0) เพื่อให้ restart policy ของแพลตฟอร์มทำงาน
    return serverDied ? serverExit || 1 : 0
  }
  return 0
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      log.error("scheduler crashed", { error: e })
      process.exit(1)
    })
}
