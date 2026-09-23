// ============================================================
// Live-period freeze — ล็อก "กติกาที่ระบบเทรดใช้จริง" ตลอดช่วงเก็บผล paper record (evidence-protocol ขั้น 3–5)
//
// ปัญหา: ระหว่างนับ record 6–12 เดือน กติกาเปลี่ยนเงียบ ๆ ได้หลายทาง — GET /api/signals/ic เขียน signals_policy
// (hold มาจาก query string) ทุกครั้งที่ผู้ดูแลเปิดแท็บ · GET /api/stops เขียน stops_policy เมื่อผู้ชนะ walk-forward เปลี่ยน ·
// POST /api/evidence/run / PUT /api/config/th เขียน config_th · prereg ล็อกแค่กติกา trial ของ Profit Engine
// ทางแก้: Setting "live_freeze" เก็บ sha256 ของค่าดิบ (Setting.value) ทุกตัวที่ Jev อ่านเป็นกติกา ณ วันล็อก
//  → route ที่เขียนกติกาเช็กก่อนเขียน (ล็อกอยู่ = คำนวณได้แต่ไม่บันทึก / 409)
//  → ทุกจุดที่แสดงสถานะเทียบ hash ปัจจุบันกับตอนล็อก: ไม่ตรง = มีการแก้ข้ามด่าน (เช่นแก้ตรงใน DB) → แสดงดัง ๆ
//  → freeze/unfreeze ลง EventLog (hash chain) พร้อม hash — บันทึกล็อกที่ถูกแก้/ลบตรงใน DB เทียบกับ EventLog แล้วโผล่
// hash = sha256(Setting.value เป็นไบต์ UTF-8) — ตรวจเองได้:
//   printf '%s' "$(sqlite3 app.db "select value from Setting where key='config_th'")" | sha256sum
// ไฟล์นี้: helper บริสุทธิ์ (มี unit test) + ตัวอ่าน/เขียน DB เล็ก ๆ แบบเดียวกับ prereg.ts
// ============================================================

import { createHash } from "crypto"
import { db } from "@/lib/db"

export const LIVE_FREEZE_KEY = "live_freeze"
/** kind ของ EventLog ที่บันทึก freeze/unfreeze */
export const LIVE_FREEZE_EVENT = "live_freeze"
/** คำยืนยันที่ต้องส่งมากับการปลดล็อก (ไม่ส่ง/ผิด = 409) */
export const UNFREEZE_CONFIRM = "UNFREEZE"
export const NOTE_MAX = 2000
export const REASON_MAX = 500

/**
 * Setting ที่ระบบเทรดอ่านเป็นกติกา — key ตรงกับค่าคงที่ของโมดูลต้นทาง (freeze.test.ts ตรวจให้)
 *  config_th      CONFIG_TH_KEY (config/thai-config.ts) — น้ำหนัก timeframe / holdDefault / overlay / reversal
 *  signals_policy POLICY_KEY (momentum/signals/io.ts) — สัญญาณที่ PROMOTE + น้ำหนัก
 *  stops_policy   STOP_POLICY_KEY (momentum/stops/engine.ts) — stop arm ที่ adopt
 *  meta_model     research/features.ts liveMetaProbability — Jev ใช้คูณขนาดไม้ (CPCV deploy เขียน)
 *  prereg_trial   research/prereg.ts — กติกา trial ที่ลงทะเบียนล่วงหน้า
 */
export const FROZEN_KEYS = ["config_th", "signals_policy", "stops_policy", "meta_model", "prereg_trial"] as const
export type FrozenKey = (typeof FROZEN_KEYS)[number]

export const FROZEN_KEY_LABEL: Record<FrozenKey, string> = {
  config_th: "config_th — น้ำหนัก timeframe / วันถือ / overlay",
  signals_policy: "signals_policy — สัญญาณที่ PROMOTE + น้ำหนัก",
  stops_policy: "stops_policy — stop arm ที่ใช้จริง",
  meta_model: "meta_model — โมเดลปรับขนาดไม้ของ Jev",
  prereg_trial: "prereg_trial — กติกา trial ที่ลงทะเบียนล่วงหน้า",
}

