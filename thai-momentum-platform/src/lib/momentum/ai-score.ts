// ============================================================
// AI-Score Engine — เรดาร์ %CMPR (Volume พุ่ง) + คะแนน 4 องค์ประกอบ
//
// AI-Score = Cmpr + PerC12-30 + Trend + Heikin-Score
// คาลิเบรตกับระบบอ้างอิง (การ์ดตัวอย่าง):
//   FTREIT 1255.02% → +3.0 | 1.27% → +1.0 | แนวโน้มขึ้น → +1.0 | HA 3-6 แท่ง → +2.0 = 7.00
//   THAI    506.12% → +2.0 | -0.01% → -0.5 | แนวโน้มขึ้น → +1.0 | HA >7 แท่ง → +3.5 = 6.00
//   RCL     421.32% → +2.0 |  4.03% → +2.0 | ขึ้นแรง(สุดเกณฑ์) → 0.0 | HA 3-6 แท่ง → +2.0 = 6.00
//   TTB     168.01% → +1.0 |  2.13% → +2.0 | Sideway UP → +1.5 | HA >7 แท่ง → +3.5 = 8.00
//
// ข้อจำกัดข้อมูล: RawDaily เก็บเฉพาะ close + val (มูลค่า บาท)
//   - Volume (หุ้น) ประมาณจาก val ÷ close (สอดคล้อง ingest history: val = close × volume)
//   - Heikin Ashi ใช้ pseudo-HA จากราคา close (HA close ≈ close, HA open = ค่าเฉลี่ยเลื่อนของ HA ก่อนหน้า)
//   - Trend เป็น rule-based (ต้นแบบเดิมใช้ Gemini จำแนก — เราใช้เกณฑ์ EMA/slope ให้ reproducible)
// ============================================================

import type { AiScoreRow, AiTrendLabel } from "@/lib/momentum/contracts"

// ---------------- เกณฑ์คะแนน (config เดียว ให้ UI อ้างถึงได้) ----------------

// Cmpr score: จาก %CMPR (volume วันนี้ vs เฉลี่ย 5 วันก่อนหน้า)
export const CMPR_TIERS: { min: number; score: number }[] = [
  { min: 700, score: 3.0 },
  { min: 250, score: 2.0 },
  { min: 150, score: 1.0 },
  { min: 100, score: 0.0 },
  { min: -Infinity, score: -1.0 },
]

// PerC score: จาก %Diff EMA12-30
export function scoreCmpr(cmprPct: number): number {
  for (const t of CMPR_TIERS) if (cmprPct >= t.min) return t.score
  return -1.0
}

export function scorePerc(p: number): number {
  if (p >= 2.0) return 2.0
  if (p >= 0.5) return 1.0
  if (p > 0) return 0.5
  if (p === 0) return 0.0
  if (p > -0.5) return -0.5
  if (p > -1.5) return -1.0
  if (p > -3.0) return -2.0
  return -2.5
}

// Trend score: ระบบอ้างอิงให้ "ขึ้นแรง" = 0.0 (ยืดตัวสุดเกณฑ์ — ช้าเกินไปที่จะตาม)
export const TREND_SCORE: Record<AiTrendLabel, number> = {
  "แนวโน้มขึ้นแรง": 0.0,
  "แนวโน้มขึ้น": 1.0,
  "Sideway UP": 1.5,
  "Sideway DOWN": 0.5,
  "แนวโน้มลง": -1.0,
  "แนวโน้มลงแรง": -2.5,
}

// ---------------- ตัวช่วยทางเทคนิค ----------------

export function emaSeries(values: number[], period: number): number[] {
  const out: number[] = []
  const alpha = 2 / (period + 1)
  let prev = values[0] ?? 0
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : alpha * values[i] + (1 - alpha) * prev
    out.push(prev)
  }
  return out
}

export interface HeikinInfo {
  score: number
  streak: number
  dir: "up" | "down" | "flat"
  bullCount: number
  desc: string
}

