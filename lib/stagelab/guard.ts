import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
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

/** 401 body shape shared by every StageLab route. */
export function unauthorized() {
  return NextResponse.json({ error: 'ต้องเข้าสู่ระบบก่อนใช้งาน StageLab' }, { status: 401 })
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export function notFound(message = 'ไม่พบข้อมูล') {
  return NextResponse.json({ error: message }, { status: 404 })
}

export function serverError(message = 'เกิดข้อผิดพลาดภายในระบบ') {
  return NextResponse.json({ error: message }, { status: 500 })
}

/** Resolve the signed-in customer and their plan, or `null` when signed out. */
export async function stageContext(): Promise<StageContext | null> {
  const user = await requireUser()
  if (!user) return null
  return { user, plan: stagePlan(user.plan) }
}

export type Gate = { ok: true; ctx: StageContext } | { ok: false; response: NextResponse }

/**
 * Gate a route on a feature. Returns the context on success, or a ready-made
 * response carrying `code: 'upgrade_required'` so the client can show the
 * pricing link instead of a generic failure.
 */
export async function gate(feature: StageFeature | null): Promise<Gate> {
  const ctx = await stageContext()
  if (!ctx) return { ok: false, response: unauthorized() }
  if (feature && !ctx.plan.features.includes(feature)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `${FEATURE_LABELS[feature]} เปิดให้ใช้งานในแผน Pro — อัปเกรดเพื่อปลดล็อก`,
          code: 'upgrade_required',
          feature,
          plan: ctx.plan.key,
        },
        { status: 402 },
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
  return NextResponse.json(
    {
      error:
        plan.key === 'free'
          ? `แผน Free เก็บได้ ${max} รายการ — อัปเกรด Pro เพื่อเพิ่มเพดาน`
          : `ถึงเพดาน ${max} รายการ — ลบรายการเก่าก่อนเพิ่มใหม่`,
      code: plan.key === 'free' ? 'upgrade_required' : 'limit_reached',
      limit: max,
      plan: plan.key,
    },
    { status: 402 },
  )
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
    return NextResponse.json(
      {
        error: 'การประมวลผลหนัก (Backtest / Quant Lab) เปิดให้ใช้งานในแผน Pro',
        code: 'upgrade_required',
        plan: ctx.plan.key,
      },
      { status: 402 },
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
    return NextResponse.json(
      {
        error: `ใช้โควตาประมวลผลครบ ${budget} ครั้งของวันนี้แล้ว — รีเซ็ตเวลาเที่ยงคืน UTC`,
        code: 'quota_exhausted',
        limit: budget,
        used: row.stageRuns,
        plan: ctx.plan.key,
      },
      { status: 429 },
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
