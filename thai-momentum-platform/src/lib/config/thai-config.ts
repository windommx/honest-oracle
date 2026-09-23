// ============================================================
// Thai config-as-data — เก็บการตั้งค่ากลยุทธ์หุ้นไทยไว้ใน Setting (key 'config_th')
// พร้อม auto-apply verdict จาก thai_fit (H1–H4) + history ทุกการเปลี่ยนแปลง
// + audit trail (Decision) + EventLog ผ่าน emitEvent ทุกครั้ง
// ============================================================

import { db } from "@/lib/db"
import { emitEvent } from "@/lib/research/events"
import type { ThaiFitReport } from "@/lib/research/thai-fit"

export const CONFIG_TH_KEY = "config_th"

/** เวลา cache config (ms) — ระดับโมดูล */
const CACHE_TTL_MS = 60_000

/** เก็บ history ใน config ไว้เฉพาะ N รายการล่าสุด (audit เต็มอยู่ที่ EventLog + Decision แล้ว) */
export const HISTORY_MAX = 200

/** tf ที่อนุญาตใน tfWeights */
export const TF_KEYS = ["5", "10", "20", "40", "80", "160", "300"] as const

export interface ThaiConfig {
  tfWeights: Record<string, number> // น้ำหนักต่อ timeframe "5".."300" — ผลรวมอิสระ (ระบบ normalize เอง)
  holdDefault: number // จำนวนวันถือปกติ (1..40)
  calendarOverlay: boolean // เปิด turn-of-month overlay +0.15x (H3)
  reversalEnabled: boolean // เปิด snap-back engine (H2)
  updatedBy: string
  history: { ts: number; verdict?: Record<string, boolean>; note?: string }[]
}

export const DEFAULT_CONFIG: ThaiConfig = {
  tfWeights: { "5": 0.35, "10": 0.3, "20": 0.2, "40": 0.1, "80": 0.05, "160": 0, "300": 0 },
  holdDefault: 5,
  calendarOverlay: false,
  reversalEnabled: false,
  updatedBy: "manual-init",
  history: [],
}

export interface ConfigHistoryEntry {
  ts: number
  verdict?: Record<string, boolean>
  note?: string
}

/** error ที่เกิดจาก input ผู้ใช้ผิด → route แปลงเป็น 400 */
export class ConfigValidationError extends Error {}

// ---------- deep-merge บน DEFAULT_CONFIG (กันข้อมูลเสียหายใน Setting) ----------

function isFiniteNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

/** ผสม parsed value ที่อ่านจาก DB กับ default — ค่าไหน type เพี้ยน/ผิดช่วงกลับไปใช้ default */
function mergeConfig(base: ThaiConfig, over: unknown): ThaiConfig {
  const cfg: ThaiConfig = {
    tfWeights: { ...base.tfWeights },
    holdDefault: base.holdDefault,
    calendarOverlay: base.calendarOverlay,
    reversalEnabled: base.reversalEnabled,
    updatedBy: base.updatedBy,
    history: [...base.history],
  }
  if (!over || typeof over !== "object") return cfg
  const o = over as Record<string, unknown>
  if (o.tfWeights && typeof o.tfWeights === "object") {
    const w = o.tfWeights as Record<string, unknown>
    for (const k of TF_KEYS) {
      const v = w[k]
      if (isFiniteNum(v) && v >= 0 && v <= 1) cfg.tfWeights[k] = v
    }
  }
  if (isFiniteNum(o.holdDefault) && Number.isInteger(o.holdDefault) && o.holdDefault >= 1 && o.holdDefault <= 40) {
    cfg.holdDefault = o.holdDefault
  }
  if (typeof o.calendarOverlay === "boolean") cfg.calendarOverlay = o.calendarOverlay
  if (typeof o.reversalEnabled === "boolean") cfg.reversalEnabled = o.reversalEnabled
  if (typeof o.updatedBy === "string" && o.updatedBy.length > 0) cfg.updatedBy = o.updatedBy
  if (Array.isArray(o.history)) {
    const hist: ConfigHistoryEntry[] = []
    for (const h of o.history) {
      if (!h || typeof h !== "object") continue
      const e = h as Record<string, unknown>
      if (!isFiniteNum(e.ts)) continue
      const entry: ConfigHistoryEntry = { ts: e.ts }
      if (e.verdict && typeof e.verdict === "object") {
        const v: Record<string, boolean> = {}
        for (const [k, bv] of Object.entries(e.verdict as Record<string, unknown>)) {
          if (typeof bv === "boolean") v[k] = bv
        }
        entry.verdict = v
      }
      if (typeof e.note === "string") entry.note = e.note
      hist.push(entry)
    }
    cfg.history = hist
  }
  return cfg
}

