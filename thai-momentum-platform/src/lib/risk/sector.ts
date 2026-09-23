// ============================================================
// Sector / Sector-Group risk layer — บังคับ diversification ระดับ
// อุตสาหกรรม (หุ้นไทยวิ่งเป็นกลุ่ม จึงต้องกันพอร์ตกระจุก sector เดียว)
//
// - getSectorMap / sectorOf : แผนที่ symbol → sector (จาก SymbolMeta, ขาด = Unknown)
// - groupOf                 : sector → กลุ่มใหญ่ (Banking → Financials)
// - computeSectorExposure   : น้ำหนักต่อ sector (slots/totalSlots) + breached เทียบ cap 30%
// - computeGroupExposure    : น้ำหนักต่อกลุ่ม + breached เทียบ cap กลุ่ม
// - applySectorConstraints  : จำลองการรับ candidate ทีละตัวบนพอร์ตเดิม ตามลำดับ
//   (Unknown → Layer 1 จำนวนชื่อ/sector → พื้นที่พอร์ต → Layer 2 น้ำหนัก sector
//    → Layer 3 น้ำหนักกลุ่ม) โดยพยายามลดขนาดลงกริด 0.25 slot ก่อนตัดทิ้งเสมอ
//
// หมายเหตุ: exposure ที่รายงานเป็น "มุมมองบรรยาย" — แถวที่ breached จะเกิดได้
// เมื่อสถานะเดิม (existing) ละเมิด cap อยู่ก่อนแล้ว เกณฑ์ที่ gate จริงคือ
// applySectorConstraints (เชิงป้องกัน)
// ============================================================

import { db } from "@/lib/db"
import {
  TH_MAX_SECTOR_WEIGHT,
  TH_MAX_NAMES_PER_SECTOR,
  TH_SECTOR_GROUPS,
  TH_GROUP_MAX_WEIGHT,
  TH_HARD_REJECT_UNKNOWN,
  TH_STRATEGY,
} from "@/lib/config/thai"
import type { GroupExposureRow, SectorExposureRow } from "@/lib/momentum/contracts"

// ---------- แผนที่หุ้น → sector ----------

export async function getSectorMap(): Promise<Map<string, string>> {
  const rows = await db.symbolMeta.findMany()
  const map = new Map<string, string>()
  for (const r of rows) map.set(r.symbol, r.sector)
  return map
}

export function sectorOf(map: Map<string, string>, symbol: string): string {
  return map.get(symbol) ?? "Unknown"
}

// reverse lookup: sector → กลุ่มใหญ่ (เช่น Banking → Financials), null ถ้าไม่สังกัดกลุ่มใด
let _groupLookup: Map<string, string> | null = null
export function groupOf(sector: string): string | null {
  if (!_groupLookup) {
    _groupLookup = new Map()
    for (const [group, sectors] of Object.entries(TH_SECTOR_GROUPS)) {
      for (const s of sectors) if (!_groupLookup.has(s)) _groupLookup.set(s, group)
    }
  }
  return _groupLookup.get(sector) ?? null
}

// ---------- exposure (monitoring view) ----------

const EPS = 1e-9
const round2 = (x: number): number => Math.round(x * 100) / 100

export function computeSectorExposure(
  positions: { symbol: string; slots: number }[],
  sectorMap: Map<string, string>
): SectorExposureRow[] {
  const totalSlots = positions.reduce((a, p) => a + p.slots, 0)
  if (positions.length === 0 || !(totalSlots > 0)) return []
  const agg = new Map<string, { slots: number; names: number }>()
  for (const p of positions) {
    const sector = sectorOf(sectorMap, p.symbol)
    const cur = agg.get(sector) ?? { slots: 0, names: 0 }
    cur.slots += p.slots
    cur.names += 1
    agg.set(sector, cur)
  }
  const rows: SectorExposureRow[] = []
  for (const [sector, v] of agg) {
    const weight = v.slots / totalSlots
    rows.push({
      sector,
      weight: round2(weight),
      names: v.names,
      cap: TH_MAX_SECTOR_WEIGHT,
      breached: weight > TH_MAX_SECTOR_WEIGHT + EPS,
    })
  }
  rows.sort((a, b) => b.weight - a.weight)
  return rows
}

export function computeGroupExposure(
  positions: { symbol: string; slots: number }[],
  sectorMap: Map<string, string>
): GroupExposureRow[] {
  const totalSlots = positions.reduce((a, p) => a + p.slots, 0)
  if (positions.length === 0 || !(totalSlots > 0)) return []
  const agg = new Map<string, { slots: number; sectors: Set<string> }>()
  for (const p of positions) {
    const sector = sectorOf(sectorMap, p.symbol)
    const group = groupOf(sector)
    if (!group) continue // เฉพาะ sector ที่สังกัดกลุ่มใหญ่
    const cur = agg.get(group) ?? { slots: 0, sectors: new Set<string>() }
    cur.slots += p.slots
    cur.sectors.add(sector)
    agg.set(group, cur)
  }
  const rows: GroupExposureRow[] = []
  for (const [group, v] of agg) {
    const cap = TH_GROUP_MAX_WEIGHT[group] ?? 1
    const weight = v.slots / totalSlots
    rows.push({
      group,
      sectors: [...v.sectors],
      weight: round2(weight),
      cap,
      breached: weight > cap + EPS,
    })
  }
  rows.sort((a, b) => b.weight - a.weight)
  return rows
}

