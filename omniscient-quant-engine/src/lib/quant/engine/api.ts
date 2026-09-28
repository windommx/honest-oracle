/**
 * api.ts — Orchestrator สำหรับ API routes: รวมทุก layer + cache ผลลัพธ์หนัก
 * Artifacts ต่อการรัน 1 ครั้ง (เทียบเท่า run_id/ ของ pipeline):
 *   market panel, factor model, volcano, dependence matrix, backtest, board
 */

import { db } from '@/lib/db';
import { loadMarketState, ensureSeeded } from './panel';
import type { MarketState } from './types';
import { buildFactorModel, type FactorModelResult } from './factors';
import { buildVolcano, type VolcanoResult } from './volcano';
import { evaluateGates, currentRegimeSummary, type GateEval } from './gates';
import { runBacktest, currentProbs, type BacktestResult } from './backtest';
import { riskAssessment, type RiskResult } from './risk';
import { kde1d, kendallTau, claytonThetaFromTau, mean, psi } from '../stats';

interface AnalyticsBox {
  key: string;
  state?: MarketState;
  factors?: FactorModelResult;
  volcano?: VolcanoResult;
  backtest?: BacktestResult;
  probs?: Record<string, number>;
  thetaMatrix?: { symbols: string[]; matrix: number[][] };
  regime?: ReturnType<typeof currentRegimeSummary>;
}

const g = globalThis as unknown as { __oqeAnalytics?: AnalyticsBox };

async function box(): Promise<AnalyticsBox> {
  if (!g.__oqeAnalytics) g.__oqeAnalytics = { key: '' };
  const b = g.__oqeAnalytics;
  const counts = { stocks: await db.stock.count(), prices: await db.price.count() };
  const last = await db.price.findFirst({ orderBy: { date: 'desc' } });
  const key = `${counts.stocks}:${counts.prices}:${last?.date?.toISOString() ?? ''}`;
  if (b.key !== key) {
    b.key = key;
    b.state = undefined;
    b.factors = undefined;
    b.volcano = undefined;
    b.backtest = undefined;
    b.probs = undefined;
    b.thetaMatrix = undefined;
    b.regime = undefined;
  }
  if (!b.state) {
    b.state = await loadMarketState();
  }
  return b;
}

export async function seedIfNeeded(force = false) {
  const res = await ensureSeeded(force);
  g.__oqeAnalytics = undefined;
  return res;
}

export async function getSystemStatus() {
  const b = await box();
  const state = b.state!;
  const N = state.dates.length;
  return {
    seeded: true,
    stocks: state.stocks.length,
    days: N,
    firstDate: state.dates[0].toISOString().slice(0, 10),
    lastDate: state.dates[N - 1].toISOString().slice(0, 10),
    regime: getRegime(b),
  };
}

function getRegime(b: AnalyticsBox) {
  if (!b.regime) b.regime = currentRegimeSummary(b.state!);
  return b.regime;
}

export async function getFactorModel(): Promise<FactorModelResult> {
  const b = await box();
  if (!b.factors) b.factors = buildFactorModel(b.state!);
  return b.factors;
}

export async function getVolcano(): Promise<VolcanoResult> {
  const b = await box();
  if (!b.volcano) b.volcano = buildVolcano(b.state!);
  return b.volcano;
}

export async function getBacktest(): Promise<BacktestResult> {
  const b = await box();
  if (!b.backtest) b.backtest = runBacktest(b.state!);
  return b.backtest;
}

export async function getProbs(): Promise<Record<string, number>> {
  const b = await box();
  if (!b.probs) b.probs = currentProbs(b.state!);
  return b.probs;
}

// ───────────────────── Decision Board (L6) ─────────────────────

export interface BoardRow {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  price: number;
  chg1d: number;
  chg5d: number;
  chg21d: number;
  rsi: number;
  phase: string;
  phaseNum: number;
  gates: { g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean };
  signal: string;
  probUp: number;
  maxSizePct: number;
  cvar: number;
  thetaZ: number;
  ltd: number;
  decoupled: boolean;
  entryLow: number;
  entryHigh: number;
  stopStruct: number;
  stopHard: number;
  failingGates: string[];
  flow5: number;
  pe: number;
  pb: number;
}

