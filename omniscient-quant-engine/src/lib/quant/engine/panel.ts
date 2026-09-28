/**
 * panel.ts — Load DB → in-memory feature panel (L0: matching, PIT join, QC)
 * Cached in globalThis by data version so API routes stay fast.
 */

import { db } from '@/lib/db';
import type { FeatureKey, MarketState, StockPanel, DayRow } from './types';
import { FEATURE_KEYS } from './types';
import { generateMarket, GeneratedMarket } from '../market';
import {
  kendallTau, claytonThetaFromTau, mean, std, pearson, quantile, linregSlope, clamp,
} from '../stats';
import { mulberry32, gaussianFactory, tradingDates } from '../rng';

let genCache: GeneratedMarket | null = null;

export function getGenerated(seed = 20250902): GeneratedMarket {
  if (!genCache) genCache = generateMarket(seed);
  return genCache;
}

// ─────────────────────── rolling helpers ───────────────────────

function rsi14(closes: number[]): number[] {
  const out = new Array<number>(closes.length).fill(50);
  let avgG = 0;
  let avgL = 0;
  for (let i = 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = Math.max(ch, 0);
    const l = Math.max(-ch, 0);
    if (i <= 14) {
      avgG += g / 14;
      avgL += l / 14;
      out[i] = 50;
      continue;
    }
    avgG = (avgG * 13 + g) / 14;
    avgL = (avgL * 13 + l) / 14;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}

function obvSlope21(closes: number[], volumes: number[]): number[] {
  const out = new Array<number>(closes.length).fill(0);
  const obv = new Array<number>(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    obv[i] = obv[i - 1] + Math.sign(closes[i] - closes[i - 1]) * volumes[i];
  }
  for (let i = 21; i < closes.length; i++) {
    const w = obv.slice(i - 20, i + 1);
    const slope = linregSlope(
      w.map((_, k) => k),
      w,
    );
    const scale = Math.max(1e-9, Math.abs(w[20]) + 1e-9);
    out[i] = clamp((slope * 21) / scale, -3, 3);
  }
  return out;
}

function rollingSma(x: number[], w: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  let acc = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i];
    if (i >= w) acc -= x[i - w];
    if (i >= w - 1) out[i] = acc / w;
  }
  return out;
}

function rollingStd(x: number[], w: number): number[] {
  const out = new Array<number>(x.length).fill(0);
  for (let i = w - 1; i < x.length; i++) {
    out[i] = std(x.slice(i - w + 1, i + 1));
  }
  return out;
}

function pctChange(x: number[], k: number): number[] {
  const out = new Array<number>(x.length).fill(0);
  for (let i = k; i < x.length; i++) out[i] = x[i] / x[i - k] - 1;
  return out;
}

// ─────────────────────── PIT as-of join ───────────────────────

interface FundPoint {
  announce: number; // ms
  pe: number; pb: number; roe: number; de: number; revG: number;
}

