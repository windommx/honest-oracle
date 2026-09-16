import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { badRequest, gate } from '@/lib/stagelab/guard'
import { guarded } from '@/lib/stagelab/problem'
import { MAX_PAGE_SIZE } from '@/lib/stagelab/http'
import { type CsvColumn, csvFilename, toCsv } from '@/lib/stagelab/csv'
import { pnlPct, positionValue, rrRatio } from '@/lib/stagelab/utils'

export const dynamic = 'force-dynamic'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  GET /api/stagelab/export?dataset=…                                      ║
// ║                                                                          ║
// ║  The plan matrix has advertised "ส่งออก CSV" on the pricing page since   ║
// ║  the module shipped, with nothing behind it. This is that feature.       ║
// ║                                                                          ║
// ║  Built on the server rather than from the client's state on purpose:     ║
// ║  the client only ever holds one page, the gate has to be enforced here   ║
// ║  anyway, and the derived columns (R:R, P/L, position value) must be the  ║
// ║  same numbers the UI showed — so they come from the same helpers.        ║
// ╚══════════════════════════════════════════════════════════════════════════╝

type Dataset = 'watchlist' | 'positions' | 'journal' | 'thesis'

const DATASETS: Dataset[] = ['watchlist', 'positions', 'journal', 'thesis']

const STATUS_TH: Record<string, string> = {
  WATCHING: 'เฝ้าดู',
  BOUGHT: 'ซื้อแล้ว',
  DROPPED: 'ปล่อย',
  OPEN: 'เปิดอยู่',
  CLOSED: 'ปิดแล้ว',
  ACTIVE: 'ยังใช้อยู่',
  CLOSED_IDEA: 'ปิดไอเดีย',
  WIN: 'กำไร',
  LOSS: 'ขาดทุน',
}

const th = (code: string) => STATUS_TH[code] ?? code

/** Round for display, matching what the table showed rather than raw floats. */
const r2 = (n: number) => Math.round(n * 100) / 100

export const GET = guarded('export.GET', async (req: Request) => {
  const g = await gate('export', req)
  if (!g.ok) return g.response
  const userId = g.ctx.user.id

  const raw = new URL(req.url).searchParams.get('dataset') ?? 'watchlist'
  if (!DATASETS.includes(raw as Dataset)) {
    return badRequest(`dataset ต้องเป็นหนึ่งใน ${DATASETS.join(' | ')}`)
  }
  const dataset = raw as Dataset
  const plan = g.ctx.plan.limits

  const body = await buildCsv(dataset, userId, plan)

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(dataset)}"`,
      // A customer's own book is never a shared cache entry.
      'Cache-Control': 'private, no-store',
    },
  })
})