// ---------- admission constraints (planning view, งบ = maxPos slots) ----------

export interface SectorSlotItem {
  symbol: string
  slots: number
}
export interface SectorDownsized extends SectorSlotItem {
  reason: string
}
export interface SectorRejected {
  symbol: string
  reason: string
}
export interface SectorConstraintResult {
  accepted: SectorSlotItem[]
  downsized: SectorDownsized[]
  rejected: SectorRejected[]
  sectorExposure: SectorExposureRow[]
  groupExposure: GroupExposureRow[]
}
export interface SectorConstraintOptions {
  // เพดาน slots รวมของรอบนี้ (เช่น slotBudget จาก composite regime × calendar) — clamp [0, maxPos]
  // น้ำหนัก sector/กลุ่มยังคิดเทียบงบเต็ม maxPos เหมือนเดิม (ไม่ระบุ = maxPos)
  maxSlots?: number
}

const SLOT_GRID = 0.25 // ลดขนาดลงกริด 0.25 slot
const MIN_ACCEPT = 0.25 // รับเข้าได้ต่อเมื่อขนาดสุดท้าย ≥ 0.25 slot
const MIN_DOWNSIZE = 0.5 // ลดขนาด (sector/group) แล้วต้องเหลือ ≥ 0.5 ไม่งั้นตัด
const pct = (cap: number): string => `${Math.round(cap * 100)}%`
const fmtSlots = (s: number): string => `${round2(s)}`
// floor ลงกริด 0.25 (epsilon-nudge กัน float noise เช่น 7*0.3−1.6 = 0.4999…96 ต้องได้ 0.5)
function floorGrid(x: number): number {
  return Math.max(0, Math.floor(x * 4 + 1e-6) / 4)
}