export async function getBoard() {
  const b = await box();
  const state = b.state!;
  const N = state.dates.length;
  const regime = getRegime(b);
  const probs = await getProbs();
  const rows: BoardRow[] = state.stocks.map((s) => {
    const ev = evaluateGates(state, s.symbol, N - 1, { riskBudgetPct: 1.0, probUp: probs[s.symbol] });
    const r = s.rows[N - 1];
    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      theme: s.theme,
      price: +r.close.toFixed(2),
      chg1d: +(r.ret1 * 100).toFixed(2),
      chg5d: +(r.ret5 * 100).toFixed(2),
      chg21d: +(r.ret21 * 100).toFixed(2),
      rsi: +r.rsi14.toFixed(1),
      phase: ev.phaseLabel,
      phaseNum: ev.phase,
      gates: ev.gates,
      signal: ev.signal,
      probUp: ev.probUp,
      maxSizePct: ev.plan.sizePct,
      cvar: ev.plan.cvar,
      thetaZ: +r.thetaZ.toFixed(2),
      ltd: +r.ltd.toFixed(2),
      decoupled: r.decoupled,
      entryLow: ev.plan.entryLow,
      entryHigh: ev.plan.entryHigh,
      stopStruct: ev.plan.stopStruct,
      stopHard: ev.plan.stopHard,
      failingGates: ev.plan.failingGates,
      flow5: +r.flow5.toFixed(1),
      pe: r.pe,
      pb: r.pb,
    };
  });
  const nPullback = rows.filter((r) => r.signal === 'ENTRY_PULLBACK').length;
  const nMomentum = rows.filter((r) => r.signal === 'ENTRY_MOMENTUM').length;
  const decoupleAlerts = rows.filter((r) => r.decoupled);
  const psiStress = psi(
    state.fStress.slice(N - 240, N - 60),
    state.fStress.slice(N - 60),
  );
  return {
    regime,
    rows: rows.sort((a, b) => {
      const rank = (x: BoardRow) => (x.signal === 'ENTRY_PULLBACK' ? 0 : x.signal === 'ENTRY_MOMENTUM' ? 1 : 2);
      return rank(a) - rank(b) || b.probUp - a.probUp;
    }),
    summary: {
      nPullback,
      nMomentum,
      nNoTrade: rows.length - nPullback - nMomentum,
      decoupleAlerts: decoupleAlerts.map((r) => r.symbol),
      psiStress: +psiStress.toFixed(3),
      drift: psiStress > 0.2 ? 'HEAVY' : psiStress > 0.1 ? 'MODERATE' : 'STABLE',
    },
  };
}

// ───────────────────── Decision Detail ─────────────────────

export async function getDecision(symbol: string) {
  const b = await box();
  const state = b.state!;
  const N = state.dates.length;
  const si = state.stocks.findIndex((s) => s.symbol === symbol);
  if (si < 0) return null;
  const s = state.stocks[si];
  const probs = await getProbs();
  const ev: GateEval = evaluateGates(state, symbol, N - 1, { riskBudgetPct: 1.0, probUp: probs[symbol] });
  const risk: RiskResult = riskAssessment(s.rows.slice(-100), 1.0, 4, 20000, 777);

  const L = 250;
  const priceSeries = s.rows.slice(N - L).map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    close: +r.close.toFixed(3),
    volume: Math.round(r.volRatio * 100),
    ma20: null as number | null,
    obv: r.obvSlope,
  }));
  // ma20 series
  const closes = s.rows.map((r) => r.close);
  for (let k = 0; k < L; k++) {
    const t = N - L + k;
    const w = closes.slice(Math.max(0, t - 19), t + 1);
    priceSeries[k].ma20 = +(mean(w)).toFixed(3);
  }

  // gate history (light) last 120 days
  const gateHist: Array<{ date: string; g1: boolean; g2: boolean; g3: boolean; g4: boolean; g5: boolean; signal: string }> = [];
  for (let t = N - 120; t < N; t++) {
    const e = evaluateGates(state, symbol, t, { light: true });
    gateHist.push({
      date: state.dates[t].toISOString().slice(0, 10),
      ...e.gates,
      signal: e.signal,
    });
  }

  // dependence series
  const depSeries = s.rows.slice(N - L).map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    theta: +r.theta.toFixed(3),
    thetaZ: +r.thetaZ.toFixed(2),
    ltd: +r.ltd.toFixed(2),
    decoupled: r.decoupled,
  }));

  // KDE of close price (support zones)
  const kde = kde1d(s.rows.slice(N - 250).map((r) => r.close), 80);

  // fundamentals (PIT) latest 6
  const dbStock = await db.stock.findUnique({
    where: { symbol },
    include: { fundamentals: { orderBy: { announceDate: 'desc' }, take: 6 } },
  });

  return {
    symbol,
    name: s.name,
    sector: s.sector,
    theme: s.theme,
    beta: s.beta,
    row: {
      date: state.dates[N - 1].toISOString().slice(0, 10),
      close: s.rows[N - 1].close,
      ret1: s.rows[N - 1].ret1,
      ret5: s.rows[N - 1].ret5,
      ret21: s.rows[N - 1].ret21,
      rsi: s.rows[N - 1].rsi14,
      vol21: s.rows[N - 1].vol21,
      flow5: s.rows[N - 1].flow5,
      pe: s.rows[N - 1].pe,
      pb: s.rows[N - 1].pb,
      roe: s.rows[N - 1].roe,
      de: s.rows[N - 1].de,
      revG: s.rows[N - 1].revG,
      distHigh: s.rows[N - 1].distHigh,
      theta: s.rows[N - 1].theta,
      thetaZ: s.rows[N - 1].thetaZ,
      ltd: s.rows[N - 1].ltd,
      decoupled: s.rows[N - 1].decoupled,
    },
    eval: {
      gates: ev.gates,
      signal: ev.signal,
      phase: ev.phaseLabel,
      probUp: ev.probUp,
      plan: ev.plan,
      reasons: ev.plan.reasons,
    },
    risk: {
      volAnn: +risk.volAnn.toFixed(4),
      var95: +risk.var95.toFixed(4),
      var99: +risk.var99.toFixed(4),
      cvar975: +risk.cvar975.toFixed(4),
      hardStop: +risk.hardStop.toFixed(3),
      structStop: +risk.structStop.toFixed(3),
      maxSizePct: +risk.maxSizePct.toFixed(1),
      paths: risk.paths,
      lossHistogram: risk.lossHistogram,
    },
    priceSeries,
    gateHist,
    depSeries,
    kde: { xs: kde.xs.map((x) => +x.toFixed(3)), ys: kde.ys.map((y) => +y.toFixed(5)) },
    fundamentals: dbStock?.fundamentals.map((f) => ({
      announceDate: f.announceDate.toISOString().slice(0, 10),
      period: f.period,
      pe: f.pe,
      pb: f.pb,
      roe: f.roe,
      de: f.de,
      revenueGrowth: f.revenueGrowth,
      netProfitM: f.netProfitM,
    })) ?? [],
  };
}

