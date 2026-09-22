// ============================================================
// Pre-registration — freeze กติกาการทดลองด้วย sha256 ก่อนเห็นผล
// หลัง freeze: การรัน trial ต่อไปใช้กติกาที่ล็อกไว้เสมอ (กัน curve fitting)
// ============================================================

import { createHash } from "crypto"
import { db } from "@/lib/db"

export interface TrialParams {
  k: number // ติด >= k โผพร้อมกัน
  hold: number // วันถือ
  stopPct: number // 0.10 = -10%
  maxPos: number // จำนวนสถานะสูงสุด
  costBps: number // ต้นทุนต่อขา (bps)
  costsGrid: number[] // ชุดต้นทุนทดสอบ sensitivity
  bootN: number // จำนวนรอบ bootstrap
  seed: number // seed RNG (reproducible)
  hitGate: number // เกณฑ์ hit ของ meta-model
  nGroups: number // CPCV groups
  nTestGroups: number // CPCV test groups
  purge: number // CPCV purge (วัน)
}

export const DEFAULT_TRIAL_PARAMS: TrialParams = {
  k: 3,
  hold: 10,
  stopPct: 0.1,
  maxPos: 10,
  costBps: 55,
  costsGrid: [25, 100, 200],
  bootN: 2000,
  seed: 42,
  hitGate: 0.55,
  nGroups: 6,
  nTestGroups: 2,
  purge: 12,
}

export interface PreregInfo {
  hash: string
  params: TrialParams
  frozenAt: string
}

const KEY = "prereg_trial"

function canonicalString(p: TrialParams): string {
  // canonical: เรียง key ตามชื่อเสมอ → hash นิ่งกับลำดับการพิมพ์
  const sorted: Record<string, unknown> = {}
  for (const k of Object.keys(p).sort()) sorted[k] = (p as unknown as Record<string, unknown>)[k]
  return JSON.stringify(sorted)
}

export function paramsHash(p: TrialParams): string {
  return createHash("sha256").update(canonicalString(p)).digest("hex")
}

export async function getPrereg(): Promise<PreregInfo | null> {
  const row = await db.setting.findUnique({ where: { key: KEY } })
  if (!row) return null
  try {
    return JSON.parse(row.value) as PreregInfo
  } catch {
    return null
  }
}

export async function freezePrereg(p: TrialParams): Promise<PreregInfo> {
  const info: PreregInfo = {
    hash: paramsHash(p),
    params: p,
    frozenAt: new Date().toISOString(),
  }
  await db.setting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(info) },
    update: { value: JSON.stringify(info) },
  })
  return info
}

export async function resetPrereg(): Promise<boolean> {
  const res = await db.setting.deleteMany({ where: { key: KEY } })
  return res.count > 0
}

// validate พารามิเตอร์จาก body (ผิด → error message ไทย)
export function parseTrialParams(body: Record<string, unknown>): { params?: TrialParams; errors: string[] } {
  const d = DEFAULT_TRIAL_PARAMS
  const p: TrialParams = { ...d, costsGrid: [...d.costsGrid] }
  const errors: string[] = []
  const num = (key: keyof TrialParams, min: number, max: number, label: string) => {
    const raw = body[key]
    if (raw === undefined || raw === null || raw === "") return
    const v = typeof raw === "number" ? raw : Number(raw)
    if (!isFinite(v)) errors.push(`${label} ต้องเป็นตัวเลข`)
    else if (v < min || v > max) errors.push(`${label} ต้องอยู่ระหว่าง ${min}-${max}`)
    else (p[key] as number) = v
  }
  num("k", 1, 7, "k")
  num("hold", 1, 60, "hold")
  num("stopPct", 0.02, 0.5, "stopPct")
  num("maxPos", 1, 30, "maxPos")
  num("costBps", 0, 500, "costBps")
  num("bootN", 200, 10000, "bootN")
  num("seed", 0, 1e9, "seed")
  num("hitGate", 0.5, 0.8, "hitGate")
  num("nGroups", 4, 10, "nGroups")
  num("nTestGroups", 1, 4, "nTestGroups")
  num("purge", 3, 60, "purge")
  return errors.length > 0 ? { errors } : { params: p, errors }
}
