// ============================================================
// กติกาคำสั่งซื้อรอเติม T+1 ของ Jev — pure (ไม่แตะ db) ใช้ร่วม server (fills.ts, ledger) และ UI
//
// Jev ตัดสินหลังตลาดปิด (ข้อมูล EOD) → ราคาปิดของวันตัดสินใจเป็นราคาที่ไม่มีใครซื้อได้หลังเห็นสัญญาณ
// คำสั่งซื้อทุกทาง (อัตโนมัติ / มนุษย์อนุมัติ / reversal) จึงเข้าคิวก่อน แล้วเติมที่ราคาปิดของ
// "วันทำการแรกที่หลัง afterDate" ในปฏิทินข้อมูล (pivot) — ตรงกับ runBacktest ที่ซื้อ pending ที่ราคาปิดแท่งถัดไป
//
// แถว Decision ที่เกี่ยวข้อง (question = Q_ENTRY ทั้งหมด):
//   - วันตัดสินใจ : action "buy"    executed=false  เหตุผลลงท้าย T1_TAG + แท็กคำสั่ง   (คำสั่ง ยังไม่ใช่สถานะ)
//   - วันเติม      : action "fill"   executed=true   date = วันเติม เหตุผลขึ้นต้น "เติม T+1 " (ไม้เข้าจริงของ ledger/NAV)
//   - ยกเลิก       : action "cancel" executed=false  เหตุผลขึ้นต้น "ยกเลิกคำสั่งเติม T+1 "
// source ของแถวเติม/ยกเลิก = source ของการตัดสินใจเดิม (lite / human / reversal) — ถังผลงานต่อผู้ตัดสินใจไม่เพี้ยน
// ============================================================

import type { PendingFillOrder, PendingFillRow, PendingFillSource } from "@/lib/momentum/contracts"

/** key ของ Setting ที่เก็บคิว (JSON { v: 1, orders }) */
export const PENDING_FILLS_KEY = "jev_pending_fills"

export const FILL_ACTION = "fill"
export const CANCEL_ACTION = "cancel"

/** ป้ายมาตรฐานของคำสั่งที่รอเติม (ท้ายเหตุผลของ Decision วันตัดสินใจ + หัวข้อใน UI) */
export const T1_TAG = "รอเติมราคาปิดวันทำการถัดไป (T+1)"
const FILL_PREFIX = "เติม T+1 "
const CANCEL_PREFIX = "ยกเลิกคำสั่งเติม T+1 "

const SOURCES: readonly PendingFillSource[] = ["auto", "human", "reversal"]
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Decision.source ของแถวที่เกิดจากคำสั่งนี้ (ตรงกับ source เดิมของ /api/jev/run และ /api/jev/pending) */
export function fillDecisionSource(source: PendingFillSource): string {
  return source === "auto" ? "lite" : source
}

/** ชื่อที่มาภาษาไทยสำหรับ UI */
export function fillSourceLabel(source: PendingFillSource): string {
  if (source === "human") return "มนุษย์อนุมัติ"
  if (source === "reversal") return "reversal"
  return "Jev อัตโนมัติ"
}

/** แท็กผูก Decision ↔ คำสั่ง ↔ EventLog (ค้นย้อนหลัง + กันเขียนซ้ำเมื่อรันซ้ำหลังพังกลางทาง) */
export function orderTag(id: string): string {
  return `(คำสั่ง ${id})`
}

function isFiniteNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x)
}

/** คำสั่งที่ถูกต้องครบ (ใช้ทั้งตอนอ่านคิวและก่อนเขียน) */
export function isValidOrder(o: unknown): o is PendingFillOrder {
  if (!o || typeof o !== "object") return false
  const r = o as Record<string, unknown>
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    typeof r.symbol === "string" &&
    r.symbol.length > 0 &&
    isFiniteNum(r.slots) &&
    r.slots > 0 &&
    isFiniteNum(r.stopPct) &&
    r.stopPct > 0 &&
    r.stopPct < 1 &&
    isFiniteNum(r.stopMult) &&
    r.stopMult > 0 &&
    SOURCES.includes(r.source as PendingFillSource) &&
    typeof r.decisionDate === "string" &&
    DATE_RE.test(r.decisionDate) &&
    typeof r.afterDate === "string" &&
    DATE_RE.test(r.afterDate) &&
    (r.gateId === null || isFiniteNum(r.gateId)) &&
    isFiniteNum(r.conf) &&
    typeof r.reason === "string" &&
    isFiniteNum(r.maxSlots) &&
    r.maxSlots > 0 &&
    typeof r.placedAt === "string" &&
    (r.epoch === null || isFiniteNum(r.epoch))
  )
}

