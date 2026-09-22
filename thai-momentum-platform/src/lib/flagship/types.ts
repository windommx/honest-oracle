// ============================================================
// FLAGSHIP — สัญญาณเรือธง
//
// คำถามที่โมดูลนี้ตอบ: "สัญญาณตัวไหนน่าเชื่อถือที่สุดวันนี้?"
// คำตอบมาจากการคัดกรองผ่านทุกกระบวนการของแพลตฟอร์ม (6 ด่าน)
// แล้วจัดอันดับ 1–10 ด้วยคะแนน ReliabilityScore ที่ลงทะเบียนน้ำหนักไว้ล่วงหน้า
//
// กติกาความจริงใจ (เช่นเดียวกับทุกโมดูลของแพลตฟอร์ม):
//  - ไม่มีสัญญาณใดการันตีกำไร 100% — สิ่งที่ระบบทำได้คือ "เพิ่มความน่าจะเป็น"
//    ด้วยหลักฐานที่ผ่านการสอบ ไม่ใช่รับประกันผลลัพธ์
//  - ทุกคะแนนต้องแนบเหตุผล — ห้ามเป็นกล่องดำ
//  - ทุกการคัดออกต้องมีบันทึกเหตุผล (veto log)
// ============================================================

export type FlagshipMode = "attack" | "selective" | "defense"
export type SignalTier = "A" | "B" | "C"

/** ผลลัพธ์ต่อด่านของสายพานคัดกรอง (funnel stage) */
export interface FunnelStageResult {
  id: string
  name: string
  desc: string
  /** จำนวนตัวก่อนเข้าด่าน */
  inCount: number
  /** จำนวนตัวที่ผ่านด่าน */
  outCount: number
  /** ตัวที่ถูกคัดออกในด่านนี้ */
  vetoed: number
}

/** ตัวอย่างเหตุผลการคัดออกรายหุ้น */
export interface VetoExample {
  symbol: string
  reason: string
}

export interface VetoStage {
  stage: string
  name: string
  count: number
  examples: VetoExample[]
}

/** รายละเอียด 3 ชั้นของ Confluence (จาก SET Sniper) — ย่อเฉพาะส่วนที่โชว์ */
export interface FlagshipConfluence {
  total: number
  verdict: "high" | "medium" | "low"
  location: number | null
  value: number | null
  behavior: number
  locationReasons: string[]
  valueReasons: string[]
  behaviorReasons: string[]
}

/** คุณภาพเทรนด์จากราคาจริง (SMA 20/50/60) */
export interface FlagshipTrend {
  above20: boolean
  above50: boolean
  above60: boolean
  ret20: number | null
  /** จำนวนข้อที่ผ่านจาก 4 (above20, above50, above60, ret20>0) */
  passed: number
}

export interface RankedSignal {
  rank: number
  symbol: string
  sector: string
  close: number
  /** ReliabilityScore 0–100 */
  score: number
  tier: SignalTier
  /** true = ผ่านครบทุกด่าน (G1–G4) · false = Tier C เฝ้าดู (ยังติดด่านไหนดู gateNote) */
  passedAllGates: boolean
  /** เหตุผลที่ยังไม่ผ่าน (เฉพาะ passedAllGates = false) */
  gateNote: string | null
  /** percentile โมเมนตัมของตลาดวันนี้ (0..1, 1 = แรงสุด) */
  enginePct: number
  confluence: FlagshipConfluence
  trend: FlagshipTrend
  /** Money-Flow Divergence — ติดลบ = เงินไหลเข้า (accumulation) */
  mfd: number
  symVolPct: number
  sectorRank: number
  sectorLeader: boolean
  sweep: { side: "bullish" | "bearish"; barsAgo: number } | null
  /** เหตุผลภาษาไทยว่าเอนจินไหนเห็นพ้องบ้าง */
  agrees: string[]
  /** คะแนนที่ทำได้จริงแยกตามบล็อกน้ำหนัก (engine/confluence/trend/evidence/risk) */
  breakdown: {
    engine: number
    confluence: number
    trend: number
    evidence: number
    risk: number
  }
  evidenceDetail: string[]
}

/** สัญญาณที่ใกล้เข้าโผ (ผ่านโมเมนตัม/กลุ่มแล้ว แต่ Confluence ยังไม่ถึง 45) */
export interface NearMissSignal {
  symbol: string
  sector: string
  close: number
  enginePct: number
  confluenceTotal: number
  score: number
  reason: string
}

export interface FlagshipSystemGate {
  id: "regime" | "gtaa" | "breaker"
  name: string
  status: "open" | "caution" | "closed"
  detail: string
}

export interface FlagshipResponse {
  meta: {
    latestDate: string
    generatedAt: string
    runtimeMs: number
    mode: FlagshipMode
    modeWhy: string
    dataLabel: string
    isSynthetic: boolean
    proxyNotice: string
    honestyNotice: string
    notes: string[]
  }
  gates: FunnelStageResult[]
  system: {
    regime: { action: string; conf: number } | null
    gtaa: { stance: string; cashPct: number; asOfMonth: string } | null
    breaker: { level: number; label: string; reasons: string[] }
    dqFlags: number
    policy: { promoted: string[]; v2: boolean } | null
    systemGates: FlagshipSystemGate[]
  }
  ranked: RankedSignal[]
  nearMiss: NearMissSignal[]
  vetoStages: VetoStage[]
}