export function applySectorConstraints(
  candidates: SectorSlotItem[],
  existingPositions: SectorSlotItem[],
  sectorMap: Map<string, string>,
  opts: SectorConstraintOptions = {}
): SectorConstraintResult {
  const budget = Math.max(1, TH_STRATEGY.maxPos) // งบ slots รวมของพอร์ต (maxPos = 7)
  // เพดาน slots รวมจริงของรอบ (พื้นที่พอร์ต) — ไม่เกินงบเต็ม
  const slotCap =
    opts.maxSlots !== undefined && Number.isFinite(opts.maxSlots)
      ? Math.min(budget, Math.max(0, opts.maxSlots))
      : budget

  // สถานะจำลอง: เริ่มจากพอร์ตเดิม แล้วรับ candidate ทีละตัวตามลำดับที่ให้มา
  const slotsBySymbol = new Map<string, number>()
  const slotsBySector = new Map<string, number>()
  const namesBySector = new Map<string, Set<string>>()
  const slotsByGroup = new Map<string, number>()
  let usedSlots = 0

  const register = (symbol: string, slots: number) => {
    const sector = sectorOf(sectorMap, symbol)
    slotsBySymbol.set(symbol, (slotsBySymbol.get(symbol) ?? 0) + slots)
    slotsBySector.set(sector, (slotsBySector.get(sector) ?? 0) + slots)
    if (!namesBySector.has(sector)) namesBySector.set(sector, new Set())
    namesBySector.get(sector)!.add(symbol)
    const group = groupOf(sector)
    if (group) slotsByGroup.set(group, (slotsByGroup.get(group) ?? 0) + slots)
    usedSlots += slots
  }
  for (const p of existingPositions) register(p.symbol, p.slots)

  const accepted: SectorSlotItem[] = []
  const downsized: SectorDownsized[] = []
  const rejected: SectorRejected[] = []

  for (const cand of candidates) {
    const want = round2(cand.slots)
    const sector = sectorOf(sectorMap, cand.symbol)
    const group = groupOf(sector)

    // ขนาดที่ขอมาไม่ถูกต้อง (NaN/≤0) → ตัด (กัน NaN ลามเข้า usedSlots แล้วทุกตัวถัดไปผ่านหมด)
    if (!Number.isFinite(want) || want <= 0) {
      rejected.push({ symbol: cand.symbol, reason: `${cand.symbol} ถูกตัด — ขนาดไม่ถูกต้อง` })
      continue
    }

    // 0) ไม่ทราบ sector + เปิดโหมด hard reject → ตัด
    if (sector === "Unknown" && TH_HARD_REJECT_UNKNOWN) {
      rejected.push({ symbol: cand.symbol, reason: `${cand.symbol} ถูกตัด — ไม่ทราบ sector` })
      continue
    }

    // Layer 1: จำนวนชื่อต่อ sector ≤ 3 (นับจาก existing + ที่รับเข้าแล้วในรอบนี้)
    const names = namesBySector.get(sector)?.size ?? 0
    if (names >= TH_MAX_NAMES_PER_SECTOR) {
      rejected.push({
        symbol: cand.symbol,
        reason: `${cand.symbol} (${sector}) ถูกตัด — เต็มจำนวนชื่อแล้ว (${names})`,
      })
      continue
    }

    // พื้นที่พอร์ตคงเหลือ (เทียบเพดาน slots ของรอบ) — เหลือ ≤ 0.25 slot = เต็ม, ไม่งั้นจำกัดที่พื้นที่ที่เหลือ
    const remaining = slotCap - usedSlots
    if (remaining <= SLOT_GRID + EPS) {
      rejected.push({ symbol: cand.symbol, reason: `${cand.symbol} ถูกตัด — พื้นที่พอร์ตเต็ม` })
      continue
    }
    let s = Math.min(want, remaining)
    // ถูกจำกัดด้วยพื้นที่ที่เหลือ = ลดขนาด (รายงานใน downsized พร้อมเหตุผล ไม่ปนกับ accepted เต็มขนาด)
    let downReason: string | null =
      s < want - EPS
        ? `${cand.symbol} (${sector}) ลดขนาดเหลือ ${fmtSlots(s)} slots — พื้นที่พอร์ตเหลือ ${fmtSlots(remaining)} slots`
        : null

    // Layer 2: น้ำหนัก sector เดี่ยว ≤ 30% — ลดขนาดลงกริด 0.25 ก่อนตัด
    const secSlots = slotsBySector.get(sector) ?? 0
    if ((secSlots + s) / budget > TH_MAX_SECTOR_WEIGHT + EPS) {
      const sFit = floorGrid(budget * TH_MAX_SECTOR_WEIGHT - secSlots)
      if (sFit < MIN_DOWNSIZE - EPS) {
        rejected.push({
          symbol: cand.symbol,
          reason: `${cand.symbol} (${sector}) ถูกตัด — sector ${sector} เต็มน้ำหนัก (${pct(TH_MAX_SECTOR_WEIGHT)})`,
        })
        continue
      }
      s = sFit
      downReason = `${cand.symbol} (${sector}) ลดขนาดเหลือ ${fmtSlots(s)} slots — sector ${sector} จะเกิน ${pct(TH_MAX_SECTOR_WEIGHT)}`
    }

    // Layer 3: น้ำหนักกลุ่ม ≤ cap กลุ่ม (Financials 35% / Tech 40% / ...) — ลดขนาดก่อนตัด
    if (group) {
      const gCap = TH_GROUP_MAX_WEIGHT[group] ?? 1
      const gSlots = slotsByGroup.get(group) ?? 0
      if ((gSlots + s) / budget > gCap + EPS) {
        const sFit = floorGrid(budget * gCap - gSlots)
        if (sFit < MIN_DOWNSIZE - EPS) {
          rejected.push({
            symbol: cand.symbol,
            reason: `${cand.symbol} (${sector}) ถูกตัด — กลุ่ม ${group}>${pct(gCap)}`,
          })
          continue
        }
        s = sFit
        downReason = `${cand.symbol} (${sector}) ลดขนาดเหลือ ${fmtSlots(s)} slots — กลุ่ม ${group} จะเกิน ${pct(gCap)}`
      }
    }

    // รับเข้าพอร์ต — ปัด 2 ตำแหน่ง, ต่ำกว่า 0.25 ไม่รับ
    // (ถึงจุดนี้ remaining > 0.25 และ sFit ≥ 0.5 เสมอ → ต่ำกว่า 0.25 ได้เฉพาะเมื่อขนาดที่ขอมาเล็กเกิน)
    const sFinal = round2(s)
    if (sFinal < MIN_ACCEPT - EPS) {
      rejected.push({
        symbol: cand.symbol,
        reason:
          want < MIN_ACCEPT - EPS
            ? `${cand.symbol} ถูกตัด — ขนาด ${fmtSlots(want)} slots ต่ำกว่าขั้นต่ำ ${MIN_ACCEPT} slots`
            : `${cand.symbol} ถูกตัด — พื้นที่พอร์ตเต็ม`,
      })
      continue
    }
    register(cand.symbol, sFinal)
    if (downReason) downsized.push({ symbol: cand.symbol, slots: sFinal, reason: downReason })
    else accepted.push({ symbol: cand.symbol, slots: sFinal })
  }

  // exposure จากสถานะสุดท้าย (existing + ที่รับเข้ารอบนี้) — มุมมองบรรยาย
  const finalPositions = [...slotsBySymbol.entries()].map(([symbol, slots]) => ({ symbol, slots }))
  return {
    accepted,
    downsized,
    rejected,
    sectorExposure: computeSectorExposure(finalPositions, sectorMap),
    groupExposure: computeGroupExposure(finalPositions, sectorMap),
  }
}
