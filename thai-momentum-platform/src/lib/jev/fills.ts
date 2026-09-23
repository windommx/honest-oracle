// ============================================================
// คิวคำสั่งซื้อรอเติม T+1 ของพอร์ตกระดาษ Jev — เก็บใน Setting (key jev_pending_fills) ไม่แก้ schema
//
// ทำไม: Jev ตัดสินหลังตลาดปิด (ข้อมูล EOD) — การบันทึกราคาเข้า = ราคาปิดของวันตัดสินใจ (T+0) คือราคาที่ไม่มีใคร
//   ซื้อได้หลังเห็นสัญญาณ ขณะที่ runBacktest ซื้อที่ราคาปิดแท่งถัดไป (docs/research/methodology.md A5)
// เลือก Setting (ไม่ใช่ PendingGate/ตารางใหม่): ห้ามแก้ schema (DB demo ที่มากับโปรเจกต์ต้องใช้ได้) · คิวเป็นข้อมูลชั่วคราว
//   ขนาดเล็ก (≤ ไม่กี่สิบคำสั่ง) เขียนแบบ compare-and-swap แถวเดียวได้ · ประวัติถาวรอยู่ใน Decision + EventLog อยู่แล้ว
//   (PendingGate มีความหมาย "รอมนุษย์" — ใส่คำสั่งอัตโนมัติจะปนคิวอนุมัติ/นับเกินใน overview และถูกล้างตอน ingest)
//
// วงจรคำสั่ง
//   1) ส่งคำสั่ง (enqueuePendingFill): Jev risk_on (auto/reversal) หรือมนุษย์อนุมัติ Q_ENTRY buy — ยังไม่สร้าง Position
//      afterDate = วันข้อมูลล่าสุดที่รู้ตอนสั่ง (auto = วันตัดสินใจ · human = วันล่าสุดของ pivot ตอนอนุมัติ)
//   2) เติม (processPendingFills): ตอนเริ่มทุกรอบ POST /api/jev/run — ราคาปิดของวันแรกใน pivot ที่ "หลัง" afterDate
//      - หุ้นไม่มีราคาวันนั้น (พัก/หยุดซื้อขาย) → ยกเลิก (ตรง backtest ที่ข้าม entry ไม่มีราคา: ไม่แต่งราคา ไม่เลื่อนวัน)
//      - ตรวจ sector/slot ซ้ำกับพอร์ต ณ ตอนเติม (exit ของรอบก่อนออกไปแล้ว · ไม้ที่เพิ่งเติมในรอบเดียวกันนับด้วย)
//        ถูกตัด → ยกเลิกพร้อมเหตุผล · ลดขนาดได้ตามกติกาเดียวกับตอนตัดสินใจ (บันทึกเหตุผลไว้)
//      - stop = ราคาเติม × (1 − stopPct × stopMult) ที่บันทึกไว้วันตัดสินใจ
//   3) บันทึก: Position (entryDate/entryPx = วัน/ราคาเติม) → Decision Q_ENTRY "fill" executed (date = วันเติม)
//      → gate ของมนุษย์เป็น executed → ลบออกจากคิว · ยกเลิก = Decision "cancel" · ทั้งรอบลง EventLog "jev_fill"
//
// ความปลอดภัยของการเขียน (ไม่ใช้ interactive transaction — บน Bun ทำ query engine ค้าง ดู src/lib/research/events.ts)
//   - mutex ระดับ process (globalThis) ครอบทุกการแก้คิว · ข้าม process ใช้ compare-and-swap บนค่า Setting
//   - idempotent: สร้าง Position ก่อน → Decision (เช็กซ้ำด้วยแท็กคำสั่ง) → ลบจากคิวเป็นขั้นสุดท้าย
//     พังกลางทาง = รอบถัดไปเห็น Position ของคำสั่งนี้แล้ว → เติม Decision ที่ขาดแล้วปิดคำสั่ง (ไม่ซื้อซ้ำ)
//     รันซ้ำบนข้อมูลเดิม = คำสั่งถูกลบไปแล้ว → ไม่มีอะไรให้เติม
//   - ยุคข้อมูลเปลี่ยน (seed / ล้าง demo) หลังส่งคำสั่ง → ยกเลิกโดยไม่เขียน Decision (คำสั่งของ "โลกเก่า")
//   - GET (/api/portfolio, /api/jev/pending) อ่านอย่างเดียว: previewPendingFills บอกวัน/ราคาที่รอบถัดไปจะเติม
//     (วันเติมกำหนดได้แน่นอนจาก afterDate — เขียนเมื่อไรผลก็เหมือนกัน) ไม่เขียน DB จาก GET
// ============================================================