// Pseudo Heikin Ashi จาก close-only:
//   HA_close[i] ≈ close[i], HA_open[i] = (HA_open[i-1] + HA_close[i-1]) / 2
// ทิศแท่ง = sign(HA_close − HA_open) — เป็น momentum แบบเรียบ (สอดคล้องแนวคิด HA เมื่อไม่มี OHLC)
export function heikinFromClose(closes: number[], window = 10): HeikinInfo {
  const n = closes.length
  const seg = closes.slice(Math.max(0, n - (window + 25))) // เผื่อหาง warm-up ของ HA open
  const dirs: ("up" | "down" | "flat")[] = []
  let haOpen = seg[0] ?? 0
  let haClose = seg[0] ?? 0
  for (let i = 0; i < seg.length; i++) {
    haClose = seg[i]
    const dir = haClose > haOpen ? "up" : haClose < haOpen ? "down" : "flat"
    if (i >= Math.max(0, seg.length - window)) dirs.push(dir)
    haOpen = (haOpen + haClose) / 2
  }
  const bullCount = dirs.filter((d) => d === "up").length
  // streak ปัจจุบัน (นับจากแท่งล่าสุดย้อนหลัง)
  let streak = 0
  const lastDir = dirs[dirs.length - 1] ?? "flat"
  if (lastDir !== "flat") {
    for (let i = dirs.length - 1; i >= 0 && dirs[i] === lastDir; i--) streak++
  }
  const dir = lastDir
  let score = 0.0
  let desc = "Heikin Ashi สลับตัว ไม่มีทิศทางชัดเจนใน 10 แท่ง"
  if (dir === "up" && streak >= 7) {
    score = 3.5
    desc = "Heikin Ashi แท่งขาขึ้นต่อเนื่องมากกว่า 7 แท่ง"
  } else if (dir === "up" && streak >= 3) {
    score = 2.0
    desc = `Heikin Ashi แท่งขาขึ้นต่อเนื่อง ${streak} แท่ง (3–6 แท่ง)`
  } else if (dir === "down" && streak >= 7) {
    score = -3.5
    desc = "Heikin Ashi แท่งขาลงต่อเนื่องมากกว่า 7 แท่ง"
  } else if (dir === "down" && streak >= 3) {
    score = -2.0
    desc = `Heikin Ashi แท่งขาลงต่อเนื่อง ${streak} แท่ง (3–6 แท่ง)`
  }
  return { score, streak, dir, bullCount, desc }
}

// ---------------- จำแนกแนวโน้ม (rule-based แทน Gemini — 6 label เดียวกัน) ----------------
// g  = %Diff EMA12-30
// s5 = ความชัน EMA12 5 วัน (%)
// above = ราคายืนเหนือ EMA30
export function classifyTrend(g: number, s5: number, above: boolean): AiTrendLabel {
  if (g >= 4 && above) return "แนวโน้มขึ้นแรง" // ยืดตัวไกลจากค่าเฉลี่ย — สุดเกณฑ์
  if (g <= -4 || (!above && g <= -2.5)) return "แนวโน้มลงแรง"
  if (g >= 1.2 || (g >= -0.6 && s5 >= 2.5) || (g >= 0.4 && s5 >= 1.5)) return "แนวโน้มขึ้น"
  if (g <= -1.2 || (g <= 0.6 && s5 <= -2.5) || (g <= -0.4 && s5 <= -1.5)) return "แนวโน้มลง"
  if (g >= -0.3) return "Sideway UP"
  return "Sideway DOWN"
}

// ---------------- บรรทัดตีความ (note) ----------------
function buildNote(perc: number, dir: "up" | "down" | "flat", streak: number): string {
  if (perc >= 3)
    return "แนวเทียบ/EMA: ราคาแพงกว่าค่าเฉลี่ยมาก — ระยะแนวเทียบ 10–15 วันถือเป็นแนวโน้มเบื้องต้นที่มีนัยสำคัญ ระวังภาวะยืดตัวจนเกินไป"
  if (perc >= 0.5)
    return "แนวเทียบ/EMA: แนวโน้มขึ้นสม่ำเสมอ แต่เฉลี่ย 3–4 แท่งผ่านมามีการย่อบ้าง — หากราคายืนเหนือ EMA12 ได้ แนวโน้มยังไม่เปลี่ยน"
  if (perc >= -0.5)
    return dir === "up"
      ? "แนวเทียบ/EMA: ราคาอยู่รอบค่าเฉลี่ยและเริ่มดีดตัว — ต้องดูว่าฝ่ายแนวต้าน EMA12 ได้จริงหรือไม่ในช่วงนี้"
      : "แนวเทียบ/EMA: ราคาแฟลตรอบค่าเฉลี่ย — หากแนวโน้มพยายามดีดในช่วงนี้ ให้ดูแนวต้าน EMA12 เป็นจุดตัดสิน"
  return streak >= 3 && dir === "down"
    ? "แนวเทียบ/EMA: แนวโน้มลงมา 3–5 แท่งต่อเนื่อง — หากแนวโน้มพยายามดีดในช่วงนี้ ต้องดูแนวต้าน EMA12/EMA30 ก่อนเป็นหลัก"
    : "แนวเทียบ/EMA: ราคาอยู่ใต้ค่าเฉลี่ย — ยังไม่มีสัญญาณกลับตัวที่ชัดเจน ให้รอการยืนเหนือ EMA12 ก่อน"
}

