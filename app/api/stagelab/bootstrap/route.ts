import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate, overRowCap } from '@/lib/stagelab/guard'
import { bootstrapBody, readJson } from '@/lib/stagelab/http'
import { ensureTenant, loadDemoBook, resetTenant } from '@/lib/stagelab/bootstrap'
import { DEMO_POSITIONS, DEMO_WATCHLIST } from '@/lib/stagelab/seed-data'
import { guarded, tooLargeIfDeclared } from '@/lib/stagelab/problem'

export const dynamic = 'force-dynamic'

/**
 * POST /api/stagelab/bootstrap { action }
 *
 *   init  — idempotent framework seed (checklists + sector board)
 *   demo  — opt-in sample book, refused once the customer has real rows so a
 *           mis-click cannot mix invented trades into a real record
 *   reset — delete everything this tenant owns, then re-seed the framework
 */
export const POST = guarded('bootstrap.POST', async (req: Request) => {
  const g = await gate(null)
  if (!g.ok) return g.response
  const { user, plan } = g.ctx

  const tooLarge = tooLargeIfDeclared(req)
  if (tooLarge) return tooLarge

  const parsed = await readJson(req, bootstrapBody)
  if (!parsed.ok) return parsed.response

  if (parsed.data.action === 'init') {
    await ensureTenant(user.id)
    return NextResponse.json({ ok: true })
  }

  if (parsed.data.action === 'reset') {
    await resetTenant(user.id)
    await ensureTenant(user.id)
    return NextResponse.json({ ok: true })
  }

  // demo
  const [watchlist, positions] = await Promise.all([
    prisma.stageWatchlistItem.count({ where: { userId: user.id } }),
    prisma.stagePosition.count({ where: { userId: user.id } }),
  ])
  if (watchlist > 0 || positions > 0) {
    return badRequest('มีข้อมูลอยู่แล้ว — ล้างข้อมูลก่อนโหลดตัวอย่าง เพื่อไม่ให้ปนกับบันทึกจริง')
  }
  const capped =
    overRowCap(plan, 'watchlist', DEMO_WATCHLIST.length - 1) ??
    overRowCap(plan, 'positions', DEMO_POSITIONS.length - 1)
  if (capped) return capped

  await ensureTenant(user.id)
  await loadDemoBook(user.id)
  return NextResponse.json({ ok: true })
})