import { randomBytes } from "node:crypto"
import { db } from "@/lib/db"
import { dataEpoch } from "@/lib/feed/provenance"
import { closePivot } from "@/lib/momentum/core"
import { emitEvent } from "@/lib/research/events"
import { applySectorConstraints, getSectorMap } from "@/lib/risk/sector"
import type {
  CancelledOrderRow,
  FilledOrderRow,
  FillStepResult,
  JevDecision,
  PendingFillOrder,
  PendingFillRow,
} from "@/lib/momentum/contracts"
import {
  CANCEL_ACTION,
  FILL_ACTION,
  PENDING_FILLS_KEY,
  cancelDecisionReason,
  fillDecisionReason,
  fillDecisionSource,
  firstDateAfter,
  isValidOrder,
  orderTag,
  parsePendingFills,
  previewPendingFill,
  serializePendingFills,
} from "./fill-rules"

// ---------- mutex ระดับ process: ทุกการแก้คิว (ส่งคำสั่ง/เติม/ยกเลิก) เรียงคิวกัน ----------
const lockHolder = globalThis as unknown as { __jevFillQueueLock?: Promise<void> }

function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = lockHolder.__jevFillQueueLock ?? Promise.resolve()
  const run = prev.then(fn)
  lockHolder.__jevFillQueueLock = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function readRaw(): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key: PENDING_FILLS_KEY } })
  return row?.value ?? null
}

/** คำสั่งที่รอเติมทั้งหมด (เรียงตามลำดับที่ส่ง) */
export async function readPendingFills(): Promise<PendingFillOrder[]> {
  return parsePendingFills(await readRaw())
}

/**
 * แก้คิวแบบ compare-and-swap: mutate คืน null = ไม่ต้องเขียน
 * ค่าในแถวเปลี่ยนระหว่างอ่าน→เขียน (อีก process แก้คิว) → อ่านใหม่แล้วลองซ้ำ
 */
async function mutateQueue<T>(
  mutate: (orders: PendingFillOrder[]) => { next: PendingFillOrder[]; result: T } | null
): Promise<T | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const raw = await readRaw()
    const out = mutate(parsePendingFills(raw))
    if (!out) return null
    const value = serializePendingFills(out.next)
    if (raw === null) {
      try {
        await db.setting.create({ data: { key: PENDING_FILLS_KEY, value } })
        return out.result
      } catch {
        continue // อีกทางสร้างแถวไปก่อน → อ่านใหม่
      }
    }
    const res = await db.setting.updateMany({ where: { key: PENDING_FILLS_KEY, value: raw }, data: { value } })
    if (res.count === 1) return out.result
  }
  throw new Error("คิวคำสั่งรอเติม T+1 ถูกแก้พร้อมกันหลายทาง — ลองใหม่อีกครั้ง")
}

/** EventLog id ที่เริ่มยุคข้อมูลปัจจุบัน (seed ล่าสุด / ingest ที่ล้าง demo) — null = ไม่มี */
export async function currentEpochId(): Promise<number | null> {
  const events = await db.eventLog.findMany({
    where: { kind: { in: ["seed", "ingest"] } },
    select: { id: true, kind: true, payload: true },
    orderBy: { id: "asc" },
  })
  return dataEpoch(events).startEventId
}

export type NewPendingFill = Omit<PendingFillOrder, "id" | "placedAt">

/**
 * ส่งคำสั่งซื้อเข้าคิว T+1 — คืน null เมื่อหุ้นนี้มีคำสั่งรอเติมอยู่แล้ว (หนึ่งคำสั่งต่อหุ้น)
 * ไม่สร้าง Position (ยังไม่ได้ซื้อ) · ผู้เรียกบันทึก Decision วันตัดสินใจเอง (queuedDecisionReason)
 */
export async function enqueuePendingFill(input: NewPendingFill): Promise<PendingFillOrder | null> {
  const order: PendingFillOrder = { ...input, id: randomBytes(6).toString("hex"), placedAt: new Date().toISOString() }
  if (!isValidOrder(order)) throw new Error(`คำสั่งรอเติม T+1 ของ ${input.symbol} ไม่ถูกต้อง (ขนาด/stop/วันที่)`)
  return withQueueLock(() =>
    mutateQueue((orders) => (orders.some((o) => o.symbol === order.symbol) ? null : { next: [...orders, order], result: order }))
  )
}

async function removeOrder(id: string): Promise<void> {
  await mutateQueue((orders) =>
    orders.some((o) => o.id === id) ? { next: orders.filter((o) => o.id !== id), result: true } : null
  )
}

