// ============================================================
// Evidence (pure) — ส่วนตัดสินของ scripts/evidence-real.ts
//   - ป้าย REAL/NOT_REAL ของรายงานหลักฐาน: ต้องเป็นข้อมูลจริงล้วนจากแหล่งที่รู้จัก + ประวัติ ≥ 250 วันซื้อขาย
//   - walk-forward แบบ expanding window: เลือก config ที่ Sharpe ดีสุด "เฉพาะช่วง in-sample" แล้ววัดผลช่วงถัดไป
//     (ไม่มีการเห็นอนาคต) + วัด config ที่ลงทะเบียนล่วงหน้าคู่กัน (ไม่ได้เลือกจากผล)
// ============================================================

import type { EvidenceDataLabel } from "@/lib/feed/provenance"

/** ประวัติขั้นต่ำ (วันซื้อขาย ≈ 1 ปี) ก่อนยอมติดป้าย REAL ให้ผลวิจัย */
export const MIN_HISTORY_DAYS = 250

export function evidenceVerdict(input: { dataLabel: EvidenceDataLabel; tradingDays: number; minDays?: number }): {
  realEvidence: boolean
  label: "REAL" | "NOT_REAL"
  reasons: string[]
} {
  const minDays = input.minDays ?? MIN_HISTORY_DAYS
  const reasons: string[] = []
  if (input.dataLabel === "SYNTHETIC") reasons.push("ข้อมูลเป็น SYNTHETIC (demo seed) — หุ้นสมมติ ไม่ใช่ตลาดจริง")
  else if (input.dataLabel === "MIXED") reasons.push("ข้อมูลจริงปนหุ้นจำลอง (ingest หลัง seed โดยไม่ล้าง demo)")
  else if (input.dataLabel === "UNVERIFIED_SOURCE") reasons.push("มีข้อมูลจากแหล่งที่ระบบไม่รู้จักในยุคนี้ (เช่น fixture) — ยืนยันที่มาก่อน")
  else if (input.dataLabel === "NO_DATA") reasons.push("ไม่มีข้อมูลตลาด")
  else if (input.dataLabel === "UNKNOWN") reasons.push("ตรวจที่มาข้อมูลจาก EventLog ไม่ได้")
  if (input.tradingDays < minDays) reasons.push(`ประวัติ ${input.tradingDays} วันซื้อขาย < ${minDays} — สั้นเกินกว่าจะสรุปผล`)
  const realEvidence = reasons.length === 0
  return { realEvidence, label: realEvidence ? "REAL" : "NOT_REAL", reasons }
}

export function annualSharpe(rets: number[]): number | null {
  if (rets.length < 20) return null
  const m = rets.reduce((s, v) => s + v, 0) / rets.length
  const sd = Math.sqrt(rets.reduce((s, v) => s + (v - m) ** 2, 0) / (rets.length - 1))
  // sd ต้องมากกว่าเศษทศนิยม — ผลตอบแทนคงที่ให้ sd ~1e-18 → Sharpe ระดับ 1e16 (เกณฑ์เดียวกับ summarize ของ signals)
  return sd > 1e-12 ? Math.round((m / sd) * Math.sqrt(252) * 100) / 100 : null
}

const compound = (rets: number[]) => rets.reduce((a, r) => a * (1 + r), 1) - 1
const pct = (x: number) => Math.round(x * 10000) / 100
const median = (xs: number[]) => {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100
}

export interface WfFold {
  fold: number
  isFrom: string
  isTo: string
  oosFrom: string
  oosTo: string
  chosen: string
  isSharpe: number | null
  oosSharpe: number | null
  oosReturnPct: number
  benchReturnPct: number
  preregOosSharpe: number | null
  preregOosReturnPct: number | null
}

export interface WfSummary {
  sufficient: boolean
  folds: number
  medianIsSharpe: number | null
  medianOosSharpe: number | null
  /** 1 − median(OOS Sharpe)/median(IS Sharpe) — > 50% = การเลือกพารามิเตอร์ fit อดีต */
  degradationPct: number | null
  pctOosPositive: number | null
  meanOosExcessPct: number | null
  preregMedianOosSharpe: number | null
  verdict: string
}

/**
 * dates = วันที่ของผลตอบแทนรายวัน (ยาวเท่า rets ทุกชุด) · configs = ผลตอบแทนรายวันของแต่ละ config ตลอดช่วง
 * warmup วันแรกไม่ใช้ (สัญญาณยังไม่ครบประวัติ) · ช่วงที่เหลือแบ่ง nFolds ช่วงเท่ากัน: fold f ใช้ [warmup, start_f) เป็น IS
 */