function asofFundamentals(
  fundPoints: FundPoint[],
  timeMs: number,
): FundPoint | null {
  // fundPoints sorted by announce
  let lo = 0;
  let hi = fundPoints.length - 1;
  let best: FundPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (fundPoints[mid].announce <= timeMs) {
      best = fundPoints[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

// ─────────────────────── dependence (L2) ───────────────────────

function computeDependence(ret: number[], marketRet: number[]): {
  theta: number[]; thetaZ: number[]; ltd: number[]; decoupled: boolean[];
} {
  const W = 60;
  const theta: number[] = new Array(ret.length).fill(2);
  const corr: number[] = new Array(ret.length).fill(0);
  for (let i = W; i < ret.length; i++) {
    const a = ret.slice(i - W + 1, i + 1);
    const b = marketRet.slice(i - W + 1, i + 1);
    const tau = kendallTau(a, b);
    theta[i] = claytonThetaFromTau(tau);
    corr[i] = pearson(a, b);
  }
  // rolling z (120d) of theta
  const thetaZ: number[] = new Array(ret.length).fill(0);
  for (let i = 0; i < ret.length; i++) {
    const lo = Math.max(W, i - 119);
    const w = theta.slice(lo, i + 1);
    if (w.length < 40) {
      thetaZ[i] = 0;
      continue;
    }
    const m = mean(w);
    const s = std(w) || 1e-9;
    thetaZ[i] = (theta[i] - m) / s;
  }
  // lower tail dependence proxy: correlation conditional on market bottom quintile
  const mQ = quantile(marketRet.slice(W), 0.2);
  const ltd: number[] = new Array(ret.length).fill(0);
  for (let i = W; i < ret.length; i++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let k = i - W + 1; k <= i; k++) {
      if (marketRet[k] < mQ) {
        a.push(ret[k]);
        b.push(marketRet[k]);
      }
    }
    ltd[i] = a.length > 12 ? Math.max(0, pearson(a, b)) * 0.9 : 0.5;
  }
  const decoupled = thetaZ.map((z) => z < -1.5);
  return { theta, thetaZ, ltd, decoupled };
}

// ─────────────────────── market state builder ───────────────────────

export async function buildMarketState(): Promise<MarketState> {
  const gen = getGenerated();
  const dates = gen.dates;
  const N = dates.length;

  // regime: risk_off if below MA100 or vol20 in top quartile
  const ma100 = rollingSma(gen.marketClose, 100);
  const volQ75 = quantile(gen.marketVol20.slice(150), 0.75);
  const regime = gen.marketClose.map((c, t) =>
    t >= 100 && (c < ma100[t] || gen.marketVol20[t] > volQ75) ? 'risk_off' : 'risk_on',
  ) as MarketState['regime'];

  const marketRet = pctChange(gen.marketClose, 1);

  const stocks: StockPanel[] = gen.stocks.map((s) => {
    const closes = s.series.close;
    const vols = s.series.volume;
    const rets = pctChange(closes, 1);
    const ret5 = pctChange(closes, 5);
    const ret21 = pctChange(closes, 21);
    const vol21raw = rollingStd(rets, 21).map((v) => v * Math.sqrt(252));
    const rsi = rsi14(closes);
    const vma5 = rollingSma(vols, 5);
    const vma60 = rollingSma(vols, 60);
    const obv = obvSlope21(closes, vols);
    const max252: number[] = new Array(N).fill(NaN);
    for (let t = 0; t < N; t++) {
      max252[t] = Math.max(...closes.slice(Math.max(0, t - 251), t + 1));
    }
    const ma20 = rollingSma(closes, 20);
    const ma50 = rollingSma(closes, 50);
    const dep = computeDependence(rets, marketRet);

    // fund flow 5d smoothed
    const flowRaw = s.flows.map((f) => f.netFlowM);
    const flow5 = flowRaw.map((_, t) => mean(flowRaw.slice(Math.max(0, t - 4), t + 1)));

    // PIT fundamentals as-of
    const fundPoints: FundPoint[] = s.fundamentals
      .map((f) => ({
        announce: f.announceDate.getTime(),
        pe: f.pe, pb: f.pb, roe: f.roe, de: f.de, revG: f.revenueGrowth,
      }))
      .sort((a, b) => a.announce - b.announce);

    const rows: DayRow[] = [];
    for (let t = 0; t < N; t++) {
      const fund = asofFundamentals(fundPoints, dates[t].getTime());
      rows.push({
        t,
        date: dates[t],
        close: closes[t],
        ret1: rets[t],
        ret5: ret5[t],
        ret21: ret21[t],
        vol21: vol21raw[t] || 0,
        rsi14: rsi[t],
        volRatio: vma60[t] ? vma5[t] / vma60[t] : 1,
        obvSlope: obv[t],
        distHigh: closes[t] / max252[t] - 1,
        ma20Gap: ma20[t] ? closes[t] / ma20[t] - 1 : 0,
        flow5: flow5[t],
        theta: dep.theta[t],
        thetaZ: dep.thetaZ[t],
        ltd: dep.ltd[t],
        decoupled: dep.decoupled[t],
        pe: fund?.pe ?? 0,
        pb: fund?.pb ?? 0,
        roe: fund?.roe ?? 0,
        de: fund?.de ?? 0,
        revG: fund?.revG ?? 0,
        z: {} as Record<FeatureKey, number>,
      });
    }
    return {
      symbol: s.def.symbol,
      name: s.def.name,
      sector: s.def.sector,
      theme: s.def.theme,
      beta: s.def.beta,
      rows,
    };
  });

  // ── cross-sectional z-scores per date (over stocks) ──
  for (let t = 0; t < N; t++) {
    for (const key of FEATURE_KEYS) {
      const vals = stocks.map((st) => {
        const v = st.rows[t][key as keyof DayRow];
        return typeof v === 'number' ? v : 0;
      });
      const m = mean(vals);
      const sd = std(vals) || 1e-9;
      stocks.forEach((st, i) => {
        st.rows[t].z[key] = (vals[i] - m) / sd;
      });
    }
  }

  // ── market-level factor series (time z-scored cross-sectional RAW means) ──
  // ⚠️ ห้ามใช้ค่าเฉลี่ยของ z-scores (ผลรวม z ต่อวัน = 0 เสมอ) — ต้องใช้ raw
  const rawStress = dates.map((_, t) => mean(stocks.map((s) => s.rows[t].vol21)));
  const rawMomentum = dates.map((_, t) => mean(stocks.map((s) => s.rows[t].ret21)));
  const rawFlow = dates.map(
    (_, t) => (stocks.filter((s) => s.rows[t].flow5 > 0).length / stocks.length) * 2 - 1,
  );
  const tz = (x: number[], w = 120) => {
    const out = new Array<number>(x.length).fill(0);
    for (let i = 0; i < x.length; i++) {
      const lo = Math.max(0, i - w + 1);
      const seg = x.slice(lo, i + 1);
      if (seg.length < 30) continue;
      out[i] = (x[i] - mean(seg)) / (std(seg) || 1e-9);
    }
    return out;
  };
  const fStress = tz(rawStress);
  const fMomentum = tz(rawMomentum);
  const fFlow = tz(rawFlow);

  return { dates, marketClose: gen.marketClose, regime, fStress, fMomentum, fFlow, stocks };
}

// ─────────────────────── DB-backed state w/ cache ───────────────────────

export interface DataVersion {
  count: number;
  lastDate: string;
}

interface CacheBox {
  version: string;
  state?: MarketState;
  promise?: Promise<MarketState>;
  dbState?: { counts: Record<string, number>; lastDate: string } | null;
}

const g = globalThis as unknown as { __oqeCache?: CacheBox };
function cache(): CacheBox {
  if (!g.__oqeCache) g.__oqeCache = { version: '' };
  return g.__oqeCache;
}

export async function ensureSeeded(force = false): Promise<DataVersion> {
  const existing = await db.stock.count();
  const gen = getGenerated();
  if (existing > 0 && !force) {
    const last = await db.price.findFirst({ orderBy: { date: 'desc' } });
    return { count: existing, lastDate: last?.date?.toISOString() ?? '' };
  }
  if (force) {
    await db.price.deleteMany();
    await db.fundFlow.deleteMany();
    await db.fundamental.deleteMany();
    await db.stock.deleteMany();
  }

  for (const s of gen.stocks) {
    const stock = await db.stock.create({
      data: {
        symbol: s.def.symbol,
        name: s.def.name,
        sector: s.def.sector,
        theme: s.def.theme,
        beta: s.def.beta,
      },
    });
    const priceRows = s.series.close.map((c, t) => ({
      stockId: stock.id,
      date: s.series.dates[t],
      open: s.series.open[t],
      high: s.series.high[t],
      low: s.series.low[t],
      close: c,
      volume: s.series.volume[t],
    }));
    // chunked createMany
    for (let i = 0; i < priceRows.length; i += 500) {
      await db.price.createMany({ data: priceRows.slice(i, i + 500) });
    }
    if (s.fundamentals.length) {
      await db.fundamental.createMany({
        data: s.fundamentals.map((f) => ({
          stockId: stock.id,
          announceDate: f.announceDate,
          period: f.period,
          pe: f.pe, pb: f.pb, roe: f.roe, de: f.de,
          revenueGrowth: f.revenueGrowth,
          netProfitM: f.netProfitM,
        })),
      });
    }
    await db.fundFlow.createMany({
      data: s.flows.map((f) => ({
        stockId: stock.id,
        date: f.date,
        netFlowM: f.netFlowM,
      })),
    });
  }
  cache().version = '';
  cache().state = undefined;
  cache().promise = undefined;
  const count = await db.stock.count();
  const last = await db.price.findFirst({ orderBy: { date: 'desc' } });
  return { count, lastDate: last?.date?.toISOString() ?? '' };
}

export async function loadMarketState(): Promise<MarketState> {
  const c = cache();
  const counts = {
    stocks: await db.stock.count(),
    prices: await db.price.count(),
  };
  const last = await db.price.findFirst({ orderBy: { date: 'desc' } });
  const version = `${counts.stocks}:${counts.prices}:${last?.date?.toISOString() ?? ''}`;
  if (c.version === version && c.state) return c.state;
  if (c.version === version && c.promise) return c.promise;

  c.version = version;
  c.promise = (async () => {
    if (counts.stocks === 0) {
      await ensureSeeded();
    }
    const state = await buildFromDb();
    c.state = state;
    return state;
  })();
  const st = await c.promise;
  c.promise = undefined;
  return st;
}

/**
 * Build the in-memory panel from DB tables (L0 provenance) — falls back to
 * generator content is NOT used here: the DB is the single source of truth.
 */
async function buildFromDb(): Promise<MarketState> {
  const dbStocks = await db.stock.findMany({
    include: {
      prices: { orderBy: { date: 'asc' } },
      fundamentals: { orderBy: { announceDate: 'asc' } },
      flows: { orderBy: { date: 'asc' } },
    },
  });
  if (dbStocks.length === 0) {
    return buildMarketState();
  }

  // canonical dates = union of price dates from DB
  const dateSet = new Set<number>();
  for (const s of dbStocks) for (const p of s.prices) dateSet.add(p.date.getTime());
  const dates = [...dateSet].sort((a, b) => a - b).map((ms) => new Date(ms));
  const N = dates.length;
  const keyOf = (d: Date) => d.toISOString().slice(0, 10);

  // market proxy = equal-weight return index from DB closes (starts at 1000)
  const perStockRet: number[][] = [];
  const stocks: StockPanel[] = [];
  const perStockCloses: number[][] = [];

  for (const s of dbStocks) {
    const byDate = new Map<string, { close: number; volume: number }>();
    for (const p of s.prices) byDate.set(keyOf(p.date), { close: p.close, volume: p.volume });
    const closes = dates.map((d) => byDate.get(keyOf(d))?.close ?? NaN);
    perStockCloses.push(closes);
  }
  // market proxy returns (equal weight, skipping NaN)
  const marketRet = new Array<number>(N).fill(0);
  for (let t = 1; t < N; t++) {
    let acc = 0;
    let cnt = 0;
    for (let s = 0; s < perStockCloses.length; s++) {
      const c0 = perStockCloses[s][t - 1];
      const c1 = perStockCloses[s][t];
      if (Number.isFinite(c0) && Number.isFinite(c1) && c0 > 0) {
        acc += c1 / c0 - 1;
        cnt++;
      }
    }
    marketRet[t] = cnt ? acc / cnt : 0;
  }
  const marketClose: number[] = new Array<number>(N).fill(1000);
  for (let t = 1; t < N; t++) marketClose[t] = marketClose[t - 1] * (1 + marketRet[t]);
  const marketVol20 = rollingStd(marketRet, 20).map((v) => v * Math.sqrt(252));

  const ma100 = rollingSma(marketClose, 100);
  const volQ75 = quantile(marketVol20.slice(150), 0.75);
  const regime = marketClose.map((c, t) =>
    t >= 100 && (c < ma100[t] || marketVol20[t] > volQ75) ? 'risk_off' : 'risk_on',
  ) as MarketState['regime'];

  for (let si = 0; si < dbStocks.length; si++) {
    const s = dbStocks[si];
    const closes = perStockCloses[si];
    const byDate = new Map<string, number>();
    for (const p of s.prices) byDate.set(keyOf(p.date), p.volume);
    const vols = dates.map((d) => byDate.get(keyOf(d)) ?? 0);
    const rets = pctChange(closes, 1);
    const ret5 = pctChange(closes, 5);
    const ret21 = pctChange(closes, 21);
    const vol21raw = rollingStd(rets, 21).map((v) => v * Math.sqrt(252));
    const rsi = rsi14(closes);
    const vma5 = rollingSma(vols, 5);
    const vma60 = rollingSma(vols, 60);
    const obv = obvSlope21(closes, vols);
    const max252: number[] = new Array(N).fill(NaN);
    for (let t = 0; t < N; t++) {
      const win = closes.slice(Math.max(0, t - 251), t + 1).filter(Number.isFinite);
      max252[t] = win.length ? Math.max(...win) : NaN;
    }
    const ma20 = rollingSma(closes, 20);
    const dep = computeDependence(rets, marketRet);
    const flowByDate = new Map<string, number>();
    for (const f of s.flows) flowByDate.set(keyOf(f.date), f.netFlowM);
    const flowRaw = dates.map((d) => flowByDate.get(keyOf(d)) ?? 0);
    const flow5 = flowRaw.map((_, t) => mean(flowRaw.slice(Math.max(0, t - 4), t + 1)));
    const fundPoints: FundPoint[] = s.fundamentals.map((f) => ({
      announce: f.announceDate.getTime(),
      pe: f.pe, pb: f.pb, roe: f.roe, de: f.de, revG: f.revenueGrowth,
    }));

    const rows: DayRow[] = [];
    for (let t = 0; t < N; t++) {
      const fund = asofFundamentals(fundPoints, dates[t].getTime());
      rows.push({
        t,
        date: dates[t],
        close: closes[t],
        ret1: rets[t],
        ret5: ret5[t],
        ret21: ret21[t],
        vol21: vol21raw[t] || 0,
        rsi14: rsi[t],
        volRatio: vma60[t] ? vma5[t] / vma60[t] : 1,
        obvSlope: obv[t],
        distHigh: closes[t] / max252[t] - 1,
        ma20Gap: ma20[t] ? closes[t] / ma20[t] - 1 : 0,
        flow5: flow5[t],
        theta: dep.theta[t],
        thetaZ: dep.thetaZ[t],
        ltd: dep.ltd[t],
        decoupled: dep.decoupled[t],
        pe: fund?.pe ?? 0,
        pb: fund?.pb ?? 0,
        roe: fund?.roe ?? 0,
        de: fund?.de ?? 0,
        revG: fund?.revG ?? 0,
        z: {} as Record<FeatureKey, number>,
      });
    }
    stocks.push({
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      theme: s.theme,
      beta: s.beta,
      rows,
    });
  }

  for (let t = 0; t < N; t++) {
    for (const key of FEATURE_KEYS) {
      const vals = stocks.map((st) => {
        const v = st.rows[t][key as keyof DayRow];
        return typeof v === 'number' ? v : 0;
      });
      const m = mean(vals);
      const sd = std(vals) || 1e-9;
      stocks.forEach((st, i) => {
        st.rows[t].z[key] = (vals[i] - m) / sd;
      });
    }
  }

  const rawStress = dates.map((_, t) => mean(stocks.map((s) => s.rows[t].vol21)));
  const rawMomentum = dates.map((_, t) => mean(stocks.map((s) => s.rows[t].ret21)));
  const rawFlow = dates.map(
    (_, t) => (stocks.filter((s) => s.rows[t].flow5 > 0).length / stocks.length) * 2 - 1,
  );
  const tz = (x: number[], w = 120) => {
    const out = new Array<number>(x.length).fill(0);
    for (let i = 0; i < x.length; i++) {
      const lo = Math.max(0, i - w + 1);
      const seg = x.slice(lo, i + 1);
      if (seg.length < 30) continue;
      out[i] = (x[i] - mean(seg)) / (std(seg) || 1e-9);
    }
    return out;
  };

  return {
    dates,
    marketClose,
    regime,
    fStress: tz(rawStress),
    fMomentum: tz(rawMomentum),
    fFlow: tz(rawFlow),
    stocks,
  };
}

/** Re-export for modules needing dates w/o state */
export { tradingDates, mulberry32, gaussianFactory };
