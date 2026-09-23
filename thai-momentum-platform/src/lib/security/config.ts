// ============================================================
// การตั้งค่าความปลอดภัยจาก env — อ่านที่เดียว ใช้ทั้ง proxy / route /api/auth/* / หน้า /login
//
// โหมด
//   auth  = ตั้ง TMP_AUTH_PASSWORD แล้ว → ทุกหน้า/ทุก API ต้องมี session cookie หรือ Bearer token
//   local = ไม่ได้ตั้งรหัสผ่าน → รับเฉพาะ client บนเครื่องเดียวกัน (loopback) เหมือนการใช้งานเดิม
//
// env ทั้งหมดอธิบายไว้ใน .env.example
// ============================================================

import { deriveSecretFromPassword, sha256Hex } from "./crypto"

export type AuthMode = "auth" | "local"

export interface SecurityConfig {
  mode: AuthMode
  /** รหัสผ่านผู้ดูแล (สิทธิ์เต็ม) — null = โหมด local */
  adminPassword: string | null
  /** รหัสผ่านผู้ชม (อ่านอย่างเดียว: GET/HEAD) — ใช้ได้เฉพาะเมื่อมี adminPassword */
  viewerPassword: string | null
  /** คีย์ HMAC ของ session cookie — null ในโหมด local */
  secret: string | null
  secretSource: "env" | "derived" | null
  /** Bearer token สำหรับสคริปต์/cron (สิทธิ์ admin เฉพาะ /api/*) */
  apiToken: string | null
  /** TMP_ALLOW_REMOTE_NOAUTH=1 — เปิดให้เครื่องอื่นเข้าได้โดยไม่มีรหัสผ่าน (ไม่ปลอดภัย) */
  allowRemoteNoAuth: boolean
  /** origin เพิ่มเติมที่อนุญาตให้ส่งคำขอแก้ไขข้อมูล (หลัง reverse proxy ที่เปลี่ยน Host) */
  allowedOrigins: string[]
  /** ส่ง Strict-Transport-Security เมื่อคำขอมาทาง https (opt-in: TMP_HSTS=1) */
  hsts: boolean
  /** ข้อความเตือนตอนเริ่มระบบ (ตั้งค่าอ่อน/ขัดกัน) */
  warnings: string[]
}

type Env = Record<string, string | undefined>

const MIN_PASSWORD = 12
const MIN_SECRET = 32
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
      warnings.push(`TMP_ALLOWED_ORIGINS: ข้าม "${s}" — ต้องเป็นรูปแบบ https://host[:port]`)
    }
  }
  return [...new Set(out)]
}