/** sha256 ของค่าดิบต่อ key (null = ไม่มีแถว — ระบบใช้ค่า default / ปิดชั้นนั้น) */
export type FreezeHashes = Record<FrozenKey, string | null>

export interface LiveFreeze {
  v: 1
  frozenAt: string
  /** วันที่ข้อมูลตลาดล่าสุดใน DB ตอนล็อก — ผลที่นับเป็นหลักฐานคือของวันหลังจากนี้ */
  dataDate: string | null
  /** สมมติฐาน/บันทึกที่เขียนก่อนเห็นผล */
  note: string
  hashes: FreezeHashes
  /** hash ของกติกา trial (PreregInfo.hash) ถ้าล็อก prereg ไว้ — ใช้อ้างอิงคู่กันตอนเผยแพร่ */
  preregHash: string | null
}

export interface FreezeDrift {
  key: FrozenKey
  label: string
  frozen: string | null
  current: string | null
}

/** ธงที่ route ซึ่ง "เคย" เขียนกติกา แนบกลับใน response (GET /api/signals/ic · /api/stops · POST /api/evidence/run) */
export interface LiveFreezeFlag {
  frozen: boolean
  frozenAt: string | null
  /** ข้อความไทยสำหรับ UI เมื่อล็อกอยู่ (null = ไม่ล็อก) */
  freezeNote: string | null
  /** key ที่ค่าปัจจุบันไม่ตรงกับตอนล็อก — ไม่ว่าง = มีการแก้ข้ามด่านล็อก */
  freezeDrift: FrozenKey[]
}

export interface FreezeEventInfo {
  id: number
  ts: string
  /** freeze | unfreeze (ค่าอื่น = payload แปลก) */
  action: string
  /** ข้อมูลที่ล็อก (เฉพาะ action freeze ที่ payload ครบ) */
  freeze: LiveFreeze | null
  reason: string | null
}

export interface LiveFreezeStatus {
  frozen: boolean
  /** มีแถว live_freeze แต่อ่านไม่ได้ → ถือว่ายังล็อก (fail closed) จนกว่าจะปลดล็อก */
  corrupt: boolean
  freeze: LiveFreeze | null
  current: { hashes: FreezeHashes; preregHash: string | null; dataDate: string | null }
  drift: FreezeDrift[]
  /** ปัญหาของตัวบันทึกล็อกเมื่อเทียบ EventLog (ถูกสร้าง/แก้/ลบตรงใน DB) */
  integrity: string[]
  lastEvent: FreezeEventInfo | null
  keys: { key: FrozenKey; label: string }[]
  message: string
}

// ---------- helper บริสุทธิ์ ----------

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex")
}

/** hash ของค่าดิบทุก key ที่ล็อก (ไม่มีค่า = null) */
export function hashValues(values: Partial<Record<FrozenKey, string | null>>): FreezeHashes {
  const out = {} as FreezeHashes
  for (const k of FROZEN_KEYS) {
    const v = values[k]
    out[k] = typeof v === "string" ? sha256Hex(v) : null
  }
  return out
}

/** hash กติกา trial จากค่าดิบของ prereg_trial (PreregInfo.hash) — อ่านไม่ได้ = null */
export function preregHashOf(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  try {
    const p = JSON.parse(raw) as { hash?: unknown }
    return p && typeof p.hash === "string" ? p.hash : null
  } catch {
    return null
  }
}

/** key ที่ค่าปัจจุบันไม่ตรงกับตอนล็อก (แถวหาย / แถวโผล่ใหม่ / ค่าเปลี่ยน นับหมด) */
export function compareFreeze(frozen: FreezeHashes, current: FreezeHashes): FreezeDrift[] {
  return FROZEN_KEYS.filter((k) => frozen[k] !== current[k]).map((k) => ({
    key: k,
    label: FROZEN_KEY_LABEL[k],
    frozen: frozen[k],
    current: current[k],
  }))
}

const HEX64 = /^[0-9a-f]{64}$/

function isHashOrNull(v: unknown): v is string | null {
  return v === null || (typeof v === "string" && HEX64.test(v))
}