// ───────────────────── Dependence matrix (L2) ─────────────────────

export async function getThetaMatrix() {
  const b = await box();
  const state = b.state!;
  if (!b.thetaMatrix) {
    const symbols = state.stocks.map((s) => s.symbol);
    const n = symbols.length;
    const rets = state.stocks.map((s) => s.rows.slice(-120).map((r) => r.ret1));
    const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 20;
      for (let j = i + 1; j < n; j++) {
        const tau = kendallTau(rets[i], rets[j]);
        const th = claytonThetaFromTau(tau);
        matrix[i][j] = th;
        matrix[j][i] = th;
      }
    }
    b.thetaMatrix = { symbols, matrix: matrix.map((row) => row.map((v) => +v.toFixed(2))) };
  }
  const N = state.dates.length;
  const decouples = state.stocks.map((s) => ({
    symbol: s.symbol,
    thetaZ: +s.rows[N - 1].thetaZ.toFixed(2),
    theta: +s.rows[N - 1].theta.toFixed(2),
    ltd: +s.rows[N - 1].ltd.toFixed(2),
    decoupled: s.rows[N - 1].decoupled,
    psi: +psi(s.rows.slice(N - 240, N - 60).map((r) => r.theta), s.rows.slice(N - 60).map((r) => r.theta)).toFixed(3),
  }));
  return { ...b.thetaMatrix, decouples };
}

// ───────────────────── Journal helpers ─────────────────────

export async function seedDemoJournal() {
  const board = await getBoard();
  const candidates = board.rows.filter((r) => r.signal !== 'NO_TRADE').slice(0, 3);
  const fallback = board.rows.slice(0, 2);
  const picks = [...candidates, ...fallback].slice(0, 4);
  const data = picks.map((r) => ({
    runDate: new Date(),
    symbol: r.symbol,
    signal: r.signal,
    gates: r.gates,
    price: r.price,
    entryLow: r.entryLow,
    entryHigh: r.entryHigh,
    stopStruct: r.stopStruct,
    stopHard: r.stopHard,
    sizePct: r.maxSizePct,
    cvar: r.cvar,
    probUp: r.probUp,
    status: r.signal === 'NO_TRADE' ? 'SKIPPED' : 'PLANNED',
    notes: 'seeded from decision board (demo)',
  }));
  for (const d of data) {
    const exists = await db.journalEntry.findFirst({
      where: { symbol: d.symbol, status: d.status, notes: d.notes },
    });
    if (!exists) await db.journalEntry.create({ data: d });
  }
  return db.journalEntry.count();
}
