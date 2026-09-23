// ============================================================
// Structured logger (JSON lines) สำหรับงาน ops — สคริปต์ backup/restore, scheduler, smoke test
// 1 event = 1 บรรทัด JSON { ts, level, component, msg, ...fields } → grep/jq/ส่งเข้า log collector ได้ตรง ๆ
// - info/debug → stdout · warn/error → stderr
// - LOG_LEVEL=debug|info|warn|error (default info)
// - field ที่ชื่อเหมือนความลับ (password/secret/token/authorization/cookie/api key) ถูกแทนด้วย "[redacted]" เสมอ
//   กันเผลอ log ค่า TMP_AUTH_PASSWORD / TMP_API_TOKEN ลงไฟล์
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error"

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key/i

function minLevel(): number {
  const env = (process.env.LOG_LEVEL ?? "").toLowerCase() as LogLevel
  return ORDER[env] ?? ORDER.info
}

/** แปลงค่าให้ JSON ได้เสมอ: Error → {name, message} · bigint → string · ความลับ → [redacted] */
function sanitize(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]"
  if (value instanceof Error) return { name: value.name, message: value.message }
  if (typeof value === "bigint") return value.toString()
  return value
}

/** สร้างบรรทัด log (pure — ใช้ใน test ได้) */
export function formatLogLine(
  level: LogLevel,
  component: string,
  msg: string,
  fields: Record<string, unknown> = {},
  now: Date = new Date()
): string {
  const record: Record<string, unknown> = { ts: now.toISOString(), level, component, msg }
  for (const [k, v] of Object.entries(fields)) {
    if (k === "ts" || k === "level" || k === "component" || k === "msg") continue
    record[k] = sanitize(k, v)
  }
  try {
    return JSON.stringify(record)
  } catch {
    // วงวนอ้างอิง/ค่าที่ stringify ไม่ได้ — อย่าให้ logger ทำงานหลักล้ม
    return JSON.stringify({ ts: record.ts, level, component, msg, note: "fields ไม่สามารถแปลงเป็น JSON" })
  }
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
}

export function createLogger(component: string): Logger {
  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[level] < minLevel()) return
    const line = formatLogLine(level, component, msg, fields)
    if (level === "warn" || level === "error") console.error(line)
    else console.log(line)
  }
  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  }
}
