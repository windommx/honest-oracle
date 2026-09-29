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
import { RULES } from './rules';

let genCache: GeneratedMarket | null = null;

export function getGenerated(seed: number = RULES.seed): GeneratedMarket {
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
  const W = RULES.dependence.window;
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
    const lo = Math.max(W, i - (RULES.dependence.zWindow - 1));
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
  const mQ = quantile(marketRet.slice(W), RULES.dependence.ltdBottomQuantile);
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
  const decoupled = thetaZ.map((z) => z < RULES.dependence.decoupleZ);
  return { theta, thetaZ, ltd, decoupled };
}

// ─────────────────────── market state builder ───────────────────────

/**
 * ข้อมูลดิบรูปเดียวกับตาราง DB (Stock + Price + Fundamental + FundFlow)
 * ข้อมูลจำลองทุก seed, ข้อมูลใน DB และข้อมูลจริงที่ ingest เข้ามา ผ่านตัวสร้าง panel ตัวเดียวกัน (buildPanel)
 * → ผล robustness ของ seed demo = ผลของแท็บ Backtest บน DB demo เป๊ะ (ไม่มีท่อคู่ขนานที่คำนวณต่างกัน)
 */
export interface PanelStockInput {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  beta: number;
  /** volume = ล้านหุ้น (หน่วยเดียวกับ generator) · open/high/low ไม่มี = ใช้ close */
  prices: Array<{ date: Date; close: number; volume: number; open?: number | null; high?: number | null; low?: number | null }>;
  fundamentals: Array<{ announceDate: Date; pe: number; pb: number; roe: number; de: number; revenueGrowth: number }>;
  flows: Array<{ date: Date; netFlowM: number }>;
}

export function generatedToPanelInput(gen: GeneratedMarket): PanelStockInput[] {
  return gen.stocks.map((s) => ({
    symbol: s.def.symbol,
    name: s.def.name,
    sector: s.def.sector,
    theme: s.def.theme,
    beta: s.def.beta,
    prices: s.series.close.map((c, t) => ({
      date: s.series.dates[t],
      open: s.series.open[t],
      high: s.series.high[t],
      low: s.series.low[t],
      close: c,
      volume: s.series.volume[t],
    })),
    fundamentals: s.fundamentals.map((f) => ({ announceDate: f.announceDate, pe: f.pe, pb: f.pb, roe: f.roe, de: f.de, revenueGrowth: f.revenueGrowth })),
    flows: s.flows.map((f) => ({ date: f.date, netFlowM: f.netFlowM })),
  }));
}

/**
 * สร้าง MarketState จากข้อมูลดิบ (pure — ไม่แตะ DB)
 *  - ปฏิทิน = union ของวันที่มีราคา ตัดช่วงหัวที่บางหุ้นยังไม่มีราคา (เริ่มที่วันแรกที่ทุกตัวมีราคา)
 *  - ช่องว่างกลางทาง (หยุดพักการซื้อขาย/ข้อมูลหาย) เติมด้วยราคาปิดล่าสุด ปริมาณ 0 — นับไว้ใน qc
 *  - market proxy = ดัชนีผลตอบแทนเฉลี่ยเท่ากันของหุ้นใน panel (เริ่ม 1000)
 */