/** ตรวจรูปร่างของบันทึกล็อก (จาก Setting หรือ payload ของ EventLog) — ผิดรูป = null */
export function toLiveFreeze(o: unknown): LiveFreeze | null {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null
  const r = o as Record<string, unknown>
  if (typeof r.frozenAt !== "string" || !Number.isFinite(Date.parse(r.frozenAt))) return null
  if (typeof r.note !== "string") return null
  if (r.dataDate !== null && typeof r.dataDate !== "string") return null
  if (r.preregHash !== null && typeof r.preregHash !== "string") return null
  const h = r.hashes
  if (!h || typeof h !== "object" || Array.isArray(h)) return null
  const hashes = {} as FreezeHashes
  for (const k of FROZEN_KEYS) {
    const v = (h as Record<string, unknown>)[k]
    if (!isHashOrNull(v)) return null
    hashes[k] = v
  }
  return { v: 1, frozenAt: r.frozenAt, dataDate: r.dataDate, note: r.note, hashes, preregHash: r.preregHash }
}

export function parseLiveFreeze(raw: string | null | undefined): LiveFreeze | null {
  if (typeof raw !== "string") return null
  try {
    return toLiveFreeze(JSON.parse(raw))
  } catch {
    return null
  }
}

/** ข้อความจากผู้ใช้: trim + ตัดความยาว (ไม่ใช่ string = "") */
export function normalizeText(x: unknown, max = NOTE_MAX): string {
  return typeof x === "string" ? x.trim().slice(0, max) : ""
}

export function parseFreezeEvent(e: { id: number; ts: Date | string; payload: string }): FreezeEventInfo {
  let p: Record<string, unknown> = {}
  try {
    const x: unknown = JSON.parse(e.payload)
    if (x && typeof x === "object" && !Array.isArray(x)) p = x as Record<string, unknown>
  } catch {
    p = {}
  }
  const action = typeof p.action === "string" ? p.action : "?"
  return {
    id: e.id,
    ts: typeof e.ts === "string" ? e.ts : e.ts.toISOString(),
    action,
    freeze: action === "freeze" ? toLiveFreeze(p) : null,
    reason: typeof p.reason === "string" ? p.reason : null,
  }
}

function sameFreeze(a: LiveFreeze, b: LiveFreeze): boolean {
  if (a.frozenAt !== b.frozenAt || a.dataDate !== b.dataDate || a.note !== b.note || a.preregHash !== b.preregHash) return false
  return FROZEN_KEYS.every((k) => a.hashes[k] === b.hashes[k])
}

/**
 * บันทึกล็อก (Setting) เทียบเหตุการณ์ live_freeze ล่าสุดใน EventLog (แก้ย้อนหลังไม่ได้เพราะ hash chain)
 * กันการ "ย้าย baseline" เงียบ ๆ: แก้ policy แล้วแก้ hash ในบันทึกล็อกตาม → drift หาย แต่ไม่ตรงกับ EventLog
 */
export function checkFreezeIntegrity(record: LiveFreeze | null, corrupt: boolean, last: FreezeEventInfo | null): string[] {
  const issues: string[] = []
  if (corrupt) {
    issues.push("บันทึกล็อก (Setting live_freeze) อ่านไม่ได้ — ถูกแก้ตรงใน DB? ระบบถือว่ายังล็อกอยู่จนกว่าจะปลดล็อก")
  } else if (record) {
    if (!last || last.action !== "freeze" || !last.freeze) {
      issues.push("ไม่พบเหตุการณ์ freeze ใน EventLog ที่คู่กับบันทึกล็อกนี้ — บันทึกอาจถูกสร้างตรงใน DB")
    } else if (!sameFreeze(record, last.freeze)) {
      issues.push(`บันทึกล็อกไม่ตรงกับ EventLog #${last.id} — ค่าที่ล็อก (hash/วันที่/บันทึก) ถูกแก้หลังล็อก`)
    }
  } else if (last?.action === "freeze") {
    issues.push(
      `EventLog #${last.id} บันทึกว่าล็อกไว้ (${last.freeze?.frozenAt ?? last.ts}) แต่ไม่พบบันทึกล็อก — live_freeze ถูกลบตรงใน DB: ตอนนี้ระบบไม่ได้ล็อก`,
    )
  }
  return issues
}

