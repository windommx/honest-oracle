/**
 * dossiers.ts — บริบทร่วมของรายงานรายหุ้น (server-only)
 *
 * Meta-Risk, Apex และ Deep Research ต้องใช้ backtest + P(up) + board + journal ชุดเดียวกัน
 * → โหลดที่นี่ที่เดียว ตัวเลขทุกหน้าจึงมาจากการคำนวณชุดเดียวกันเสมอ (ไม่ใช่ copy โค้ดแล้วค่อย ๆ เพี้ยน)
 */

import { db } from '@/lib/db';
import { getBacktest, getBoard, getProbs } from './api';
import { buildApexDossier, type ApexDossier } from './apex';
import type { BacktestResult } from './backtest';
import { buildMetaRiskDossier, type MetaRiskDossier } from './meta-risk';
import { ensureSeeded, loadMarketState } from './panel';
import type { MarketState } from './types';

export interface RiskContext {
  state: MarketState;
  bt: BacktestResult;
  probs: Record<string, number>;
  board: { rows: Array<{ symbol: string; theme: string; signal: string; maxSizePct: number }>; summary: { psiStress: number } };
  journal: Array<{ symbol: string; status: string; pnlPct: number | null }>;
}

export async function loadRiskContext(): Promise<RiskContext> {
  await ensureSeeded(false);
  const [state, bt, probs, board, journal] = await Promise.all([
    loadMarketState(),
    getBacktest(),
    getProbs(),
    getBoard(),
    db.journalEntry.findMany({ orderBy: { runDate: 'desc' }, take: 30 }),
  ]);
  return {
    state,
    bt,
    probs,
    board: {
      rows: board.rows.map((r) => ({ symbol: r.symbol, theme: r.theme, signal: r.signal, maxSizePct: r.maxSizePct })),
      summary: { psiStress: board.summary.psiStress },
    },
    journal: journal.map((j) => ({ symbol: j.symbol, status: j.status, pnlPct: j.pnlPct })),
  };
}

export function metaRiskFor(ctx: RiskContext, symbol: string): MetaRiskDossier | null {
  return buildMetaRiskDossier(ctx.state, symbol, ctx.bt, ctx.board, ctx.journal, ctx.probs[symbol] ?? 0.5);
}

/** Apex อ่านคำสั่ง size override ของ Risk MDX (Meta-Risk) เพราะเป็นขนาดไม้สุดท้าย */
export function apexFor(ctx: RiskContext, symbol: string, meta: MetaRiskDossier | null = metaRiskFor(ctx, symbol)): ApexDossier | null {
  return buildApexDossier(ctx.state, symbol, ctx.bt, ctx.probs[symbol] ?? 0.5, { riskMdx: meta?.riskMdx ?? null });
}
