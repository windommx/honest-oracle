// ============================================================
// Q_EXIT แบบ legacy ของสมอง Jev — pure (ไม่แตะ db) ใช้โดย /api/jev/run
// ใช้เมื่อ Bayesian stop ไม่ได้ adopt หรือสถานะยังไม่ติดลบ (dd ≤ 0.5%)
// ลำดับกฎ:
//   ไม่มีราคาวันล่าสุด → ไม่มีราคาติดกัน ≥ NO_PRICE_EXIT_DAYS วันทำการ → exit ที่ราคาปิดล่าสุดที่มี
//                        (หุ้นถูกพัก/เพิกถอน — ไม่ถือค้างตลอดไป) · น้อยกว่านั้น → hold (ขายไม่ได้ —
//                        รายงานราคาล่าสุดที่มีจริง ไม่ใช่ ret=0.0% ปลอม)
//   ราคา ≤ stop ที่บันทึกไว้ → exit (stop ตั้งตอนเข้า หรือเลื่อนเป็น +2% ตอน tighten — ตรง backtest engine)
//   ret > 25% → exit (กำไรใหญ่) · หลุดโผ & ret > 0 → tighten · ret ≤ −6% → exit · อื่น ๆ → hold
//
// Time exit (applyTimeExit — ตัดสินเมื่อ 2026-09-23): ถือครบ holdDefault วันทำการ (config_th) → exit
//   ใช้ "หลัง" กฎอื่นทั้งหมด (ทั้ง Bayes และ legacy): การตัดสินที่เป็น exit อยู่แล้ว (stop/Bayes/กำไรใหญ่/−6%)
//   คงเหตุผลเดิม (stop มาก่อน time — ลำดับเดียวกับ runBacktest) · hold/tighten ที่ครบกำหนด → exit
//   ไม่มีราคาวันนี้ → ยังออกไม่ได้ (รอราคากลับมา หรือกฎไม่มีราคา N วัน) — ตรง backtest ที่ออกวันแรกที่มีราคา
// ============================================================

import type { JevDecision } from "@/lib/momentum/contracts"

/** วันทำการติดกันที่ไม่มีราคา (นับตามปฏิทินข้อมูลของระบบ) ก่อนบังคับปิดที่ราคาปิดล่าสุดที่มี — ใช้ทั้ง Jev และ runBacktest */
export const NO_PRICE_EXIT_DAYS = 10

const NO_PRICE_EXIT_PREFIX = "หยุดซื้อขาย/ไม่มีราคา "
const TIME_EXIT_PREFIX = "ครบกำหนดถือ "
const TIME_EXIT_TAG = " วัน (time exit)"

/** ข้อความเหตุผลมาตรฐานของการบังคับปิดหุ้นที่หยุดซื้อขาย (ขึ้นต้นเหมือนกันทุกที่ ค้นย้อนหลังได้) */
export function noPriceExitReason(days: number): string {
  return `${NO_PRICE_EXIT_PREFIX}${days} วัน — ปิดที่ราคาล่าสุดที่มี`
}

/** ข้อความเหตุผลมาตรฐานของ time exit */
export function timeExitReason(holdDays: number): string {
  return `${TIME_EXIT_PREFIX}${holdDays}${TIME_EXIT_TAG}`
}

/** จัดประเภทการตัดสิน exit จากเหตุผลมาตรฐาน (ใช้นับใน message/event และค้น Decision ย้อนหลัง) */
export function exitKind(dec: Pick<JevDecision, "action" | "reason">): "no_price" | "time" | "other" | null {
  if (dec.action !== "exit") return null
  if (dec.reason.startsWith(NO_PRICE_EXIT_PREFIX)) return "no_price"
  if (dec.reason.startsWith(TIME_EXIT_PREFIX) && dec.reason.includes(TIME_EXIT_TAG)) return "time"
  return "other"
}

export interface ExitPosition {
  symbol: string
  entryPx: number
  stop: number
}