/** อ่านค่า Setting → คำสั่งที่ถูกต้อง (ค่าเสีย/แถวเสีย = ทิ้ง ไม่ throw — คิวว่างดีกว่าคำสั่งปลอม) */
export function parsePendingFills(raw: string | null | undefined): PendingFillOrder[] {
  if (!raw) return []
  try {
    const v = JSON.parse(raw) as { orders?: unknown }
    return Array.isArray(v?.orders) ? v.orders.filter(isValidOrder) : []
  } catch {
    return []
  }
}

export function serializePendingFills(orders: PendingFillOrder[]): string {
  return JSON.stringify({ v: 1, orders })
}

/** index ของวันแรกใน dates (เรียงจากเก่า) ที่ "หลัง" afterDate อย่างเคร่งครัด · ไม่มี = −1 (รอข้อมูล) */
export function firstDateAfter(dates: string[], afterDate: string): number {
  let lo = 0
  let hi = dates.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (dates[mid] <= afterDate) lo = mid + 1
    else hi = mid
  }
  return lo < dates.length ? lo : -1
}

/** มุมมองอ่านอย่างเดียว: วัน/ราคาที่คำสั่งนี้จะถูกเติม ตามข้อมูลที่มีตอนนี้ */
export function previewPendingFill(
  order: PendingFillOrder,
  pivot: { dates: string[]; px: number[][]; symIdx: Map<string, number> }
): PendingFillRow {
  const k = firstDateAfter(pivot.dates, order.afterDate)
  const si = pivot.symIdx.get(order.symbol)
  const px = k >= 0 && si !== undefined ? pivot.px[k]?.[si] : NaN
  return {
    ...order,
    fillDate: k >= 0 ? pivot.dates[k] : null,
    fillPx: px !== undefined && Number.isFinite(px) && px > 0 ? px : null,
  }
}

/** เหตุผลของ Decision วันตัดสินใจเมื่อส่งคำสั่งเข้าคิว */
export function queuedDecisionReason(reason: string, orderId: string): string {
  return `${reason} | ${T1_TAG} ${orderTag(orderId)}`
}

/** เหตุผลของ Decision วันเติม — บอกว่าเป็นการเติม T+1 ของการตัดสินใจวันไหน */
export function fillDecisionReason(order: PendingFillOrder, date: string, px: number, note: string | null): string {
  const origin =
    order.source === "human"
      ? ` · มนุษย์อนุมัติ${order.gateId !== null ? ` gate #${order.gateId}` : ""} หลังข้อมูล ${order.afterDate}`
      : order.afterDate !== order.decisionDate
        ? ` · สั่งหลังข้อมูล ${order.afterDate}`
        : ""
  return `${FILL_PREFIX}ที่ราคาปิด ${date} (${px.toFixed(2)}) ของการตัดสินใจวันที่ ${order.decisionDate}${origin}${note ? ` | ${note}` : ""} ${orderTag(order.id)}`
}

/** เหตุผลของ Decision เมื่อยกเลิกคำสั่ง */
export function cancelDecisionReason(order: PendingFillOrder, why: string): string {
  return `${CANCEL_PREFIX}ของการตัดสินใจวันที่ ${order.decisionDate}: ${why} ${orderTag(order.id)}`
}

type DecisionLike = { question: string; action: string; executed: boolean; reason: string }

/** Decision วันตัดสินใจที่ส่งคำสั่งเข้าคิว T+1 (ไม่ใช่ไม้เข้า และไม่ใช่ "รอ human gate") */
export function isQueuedEntryDecision(d: DecisionLike): boolean {
  return d.question === "Q_ENTRY" && d.action === "buy" && !d.executed && d.reason.includes(T1_TAG)
}

/** Decision ที่เติมคำสั่งแล้ว (ไม้เข้าจริง: date = วันเติม) */
export function isFillDecision(d: DecisionLike): boolean {
  return d.question === "Q_ENTRY" && d.action === FILL_ACTION && d.executed
}

/** Decision ที่ยกเลิกคำสั่งตอนเติม */
export function isCancelDecision(d: Pick<DecisionLike, "question" | "action">): boolean {
  return d.question === "Q_ENTRY" && d.action === CANCEL_ACTION
}