async function buildCsv(
  dataset: Dataset,
  userId: string,
  limits: { watchlist: number; positions: number; journal: number; theses: number },
): Promise<string> {
  if (dataset === 'watchlist') {
    const rows = await prisma.stageWatchlistItem.findMany({
      where: { userId },
      orderBy: [{ priority: 'asc' }, { rsScore: 'desc' }],
      take: Math.min(MAX_PAGE_SIZE, limits.watchlist),
    })
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: 'หุ้น', value: (r) => r.symbol },
      { header: 'กลุ่ม', value: (r) => r.sector },
      { header: 'Stage', value: (r) => r.stage },
      { header: 'รูปแบบเข้า', value: (r) => r.setup },
      { header: 'ราคาเข้า', value: (r) => r.entryPrice },
      { header: 'Stop Loss', value: (r) => r.stopLoss },
      { header: 'ราคาเป้าหมาย', value: (r) => r.targetPrice },
      // Derived here from the same helper the table uses, so the spreadsheet
      // and the screen can never disagree about a trade's risk-reward.
      { header: 'R:R', value: (r) => r2(rrRatio(r.entryPrice, r.stopLoss, r.targetPrice)) },
      { header: 'คะแนน RS', value: (r) => r.rsScore },
      { header: 'คะแนนพื้นฐาน', value: (r) => r.fundScore },
      { header: 'ลำดับ', value: (r) => r.priority },
      { header: 'สถานะ', value: (r) => th(r.status) },
      { header: 'บันทึก', value: (r) => r.notes },
      { header: 'สร้างเมื่อ', value: (r) => r.createdAt },
    ]
    return toCsv(rows, columns)
  }

  if (dataset === 'positions') {
    const rows = await prisma.stagePosition.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
      take: Math.min(MAX_PAGE_SIZE, limits.positions * 2),
    })
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: 'หุ้น', value: (r) => r.symbol },
      { header: 'กลุ่ม', value: (r) => r.sector },
      { header: 'จำนวนหุ้น', value: (r) => r.quantity },
      { header: 'ราคาเข้า', value: (r) => r.entryPrice },
      { header: 'ราคาปัจจุบัน', value: (r) => r.currentPrice },
      { header: 'ราคาปิด', value: (r) => r.closedPrice },
      { header: 'Stage ตอนเข้า', value: (r) => r.entryStage },
      { header: 'Stage ปัจจุบัน', value: (r) => r.currentStage },
      { header: 'Stop Loss', value: (r) => r.stopLoss },
      { header: 'ความมั่นใจ', value: (r) => r.confidence },
      { header: 'สถานะ', value: (r) => th(r.status) },
      {
        header: 'P/L %',
        value: (r) =>
          r2(pnlPct({ ...r, openedAt: '', closedAt: null, updatedAt: '' })),
      },
      {
        header: 'P/L บาท',
        value: (r) =>
          r2(((r.status === 'OPEN' ? r.currentPrice : (r.closedPrice ?? r.currentPrice)) - r.entryPrice) * r.quantity),
      },
      {
        header: 'มูลค่า',
        value: (r) => r2(positionValue({ ...r, openedAt: '', closedAt: null, updatedAt: '' })),
      },
      { header: 'เปิดเมื่อ', value: (r) => r.openedAt },
      { header: 'ปิดเมื่อ', value: (r) => r.closedAt },
      { header: 'บันทึก', value: (r) => r.notes },
    ]
    return toCsv(rows, columns)
  }

  if (dataset === 'journal') {
    const rows = await prisma.stageJournalEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(MAX_PAGE_SIZE, limits.journal),
    })
    const columns: CsvColumn<(typeof rows)[number]>[] = [
      { header: 'วันที่', value: (r) => r.createdAt },
      { header: 'หุ้น', value: (r) => r.symbol },
      { header: 'อคติ', value: (r) => r.bias },
      { header: 'ผลลัพธ์', value: (r) => th(r.outcome) },
      { header: 'P/L %', value: (r) => r.pnlPct },
      { header: 'บทเรียน', value: (r) => r.lesson },
    ]
    return toCsv(rows, columns)
  }

  const rows = await prisma.stageThesis.findMany({
    where: { userId },
    orderBy: { id: 'desc' },
    take: Math.min(MAX_PAGE_SIZE, limits.theses),
  })
  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: 'หุ้น', value: (r) => r.symbol },
    { header: 'กลุ่ม', value: (r) => r.sector },
    { header: 'Stage', value: (r) => r.stockStage },
    { header: 'คะแนนเทคนิค', value: (r) => r.tech17 },
    { header: 'คะแนนพื้นฐาน', value: (r) => r.fundScore },
    { header: 'คะแนนรวม', value: (r) => r.combinedScore },
    { header: 'ระดับ', value: (r) => r.tier },
    { header: 'Triple Confirm', value: (r) => r.tripleConfirm },
    { header: 'EPS Growth %', value: (r) => r.epsGrowthPct },
    { header: 'Revenue Growth %', value: (r) => r.revenueGrowthPct },
    { header: 'FCF Yield %', value: (r) => r.fcfYieldPct },
    { header: 'D/E', value: (r) => r.debtEquity },
    { header: 'กระแสต่างชาติ', value: (r) => r.foreignFlow },
    { header: 'ราคาเข้า', value: (r) => r.entryPrice },
    { header: 'Stop Loss', value: (r) => r.stopLoss },
    { header: 'เป้า 1', value: (r) => r.target1 },
    { header: 'เป้า 2', value: (r) => r.target2 },
    { header: 'R:R', value: (r) => r2(rrRatio(r.entryPrice, r.stopLoss, r.target1)) },
    { header: 'ตัวเร่ง', value: (r) => r.catalyst },
    { header: 'อะไรจะทำให้ผิด', value: (r) => r.riskNote },
    { header: 'สถานะ', value: (r) => th(r.status) },
    { header: 'แก้ไขล่าสุด', value: (r) => r.updatedAt },
  ]
  return toCsv(rows, columns)
}
