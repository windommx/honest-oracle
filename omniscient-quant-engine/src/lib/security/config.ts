// ============================================================
// การตั้งค่าความปลอดภัยจาก env — อ่านที่เดียว ใช้ทั้ง proxy และ route
//
// โหมด
//   auth  = ตั้ง OQE_AUTH_PASSWORD แล้ว → ทุกหน้า/ทุก API ต้องส่ง HTTP Basic (หรือ Bearer OQE_API_TOKEN ที่ /api/*)
//   local = ไม่ได้ตั้งรหัสผ่าน → รับเฉพาะ client บนเครื่องเดียวกัน (loopback) เหมือนการใช้งานเดิม
//
// env ทั้งหมดอธิบายไว้ใน .env.example
// ============================================================

import { sha256Hex } from "./crypto"

export type AuthMode = "auth" | "local"

export interface SecurityConfig {
  mode: AuthMode
  /** รหัสผ่าน (สิทธิ์เต็ม) — null = โหมด local */
  password: string | null
  /** Bearer token สำหรับสคริปต์/cron (เฉพาะ /api/*) */
  apiToken: string | null
  /** OQE_ALLOW_REMOTE_NOAUTH=1 — เปิดให้เครื่องอื่นเข้าได้โดยไม่มีรหัสผ่าน (ไม่ปลอดภัย) */
  allowRemoteNoAuth: boolean
  /** origin เพิ่มเติมที่อนุญาตให้ส่งคำขอแก้ไขข้อมูล (หลัง reverse proxy ที่เปลี่ยน Host) */
  allowedOrigins: string[]
  /** ส่ง Strict-Transport-Security เมื่อคำขอมาทาง https (opt-in: OQE_HSTS=1) */
  hsts: boolean
  /** ข้อความเตือนตอนเริ่มระบบ (ตั้งค่าอ่อน/ขัดกัน) */
  warnings: string[]
}

type Env = Record<string, string | undefined>

const MIN_PASSWORD = 12
const MIN_TOKEN = 24

function clean(v: string | undefined): string | null {
  const t = (v ?? "").trim()
  return t ? t : null
}

function truthy(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((v ?? "").trim())
}

/** แปลงรายการ origin คั่นด้วย , → origin มาตรฐาน (scheme://host[:port]) · ตัวที่ parse ไม่ได้ถูกทิ้งพร้อมคำเตือน */
export function parseOriginList(raw: string | undefined, warnings: string[] = []): string[] {
  const out: string[] = []
  for (const part of (raw ?? "").split(",")) {
    const s = part.trim()
    if (!s) continue
    try {
      const u = new URL(s)
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme")
      out.push(u.origin)
    } catch {
      warnings.push(`OQE_ALLOWED_ORIGINS: ข้าม "${s}" — ต้องเป็นรูปแบบ https://host[:port]`)
    }
  }
  return [...new Set(out)]
}

/** อ่าน env → SecurityConfig (pure ต่อ env ที่ส่งเข้า — ใช้ใน test ได้) */
export function readSecurityConfig(env: Env = process.env): SecurityConfig {
  const warnings: string[] = []
  const password = clean(env.OQE_AUTH_PASSWORD)
  const apiToken = clean(env.OQE_API_TOKEN)
  const allowRemoteNoAuth = truthy(env.OQE_ALLOW_REMOTE_NOAUTH)
  const allowedOrigins = parseOriginList(env.OQE_ALLOWED_ORIGINS, warnings)
  const hsts = truthy(env.OQE_HSTS)

  if (password && password.length < MIN_PASSWORD) {
    warnings.push(`OQE_AUTH_PASSWORD สั้นกว่า ${MIN_PASSWORD} ตัวอักษร — ควรใช้รหัสยาวแบบสุ่ม`)
  }
  if (apiToken && apiToken.length < MIN_TOKEN) {
    warnings.push(`OQE_API_TOKEN สั้นกว่า ${MIN_TOKEN} ตัวอักษร — ใช้ค่าสุ่ม เช่น openssl rand -hex 32`)
  }
  if (password && apiToken && password === apiToken) {
    warnings.push("OQE_API_TOKEN ซ้ำกับ OQE_AUTH_PASSWORD — ควรใช้คนละค่า (token หลุด = รหัสผ่านหลุด)")
  }
  if (!password && allowRemoteNoAuth) {
    warnings.push("OQE_ALLOW_REMOTE_NOAUTH=1 — ใครก็ตามที่เข้าถึงพอร์ตนี้ได้ แก้ journal/รีเซ็ตข้อมูล/ใช้โควตา LLM ได้โดยไม่ต้องมีรหัสผ่าน (ไม่ปลอดภัย)")
  }

  return {
    mode: password ? "auth" : "local",
    password,
    apiToken,
    allowRemoteNoAuth,
    allowedOrigins,
    hsts,
    warnings,
  }
}

// cache ต่อ "ลายนิ้วมือ" ของ env ที่เกี่ยวข้อง — proxy เรียกทุก request
// เก็บบน globalThis: proxy กับ route handler เป็น bundle แยกกันแต่อยู่ process เดียว → เตือนครั้งเดียวต่อค่า
const ENV_KEYS = ["OQE_AUTH_PASSWORD", "OQE_API_TOKEN", "OQE_ALLOW_REMOTE_NOAUTH", "OQE_ALLOWED_ORIGINS", "OQE_HSTS"] as const

const holder = globalThis as unknown as {
  __oqeSecurityConfig?: { fp: string; cfg: SecurityConfig }
  __oqeSecurityWarned?: Set<string>
}

export function getSecurityConfig(env: Env = process.env): SecurityConfig {
  const fp = sha256Hex(ENV_KEYS.map((k) => `${k}=${env[k] ?? ""}`).join("\n"))
  const hit = holder.__oqeSecurityConfig
  if (hit && hit.fp === fp) return hit.cfg
  const cfg = readSecurityConfig(env)
  holder.__oqeSecurityConfig = { fp, cfg }
  const warned = (holder.__oqeSecurityWarned ??= new Set())
  if (!warned.has(fp) && env.NODE_ENV !== "test") {
    warned.add(fp)
    const head = cfg.mode === "auth" ? "[security] โหมด auth (ต้องส่งรหัสผ่านทุกคำขอ)" : "[security] โหมด local (รับเฉพาะ localhost)"
    console.info(head)
    for (const w of cfg.warnings) console.warn(`[security] ⚠️ ${w}`)
  }
  return cfg
}