const dateTh = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "—")

export const NOT_FROZEN: LiveFreezeFlag = { frozen: false, frozenAt: null, freezeNote: null, freezeDrift: [] }

/** ธงสั้นจากค่าดิบ: มีแถว live_freeze = ล็อก (อ่านไม่ได้ก็ถือว่าล็อก) + drift */
export function freezeFlagFrom(freezeRaw: string | null, values: Partial<Record<FrozenKey, string | null>>): LiveFreezeFlag {
  if (freezeRaw === null) return NOT_FROZEN
  const rec = parseLiveFreeze(freezeRaw)
  if (!rec) {
    return {
      frozen: true,
      frozenAt: null,
      freezeNote: "🔒 ล็อกช่วงเก็บผลจริง — ไม่บันทึก policy ใหม่ (บันทึกล็อกอ่านไม่ได้ — ถือว่าล็อกไว้ก่อน ตรวจที่แท็บ Evidence)",
      freezeDrift: [],
    }
  }
  const drift = compareFreeze(rec.hashes, hashValues(values)).map((d) => d.key)
  return {
    frozen: true,
    frozenAt: rec.frozenAt,
    freezeNote:
      `🔒 ล็อกช่วงเก็บผลจริง — ไม่บันทึก policy ใหม่ (ล็อกเมื่อ ${dateTh(rec.frozenAt)} · Jev ใช้กติกาที่ล็อกไว้)` +
      (drift.length > 0 ? ` · ⚠️ ค่าปัจจุบันไม่ตรงกับตอนล็อก: ${drift.join(", ")}` : ""),
    freezeDrift: drift,
  }
}

/** ข้อความ 409 เมื่อมีคนพยายามเขียนกติกาขณะล็อก */
export function frozenWriteError(what: string, flag: Pick<LiveFreezeFlag, "frozenAt">): string {
  return (
    `🔒 ล็อกช่วงเก็บผลจริงอยู่${flag.frozenAt ? ` (ตั้งแต่ ${dateTh(flag.frozenAt)})` : ""} — ${what}ไม่ได้ระหว่างเก็บผล ` +
    `เพื่อไม่ให้ record เสียเพราะเปลี่ยนกติกากลางทาง · ถ้าจำเป็นต้องเปลี่ยนจริง: ปลดล็อกที่แท็บ Evidence (พิมพ์ UNFREEZE + เหตุผล) ` +
    `= จบ trial นี้และเริ่ม trial ใหม่`
  )
}

/** ประกอบสถานะเต็ม (บริสุทธิ์ — route/track record ใช้ร่วมกัน) */
export function buildFreezeStatus(input: {
  freezeRaw: string | null
  values: Partial<Record<FrozenKey, string | null>>
  lastEvent: FreezeEventInfo | null
  dataDate: string | null
}): LiveFreezeStatus {
  const record = parseLiveFreeze(input.freezeRaw)
  const corrupt = input.freezeRaw !== null && record === null
  const current = {
    hashes: hashValues(input.values),
    preregHash: preregHashOf(input.values.prereg_trial),
    dataDate: input.dataDate,
  }
  const drift = record ? compareFreeze(record.hashes, current.hashes) : []
  const integrity = checkFreezeIntegrity(record, corrupt, input.lastEvent)
  const frozen = input.freezeRaw !== null
  let message: string
  if (corrupt) message = "⚠️ บันทึกล็อกเสียหาย — ถือว่ายังล็อกอยู่ (ไม่บันทึก policy/config ใหม่) · ปลดล็อกแล้วล็อกใหม่เพื่อเริ่มนับให้ถูกต้อง"
  else if (record && drift.length > 0)
    message =
      `⚠️ ล็อกตั้งแต่ ${dateTh(record.frozenAt)} แต่ค่าที่ระบบเทรดใช้ตอนนี้ไม่ตรงกับตอนล็อก: ${drift.map((d) => d.key).join(", ")} — ` +
      `มีการแก้ข้ามด่านล็อก (เช่นแก้ตรงใน DB) · record หลังวันล็อกไม่ใช่ผลของกติกาชุดเดียว`
  else if (record) message = `🔒 ล็อกตั้งแต่ ${dateTh(record.frozenAt)} — ค่าที่ระบบเทรดใช้ตรงกับตอนล็อกทุกตัว`
  else message = "ยังไม่ได้ล็อก — กติกาที่ระบบเทรดใช้ (config_th / signals_policy / stops_policy / meta_model) เปลี่ยนได้ระหว่างเก็บผล"
  if (integrity.length > 0) message += ` · ⚠️ ${integrity.join(" · ")}`
  return {
    frozen,
    corrupt,
    freeze: record,
    current,
    drift,
    integrity,
    lastEvent: input.lastEvent,
    keys: FROZEN_KEYS.map((key) => ({ key, label: FROZEN_KEY_LABEL[key] })),
    message,
  }
}