export function buildPanel(input: PanelStockInput[]): MarketState {
  const keyOf = (d: Date) => d.toISOString().slice(0, 10);
  const dateSet = new Map<string, number>();
  for (const s of input) for (const p of s.prices) if (Number.isFinite(p.close) && p.close > 0) dateSet.set(keyOf(p.date), p.date.getTime());
  let allDates = [...dateSet.values()].sort((a, b) => a - b).map((ms) => new Date(ms));
  const firstByStock = input.map((s) => {
    const ts = s.prices.filter((p) => Number.isFinite(p.close) && p.close > 0).map((p) => p.date.getTime());
    return ts.length ? Math.min(...ts) : Infinity;
  });
  const commonStart = Math.max(...firstByStock);
  const trimmedLeading = allDates.filter((d) => d.getTime() < commonStart).length;
  allDates = allDates.filter((d) => d.getTime() >= commonStart);
  const dates = allDates;
  const N = dates.length;

  let filled = 0;
  const perStockCloses: number[][] = [];
  const perStockVols: number[][] = [];
  const perStockOhl: Array<{ open: number[]; high: number[]; low: number[] }> = [];
  const pos = (v: number | null | undefined, fallback: number) => (v != null && Number.isFinite(v) && v > 0 ? v : fallback);
  for (const s of input) {
    const byDate = new Map<string, PanelStockInput['prices'][number]>();
    for (const p of s.prices) if (Number.isFinite(p.close) && p.close > 0) byDate.set(keyOf(p.date), p);
    const closes = new Array<number>(N);
    const vols = new Array<number>(N);
    const open = new Array<number>(N);
    const high = new Array<number>(N);
    const low = new Array<number>(N);
    let last = NaN;
    for (let t = 0; t < N; t++) {
      const hit = byDate.get(keyOf(dates[t]));
      if (hit) {
        last = hit.close;
        closes[t] = hit.close;
        vols[t] = Number.isFinite(hit.volume) && hit.volume > 0 ? hit.volume : 0;
        open[t] = pos(hit.open, hit.close);
        high[t] = Math.max(pos(hit.high, hit.close), open[t], hit.close);
        low[t] = Math.min(pos(hit.low, hit.close), open[t], hit.close);
      } else {
        filled++;
        closes[t] = last;
        vols[t] = 0;
        open[t] = high[t] = low[t] = last;
      }
    }
    perStockCloses.push(closes);
    perStockVols.push(vols);
    perStockOhl.push({ open, high, low });
  }

  // market proxy returns (equal weight)
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

  // regime: risk_off if below MA100 or vol20 in top quartile
  const ma100 = rollingSma(marketClose, RULES.regime.maWindow);
  const volQ75 = quantile(marketVol20.slice(150), RULES.regime.volQuantile);
  const regime = marketClose.map((c, t) =>
    t >= 100 && (c < ma100[t] || marketVol20[t] > volQ75) ? 'risk_off' : 'risk_on',
  ) as MarketState['regime'];

  const stocks: StockPanel[] = input.map((s, si) => {
    const closes = perStockCloses[si];
    const vols = perStockVols[si];
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

    // fund flow 5d smoothed (วันที่ไม่มีข้อมูล = 0)
    const flowByDate = new Map<string, number>();
    for (const f of s.flows) flowByDate.set(keyOf(f.date), f.netFlowM);
    const flowRaw = dates.map((d) => flowByDate.get(keyOf(d)) ?? 0);
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
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      theme: s.theme,
      beta: s.beta,
      rows,
      coverage: { fundamentals: s.fundamentals.length > 0, flows: s.flows.length > 0 },
      ohlcv: { ...perStockOhl[si], volume: vols },
    };
  });

  // ── cross-sectional z-scores per date (over stocks) ──
  for (let t = 0; t < N; t++) {
    for (const key of FEATURE_KEYS) {
      const vals = stocks.map((st) => {
        const v = st.rows[t][key as keyof DayRow];
        return typeof v === 'number' && Number.isFinite(v) ? v : 0;
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

  return {
    dates,
    marketClose,
    regime,
    fStress: tz(rawStress),
    fMomentum: tz(rawMomentum),
    fFlow: tz(rawFlow),
    stocks,
    qc: { filledCells: filled, trimmedLeadingDays: trimmedLeading },
  };
}

/** MarketState จากข้อมูลจำลอง (ค่าเริ่มต้น = seed ของ demo) — ท่อเดียวกับข้อมูลใน DB */
export async function buildMarketState(genIn?: GeneratedMarket): Promise<MarketState> {
  return buildPanel(generatedToPanelInput(genIn ?? getGenerated()));
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
  invalidateMarketCache();
  const count = await db.stock.count();
  const first = await db.price.findFirst({ orderBy: { date: 'asc' } });
  const last = await db.price.findFirst({ orderBy: { date: 'desc' } });
  // ที่มาของข้อมูล — UI/health/รายงานอ่านจากตารางนี้ว่าเป็นข้อมูลจำลองหรือข้อมูลจริง
  await db.dataSource
    .create({
      data: {
        kind: 'synthetic',
        source: `generator seed ${RULES.seed}`,
        note: 'ข้อมูลจำลองเพื่อการสาธิต — ไม่ใช่ราคาตลาดจริง',
        stocks: count,
        prices: await db.price.count(),
        firstDate: first?.date,
        lastDate: last?.date,
        seed: RULES.seed,
      },
    })
    .catch(() => undefined); // DB เก่าที่ยังไม่มีตาราง DataSource — seed ยังสำเร็จ
  return { count, lastDate: last?.date?.toISOString() ?? '' };
}

/**
 * กุญแจเวอร์ชันข้อมูลของ cache ทุกชั้น — จำนวนแถว + วันล่าสุด + DataSource ล่าสุด
 * (seed/นำเข้าทุกครั้งเขียน DataSource แถวใหม่ → cache ของทุก process หมดอายุ แม้จำนวนแถวกับวันล่าสุดเท่าเดิม)
 */
export async function dataVersionKey(): Promise<{ key: string; stocks: number }> {
  const [stocks, prices, last, source] = await Promise.all([
    db.stock.count(),
    db.price.count(),
    db.price.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }),
    db.dataSource.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }).catch(() => null),
  ]);
  return { key: `${stocks}:${prices}:${last?.date?.toISOString() ?? ''}:${source?.id ?? '-'}`, stocks };
}

/** ล้าง cache ของ panel ใน process นี้ (หลังแทนที่ข้อมูล) */
export function invalidateMarketCache(): void {
  const c = cache();
  c.version = '';
  c.state = undefined;
  c.promise = undefined;
}

export async function loadMarketState(): Promise<MarketState> {
  const c = cache();
  const { key: version, stocks } = await dataVersionKey();
  const counts = { stocks };
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
 * Build the in-memory panel from DB tables (L0 provenance) — DB คือแหล่งความจริงเดียว
 * DB ว่าง → ใช้ข้อมูลจำลองของ demo (seed ของ RULES)
 */
async function buildFromDb(): Promise<MarketState> {
  const dbStocks = await db.stock.findMany({
    include: {
      prices: { orderBy: { date: 'asc' } },
      fundamentals: { orderBy: { announceDate: 'asc' } },
      flows: { orderBy: { date: 'asc' } },
    },
  });
  if (dbStocks.length === 0) return buildMarketState();
  return buildPanel(dbStocks);
}

/** Re-export for modules needing dates w/o state */
export { tradingDates, mulberry32, gaussianFactory };
