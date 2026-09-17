import { NextResponse } from 'next/server'
import { z } from 'zod'
import { badRequest } from './guard'
import { TECHNICAL_MAX } from './scoring'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Request parsing for the StageLab routes.                                ║
// ║                                                                          ║
// ║  Every write body goes through a zod schema. The schemas use `.partial()` ║
// ║  for updates so an absent key means "leave it alone" while an explicit    ║
// ║  null still clears a nullable column — the distinction matters for        ║
// ║  `notes`, which the UI clears by sending null.                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝

// The third type argument pins T to the schema's OUTPUT type. Without it TS
// unifies on the input type and every field carrying a `.default()` comes back
// optional, which then fails Prisma's stricter create input.
export async function readJson<T>(
  req: Request,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, response: badRequest('รูปแบบ JSON ไม่ถูกต้อง') }
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const where = first?.path.join('.') || 'body'
    return { ok: false, response: badRequest(`ข้อมูลไม่ถูกต้อง: ${where} — ${first?.message ?? ''}`) }
  }
  return { ok: true, data: parsed.data }
}

/** `?id=` as a positive integer, or null when absent/garbage. */
export function idParam(req: Request): number | null {
  const raw = new URL(req.url).searchParams.get('id')
  if (raw === null) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

const finite = z.number().finite()
const posInt = z.number().int().positive()
const stage = z.number().int().min(1).max(4)
const score = z.number().int().min(0).max(10)
const nonEmpty = z.string().trim().min(1)
const symbol = nonEmpty.max(20).transform((s) => s.toUpperCase())

export const idBody = z.object({ id: posInt })

export const watchlistCreate = z.object({
  symbol,
  sector: z.string().trim().default(''),
  stage: stage.default(2),
  setup: nonEmpty.max(60).default('Breakout'),
  entryPrice: finite,
  stopLoss: finite,
  targetPrice: finite,
  rsScore: score.default(5),
  fundScore: score.default(5),
  priority: z.enum(['A', 'B', 'C']).default('B'),
  status: z.enum(['WATCHING', 'BOUGHT', 'DROPPED']).default('WATCHING'),
  notes: z.string().nullable().default(null),
})
export const watchlistUpdate = watchlistCreate
  .partial()
  .extend({ id: posInt, expectedUpdatedAt: z.string().datetime().optional() })

export const positionCreate = z.object({
  symbol,
  sector: z.string().trim().default(''),
  quantity: posInt,
  entryPrice: finite,
  currentPrice: finite.optional(),
  entryStage: stage.default(2),
  currentStage: stage.default(2),
  stopLoss: finite,
  confidence: z.enum(['A+', 'A', 'B', 'C', 'D']).default('B'),
  notes: z.string().nullable().default(null),
})
export const positionUpdate = z
  .object({
    id: posInt,
    symbol: symbol.optional(),
    sector: z.string().trim().optional(),
    quantity: posInt.optional(),
    entryPrice: finite.optional(),
    currentPrice: finite.optional(),
    entryStage: stage.optional(),
    currentStage: stage.optional(),
    stopLoss: finite.optional(),
    confidence: z.enum(['A+', 'A', 'B', 'C', 'D']).optional(),
    notes: z.string().nullable().optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
    closedPrice: finite.nullable().optional(),
    closedAt: z.string().datetime().nullable().optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((v) => v.status !== 'CLOSED' || typeof v.closedPrice === 'number', {
    message: 'ต้องระบุราคาปิดเมื่อปิดสถานะ',
    path: ['closedPrice'],
  })

export const marketReviewBody = z.object({
  weekOf: z.string().trim().min(8).optional(),
  setIndex: finite.optional(),
  breadthPct: z.number().min(0).max(100).optional(),
  setAboveMa: z.boolean().optional(),
  maRising: z.boolean().optional(),
  breadthOk: z.boolean().optional(),
  adConfirm: z.boolean().optional(),
  foreignBuy: z.boolean().optional(),
  notes: z.string().nullable().optional(),
})

export const sectorCreate = z.object({
  name: nonEmpty.max(30).transform((s) => s.toUpperCase()),
  stage: stage.default(2),
  rsVsSet: finite.default(0),
  trend: z.enum(['RISING', 'FLAT', 'FALLING']).default('RISING'),
  volume: z.enum(['HEAVY', 'NORMAL', 'LIGHT']).default('NORMAL'),
  score: z.number().int().min(1).max(5).default(3),
})
export const sectorUpdate = sectorCreate.partial().extend({ id: posInt })

export const actionCreate = z.object({
  type: z.enum(['BUY', 'SELL', 'ADD', 'ALERT', 'EVENT']),
  content: nonEmpty.max(500),
  weekOf: z.string().trim().min(8).optional(),
  done: z.boolean().default(false),
})
export const actionUpdate = z.object({
  id: posInt,
  type: z.enum(['BUY', 'SELL', 'ADD', 'ALERT', 'EVENT']).optional(),
  content: nonEmpty.max(500).optional(),
  done: z.boolean().optional(),
})

export const journalCreate = z.object({
  symbol,
  bias: z.enum(['FOMO', 'LOSS_AVERSION', 'DISPOSITION', 'CONFIRMATION', 'RECENCY', 'NONE']),
  outcome: z.enum(['WIN', 'LOSS', 'OPEN']),
  pnlPct: finite.nullable().default(null),
  lesson: z.string().trim().max(2000).default(''),
})

export const checklistPatch = z.object({ id: posInt, done: z.boolean() })
export const checklistReset = z.object({
  category: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY']),
})

export const thesisBody = z.object({
  id: posInt.optional(),
  expectedUpdatedAt: z.string().datetime().optional(),
  symbol,
  sector: z.string().trim().default(''),
  stockStage: stage.default(2),
  tripleConfirm: z.boolean().default(false),
  // Bound comes from the engine. It was hardcoded to 17 while the checklist
  // could only produce 16, so the schema accepted a score the engine itself
  // could never generate.
  tech17: z.number().int().min(0).max(TECHNICAL_MAX).default(0),
  epsGrowthPct: finite.default(0),
  epsAccelerating: z.boolean().default(false),
  cfoGeNi: z.boolean().default(false),
  revenueGrowthPct: finite.default(0),
  recurringRev: z.boolean().default(false),
  gmExpanding: z.boolean().default(false),
  opMarginAboveInd: z.boolean().default(false),
  debtEquity: finite.default(1),
  currentRatio: finite.default(1.5),
  fcfYieldPct: finite.default(0),
  foreignNetBuy: z.boolean().default(false),
  fundIncreasing: z.boolean().default(false),
  insiderBuying: z.boolean().default(false),
  catalyst: z.string().trim().max(1000).default(''),
  earningsDate: z.string().nullable().default(null),
  riskNote: z.string().nullable().default(null),
  entryStrategy: nonEmpty.max(60).default('Breakout'),
  entryPrice: finite.default(0),
  stopLoss: finite.default(0),
  target1: finite.default(0),
  target2: finite.default(0),
  foreignFlow: z.enum(['BUY_HEAVY', 'BUY', 'FLAT', 'SELL', 'SELL_HEAVY']).default('FLAT'),
  status: z.enum(['ACTIVE', 'CLOSED_IDEA']).default('ACTIVE'),
  quarters: z
    .array(z.object({ label: nonEmpty.max(20), eps: finite }))
    .max(12)
    .default([]),
})

export const backtestBody = z.object({
  capital: z.number().min(100_000).max(100_000_000).default(1_000_000),
  riskPct: z.number().min(0.25).max(5).default(1),
  maxPositions: z.number().int().min(1).max(20).default(8),
  commissionPct: z.number().min(0).max(1).default(0.25),
  requireVolume: z.boolean().default(true),
  requireRs: z.boolean().default(true),
  marketFilter: z.boolean().default(false),
  slippagePct: z.number().min(0).max(2).default(0.3),
})

export const monteCarloBody = z.object({
  returns: z.array(z.number()).min(1).max(400),
  sims: z.number().int().min(100).max(10_000).default(2000),
  capital: z.number().min(10_000).max(100_000_000).default(1_000_000),
  // Block is the default in the engine and here, so a client that says nothing
  // gets the less flattering answer rather than the nicer one.
  method: z.enum(['iid', 'block']).default('block'),
  blockSize: z.number().int().min(2).max(400).optional(),
  avgHoldWeeks: z.number().min(0.25).max(260).optional(),
})

export const bootstrapBody = z.object({
  action: z.enum(['init', 'demo', 'reset']),
})

// ─── Optimistic concurrency ──────────────────────────────────────────────────

/**
 * Rows a customer edits from more than one place carry a version token. The
 * client echoes the `updatedAt` it rendered; the route puts it in the WHERE
 * clause, so a write based on a stale read updates zero rows instead of
 * silently overwriting whatever happened in between.
 *
 * Optional on purpose: a caller that genuinely wants last-write-wins (a status
 * dropdown, say) simply omits it, and the behaviour is then explicit rather
 * than accidental.
 */
export const versioned = z.object({ expectedUpdatedAt: z.string().datetime().optional() })

/** Turn the token into a Prisma predicate fragment. */
export function versionWhere(expectedUpdatedAt: string | undefined) {
  return expectedUpdatedAt ? { updatedAt: new Date(expectedUpdatedAt) } : {}
}

// ─── Pagination ──────────────────────────────────────────────────────────────

/**
 * Every list endpoint is bounded. An unbounded findMany is a query whose cost
 * is set by the customer's own history — it works for a year and then one
 * account with four thousand journal entries times out the dashboard.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500

export function pageParams(req: Request): { take: number; skip: number } {
  const params = new URL(req.url).searchParams
  const rawLimit = Number(params.get('limit') ?? DEFAULT_PAGE_SIZE)
  const rawOffset = Number(params.get('offset') ?? 0)
  const take = Number.isFinite(rawLimit)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_PAGE_SIZE
  const skip = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0
  return { take, skip }
}

/** The envelope every paged list returns, so the client can page uniformly. */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export function page<T>(items: T[], total: number, { take, skip }: { take: number; skip: number }): Page<T> {
  return { items, total, limit: take, offset: skip, hasMore: skip + items.length < total }
}
