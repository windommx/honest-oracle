// ============================================================
// Shadow Lab — synthetic state generator (THE CORE State Packet)
// หมายเหตุ: ไม่ใช่ port ของ lab/synth_state.py (ตัวนั้นสร้าง state OHLC ของครู S1–R6.1 คนละ schema/edge case)
//
// ตัวสร้างสถานการณ์จำลองแบบ deterministic: PRNG แบบ mulberry32 (seed เดิม →
// state เดิมเสมอ) ใช้ทั้งเติมแล็บเมื่อ panel ยังมีไม่พอ และใช้เป็นชุดทดสอบ
// มาตรฐาน (g1/g5) ของ eval harness — seed 123 / 789 จึงเป็นชุดอ้างอิงถาวร
// ============================================================

import type { StatePacket } from './state'

// ---------------- PRNG: mulberry32 (deterministic ต่อ seed) ----------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Rng = () => number

// uniform [lo, hi)
function rr(rng: Rng, lo: number, hi: number): number {
  return lo + rng() * (hi - lo)
}

function round(x: number, d = 4): number {
  const m = Math.pow(10, d)
  return Math.round(x * m) / m
}

// ---------------- ค่าคงที่ตามต้นฉบับ ----------------
export const SYNTH_ASSETS = ['AOT', 'PTT', 'KTB', 'CPALL', 'DELTA', 'STA', 'JMART'] as const

// edge_case_types 10 แบบ + น้ำหนัก (โอกาสถูกจับ) ตาม weight map ของต้นฉบับ
export const EDGE_CASE_TYPES = [
  'gap_through_zone',
  'near_miss_trigger',
  'weak_trigger',
  'regime_fresh_cross',
  'regime_slope_flat',
  'stop_too_wide',
  'rr_too_low',
  'loss_streak_active',
  'spoof_zone',
  'news_day_high_vol',
] as const

export type EdgeCaseType = (typeof EDGE_CASE_TYPES)[number]

export const EDGE_CASE_WEIGHTS: Record<EdgeCaseType, number> = {
  gap_through_zone: 1.5,
  near_miss_trigger: 1.5,
  weak_trigger: 2.0,
  regime_fresh_cross: 1.5,
  regime_slope_flat: 1.0,
  stop_too_wide: 1.0,
  rr_too_low: 1.0,
  loss_streak_active: 1.5,
  spoof_zone: 1.0,
  news_day_high_vol: 1.0,
}

const EDGE_CASE_TOTAL_W = EDGE_CASE_TYPES.reduce((a, t) => a + EDGE_CASE_WEIGHTS[t], 0)

// โอกาสที่ state หนึ่งเป็น edge case = 30%
export const EDGE_CASE_P = 0.3

const LEVEL_TYPES = ['pullback', 'breakout', 'base', 'vcp'] as const
const PATTERNS: ('T1' | 'T2' | 'T3' | null)[] = ['T1', 'T1', 'T2', 'T2', 'T3', null, null] // ~29% null

// วันที่ล่าสุดย้อนหลัง 0..90 วัน (YYYY-MM-DD ตรง ๆ ตามต้นฉบับ — ไม่กรองวันทำการ)
function recentDate(rng: Rng): string {
  const offsetDays = Math.floor(rng() * 91)
  return new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10)
}