// ---------- วางแผนการเติมต่อคำสั่ง (pure — เทสต์ได้โดยไม่แตะ DB) ----------

export interface HeldPosition {
  symbol: string
  entryDate: string
  entryPx: number
  slots: number
}

export interface FillContext {
  pivot: { dates: string[]; px: number[][]; symIdx: Map<string, number> }
  /** พอร์ต ณ ตอนเติม (รวมไม้ที่เพิ่งเติมในรอบเดียวกัน) */
  held: HeldPosition[]
  sectorMap: Map<string, string>
  /** ยุคข้อมูลปัจจุบัน (currentEpochId) */
  epoch: number | null
}

export type FillPlan =
  | { kind: "wait" }
  | { kind: "fill"; date: string; px: number; slots: number; stop: number; note: string | null }
  /** เติมไปแล้ว (Position ของคำสั่งนี้มีอยู่ — รอบก่อนพังก่อนปิดคำสั่ง) → เติม Decision ที่ขาดแล้วปิดคำสั่ง */
  | { kind: "done"; date: string; px: number; slots: number }
  | { kind: "cancel"; date: string | null; why: string; epochChanged: boolean }

const samePx = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b))

export function planFill(order: PendingFillOrder, ctx: FillContext): FillPlan {
  if (order.epoch !== ctx.epoch) {
    return { kind: "cancel", date: null, why: "ยุคข้อมูลเปลี่ยน (seed / ล้าง demo) หลังส่งคำสั่ง", epochChanged: true }
  }
  const k = firstDateAfter(ctx.pivot.dates, order.afterDate)
  if (k < 0) return { kind: "wait" } // ยังไม่มีข้อมูลวันทำการถัดไป
  const date = ctx.pivot.dates[k]
  const si = ctx.pivot.symIdx.get(order.symbol)
  const px = si === undefined ? NaN : ctx.pivot.px[k]?.[si]
  if (px === undefined || !Number.isFinite(px) || px <= 0) {
    return {
      kind: "cancel",
      date,
      why: `ไม่มีราคาปิด ${order.symbol} วันเติม ${date} (พัก/หยุดซื้อขาย?) — ยกเลิกตามกติกา backtest: ไม่แต่งราคา ไม่เลื่อนไปวันถัดไป`,
      epochChanged: false,
    }
  }
  const existing = ctx.held.find((p) => p.symbol === order.symbol)
  if (existing) {
    if (existing.entryDate === date && samePx(existing.entryPx, px)) return { kind: "done", date, px, slots: existing.slots }
    return { kind: "cancel", date, why: `มีสถานะ ${order.symbol} อยู่แล้ว (เข้า ${existing.entryDate})`, epochChanged: false }
  }
  // sector/slot ตรวจซ้ำกับพอร์ต ณ ตอนเติม (งบ slots = งบของรอบที่ส่งคำสั่ง)
  const plan = applySectorConstraints(
    [{ symbol: order.symbol, slots: order.slots }],
    ctx.held.map((p) => ({ symbol: p.symbol, slots: p.slots })),
    ctx.sectorMap,
    { maxSlots: order.maxSlots }
  )
  const fit = plan.downsized[0] ?? plan.accepted[0]
  if (!fit) {
    const why = plan.rejected[0]?.reason ?? `${order.symbol} ถูกตัดโดย sector layer`
    return { kind: "cancel", date, why: `ไม่ผ่าน sector/slot ตอนเติม — ${why}`, epochChanged: false }
  }
  const note = "reason" in fit ? `ลดขนาดตอนเติม: ${fit.reason}` : null
  return { kind: "fill", date, px, slots: fit.slots, stop: px * (1 - order.stopPct * order.stopMult), note }
}

// ---------- ขั้นเติม (เขียน DB) ----------

export interface FillStepOutcome extends FillStepResult {
  /** แถวที่ลงมือ (action "fill") — ต่อหน้า executed ของ /api/jev/run */
  executed: JevDecision[]
}

/** Decision ของคำสั่งนี้ (ค้นด้วยแท็กคำสั่ง) — มีแล้ว = ไม่เขียนซ้ำ */
async function ensureDecision(order: PendingFillOrder, action: string, date: string, reason: string, executed: boolean) {
  const dup = await db.decision.findFirst({
    where: { question: "Q_ENTRY", target: order.symbol, action, reason: { contains: orderTag(order.id) } },
    select: { id: true },
  })
  if (dup) return
  await db.decision.create({
    data: {
      date,
      question: "Q_ENTRY",
      target: order.symbol,
      action,
      conf: order.conf,
      reason,
      executed,
      source: fillDecisionSource(order.source),
    },
  })
}