export function walkForward(input: {
  dates: string[]
  configs: { key: string; rets: number[] }[]
  bench: number[]
  preregKey: string | null
  warmup?: number
  nFolds?: number
  minDays?: number
}): { folds: WfFold[]; summary: WfSummary } {
  const R = input.dates.length
  const minDays = input.minDays ?? MIN_HISTORY_DAYS
  const nFolds = input.nFolds ?? 5
  const warmup = Math.min(input.warmup ?? 60, Math.floor(R / 6))
  const size = Math.floor((R - warmup) / nFolds)
  const folds: WfFold[] = []
  if (size >= 20 && input.configs.length > 0) {
    const prereg = input.configs.find((c) => c.key === input.preregKey) ?? null
    for (let f = 1; f < nFolds; f++) {
      const isEnd = warmup + f * size
      const oosEnd = f === nFolds - 1 ? R : isEnd + size
      let best: { key: string; s: number | null; rets: number[] } | null = null
      for (const c of input.configs) {
        const s = annualSharpe(c.rets.slice(warmup, isEnd))
        if (!best || (s ?? -Infinity) > (best.s ?? -Infinity)) best = { key: c.key, s, rets: c.rets }
      }
      if (!best) continue
      const oos = best.rets.slice(isEnd, oosEnd)
      folds.push({
        fold: f,
        isFrom: input.dates[warmup],
        isTo: input.dates[isEnd - 1],
        oosFrom: input.dates[isEnd],
        oosTo: input.dates[oosEnd - 1],
        chosen: best.key,
        isSharpe: best.s,
        oosSharpe: annualSharpe(oos),
        oosReturnPct: pct(compound(oos)),
        benchReturnPct: pct(compound(input.bench.slice(isEnd, oosEnd))),
        preregOosSharpe: prereg ? annualSharpe(prereg.rets.slice(isEnd, oosEnd)) : null,
        preregOosReturnPct: prereg ? pct(compound(prereg.rets.slice(isEnd, oosEnd))) : null,
      })
    }
  }
  const isS = folds.map((f) => f.isSharpe).filter((x): x is number => x !== null)
  const oosS = folds.map((f) => f.oosSharpe).filter((x): x is number => x !== null)
  const medIs = median(isS)
  const medOos = median(oosS)
  const degradation = medIs !== null && medOos !== null && medIs > 0 ? 1 - medOos / medIs : null
  const preregMed = median(folds.map((f) => f.preregOosSharpe).filter((x): x is number => x !== null))
  const sufficient = R >= minDays && folds.length > 0
  let verdict: string
  if (!sufficient) verdict = `ประวัติ ${R} วันซื้อขาย — สั้นเกินไปสำหรับ walk-forward (ต้อง ≥ ${minDays})`
  else if (medOos === null) verdict = "วัด Sharpe นอกตัวอย่างไม่ได้ (ผลตอบแทนคงที่/ไม่มีเทรด)"
  else if (medOos <= 0) verdict = "Sharpe นอกตัวอย่าง (มัธยฐาน) ≤ 0 — ไม่มี edge นอกตัวอย่าง"
  else if (degradation !== null && degradation > 0.5) verdict = `OOS เสื่อม ${Math.round(degradation * 100)}% จาก IS — การเลือกพารามิเตอร์ fit อดีต ให้ใช้ config ที่ลงทะเบียนล่วงหน้า`
  else verdict = "OOS ยังบวกและเสื่อม ≤ 50% — ผ่านเบื้องต้น แต่ยังไม่ใช่หลักฐานจนกว่าจะมี live track record"
  return {
    folds,
    summary: {
      sufficient,
      folds: folds.length,
      medianIsSharpe: medIs,
      medianOosSharpe: medOos,
      degradationPct: degradation === null ? null : Math.round(degradation * 1000) / 10,
      pctOosPositive: folds.length ? Math.round((folds.filter((f) => f.oosReturnPct > 0).length / folds.length) * 1000) / 10 : null,
      meanOosExcessPct: folds.length ? Math.round((folds.reduce((s, f) => s + (f.oosReturnPct - f.benchReturnPct), 0) / folds.length) * 100) / 100 : null,
      preregMedianOosSharpe: preregMed,
      verdict,
    },
  }
}