// ---------- cache (60s) ----------

let _cache: { at: number; cfg: ThaiConfig } | null = null

/** ล้าง cache — เรียกหลังเขียน config หรือหลัง ingest ข้อมูลที่กระทบการตั้งค่า */
export function invalidateConfigThCache(): void {
  _cache = null
}

async function readConfigFromDb(): Promise<ThaiConfig> {
  let parsed: unknown = null
  try {
    const row = await db.setting.findUnique({ where: { key: CONFIG_TH_KEY } })
    if (row) parsed = JSON.parse(row.value)
  } catch {
    parsed = null // value เสีย → ใช้ default
  }
  return mergeConfig(DEFAULT_CONFIG, parsed)
}

/** อ่าน config ปัจจุบัน (cache 60 วินาที) */
export async function getConfigTh(): Promise<ThaiConfig> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.cfg
  const cfg = await readConfigFromDb()
  _cache = { at: Date.now(), cfg }
  return cfg
}

// ---------- save ----------

function validatePatch(patch: Partial<ThaiConfig>): void {
  if (patch.tfWeights !== undefined) {
    const w = patch.tfWeights
    if (!w || typeof w !== "object") {
      throw new ConfigValidationError("tfWeights ต้องเป็น object ของ timeframe → น้ำหนัก")
    }
    for (const [k, v] of Object.entries(w)) {
      if (!(TF_KEYS as readonly string[]).includes(k)) {
        throw new ConfigValidationError(`tfWeights มีเฉพาะคีย์ ${TF_KEYS.join("/")} — ไม่รู้จัก "${k}"`)
      }
      if (!isFiniteNum(v) || v < 0 || v > 1) {
        throw new ConfigValidationError(`tfWeights["${k}"] ต้องเป็นตัวเลข 0..1`)
      }
    }
  }
  if (patch.holdDefault !== undefined) {
    const h = patch.holdDefault
    if (!Number.isInteger(h) || h < 1 || h > 40) {
      throw new ConfigValidationError("holdDefault ต้องเป็นจำนวนเต็ม 1-40 วัน")
    }
  }
  if (patch.calendarOverlay !== undefined && typeof patch.calendarOverlay !== "boolean") {
    throw new ConfigValidationError("calendarOverlay ต้องเป็น true/false")
  }
  if (patch.reversalEnabled !== undefined && typeof patch.reversalEnabled !== "boolean") {
    throw new ConfigValidationError("reversalEnabled ต้องเป็น true/false")
  }
}

/**
 * บันทึก patch ลง Setting (upsert) + ผนวก history + ยิง EventLog
 * verdict ใช้ภายในโดย applyVerdict (ประวัติแนบแผนที่ H1–H4)
 */