// ---------------- คำนวณต่อหุ้น ----------------
export interface AiSymbolInput {
  symbol: string
  closes: number[] // เรียงเก่า → ใหม่ (แนะนำ ≥ 40 แท่ง)
  vals: number[] // มูลค่าซื้อขาย (บาท) เรียงเก่า → ใหม่ ขนาดเท่า closes
}

export function computeAiScore(input: AiSymbolInput): AiScoreRow | null {
  const { symbol } = input
  const closes = input.closes
  const vals = input.vals
  const n = closes.length
  if (n < 36) return null // EMA30 ยังไม่นิ่งพอ

  const last = closes[n - 1]
  if (!(last > 0)) return null

  // volume ประมาณจาก มูลค่า ÷ ราคา
  const vols: number[] = []
  for (let i = 0; i < n; i++) {
    const c = closes[i]
    vols.push(c > 0 ? vals[i] / c : 0)
  }
  const win5 = vols.slice(Math.max(0, n - 6), n - 1) // 5 วันก่อนหน้า (ไม่รวมวันนี้)
  const avgVol5D = win5.reduce((a, b) => a + b, 0) / (win5.length || 1)
  const volToday = vols[n - 1]
  if (!(avgVol5D > 0) || !(volToday > 0)) return null
  const cmprPct = (volToday / avgVol5D) * 100

  const e12 = emaSeries(closes, 12)
  const e30 = emaSeries(closes, 30)
  const ema12 = e12[n - 1]
  const ema30 = e30[n - 1]
  const perc = ema30 > 0 ? ((ema12 - ema30) / ema30) * 100 : 0
  const s5 = e12[n - 6] > 0 ? (ema12 / e12[n - 6] - 1) * 100 : 0
  const above = last > ema30

  const trendLabel = classifyTrend(perc, s5, above)
  const trendScore = TREND_SCORE[trendLabel]
  const hk = heikinFromClose(closes, 10)

  const pCmpr = scoreCmpr(cmprPct)
  const pPerc = scorePerc(perc)
  const aiScore = pCmpr + pPerc + trendScore + hk.score

  return {
    rank: 0,
    symbol,
    last: Math.round(last * 100) / 100,
    volToday: Math.round(volToday),
    avgVol5D: Math.round(avgVol5D),
    cmprPct: Math.round(cmprPct * 100) / 100,
    ema12: Math.round(ema12 * 100) / 100,
    ema30: Math.round(ema30 * 100) / 100,
    perc: Math.round(perc * 100) / 100,
    trend: { label: trendLabel, score: trendScore },
    heikin: {
      score: hk.score,
      streak: hk.streak,
      dir: hk.dir,
      bullCount: hk.bullCount,
      desc: hk.desc,
    },
    parts: { cmpr: pCmpr, perc: pPerc, trend: trendScore, heikin: hk.score },
    aiScore: Math.round(aiScore * 100) / 100,
    note: buildNote(perc, hk.dir, hk.streak),
  }
}

// ---------------- ประกอบเรดาร์: เรียงตาม %CMPR แล้วตัด top N ----------------
export function buildAiScoreRadar(inputs: AiSymbolInput[], topN = 30): AiScoreRow[] {
  const rows: AiScoreRow[] = []
  for (const inp of inputs) {
    const r = computeAiScore(inp)
    if (r) rows.push(r)
  }
  rows.sort((a, b) => b.cmprPct - a.cmprPct)
  return rows.slice(0, topN).map((r, i) => ({ ...r, rank: i + 1 }))
}
