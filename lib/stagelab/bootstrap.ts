import { prisma } from '@/lib/prisma'
import {
  DEFAULT_CHECKLIST,
  DEFAULT_SECTORS,
  DEMO_ACTIONS,
  DEMO_JOURNAL,
  DEMO_POSITIONS,
  DEMO_WATCHLIST,
  STAGE_UNIVERSE,
} from './seed-data'
import { weekKey } from './utils'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  First-run bootstrap.                                                    ║
// ║                                                                          ║
// ║  A tenant is created lazily, on their first StageLab request, rather     ║
// ║  than at signup: users of the other products in this repo should not pay ║
// ║  for rows they never asked for. Every function here is idempotent — it   ║
// ║  is called on ordinary reads, so running twice must be a no-op.          ║
// ╚══════════════════════════════════════════════════════════════════════════╝

/**
 * Give a tenant the framework rows they need for the app to make sense:
 * the discipline checklists, the sector board, and an empty market review for
 * the current week. Deliberately no trades — see seed-data.ts.
 */
export async function ensureTenant(userId: string): Promise<void> {
  const [checklistCount, sectorCount] = await Promise.all([
    prisma.stageChecklistItem.count({ where: { userId } }),
    prisma.stageSector.count({ where: { userId } }),
  ])

  if (checklistCount === 0) {
    await prisma.stageChecklistItem.createMany({
      data: DEFAULT_CHECKLIST.map((c) => ({ ...c, userId })),
    })
  }

  if (sectorCount === 0) {
    const week = weekKey()
    await prisma.stageSector.createMany({
      data: DEFAULT_SECTORS.map((s) => ({ ...s, userId, weekOf: week })),
    })
  }
}

/**
 * The current week's market review, created on demand.
 *
 * `upsert` on the composite key rather than find-then-create: two parallel
 * dashboard fetches on a fresh account would otherwise race and one would fail
 * the unique constraint.
 */
export async function ensureMarketReview(userId: string) {
  const week = weekKey()
  return prisma.stageMarketReview.upsert({
    where: { userId_weekOf: { userId, weekOf: week } },
    create: { userId, weekOf: week },
    update: {},
  })
}

/** Opt-in sample book, so an evaluator can see a populated app in one click. */
export async function loadDemoBook(userId: string): Promise<void> {
  const week = weekKey()
  await prisma.$transaction([
    prisma.stageWatchlistItem.createMany({
      data: DEMO_WATCHLIST.map((w) => ({ ...w, userId })),
    }),
    prisma.stagePosition.createMany({
      data: DEMO_POSITIONS.map((p) => ({ ...p, userId })),
    }),
    prisma.stageJournalEntry.createMany({
      data: DEMO_JOURNAL.map((j) => ({ ...j, userId })),
    }),
    prisma.stageActionItem.createMany({
      data: DEMO_ACTIONS.map((a) => ({ ...a, userId, weekOf: week })),
    }),
  ])
}

/** Remove everything this tenant owns in StageLab. Used by "เริ่มใหม่". */
export async function resetTenant(userId: string): Promise<void> {
  await prisma.$transaction([
    prisma.stageWatchlistItem.deleteMany({ where: { userId } }),
    prisma.stagePosition.deleteMany({ where: { userId } }),
    prisma.stageJournalEntry.deleteMany({ where: { userId } }),
    prisma.stageActionItem.deleteMany({ where: { userId } }),
    prisma.stageThesis.deleteMany({ where: { userId } }),
    prisma.stageNightlySnapshot.deleteMany({ where: { userId } }),
    prisma.stageSector.deleteMany({ where: { userId } }),
    prisma.stageChecklistItem.deleteMany({ where: { userId } }),
    prisma.stageMarketReview.deleteMany({ where: { userId } }),
  ])
}

/**
 * Make sure the shared universe exists before something tries to read it.
 *
 * This is a write on a read path, which is normally a smell — but the universe
 * is reference data that is identical for everyone and has to be there for the
 * screener to mean anything. Doing it lazily means a fresh deployment works
 * without an out-of-band seed step, and the count check makes it a single
 * cheap query on every call after the first.
 */
export async function ensureUniverse(): Promise<void> {
  const count = await prisma.stageStock.count()
  if (count === 0) await syncUniverse()
}

/**
 * Publish the shared SET universe. Idempotent: an upsert per symbol so
 * re-running refreshes prices without orphaning user references to a symbol
 * that would otherwise be deleted and re-created under a new id.
 */
export async function syncUniverse(): Promise<number> {
  for (const row of STAGE_UNIVERSE) {
    await prisma.stageStock.upsert({
      where: { symbol: row.symbol },
      create: row,
      update: row,
    })
  }
  return STAGE_UNIVERSE.length
}
