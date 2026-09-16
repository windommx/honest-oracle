// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  StageLab plan matrix — the single source of truth for what a customer   ║
// ║  may do.                                                                 ║
// ║                                                                          ║
// ║  Two distinct kinds of limit live here and they exist for different      ║
// ║  reasons:                                                                ║
// ║                                                                          ║
// ║    • FEATURE gates decide whether a surface exists for a plan at all.    ║
// ║      They are the upgrade reason. The free tier is a complete weekly     ║
// ║      routine — market score, funnel, watchlist, portfolio, journal —      ║
// ║      because a screener you cannot finish a week with sells nothing.     ║
// ║      What Pro adds is the research desk: thesis pages, backtesting,      ║
// ║      the short/rotation/options tooling and the Quant Lab.               ║
// ║                                                                          ║
// ║    • ROW and COMPUTE caps protect the database and the CPU. They apply   ║
// ║      to every plan, Pro included, just at different heights.             ║
// ║                                                                          ║
// ║  This module is imported by both client and server, so it must stay      ║
// ║  free of Prisma, next-auth and node builtins. Enforcement lives in       ║
// ║  lib/stagelab/guard.ts; this file only states the rules.                 ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export type StageFeature =
  // ── included in every plan ────────────────────────────────────────────────
  | 'dashboard'
  | 'weekly'
  | 'screener'
  | 'watchlist'
  | 'portfolio'
  | 'journal'
  | 'tools'
  | 'learn'
  // ── paid ──────────────────────────────────────────────────────────────────
  | 'alerts'
  | 'thesis'
  | 'backtest'
  | 'pro'
  | 'quant'
  | 'audit'
  | 'export'

/** Row caps are per user. `null` means "no cap beyond the DB-safety ceiling". */
export interface StageLimits {
  watchlist: number
  positions: number
  theses: number
  sectors: number
  actions: number
  journal: number
  /** Heavy compute (backtest, Monte Carlo, trap scan, unified score) per UTC day. */
  computePerDay: number
}

export interface StagePlan {
  key: StagePlanKey
  label: string
  /** Short sentence used on the pricing page and the upgrade nudge. */
  tagline: string
  priceThb: number | null
  features: readonly StageFeature[]
  limits: StageLimits
}

export type StagePlanKey = 'free' | 'pro' | 'team'

const FREE_FEATURES = [
  'dashboard',
  'weekly',
  'screener',
  'watchlist',
  'portfolio',
  'journal',
  'tools',
  'learn',
] as const

const PAID_FEATURES = [
  ...FREE_FEATURES,
  'alerts',
  'thesis',
  'backtest',
  'pro',
  'quant',
  'audit',
  'export',
] as const

export const STAGE_PLANS: Record<StagePlanKey, StagePlan> = {
  free: {
    key: 'free',
    label: 'Free',
    tagline: 'รอบทบทวนรายสัปดาห์ครบทั้ง 5 ขั้น — พอสำหรับเทรดจริงหนึ่งพอร์ต',
    priceThb: 0,
    features: FREE_FEATURES,
    limits: {
      watchlist: 10,
      positions: 5,
      theses: 0,
      sectors: 12,
      actions: 30,
      journal: 50,
      computePerDay: 0,
    },
  },
  pro: {
    key: 'pro',
    label: 'Pro',
    tagline: 'เพิ่มโต๊ะวิจัย: Thesis, Backtest, Pro Desk และ Quant Lab พร้อมสมุดหลักฐาน',
    priceThb: 590,
    features: PAID_FEATURES,
    limits: {
      watchlist: 200,
      positions: 100,
      theses: 100,
      sectors: 40,
      actions: 500,
      journal: 2000,
      computePerDay: 200,
    },
  },
  team: {
    key: 'team',
    label: 'Team',
    tagline: 'สำหรับทีมกลยุทธ์ — โควตาประมวลผลสูงและเพดานข้อมูลกว้างขึ้น',
    priceThb: 1890,
    features: PAID_FEATURES,
    limits: {
      watchlist: 1000,
      positions: 500,
      theses: 500,
      sectors: 100,
      actions: 2000,
      journal: 10000,
      computePerDay: 1000,
    },
  },
}

/**
 * Normalize whatever is on `user.plan` into a plan we actually know about.
 * An unrecognized plan string degrades to free rather than throwing: a typo in
 * a billing webhook must not lock a paying customer out of their own journal.
 */
export function stagePlan(plan: string | null | undefined): StagePlan {
  if (plan === 'pro') return STAGE_PLANS.pro
  if (plan === 'team') return STAGE_PLANS.team
  return STAGE_PLANS.free
}

export function hasFeature(plan: string | null | undefined, feature: StageFeature): boolean {
  return stagePlan(plan).features.includes(feature)
}

export function limitFor(plan: string | null | undefined, key: keyof StageLimits): number {
  return stagePlan(plan).limits[key]
}

/** Human-readable reason shown when a gate closes. Thai, because the UI is. */
export const FEATURE_LABELS: Record<StageFeature, string> = {
  dashboard: 'ภาพรวม',
  weekly: 'รอบทบทวนรายสัปดาห์',
  screener: 'Screener',
  watchlist: 'Watchlist',
  portfolio: 'พอร์ต',
  journal: 'Journal',
  tools: 'เครื่องมือ',
  learn: 'คู่มือ',
  alerts: 'Risk Radar',
  thesis: 'Stock Thesis',
  backtest: 'Backtest',
  pro: 'Pro Desk',
  quant: 'Quant Lab',
  audit: 'สมุดหลักฐาน',
  export: 'ส่งออก CSV',
}
