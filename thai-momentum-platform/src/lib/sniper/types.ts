// ============================================================
// SET Sniper — แปลง Blueprint "ICT + Order Flow + AI Orchestration"
// เป็นเอนจินบนข้อมูลรายวันของแพลตฟอร์ม (RawDaily + OHLC + มูลค่าซื้อขาย)
//
// แผนที่จากเอกสารต้นทาง → เอนจินนี้:
//   ICT Location (PDH/PDL/Key Levels + Liquidity Sweep + FVG) → structure.ts
//   Value Formation (Volume Profile: POC / Value Area / HVN-LVN) → value.ts
//   Order Flow Behavior (Absorption proxy แบบ effort-vs-result) → flow.ts
//   3-Layer Checklist (Location × Value × Behavior) → confluence.ts
//   Sector Rotation "หาผู้นำก่อนผู้ตาม" → rotation.ts
//   Cross-Asset Lead-Lag (futures เป็นเรดาร์ — เวอร์ชันนี้ใช้ SPX/USDTHB/GOLD) → leadlag.ts
//   Circuit Breaker 3 ระดับ (Caution/Danger/Emergency) → breaker.ts
//
// ความจริงใจเชิงวิศวกรรม (สำคัญ): ข้อมูลของเราเป็นรายวัน — ทุกอย่างที่ต้องใช้
// tick/footprint/DOM จริง (Delta แท้, Iceberg, Ghost Wall, Block Trade window)
// เป็น "proxy" เท่านั้น และถูกติดป้าย DAILY PROXY ไว้เสมอ ไม่มีการอวยผล
// ============================================================

export interface OhlcBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  val: number
}

export interface SniperSeries {
  symbol: string
  sector: string
  bars: OhlcBar[] // เรียงขึ้น ตัดหน้าต่างล่าสุด (≤ 260 แท่ง)
  hasOhlc: boolean // false = CSV ไม่มี open/high/low → เอนจินโครงสร้างปิดตัวแบบ honest
}

export type LevelKind = "PDH" | "PDL" | "H20" | "L20" | "H52W" | "L52W" | "ROUND"

export interface KeyLevel {
  kind: LevelKind
  price: number
  /** (close/price − 1) × 100 — บวก = close อยู่เหนือระดับ */
  gapPct: number
  note: string
}

export interface SweepEvent {
  date: string
  side: "bullish" | "bearish"
  /** ระดับ swing ที่ถูกแทงทะลุ */
  pierced: number
  close: number
  /** ความลึกที่แทงทะลุ % ของระดับ */
  depthPct: number
  /** วอลุ่มวัน sweep เทียบ z-score 20 วัน */
  valZ: number
  /** ผ่านมากี่แท่ง (0 = แท่งล่าสุด) */
  barsAgo: number
}

export interface FvgEvent {
  kind: "bullish" | "bearish"
  from: string
  to: string
  /** โซน gap: [bottom, top] */
  bottom: number
  top: number
  sizePct: number
  /** ราคากลับเข้าโซนแล้วหรือยัง (FVG ที่ยังไม่ถูก mitigate คือ POI) */
  mitigated: boolean
  barsAgo: number
}

export interface ValueProfile {
  poc: number
  valLow: number
  valHigh: number
  closePos: "above_va" | "inside_va" | "below_va"
  hvn: number[]
  lvn: number[]
}

export interface FlowProxy {
  /** effort — วอลุ่มวันล่าสุดเทียบ z-score 20 วัน */
  valZ: number
  /** |close−open| / range — ผลลัพธ์เล็กแต่ effort สูง = มีแรงดูดซับ */
  bodyPct: number
  /** ตำแหน่งปิดในแท่ง 0..1 (ใกล้ 1 = ปิดใกล้ high) */
  closePosBar: number
  absorptionSide: "buy" | "sell" | null
  absorptionScore: number
}

export interface LayerScore {
  score: number
  reasons: string[]
}

export interface ConfluenceRow {
  symbol: string
  sector: string
  close: number
  ret20: number | null
  location: LayerScore | null
  value: LayerScore | null
  behavior: LayerScore
  total: number
  verdict: "high" | "medium" | "low"
  sweep: SweepEvent | null
  fvgs: FvgEvent[]
  levels: KeyLevel[]
  profile: ValueProfile | null
  flow: FlowProxy
}

export interface SectorRow {
  sector: string
  ret20: number
  ret60: number
  valTrendPct: number
  rankNow: number
  rankPrev: number
  leader: boolean
  stocks: number
}

export interface LeadLagRow {
  asset: string
  corr0: number
  bestLag: number
  bestCorr: number
  direction: "leads" | "lags" | "flat"
  note: string
}

export interface BreakerState {
  /** 0 = ปกติ · 1 = Caution · 2 = Danger · 3 = Emergency (ตาม Protocol ในเอกสาร) */
  level: 0 | 1 | 2 | 3
  label: string
  reasons: string[]
  actions: string[]
  metrics: {
    latestDate: string
    mkt1d: number
    mkt5d: number
    /** กำไร/ขาดทุนรวม % ของไม้ที่ปิดล่าสุด (paper Trade log) */
    lastClosedPnlPct: number | null
    lastClosedCount: number
    /** win rate ของ 10 ไม้ที่ปิดล่าสุด */
    winRate10: number | null
    openPositions: number
    dqFlags: number
  }
}

export interface SniperBriefing {
  latestDate: string
  generatedAt: string
  regime: { label: string; score: number } | null
  gtaa: { stance: string; cashPct: number; asOfMonth: string; source: string } | null
  mkt: { ret1d: number; ret5d: number; breadth20: number; note: string }
  rotation: SectorRow[]
  leadlag: LeadLagRow[]
  notes: string[]
}

export interface SniperReport {
  meta: {
    latestDate: string
    generatedAt: string
    watchlistCount: number
    hasOhlcCount: number
    runtimeMs: number
    /** DAILY PROXY — ป้ายความจริงใจประจำโมดูล */
    proxyNotice: string
    notes: string[]
  }
  briefing: SniperBriefing
  breaker: BreakerState
  rotation: SectorRow[]
  leadlag: LeadLagRow[]
  confluence: ConfluenceRow[]
  events: {
    sweeps: (SweepEvent & { symbol: string })[]
    fvgs: (FvgEvent & { symbol: string })[]
  }
}