// ---------------- สถานะ "สุขภาพดี" ฐาน (ก่อนใส่ edge case) ----------------
function baseState(rng: Rng): StatePacket {
  const asset = SYNTH_ASSETS[Math.floor(rng() * SYNTH_ASSETS.length)]
  const px = round(rr(rng, 20, 300), 2)

  const regimePass = rng() < 0.85
  const freshCross = regimePass && rng() < 0.2
  const closeVs200 = regimePass ? rr(rng, 1.0, 1.3) : rr(rng, 0.85, 0.995)
  const slope = regimePass ? rr(rng, 0.005, 0.06) : rr(rng, -0.02, 0.004)
  const indexOk = rng() < 0.9

  const rsPct = rr(rng, 72, 99)
  const epsYoy = rr(rng, 0.05, 0.85)
  const catalystDays = rng() < 0.3 ? null : Math.round(rr(rng, 5, 150))

  const zoneLo = round(px * 0.99, 2)
  const zoneHi = round(px * 1.01, 2)
  const levelStatus: StatePacket['level']['status'] =
    rng() < 0.93 ? 'active' : rng() < 0.5 ? 'frozen' : 'missed'

  const pattern = PATTERNS[Math.floor(rng() * PATTERNS.length)]
  const inZone = rng() < 0.85
  const wick = rr(rng, 0.6, 3.2)
  const closePos = rr(rng, 0.05, 0.98)

  const stopDist = rr(rng, 3, 8)
  const entry = round(px * 1.002, 2)
  const stop = round(entry * (1 - stopDist / 100), 2)
  const rrv = rr(rng, 2, 5)

  return {
    asset,
    tf: '1D',
    date: recentDate(rng),
    regime: {
      pass: regimePass && indexOk,
      fresh_cross: freshCross,
      close_vs_200dma: round(closeVs200),
      slope_20d: round(slope),
      index_ok: indexOk,
    },
    selection: {
      rs_pct: round(rsPct, 2),
      eps_yoy: round(epsYoy, 3),
      catalyst_days: catalystDays,
    },
    level: {
      type: LEVEL_TYPES[Math.floor(rng() * LEVEL_TYPES.length)],
      zone: [zoneLo, zoneHi],
      status: levelStatus,
      dist_pct: round(rr(rng, 0, 3), 2),
    },
    trigger: {
      candle_closed: true,
      pattern,
      in_zone: inZone,
      wick_ratio: round(wick, 2),
      close_pos_in_range: round(closePos, 3),
    },
    risk: {
      entry,
      stop,
      stop_dist_pct: round(stopDist, 2),
      rr_to_next_supply: round(rrv, 2),
      size_R: freshCross ? 0.5 : 1.0,
      tradeable: stopDist <= 8 && rrv >= 2,
    },
    context: {
      day_pnl_R: round(rr(rng, -1.5, 0.8), 2),
      week_pnl_R: round(rr(rng, -3, 2.5), 2),
      loss_streak: Math.floor(rng() * 3),
    },
  }
}