// ---------- เหตุการณ์ที่เปลี่ยนกติกา (EventLog) ----------

/** kind ของ EventLog ที่อาจเปลี่ยนกติกา (research ต้องดู payload) + freeze/unfreeze */
export const POLICY_EVENT_KINDS = ["signals_policy", "stops_policy", "config", "research", "seed", "ingest", LIVE_FREEZE_EVENT] as const

const WIPED_BY_RESET: FrozenKey[] = ["signals_policy", "stops_policy", "meta_model", "prereg_trial"]

/** key ที่เหตุการณ์นี้เปลี่ยน (อิง payload ที่แต่ละ route emit จริง) — [] = ไม่แตะกติกา */
export function policyKeysOfEvent(kind: string, payloadRaw: string): FrozenKey[] {
  if (kind === "signals_policy") return ["signals_policy"]
  if (kind === "stops_policy") return ["stops_policy"]
  if (kind === "config") return ["config_th"] // saveConfigTh (PUT /api/config/th · auto-apply ของ evidence/run)
  let p: Record<string, unknown> = {}
  try {
    const x: unknown = JSON.parse(payloadRaw)
    if (x && typeof x === "object" && !Array.isArray(x)) p = x as Record<string, unknown>
  } catch {
    p = {}
  }
  if (kind === "research") {
    if (p.action === "prereg_freeze" || p.action === "prereg_reset") return ["prereg_trial"]
    if (p.action === "meta_model_disabled") return ["meta_model"]
    if (p.kind === "cpcv" && p.deployed === true) return ["meta_model"]
    return []
  }
  // seed / replaceDemo ล้าง meta_model · prereg · signals/stops policy (core.seedDemoData · feed/ingest clearDemoMarketData)
  if (kind === "seed") return [...WIPED_BY_RESET]
  if (kind === "ingest" && p.replacedDemo === true) return [...WIPED_BY_RESET]
  return []
}

export interface PolicyChange {
  id: number
  ts: string
  kind: string
  keys: FrozenKey[]
  /** เกิดหลังเวลาที่ล็อก (ขณะล็อกอยู่) — ผ่านแอปไม่ควรเกิดได้ */
  afterFreeze: boolean
  text: string
}

/** ข้อมูลล็อกที่ GET /api/track-record แนบ (แท็บ Track Record) */
export interface TrackFreezeInfo {
  frozen: boolean
  corrupt: boolean
  frozenAt: string | null
  dataDate: string | null
  note: string | null
  hashes: FreezeHashes | null
  preregHash: string | null
  drift: FreezeDrift[]
  integrity: string[]
  /** การเปลี่ยนกติกา/ปลดล็อกใน EventLog ระหว่างช่วง record (นับจากรอบตัดสินใจแรกของยุคนี้) และหลังล็อก */
  changes: PolicyChange[]
  /** record เริ่มก่อนล็อก — ช่วงแรกของ record ไม่ได้อยู่ใต้กติกาที่ล็อก */
  startedBeforeFreeze: boolean
  /** ล็อกก่อนยุคข้อมูลปัจจุบัน — seed/ล้าง demo ระหว่างล็อกลบ policy ที่ล็อกไว้ */
  beforeEpoch: boolean
  /** กติกาเปลี่ยน/ตรวจไม่ผ่านระหว่างล็อก → record ช่วงนี้ไม่ใช่หลักฐานของกติกาที่ลงทะเบียนไว้ */
  violated: boolean
}

