import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { crossOriginWrite, fail, isWrite } from './problem'
import { READ_BUDGET, WRITE_BUDGET, rateLimit } from './rate-limit'
import { requireUser } from '@/lib/server/session'
import { utcDay } from '@/lib/server/usage'
import {
  FEATURE_LABELS,
  limitFor,
  stagePlan,
  type StageFeature,
  type StageLimits,
  type StagePlan,
} from './plans'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Enforcement for the StageLab plan matrix.                               ║
// ║                                                                          ║
// ║  Every StageLab route begins with one of these calls. That is deliberate ║
// ║  — a route that forgets returns data for *no* tenant rather than the     ║
// ║  wrong one, because `ctx.user.id` is the only way to reach a row and     ║
// ║  there is no un-scoped accessor exported from here.                      ║
// ║                                                                          ║
// ║  Gating decisions are duplicated in the UI so the customer sees a lock   ║
// ║  rather than an error, but the UI copy is a courtesy. This file is the   ║
// ║  boundary that actually holds.                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export interface StageContext {
  user: { id: string; email: string; name: string | null; plan: string; role: string }
  plan: StagePlan
}

// Thin wrappers over the shared envelope so route code reads as intent.
export const unauthorized = () => fail('unauthenticated', 'ต้องเข้าสู่ระบบก่อนใช้งาน StageLab')
export const badRequest = (message: string) => fail('invalid_request', message)
export const notFound = (message = 'ไม่พบข้อมูล') => fail('not_found', message)
export const conflict = (message: string, detail?: Record<string, unknown>) =>
  fail('conflict', message, detail)

/** Resolve the signed-in customer and their plan, or `null` when signed out. */
export async function stageContext(): Promise<StageContext | null> {
  const user = await requireUser()
  if (!user) return null
  return { user, plan: stagePlan(user.plan) }
}

export type Gate = { ok: true; ctx: StageContext } | { ok: false; response: NextResponse }

/**
 * Gate a route on a feature.
 *
 * Checks run in this order and the order matters: authentication first (an
 * anonymous caller must not be able to probe anything, including the rate
 * limiter's state), then origin, then rate, then plan. A signed-out request
 * therefore costs one session lookup and nothing else.
 *
 * `req` is optional only so a handler with no request in hand still compiles;
 * pass it wherever you have it, because without it there is no origin check
 * and no rate limit.
 */
export async function gate(feature: StageFeature | null, req?: Request): Promise<Gate> {
  const ctx = await stageContext()
  if (!ctx) return { ok: false, response: unauthorized() }

  if (req) {
    const foreign = crossOriginWrite(req)
    if (foreign) return { ok: false, response: foreign }

    // Keyed per user and per direction, so a burst of saves cannot starve the
    // reads that render the result of those saves.
    const write = isWrite(req)
    const budget = write ? WRITE_BUDGET : READ_BUDGET
    const verdict = rateLimit(`${ctx.user.id}:${write ? 'w' : 'r'}`, budget)
    if (!verdict.ok) {
      return {
        ok: false,
        response: fail(
          'quota_exhausted',
          'ส่งคำขอถี่เกินไป — รอสักครู่แล้วลองใหม่',
          { retryAfterMs: verdict.retryAfterMs },
        ),
      }
    }
  }

  if (feature && !ctx.plan.features.includes(feature)) {
    return {
      ok: false,
      response: fail(
        'upgrade_required',
        `${FEATURE_LABELS[feature]} เปิดให้ใช้งานในแผน Pro — อัปเกรดเพื่อปลดล็อก`,
        { feature, plan: ctx.plan.key },
      ),
    }
  }
  return { ok: true, ctx }
}

/**
 * Row caps. Called before every create. `current` is the caller's own count so
 * the check costs one query rather than two round-trips through this helper.
 */
export function overRowCap(
  plan: StagePlan,
  key: keyof Omit<StageLimits, 'computePerDay'>,
  current: number,
): NextResponse | null {
  const max = limitFor(plan.key, key)
  if (current < max) return null
  return plan.key === 'free'
    ? fail('upgrade_required', `แผน Free เก็บได้ ${max} รายการ — อัปเกรด Pro เพื่อเพิ่มเพดาน`, {
        limit: max,
        plan: plan.key,
      })
    : fail('limit_reached', `ถึงเพดาน ${max} รายการ — ลบรายการเก่าก่อนเพิ่มใหม่`, {
        limit: max,
        plan: plan.key,
      })
}

/**
 * Meter heavy compute against the shared UsageDay counter.
 *
 * The increment happens BEFORE the work runs, not after. A backtest that
 * crashes halfway still burned the CPU, and charging only for successes is an
 * invitation to hammer the endpoint with inputs that fail late.
 */
export async function spendCompute(
  ctx: StageContext,
  cost = 1,
): Promise<NextResponse | null> {
  const budget = ctx.plan.limits.computePerDay
  if (budget <= 0) {
    return fail(
      'upgrade_required',
      'การประมวลผลหนัก (Backtest / Quant Lab) เปิดให้ใช้งานในแผน Pro',
      { plan: ctx.plan.key },
    )
  }

  const day = utcDay(new Date())
  const row = await prisma.usageDay.upsert({
    where: { userId_day: { userId: ctx.user.id, day } },
    create: { userId: ctx.user.id, day, stageRuns: cost },
    update: { stageRuns: { increment: cost } },
    select: { stageRuns: true },
  })

  if (row.stageRuns > budget) {
    return fail(
      'quota_exhausted',
      `ใช้โควตาประมวลผลครบ ${budget} ครั้งของวันนี้แล้ว — รีเซ็ตเวลาเที่ยงคืน UTC`,
      { limit: budget, used: row.stageRuns, plan: ctx.plan.key },
    )
  }
  return null
}

/** Remaining compute budget for today — surfaced in the UI header. */
export async function computeRemaining(ctx: StageContext): Promise<number> {
  const budget = ctx.plan.limits.computePerDay
  if (budget <= 0) return 0
  const row = await prisma.usageDay.findUnique({
    where: { userId_day: { userId: ctx.user.id, day: utcDay(new Date()) } },
    select: { stageRuns: true },
  })
  return Math.max(0, budget - (row?.stageRuns ?? 0))
}