export function legacyExitDecision(
  p: ExitPosition,
  lp: number, // ราคาปิดวันล่าสุด (NaN = ไม่มีแถววันล่าสุด)
  inList: boolean, // ติดโผ snapshot วันล่าสุดอยู่หรือไม่
  lastKnown: { px: number; date: string } | null, // ราคาล่าสุดที่มีจริง (ใช้เมื่อ lp ไม่มี)
  noPriceDays: number | null = null // วันทำการติดกันที่ไม่มีราคา ณ วันล่าสุด (null = ไม่ทราบ → ไม่บังคับปิด)
): JevDecision {
  const base = { question: "Q_EXIT" as const, target: p.symbol }
  if (!Number.isFinite(lp)) {
    const lkRet = lastKnown ? ((lastKnown.px / p.entryPx - 1) * 100).toFixed(1) : null
    // หยุดซื้อขายนานเกินเกณฑ์ → ปิดที่ราคาปิดล่าสุดที่มี (ต้องรู้ราคาล่าสุด — ไม่แต่งราคา)
    if (lastKnown && noPriceDays !== null && noPriceDays >= NO_PRICE_EXIT_DAYS) {
      return {
        ...base,
        action: "exit",
        conf: 0.85,
        reason: `${noPriceExitReason(noPriceDays)} (${lastKnown.date} ราคา ${lastKnown.px.toFixed(2)} ret=${lkRet}%)`,
      }
    }
    const lkPart = lastKnown ? ` · ราคาล่าสุดที่มี ${lastKnown.date} ret=${lkRet}%` : ""
    const daysPart =
      noPriceDays !== null && lastKnown ? ` · ไม่มีราคา ${noPriceDays}/${NO_PRICE_EXIT_DAYS} วัน` : ""
    return {
      ...base,
      action: "hold",
      conf: 0.6,
      reason: `ไม่มีราคาวันล่าสุด (พัก/หยุดซื้อขาย) — ถือไว้ก่อน${lkPart}${daysPart}`,
    }
  }
  const r = lp / p.entryPx - 1
  const fmt = `${(r * 100).toFixed(1)}%`
  if (lp <= p.stop) {
    return {
      ...base,
      action: "exit",
      conf: 0.85,
      reason: `หลุด stop ${p.stop.toFixed(2)} (ราคา ${lp.toFixed(2)}) ret=${fmt}`,
    }
  }
  if (r > 0.25) return { ...base, action: "exit", conf: 0.85, reason: `กำไรใหญ่ ret=${fmt}` }
  if (!inList && r > 0) return { ...base, action: "tighten", conf: 0.8, reason: `ret=${fmt}` }
  if (r <= -0.06) return { ...base, action: "exit", conf: 0.85, reason: `ret=${fmt}` }
  return { ...base, action: "hold", conf: 0.6, reason: `ret=${fmt}` }
}

/**
 * วันทำการติดกันที่ไม่มีราคา ณ index i (px = dates × symbols, NaN/≤0 = ไม่มีราคา)
 * มีราคาวัน i → 0 · ไม่เคยมีราคาเลยจนถึง i → null (ไม่รู้ราคาล่าสุด = ห้ามแต่งราคาปิด)
 */
export function noPriceStreak(px: number[][], si: number, i: number): number | null {
  for (let k = Math.min(i, px.length - 1); k >= 0; k--) {
    const v = px[k]?.[si]
    if (Number.isFinite(v) && v > 0) return i - k
  }
  return null
}

/**
 * Time exit — ใช้กับผลตัดสิน Q_EXIT ที่ได้จากกฎอื่นแล้ว (Bayes หรือ legacy)
 * - exit อยู่แล้ว → คงเดิม (stop/Bayes/กำไรใหญ่/−6% มาก่อน time)
 * - ไม่มีราคาวันนี้ → คงเดิม (ปิด paper ที่ราคาปิดไม่ได้)
 * - heldDays ≥ holdDays (≥ 1) → exit conf 0.85 (ผ่าน Q_EXIT 0.75 = ลงมือจริงใน paper mode เหมือน exit legacy อื่น)
 * heldDays = จำนวนวันทำการตามปฏิทินข้อมูล (index วันล่าสุด − index วันเข้า) เท่ากับ `i − ei ≥ hold` ของ runBacktest
 */
export function applyTimeExit(
  dec: JevDecision,
  heldDays: number | null,
  holdDays: number,
  hasPrice: boolean
): JevDecision {
  if (dec.action === "exit" || !hasPrice) return dec
  if (heldDays === null || !Number.isFinite(heldDays) || !Number.isFinite(holdDays) || holdDays < 1) return dec
  if (heldDays < holdDays) return dec
  return {
    question: "Q_EXIT",
    target: dec.target,
    action: "exit",
    conf: 0.85,
    reason: `${timeExitReason(holdDays)} · ถือแล้ว ${heldDays} วันทำการ · กฎเดิม: ${dec.action} (${dec.reason})`,
  }
}
