// ============================================================
// Shadow Lab — shared types (State Packet + Gates)
//
// State Packet = สัญญาสื่อสารเดียวระหว่าง "กฎ" (rule engine) กับ "Nimble" (LLM)
// ทุกฝ่ายตัดสินจาก packet ชุดเดียวกัน → วัดความเห็นแตกต่างได้อย่างยุติธรรม
// และ replay ย้อนหลังจาก stateJson ใน ShadowLog ได้เป๊ะ
// ============================================================

export interface StatePacket {
  asset: string
  tf: '1D'
  date?: string
  regime: { pass: boolean; fresh_cross: boolean; close_vs_200dma: number; slope_20d: number; index_ok: boolean }
  selection: { rs_pct: number; eps_yoy: number; catalyst_days: number | null }
  level: { type: string; zone: [number, number]; status: 'active' | 'frozen' | 'missed'; dist_pct: number; marked?: string; frozen_closes?: number }
  trigger: { candle_closed: boolean; pattern: 'T1' | 'T2' | 'T3' | null; in_zone: boolean; wick_ratio: number; close_pos_in_range: number }
  risk: { entry: number; stop: number; stop_dist_pct: number; rr_to_next_supply: number; size_R: number; tradeable: boolean }
  context: { day_pnl_R: number; week_pnl_R: number; loss_streak: number }
  edge_case_note?: string
}

// THE CORE 5 gates — 1 = ผ่าน, 0 = ไม่ผ่าน
export type Gates = { regime: number; selection: number; level: number; trigger: number; risk: number }

export const GATE_NAMES: (keyof Gates)[] = ['regime', 'selection', 'level', 'trigger', 'risk']
