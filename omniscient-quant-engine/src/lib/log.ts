// ============================================================
// Structured logger (JSON lines) — 1 event = 1 บรรทัด { ts, level, msg, ...fields }
// - OQE_LOG_FORMAT=json (ค่าเริ่มต้นในโปรดักชัน) | text (อ่านง่ายตอน dev)
// - LOG_LEVEL=debug|info|warn|error (ค่าเริ่มต้น info)
// - field ที่ชื่อเหมือนความลับ (password/secret/token/authorization/cookie/api key) ถูกแทนด้วย "[redacted]" เสมอ
// ============================================================

export type LogLevel = "debug" | "info" | "warn" | "error"

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const SECRET_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key/i

function minLevel(env: Record<string, string | undefined> = process.env): number {
  const v = (env.LOG_LEVEL ?? "").toLowerCase() as LogLevel
  return ORDER[v] ?? ORDER.info
}

function sanitize(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]"
  if (value instanceof Error) return { name: value.name, message: value.message }
  if (typeof value === "bigint") return value.toString()
  return value
}

/** สร้างบรรทัด log (pure — ใช้ใน test ได้) */
export function formatLogLine(level: LogLevel, msg: string, fields: Record<string, unknown> = {}, now: Date = new Date(), format: "json" | "text" = "json"): string {
  const record: Record<string, unknown> = { ts: now.toISOString(), level, msg }
  for (const [k, v] of Object.entries(fields)) {
    if (k === "ts" || k === "level" || k === "msg") continue
    record[k] = sanitize(k, v)
  }
  if (format === "text") {
    const rest = Object.entries(record).filter(([k]) => !["ts", "level", "msg"].includes(k)).map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    return `${record.ts} ${level.toUpperCase().padEnd(5)} ${msg}${rest.length ? " · " + rest.join(" ") : ""}`
  }
  try {
    return JSON.stringify(record)
  } catch {
    return JSON.stringify({ ts: record.ts, level, msg, note: "fields ไม่สามารถแปลงเป็น JSON" })
  }
}

function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < minLevel()) return
  const format = process.env.OQE_LOG_FORMAT === "text" || (process.env.OQE_LOG_FORMAT === undefined && process.env.NODE_ENV !== "production") ? "text" : "json"
  const line = formatLogLine(level, msg, fields, new Date(), format)
  if (level === "warn" || level === "error") console.error(line)
  else console.log(line)
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
}