const KIND_TEXT: Record<string, string> = {
  signals_policy: "บันทึก signals_policy ใหม่",
  stops_policy: "บันทึก stops_policy ใหม่",
  config: "แก้ config_th",
  seed: "seed ข้อมูลตัวอย่าง (ล้าง policy)",
  ingest: "ล้าง demo + นำเข้าข้อมูล (ล้าง policy)",
}

function changeText(kind: string, keys: FrozenKey[], ev: FreezeEventInfo | null): string {
  if (ev) return ev.action === "unfreeze" ? `ปลดล็อก${ev.reason ? ` — เหตุผล: ${ev.reason}` : ""}` : "ล็อกกติกา"
  if (kind === "research") return keys.includes("prereg_trial") ? "เปลี่ยน prereg (กติกา trial)" : "เปลี่ยน meta_model (ขนาดไม้)"
  return KIND_TEXT[kind] ?? kind
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

/**
 * ประกอบข้อมูลล็อกของ track record + หมายเหตุภาษาไทย (บริสุทธิ์)
 * events = EventLog ของ POLICY_EVENT_KINDS เรียงตาม id · recordStart = เวลารันจริงครั้งแรกของยุคนี้ (firstRunAt)
 */
export function buildTrackFreeze(input: {
  status: LiveFreezeStatus
  events: { id: number; kind: string; ts: string; payload: string }[]
  recordStart: string | null
  liveSince: string | null
  epochStart: string | null
}): { info: TrackFreezeInfo; notes: string[] } {
  const { status } = input
  const rec = status.freeze
  const frozenMs = ms(rec?.frozenAt)
  const startMs = ms(input.recordStart)
  const changes: PolicyChange[] = []
  for (const e of input.events) {
    const t = ms(e.ts)
    if (t === null) continue
    const inRecord = startMs !== null && t >= startMs
    const afterFreeze = status.frozen && frozenMs !== null && t > frozenMs
    if (!inRecord && !afterFreeze) continue
    const fev = e.kind === LIVE_FREEZE_EVENT ? parseFreezeEvent(e) : null
    // ล็อกครั้งปัจจุบันเองไม่ใช่ "การเปลี่ยนกติกา" · ปลดล็อกระหว่าง record = บริบทสำคัญ (จบ trial หนึ่ง)
    if (fev && fev.action !== "unfreeze") continue
    const keys = fev ? [] : policyKeysOfEvent(e.kind, e.payload)
    if (!fev && keys.length === 0) continue
    changes.push({ id: e.id, ts: e.ts, kind: e.kind, keys, afterFreeze, text: changeText(e.kind, keys, fev) })
  }
  const policyAfter = changes.filter((c) => c.afterFreeze && c.keys.length > 0)
  const beforeFreezeInRecord = changes.filter((c) => !c.afterFreeze && c.keys.length > 0)
  const epochMs = ms(input.epochStart)
  const beforeEpoch = status.frozen && frozenMs !== null && epochMs !== null && frozenMs < epochMs
  const startedBeforeFreeze = status.frozen && frozenMs !== null && startMs !== null && startMs < frozenMs
  const violated = status.drift.length > 0 || status.integrity.length > 0 || policyAfter.length > 0 || beforeEpoch

  const notes: string[] = []
  const since = dateTh(rec?.frozenAt)
  if (status.drift.length > 0)
    notes.push(
      `⚠️ กติกาที่ระบบเทรดใช้ไม่ตรงกับที่ล็อกไว้: ${status.drift.map((d) => d.key).join(", ")} — ถูกแก้ข้ามด่านล็อก (เช่นแก้ตรงใน DB): record ตั้งแต่ ${since} ไม่ใช่ผลของกติกาชุดเดียว`,
    )
  for (const i of status.integrity) notes.push(`⚠️ ${i}`)
  if (policyAfter.length > 0)
    notes.push(
      `⚠️ EventLog มีการเปลี่ยนกติกา ${policyAfter.length} ครั้งหลังล็อก (${policyAfter.map((c) => `#${c.id} ${c.text}`).join(" · ")}) — ต้องตรวจว่าผ่านด่านล็อกมาได้อย่างไร`,
    )
  if (beforeEpoch)
    notes.push(`⚠️ ยุคข้อมูลเริ่มใหม่ (seed/ล้าง demo) หลังล็อก ${since} — policy ที่ล็อกไว้ถูกล้างไปด้วย: ปลดล็อกแล้วล็อกใหม่ = trial ใหม่`)
  if (startedBeforeFreeze)
    notes.push(
      `record เริ่ม ${input.liveSince ?? dateTh(input.recordStart)} ก่อนล็อกกติกา (${since})` +
        (beforeFreezeInRecord.length > 0 ? ` และกติกาเปลี่ยน ${beforeFreezeInRecord.length} ครั้งก่อนล็อก` : "") +
        " — ช่วงก่อนล็อกไม่ได้อยู่ใต้กติกาที่ลงทะเบียนไว้",
    )
  if (!status.frozen && startMs !== null)
    notes.push(
      "ยังไม่ได้ล็อกกติกาช่วงเก็บผล (POST /api/research/freeze) — config_th / signals_policy / stops_policy เปลี่ยนได้ระหว่าง record" +
        (beforeFreezeInRecord.length > 0 ? ` (เปลี่ยนแล้ว ${beforeFreezeInRecord.length} ครั้งในช่วงนี้)` : ""),
    )

  return {
    info: {
      frozen: status.frozen,
      corrupt: status.corrupt,
      frozenAt: rec?.frozenAt ?? null,
      dataDate: rec?.dataDate ?? null,
      note: rec?.note ?? null,
      hashes: rec?.hashes ?? null,
      preregHash: rec?.preregHash ?? null,
      drift: status.drift,
      integrity: status.integrity,
      changes,
      startedBeforeFreeze,
      beforeEpoch,
      violated,
    },
    notes,
  }
}

// ---------- DB (อ่าน/เขียนเล็ก ๆ — route เป็นคนตัดสิน HTTP + emit event) ----------

/** ค่าดิบของทุก key ที่ล็อก + ค่าดิบของบันทึกล็อก (query เดียว) */
export async function readFreezeValues(): Promise<{ values: Record<FrozenKey, string | null>; freezeRaw: string | null }> {
  const rows = await db.setting.findMany({ where: { key: { in: [...FROZEN_KEYS, LIVE_FREEZE_KEY] } } })
  const byKey = new Map(rows.map((r) => [r.key, r.value]))
  const values = {} as Record<FrozenKey, string | null>
  for (const k of FROZEN_KEYS) values[k] = byKey.get(k) ?? null
  return { values, freezeRaw: byKey.get(LIVE_FREEZE_KEY) ?? null }
}

/** ธงสำหรับ route ที่เขียนกติกา — เรียก "ก่อนเขียน" ทุกครั้ง (อ่าน Setting 1 query) */
export async function liveFreezeFlag(): Promise<LiveFreezeFlag> {
  const { values, freezeRaw } = await readFreezeValues()
  return freezeFlagFrom(freezeRaw, values)
}

export async function getLiveFreezeStatus(): Promise<LiveFreezeStatus> {
  const [{ values, freezeRaw }, last, agg] = await Promise.all([
    readFreezeValues(),
    db.eventLog.findFirst({ where: { kind: LIVE_FREEZE_EVENT }, orderBy: { id: "desc" }, select: { id: true, ts: true, payload: true } }),
    db.rawDaily.aggregate({ _max: { date: true } }),
  ])
  return buildFreezeStatus({
    freezeRaw,
    values,
    lastEvent: last ? parseFreezeEvent(last) : null,
    dataDate: agg._max.date ?? null,
  })
}

/** เขียนบันทึกล็อกใหม่ (create — มีอยู่แล้ว = Prisma P2002 → route ตอบ 409) */
export async function writeLiveFreeze(record: LiveFreeze): Promise<void> {
  await db.setting.create({ data: { key: LIVE_FREEZE_KEY, value: JSON.stringify(record) } })
}

export async function clearLiveFreeze(): Promise<boolean> {
  const res = await db.setting.deleteMany({ where: { key: LIVE_FREEZE_KEY } })
  return res.count > 0
}