export async function saveConfigTh(
  patch: Partial<ThaiConfig>,
  by: string,
  note?: string,
  verdict?: Record<string, boolean>
): Promise<ThaiConfig> {
  validatePatch(patch)
  const cur = await readConfigFromDb() // อ่านสด (ไม่ผ่าน cache) กันทับของใหม่ด้วยของเก่า
  const next: ThaiConfig = {
    // tfWeights บางคีย์ = แก้เฉพาะคีย์นั้น (merge บนค่าปัจจุบัน) — ให้ค่าที่ cache/ตอบกลับ
    // ตรงกับค่าที่อ่านกลับจาก DB (mergeConfig เติมคีย์ที่ขาดเสมอ)
    tfWeights: patch.tfWeights ? { ...cur.tfWeights, ...patch.tfWeights } : { ...cur.tfWeights },
    holdDefault: patch.holdDefault !== undefined ? patch.holdDefault : cur.holdDefault,
    calendarOverlay: patch.calendarOverlay !== undefined ? patch.calendarOverlay : cur.calendarOverlay,
    reversalEnabled: patch.reversalEnabled !== undefined ? patch.reversalEnabled : cur.reversalEnabled,
    updatedBy: by,
    history: [...cur.history],
  }
  const entry: ConfigHistoryEntry = { ts: Math.floor(Date.now() / 1000) }
  if (verdict) entry.verdict = verdict
  if (note !== undefined && note !== "") entry.note = note
  next.history.push(entry)
  if (next.history.length > HISTORY_MAX) next.history = next.history.slice(-HISTORY_MAX)

  const value = JSON.stringify(next)
  await db.setting.upsert({
    where: { key: CONFIG_TH_KEY },
    create: { key: CONFIG_TH_KEY, value },
    update: { value },
  })
  _cache = { at: Date.now(), cfg: next }
  await emitEvent("config", by, { patch, note, verdict })
  return next
}

// ---------- auto-apply verdict ----------

/** วันที่ปัจจุบันตามเวลาตลาด (Asia/Bangkok) รูป YYYY-MM-DD — ไม่ขึ้นกับ TZ ของ server */
export function bangkokDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)
}

/**
 * applyVerdict(rep) — auto-apply ผล thai_fit ลง config + เขียน audit row (Decision):
 *   reversalEnabled = H2 pass, calendarOverlay = H3 pass,
 *   holdDefault = 5 (H1 pass) / 10, tfWeights เอนสายสั้น (H1 pass) หรือสายยาว
 *   updatedBy = auto-verdict@<YYYY-MM-DD> (วันที่ตามเวลาไทย)
 */
export async function applyVerdict(rep: ThaiFitReport): Promise<ThaiConfig> {
  const today = bangkokDate()
  const h1Pass = !!rep.h1?.pass
  const patch: Partial<ThaiConfig> = {
    reversalEnabled: !!rep.h2?.pass,
    calendarOverlay: !!rep.h3?.pass,
    holdDefault: h1Pass ? 5 : 10,
    tfWeights: h1Pass
      ? { "5": 0.35, "10": 0.3, "20": 0.2, "40": 0.1, "80": 0.05, "160": 0, "300": 0 }
      : { "5": 0.15, "10": 0.15, "20": 0.1, "40": 0.1, "80": 0.05, "160": 0.2, "300": 0.25 },
  }
  const verdict: Record<string, boolean> = {
    H1: !!rep.h1?.pass,
    H2: !!rep.h2?.pass,
    H3: !!rep.h3?.pass,
    H4: !!rep.h4?.pass,
  }
  const config = await saveConfigTh(
    patch,
    `auto-verdict@${today}`,
    "auto-apply จาก thai_fit verdict (H1-H4)",
    verdict
  )
  // audit trail: Decision Q_SIGNAL — ตรวจย้อนหลังได้ว่าระบบเปลี่ยน config เพราะอะไร
  await db.decision.create({
    data: {
      date: today,
      question: "Q_SIGNAL",
      target: "config_th",
      action: "auto-apply",
      conf: 1.0,
      reason: JSON.stringify(rep.actions ?? {}),
      executed: true,
      source: "system",
    },
  })
  return config
}