// ---------------- edge cases: ดัดแปลง state ฐานให้ "ขอบ" แบบเจาะจง ----------------
function applyEdgeCase(s: StatePacket, rng: Rng, kind: EdgeCaseType): void {
  switch (kind) {
    // ราคา gap ทะลุโซนไปแล้ว → trigger ไม่อยู่ในโซน (G4 ตาย)
    case 'gap_through_zone': {
      s.trigger.in_zone = false
      s.trigger.pattern = null
      s.level.dist_pct = round(rr(rng, 4, 10), 2)
      s.edge_case_note = 'gap_through_zone: ราคา gap ทะลุโซน — trigger ไม่อยู่ในโซน'
      break
    }
    // เกือบเข้า trigger แต่ไม่มีแท่งนิยาม (ทุกอย่างอื่นเขียว) → G4 ตาย
    case 'near_miss_trigger': {
      s.trigger.pattern = null
      s.trigger.in_zone = true
      s.edge_case_note = 'near_miss_trigger: โครงสร้างดีแต่ยังไม่มีแท่ง trigger'
      break
    }
    // trigger อ่อน (ไส้สั้น ปิดกลางแท่ง) — กฎผ่าน แต่คุณภาพแท่งต่ำ
    case 'weak_trigger': {
      s.trigger.pattern = 'T2'
      s.trigger.in_zone = true
      s.trigger.wick_ratio = round(rr(rng, 0.5, 0.9), 2)
      s.trigger.close_pos_in_range = round(rr(rng, 0.3, 0.5), 3)
      s.edge_case_note = 'weak_trigger: แท่ง trigger อ่อน — ไส้สั้น/ปิดไม่สว่าง'
      break
    }
    // เพิ่งตัดขึ้นเหนือ 200dma เฉียด ๆ — กฎผ่านแต่เขตแดน regime
    case 'regime_fresh_cross': {
      s.regime.pass = true
      s.regime.index_ok = true
      s.regime.fresh_cross = true
      s.regime.close_vs_200dma = round(rr(rng, 1.0, 1.02), 4)
      s.regime.slope_20d = round(rr(rng, 0.003, 0.015), 4)
      s.risk.size_R = 0.5
      s.edge_case_note = 'regime_fresh_cross: เพิ่งตัดขึ้นเฉียดเส้น — regime เขตแดน'
      break
    }
    // slope แบนราบ — regime ไม่ผ่าน (G1 ตาย)
    case 'regime_slope_flat': {
      s.regime.slope_20d = round(rr(rng, -0.002, 0.002), 4)
      s.regime.pass = false
      s.edge_case_note = 'regime_slope_flat: slope 200dma แบน — regime ไม่ผ่าน'
      break
    }
    // stop กว้างเกิน 8% → tradeable=false (G5 ตาย)
    case 'stop_too_wide': {
      const dist = round(rr(rng, 8.5, 12), 2)
      s.risk.stop_dist_pct = dist
      s.risk.stop = round(s.risk.entry * (1 - dist / 100), 2)
      s.risk.tradeable = false
      s.edge_case_note = 'stop_too_wide: ระยะ stop เกิน 8% — ความเสี่ยงต่อไม่คุ้ม'
      break
    }
    // RR ต่ำกว่า 2 → tradeable=false (G5 ตาย)
    case 'rr_too_low': {
      const rrv = round(rr(rng, 1.0, 1.8), 2)
      s.risk.rr_to_next_supply = rrv
      s.risk.tradeable = false
      s.edge_case_note = 'rr_too_low: RR ถึง supply ต่ำกว่า 2'
      break
    }
    // ติด circuit breaker: วันนี้เสีย ≥2R + สายเสียต่อเนื่อง
    case 'loss_streak_active': {
      s.context.loss_streak = Math.round(rr(rng, 3, 5))
      s.context.day_pnl_R = round(rr(rng, -2.8, -2.05), 2)
      s.context.week_pnl_R = round(rr(rng, -4, -2.5), 2)
      s.edge_case_note = 'loss_streak_active: day_pnl_R ≤ -2 — breaker ตัดทุกอย่าง'
      break
    }
    // โซน spoof: เพิ่ง mark วันนี้ โซนบางมาก — กฎผ่าน แต่น่าระแวง
    case 'spoof_zone': {
      s.level.marked = s.date ?? recentDate(rng)
      s.level.dist_pct = round(rr(rng, 0, 0.6), 2)
      s.level.status = 'active'
      s.trigger.in_zone = true
      s.trigger.pattern = s.trigger.pattern ?? 'T1'
      s.edge_case_note = 'spoof_zone: โซนเพิ่ง mark วันนี้ + บางมาก — ระวังโซนปลอม'
      break
    }
    // วันข่าวแรง: catalyst วันนี้ + ไส้ยาวผิดปกติ — กฎผ่าน แต่ volatility สูง
    case 'news_day_high_vol': {
      s.selection.catalyst_days = 0
      s.trigger.wick_ratio = round(rr(rng, 2.8, 3.5), 2)
      s.trigger.pattern = s.trigger.pattern ?? 'T1'
      s.risk.stop_dist_pct = round(rr(rng, 6.5, 7.9), 2)
      s.edge_case_note = 'news_day_high_vol: วันข่าว + ไส้ยาว — ความผันผวนสูงผิดปกติ'
      break
    }
  }
}

// ---------------- API หลัก ----------------

// สร้าง state จำลอง 1 ตัวจาก rng (เรียกซ้ำเรื่อย ๆ เพื่อลำดับที่ต่อเนื่อง)
export function synthState(rng: Rng): StatePacket {
  const s = baseState(rng)
  if (rng() < EDGE_CASE_P) {
    // เลือก edge case แบบ weighted ตาม weight map
    let pick = rng() * EDGE_CASE_TOTAL_W
    for (const t of EDGE_CASE_TYPES) {
      pick -= EDGE_CASE_WEIGHTS[t]
      if (pick <= 0) {
        applyEdgeCase(s, rng, t)
        break
      }
    }
  }
  return s
}

// สร้างชุด n states จาก seed เดียว (deterministic — seed เดิมได้ชุดเดิมเสมอ)
export function generateBatch(n: number, seed: number): StatePacket[] {
  const rng = mulberry32(seed)
  const out: StatePacket[] = []
  for (let i = 0; i < n; i++) out.push(synthState(rng))
  return out
}