/**
 * เติมคำสั่งทุกตัวที่ถึงวันเติมแล้ว (ตามลำดับที่ส่ง) — เรียกตอนเริ่มทุกรอบ POST /api/jev/run
 * คำสั่งที่ยังไม่มีข้อมูลวันทำการถัดไป = รอต่อ (ไม่เขียนอะไรเลยเมื่อไม่มีคำสั่งให้เติม/ยกเลิก)
 */
export async function processPendingFills(): Promise<FillStepOutcome> {
  return withQueueLock(async () => {
    const out: FillStepOutcome = { filled: [], cancelled: [], executed: [] }
    const orders = await readPendingFills()
    if (orders.length === 0) return out
    const [pivot, sectorMap, positions, epoch] = await Promise.all([
      closePivot(),
      getSectorMap(),
      db.position.findMany(),
      currentEpochId(),
    ])
    const held: HeldPosition[] = positions.map((p) => ({
      symbol: p.symbol,
      entryDate: p.entryDate,
      entryPx: p.entryPx,
      slots: p.slots,
    }))

    for (const order of orders) {
      let plan = planFill(order, { pivot, held, sectorMap, epoch })
      if (plan.kind === "wait") continue
      const base = {
        id: order.id,
        symbol: order.symbol,
        source: order.source,
        decisionDate: order.decisionDate,
        afterDate: order.afterDate,
      }

      if (plan.kind === "fill") {
        const { date, px, slots, stop } = plan
        try {
          await db.position.create({ data: { symbol: order.symbol, entryDate: date, entryPx: px, slots, stop } })
          held.push({ symbol: order.symbol, entryDate: date, entryPx: px, slots })
        } catch (e) {
          // อีกทางสร้าง Position ของหุ้นนี้ไปก่อน → วางแผนใหม่กับสถานะจริง (ของคำสั่งนี้เอง = done · อื่น = ยกเลิก)
          const now = await db.position.findUnique({ where: { symbol: order.symbol } })
          if (!now) throw e
          held.push({ symbol: now.symbol, entryDate: now.entryDate, entryPx: now.entryPx, slots: now.slots })
          plan = planFill(order, { pivot, held, sectorMap, epoch })
        }
      }

      if (plan.kind === "cancel") {
        const why = plan.why
        // ยุคข้อมูลเปลี่ยน = คำสั่งของโลกเก่า → ไม่เขียน Decision ลงยุคใหม่ (บันทึกใน EventLog เท่านั้น)
        if (!plan.epochChanged) await ensureDecision(order, CANCEL_ACTION, plan.date ?? order.afterDate, cancelDecisionReason(order, why), false)
        await removeOrder(order.id)
        out.cancelled.push({ ...base, date: plan.date, reason: why } satisfies CancelledOrderRow)
        continue
      }
      if (plan.kind !== "fill" && plan.kind !== "done") continue

      const note = plan.kind === "fill" ? plan.note : null
      const reason = fillDecisionReason(order, plan.date, plan.px, note)
      await ensureDecision(order, FILL_ACTION, plan.date, reason, true)
      if (order.gateId !== null) {
        await db.pendingGate.updateMany({ where: { id: order.gateId, status: "approved" }, data: { status: "executed" } })
      }
      await removeOrder(order.id)
      const pos = held.find((h) => h.symbol === order.symbol)
      out.filled.push({
        ...base,
        fillDate: plan.date,
        fillPx: plan.px,
        slots: plan.slots,
        stop: plan.kind === "fill" ? plan.stop : plan.px * (1 - order.stopPct * order.stopMult),
        note: plan.kind === "done" ? `เติมไว้แล้ว (Position ${pos?.entryDate ?? plan.date}) — ปิดคำสั่งที่ค้าง` : note,
      } satisfies FilledOrderRow)
      out.executed.push({ question: "Q_ENTRY", target: order.symbol, action: FILL_ACTION, conf: order.conf, reason })
    }

    if (out.filled.length + out.cancelled.length > 0) {
      await emitEvent("jev_fill", "paper", { filled: out.filled, cancelled: out.cancelled })
    }
    return out
  })
}

/** มุมมองอ่านอย่างเดียวของคิว (+ วัน/ราคาที่จะเติมถ้าข้อมูลวันนั้นเข้าแล้ว) — ไม่เขียน DB */
export async function previewPendingFills(): Promise<PendingFillRow[]> {
  const orders = await readPendingFills()
  if (orders.length === 0) return []
  const pivot = await closePivot()
  return orders.map((o) => previewPendingFill(o, pivot))
}