/** อ่าน env → SecurityConfig (pure ต่อ env ที่ส่งเข้า — ใช้ใน test ได้) */
export function readSecurityConfig(env: Env = process.env): SecurityConfig {
  const warnings: string[] = []
  const adminPassword = clean(env.TMP_AUTH_PASSWORD)
  let viewerPassword = clean(env.TMP_VIEWER_PASSWORD)
  const envSecret = clean(env.TMP_AUTH_SECRET)
  const apiToken = clean(env.TMP_API_TOKEN)
  const allowRemoteNoAuth = truthy(env.TMP_ALLOW_REMOTE_NOAUTH)
  const allowedOrigins = parseOriginList(env.TMP_ALLOWED_ORIGINS, warnings)
  const hsts = truthy(env.TMP_HSTS)

  if (!adminPassword && viewerPassword) {
    warnings.push("ตั้ง TMP_VIEWER_PASSWORD โดยไม่มี TMP_AUTH_PASSWORD — ละเว้นรหัสผู้ชม ระบบยังอยู่โหมด local (เฉพาะเครื่องนี้)")
    viewerPassword = null
  }
  if (adminPassword && viewerPassword && adminPassword === viewerPassword) {
    warnings.push("TMP_VIEWER_PASSWORD ซ้ำกับ TMP_AUTH_PASSWORD — ปิดบทบาทผู้ชม (ทุกคนที่รู้รหัสจะได้สิทธิ์ผู้ดูแล)")
    viewerPassword = null
  }
  if (adminPassword && adminPassword.length < MIN_PASSWORD) {
    warnings.push(`TMP_AUTH_PASSWORD สั้นกว่า ${MIN_PASSWORD} ตัวอักษร — ควรใช้รหัสยาวแบบสุ่ม`)
  }
  if (apiToken && apiToken.length < MIN_TOKEN) {
    warnings.push(`TMP_API_TOKEN สั้นกว่า ${MIN_TOKEN} ตัวอักษร — ใช้ค่าสุ่ม เช่น openssl rand -hex 32`)
  }

  let secret: string | null = null
  let secretSource: SecurityConfig["secretSource"] = null
  if (adminPassword) {
    if (envSecret) {
      secret = envSecret
      secretSource = "env"
      if (envSecret.length < MIN_SECRET) warnings.push(`TMP_AUTH_SECRET สั้นกว่า ${MIN_SECRET} ตัวอักษร — ใช้ openssl rand -hex 32`)
    } else {
      // อนุพันธ์แบบ deterministic จากรหัสผ่าน: restart แล้ว session เดิมยังใช้ได้ · เปลี่ยนรหัส = ออกจากระบบทุกคน
      secret = deriveSecretFromPassword(adminPassword)
      secretSource = "derived"
      warnings.push("ไม่ได้ตั้ง TMP_AUTH_SECRET — ใช้คีย์ที่อนุพันธ์จาก TMP_AUTH_PASSWORD แทน (ตั้งค่าสุ่มยาว ≥32 ตัวอักษรจะปลอดภัยกว่า)")
    }
  }

  if (!adminPassword && allowRemoteNoAuth) {
    warnings.push("TMP_ALLOW_REMOTE_NOAUTH=1 — ใครก็ตามที่เข้าถึงพอร์ตนี้ได้ ลบ/แก้ข้อมูลได้ทั้งหมดโดยไม่ต้องมีรหัสผ่าน (ไม่ปลอดภัย)")
  }

  return {
    mode: adminPassword ? "auth" : "local",
    adminPassword,
    viewerPassword,
    secret,
    secretSource,
    apiToken,
    allowRemoteNoAuth,
    allowedOrigins,
    hsts,
    warnings,
  }
}

// cache ต่อ "ลายนิ้วมือ" ของ env ที่เกี่ยวข้อง — proxy เรียกทุก request แต่ PBKDF2 ต้องไม่รันซ้ำ
// เก็บบน globalThis: proxy กับ route handler เป็น bundle แยกกันแต่อยู่ process เดียว → เตือนครั้งเดียวต่อค่า
const ENV_KEYS = [
  "TMP_AUTH_PASSWORD",
  "TMP_VIEWER_PASSWORD",
  "TMP_AUTH_SECRET",
  "TMP_API_TOKEN",
  "TMP_ALLOW_REMOTE_NOAUTH",
  "TMP_ALLOWED_ORIGINS",
  "TMP_HSTS",
] as const

const holder = globalThis as unknown as {
  __tmpSecurityConfig?: { fp: string; cfg: SecurityConfig }
  __tmpSecurityWarned?: Set<string>
}

export function getSecurityConfig(env: Env = process.env): SecurityConfig {
  const fp = sha256Hex(ENV_KEYS.map((k) => `${k}=${env[k] ?? ""}`).join("\n"))
  const hit = holder.__tmpSecurityConfig
  if (hit && hit.fp === fp) return hit.cfg
  const cfg = readSecurityConfig(env)
  holder.__tmpSecurityConfig = { fp, cfg }
  const warned = (holder.__tmpSecurityWarned ??= new Set())
  if (!warned.has(fp) && env.NODE_ENV !== "test") {
    warned.add(fp)
    const head = cfg.mode === "auth" ? "[security] โหมด auth (ต้องเข้าสู่ระบบ)" : "[security] โหมด local (รับเฉพาะ localhost)"
    console.info(head)
    for (const w of cfg.warnings) console.warn(`[security] ⚠️ ${w}`)
  }
  return cfg
}
