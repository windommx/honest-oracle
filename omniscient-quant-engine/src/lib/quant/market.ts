/**
 * market.ts — Synthetic SET universe generator (deterministic, seed-based)
 *
 * สร้างพาเนลตลาดไทยจำลอง 22 ตัว × 3 ปี (750 วันทำการ):
 *  - SET index proxy พร้อม regime narrative (SIDEWAYS → CRISIS → RECOVERY → BULL → MILD-CRISIS → RECOVERY → SIDEWAYS)
 *  - Sector factor + idiosyncratic + event shocks (TSE "Solar Big Lot" → decouple & markup)
 *  - OHLCV, PIT fundamentals (announce = period end + 45 วัน), fund flows
 */

import { gaussianFactory, mulberry32, studentTFactory, tradingDates } from './rng';

export interface UniverseDef {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  beta: number;
  startPrice: number;
  idioVol: number; // daily idiosyncratic vol
  pe0: number;
  pb0: number;
  roe0: number;
  de0: number;
  revG0: number; // revenue growth %
  profit0: number; // net profit (M THB)
  eventAt?: number; // fraction of timeline for idiosyncratic story event
}

export const UNIVERSE: UniverseDef[] = [
  // ── Renewable-Capex Cycle ──
  { symbol: 'TSE',   name: 'Thai Solar Energy',        sector: 'Renewable', theme: 'Renewable-Capex Cycle', beta: 1.32, startPrice: 1.26, idioVol: 0.031, pe0: 54.6, pb0: 0.86, roe0: 1.9,  de0: 0.62, revG0: 22.4,  profit0: 79.8,  eventAt: 0.82 },
  { symbol: 'BGRIM', name: 'B.Grimm Power',            sector: 'Renewable', theme: 'Renewable-Capex Cycle', beta: 1.05, startPrice: 27.8, idioVol: 0.014, pe0: 14.2, pb0: 1.42, roe0: 9.8,  de0: 0.71, revG0: 8.1,   profit0: 5200 },
  { symbol: 'GULF',  name: 'Gulf Energy Development',  sector: 'Renewable', theme: 'Renewable-Capex Cycle', beta: 1.18, startPrice: 51.5, idioVol: 0.016, pe0: 17.9, pb0: 1.86, roe0: 10.4, de0: 0.83, revG0: 12.6,  profit0: 11200 },
  { symbol: 'EA',    name: 'Energy Absolute',          sector: 'Renewable', theme: 'Renewable-Capex Cycle', beta: 1.42, startPrice: 21.9, idioVol: 0.024, pe0: 26.3, pb0: 0.94, roe0: 4.1,  de0: 0.95, revG0: -6.2,  profit0: 1850 },
  { symbol: 'SPRC',  name: 'Super Energy',             sector: 'Renewable', theme: 'Renewable-Capex Cycle', beta: 1.26, startPrice: 4.42, idioVol: 0.022, pe0: 11.4, pb0: 1.10, roe0: 8.6,  de0: 0.55, revG0: 15.3,  profit0: 2400 },
  // ── Energy Chain ──
  { symbol: 'PTT',   name: 'PTT PCL',                  sector: 'Energy',    theme: 'Energy-Chain',          beta: 0.98, startPrice: 32.0, idioVol: 0.011, pe0: 10.8, pb0: 1.02, roe0: 9.9,  de0: 0.48, revG0: 4.2,   profit0: 98000 },
  { symbol: 'PTTEP', name: 'PTT Exploration & Prod.',  sector: 'Energy',    theme: 'Energy-Chain',          beta: 0.92, startPrice: 108.5, idioVol: 0.013, pe0: 9.6, pb0: 1.14, roe0: 11.8, de0: 0.31, revG0: 6.8,   profit0: 62000 },
  { symbol: 'PTTGC', name: 'PTT Global Chemical',      sector: 'Energy',    theme: 'Energy-Chain',          beta: 1.14, startPrice: 41.8, idioVol: 0.017, pe0: 18.4, pb0: 0.78, roe0: 4.2,  de0: 0.58, revG0: -3.4,  profit0: 9400 },
  { symbol: 'BANPU', name: 'Banpu PCL',                sector: 'Energy',    theme: 'Energy-Chain',          beta: 1.22, startPrice: 12.4, idioVol: 0.019, pe0: 7.2,  pb0: 0.66, roe0: 9.1,  de0: 0.66, revG0: -8.5,  profit0: 8200 },
  { symbol: 'TOP',   name: 'Thai Oil PCL',             sector: 'Energy',    theme: 'Energy-Chain',          beta: 1.10, startPrice: 16.8, idioVol: 0.018, pe0: 12.1, pb0: 0.82, roe0: 6.7,  de0: 0.74, revG0: 2.1,   profit0: 4100 },
  // ── Financial Leverage ──
  { symbol: 'KBANK', name: 'Kasikornbank',             sector: 'Banking',   theme: 'Financial-Leverage',    beta: 0.96, startPrice: 158.0, idioVol: 0.012, pe0: 9.8, pb0: 1.06, roe0: 11.2, de0: 1.05, revG0: 6.4,  profit0: 46000 },
  { symbol: 'KTB',   name: 'Krung Thai Bank',          sector: 'Banking',   theme: 'Financial-Leverage',    beta: 1.02, startPrice: 18.2, idioVol: 0.013, pe0: 7.4,  pb0: 0.62, roe0: 8.8,  de0: 1.12, revG0: 3.8,  profit0: 34000 },
  { symbol: 'SCB',   name: 'Siam Commercial Bank',     sector: 'Banking',   theme: 'Financial-Leverage',    beta: 0.99, startPrice: 100.5, idioVol: 0.012, pe0: 8.9, pb0: 0.98, roe0: 10.6, de0: 1.02, revG0: 5.1,  profit0: 41000 },
  { symbol: 'BBL',   name: 'Bangkok Bank',             sector: 'Banking',   theme: 'Financial-Leverage',    beta: 0.88, startPrice: 148.0, idioVol: 0.011, pe0: 9.1,  pb0: 0.74, roe0: 8.2,  de0: 0.98, revG0: 2.9,  profit0: 38000 },
  { symbol: 'KKP',   name: 'Kiatnakin Phatra',         sector: 'Banking',   theme: 'Financial-Leverage',    beta: 1.08, startPrice: 57.5, idioVol: 0.015, pe0: 10.2, pb0: 1.18, roe0: 11.6, de0: 1.08, revG0: 7.2,  profit0: 9800 },
  // ── Tourism & Consumer Recovery ──
  { symbol: 'CPALL', name: 'CP All',                   sector: 'Consumer',  theme: 'Tourism-Recovery',      beta: 0.86, startPrice: 62.0, idioVol: 0.012, pe0: 15.6, pb0: 2.20, roe0: 14.8, de0: 0.88, revG0: 5.8,  profit0: 21000 },
  { symbol: 'MINT',  name: 'Minor International',      sector: 'Consumer',  theme: 'Tourism-Recovery',      beta: 0.94, startPrice: 38.2, idioVol: 0.016, pe0: 19.4, pb0: 1.64, roe0: 8.9,  de0: 0.94, revG0: 9.6,  profit0: 6800 },
  { symbol: 'AOT',   name: 'Airports of Thailand',     sector: 'Tourism',   theme: 'Tourism-Recovery',      beta: 0.90, startPrice: 59.5, idioVol: 0.014, pe0: 22.8, pb0: 2.05, roe0: 9.4,  de0: 0.42, revG0: 11.2, profit0: 19200 },
  { symbol: 'ERW',   name: 'Erawan Group',             sector: 'Tourism',   theme: 'Tourism-Recovery',      beta: 1.06, startPrice: 39.8, idioVol: 0.018, pe0: 24.1, pb0: 1.72, roe0: 7.6,  de0: 0.86, revG0: 13.4, profit0: 2100 },
  // ── Digital & Telecom ──
  { symbol: 'TRUE',  name: 'True Corporation',         sector: 'Digital',   theme: 'Digital-Telecom',       beta: 1.12, startPrice: 9.40, idioVol: 0.017, pe0: 0,    pb0: 1.30, roe0: -3.2, de0: 0.91, revG0: 4.4,  profit0: -2800 },
  { symbol: 'ADVANC',name: 'Advanced Info Service',    sector: 'Digital',   theme: 'Digital-Telecom',       beta: 0.74, startPrice: 162.0, idioVol: 0.010, pe0: 14.6, pb0: 3.10, roe0: 21.4, de0: 0.52, revG0: 1.8,  profit0: 32000 },
  { symbol: 'INTUCH',name: 'Intouch Holdings',         sector: 'Digital',   theme: 'Digital-Telecom',       beta: 0.82, startPrice: 26.2, idioVol: 0.012, pe0: 11.8, pb0: 1.44, roe0: 12.2, de0: 0.28, revG0: 2.4,  profit0: 12800 },
];

interface RegimeSpec {
  name: 'SIDEWAYS' | 'CRISIS' | 'RECOVERY' | 'BULL';
  drift: number;
  vol: number;
}

const REGIME_SCRIPT: Array<{ until: number } & RegimeSpec> = [
  { until: 0.16, name: 'SIDEWAYS', drift: 0.0002,  vol: 0.0085 },
  { until: 0.27, name: 'CRISIS',   drift: -0.0042, vol: 0.021 },
  { until: 0.44, name: 'RECOVERY', drift: 0.0013,  vol: 0.0125 },
  { until: 0.62, name: 'BULL',     drift: 0.0009,  vol: 0.009 },
  { until: 0.72, name: 'CRISIS',   drift: -0.0028, vol: 0.016 },
  { until: 0.86, name: 'RECOVERY', drift: 0.0015,  vol: 0.010 },
  { until: 1.01, name: 'BULL',     drift: 0.0016,  vol: 0.0075 },
];

export interface StockSeries {
  symbol: string;
  dates: Date[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  marketClose: number[];
}

export interface FundamentalRow {
  announceDate: Date;
  period: string;
  pe: number;
  pb: number;
  roe: number;
  de: number;
  revenueGrowth: number;
  netProfitM: number;
}

export interface FlowRow {
  date: Date;
  netFlowM: number;
}

export interface GeneratedMarket {
  dates: Date[];
  marketClose: number[];
  marketVol20: number[];
  stocks: Array<{
    def: UniverseDef;
    series: StockSeries;
    fundamentals: FundamentalRow[];
    flows: FlowRow[];
  }>;
}

const N_DAYS = 750;
const SECTOR_BETA: Record<string, number> = {
  Renewable: 1.15,
  Energy: 0.85,
  Banking: 0.9,
  Consumer: 0.75,
  Tourism: 0.95,
  Digital: 0.8,
};

function regimeAt(frac: number): RegimeSpec {
  for (const r of REGIME_SCRIPT) if (frac < r.until) return r;
  return REGIME_SCRIPT[REGIME_SCRIPT.length - 1];
}

/** endDate = วันสุดท้ายของข้อมูล (ไม่ใส่ = วันนี้) — test ตรึงวันได้เพื่อให้ปฏิทินงบเทียบกับราคาไม่เลื่อนตามวันที่รัน */
export function generateMarket(seed = 20250817, endDate?: Date): GeneratedMarket {
  const rand = mulberry32(seed);
  const gauss = gaussianFactory(rand);
  const tDist = studentTFactory(rand, 5); // fat tails
  const dates = tradingDates(N_DAYS, endDate);
  const n = dates.length;

  // ── Market index proxy with occasional fat-tail jumps ──
  const marketRet: number[] = [];
  const marketClose: number[] = [];
  let mIdx = 1550;
  for (let t = 0; t < n; t++) {
    const reg = regimeAt(t / n);
    let r = reg.drift + reg.vol * gauss();
    if (rand() < 0.008) r += reg.vol * 3.5 * tDist(); // jump
    marketRet.push(r);
    mIdx *= 1 + r;
    marketClose.push(mIdx);
  }

  // market vol20
  const marketVol20: number[] = [];
  for (let t = 0; t < n; t++) {
    const w = marketRet.slice(Math.max(0, t - 19), t + 1);
    const m = w.reduce((s, v) => s + v, 0) / w.length;
    marketVol20.push(
      Math.sqrt((w.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, w.length - 1)) * 252),
    );
  }

  // ── Sector returns ──
  const sectors = Object.keys(SECTOR_BETA);
  const sectorRet: Record<string, number[]> = {};
  for (const sec of sectors) {
    const b = SECTOR_BETA[sec];
    const g = gaussianFactory(mulberry32(seed + sec.length * 977 + sec.charCodeAt(0) * 31));
    sectorRet[sec] = marketRet.map((rm, t) => {
      const reg = regimeAt(t / n);
      return b * rm * 0.55 + (reg.vol * 0.55 + 0.004) * g();
    });
  }

  // ── Stocks ──
  const stocks = UNIVERSE.map((def, si) => {
    const gIdio = gaussianFactory(mulberry32(seed * 7 + si * 131 + 17));
    const sec = sectorRet[def.sector] ?? marketRet;
    const close: number[] = [];
    const open: number[] = [];
    const high: number[] = [];
    const low: number[] = [];
    const volume: number[] = [];
    let px = def.startPrice;
    let prevClose = def.startPrice;
    const baseVolM = 20 + si * 3; // million shares-ish scale factor

    // event window (TSE Solar Big Lot style)
    const eventStart = def.eventAt !== undefined ? Math.floor(def.eventAt * n) : -1;
    const eventLen = 28;

    for (let t = 0; t < n; t++) {
      const reg = regimeAt(t / n);
      let r = 0.00025 + def.beta * 0.75 * marketRet[t] + 0.45 * sec[t] + def.idioVol * gIdio();

      // valuation mean reversion (high PE → slight drag)
      r += 0.0006 * (1 - def.pe0 / 60);

      // event shock & post-event markup
      let inEvent = false;
      if (eventStart >= 0 && t >= eventStart && t < eventStart + eventLen) {
        inEvent = true;
        const k = t - eventStart;
        if (k === 0) r += 0.075 + 0.02 * gIdio(); // big-lot news pop
        else if (k < 6) r += 0.011 - 0.001 * k;
        else r += 0.0042; // running markup
        r += def.idioVol * 1.35 * gIdio(); // idio vol spike → decouple
      }
      if (eventStart >= 0 && t === eventStart + eventLen) r -= 0.02;

      if (reg.name === 'CRISIS') r -= 0.0008 * def.beta;
      r = Math.max(-0.18, Math.min(0.18, r));

      prevClose = px;
      px *= 1 + r;
      const gap = 1 + 0.004 * gIdio();
      const o = prevClose * gap;
      const wick = Math.abs(0.006 * gIdio()) + Math.abs(r) * 0.4;
      const h = Math.max(o, px) * (1 + wick * 0.6);
      const l = Math.min(o, px) * (1 - wick * 0.6);
      open.push(o);
      close.push(px);
      high.push(h);
      low.push(l);
      const vMul = inEvent ? 2.6 : 1;
      volume.push(baseVolM * (1 + 9 * Math.abs(r)) * (0.7 + 0.6 * rand()) * vMul);
    }

    const series: StockSeries = {
      symbol: def.symbol,
      dates,
      open,
      high,
      low,
      close,
      volume,
      marketClose,
    };

    // ── PIT fundamentals: quarterly, announce = period end + 45d ──
    // สิ้นงวด = สิ้นไตรมาสตามปฏิทินจริง (ไม่ใช่วันสุดท้ายของข้อมูลเลื่อนทีละ 3 เดือน — แบบนั้นเมื่อวันสุดท้ายอยู่ต้นไตรมาส
    // ป้ายงวดจะเป็นไตรมาสที่ยังไม่จบตอนประกาศ = look-ahead)
    const fundamentals: FundamentalRow[] = [];
    const nQ = 10; // 10 quarters ending before the last day
    const lastDay = dates[n - 1];
    const lastQEnd = new Date(lastDay.getFullYear(), Math.floor(lastDay.getMonth() / 3) * 3, 0);
    for (let q = 0; q < nQ; q++) {
      const periodEnd = new Date(lastQEnd.getFullYear(), lastQEnd.getMonth() + 1 - (nQ - 1 - q) * 3, 0);
      const announce = new Date(periodEnd);
      announce.setDate(announce.getDate() + 45);
      if (announce > dates[n - 1]) continue;
      const drift = (mulberry32(seed + si * 997 + q * 13)() - 0.45) * 0.2;
      const cycle = Math.sin((q / nQ) * Math.PI * 2 + si) * 0.12;
      const revG = def.revG0 * (1 + drift + cycle);
      const roe = def.roe0 * (1 + 0.5 * drift + 0.3 * cycle);
      const pe = Math.max(3, def.pe0 * (1 + 0.25 * drift - 0.15 * cycle));
      const pb = Math.max(0.25, def.pb0 * (1 + 0.2 * drift));
      const de = Math.max(0.05, def.de0 * (1 + 0.3 * drift));
      const profit = def.profit0 * (1 + drift * 1.5 + cycle);
      fundamentals.push({
        announceDate: announce,
        period: `${periodEnd.getFullYear()}-Q${Math.floor(periodEnd.getMonth() / 3) + 1}`,
        pe: pe === 0 ? 0 : +pe.toFixed(2),
        pb: +pb.toFixed(2),
        roe: +roe.toFixed(2),
        de: +de.toFixed(2),
        revenueGrowth: +revG.toFixed(2),
        netProfitM: +profit.toFixed(1),
      });
    }

    // ── Fund flows: chase returns + big-lot events ──
    const gFlow = gaussianFactory(mulberry32(seed * 13 + si * 29 + 5));
    const flows: FlowRow[] = dates.map((d, t) => {
      let f = 18 * (close[t] / close[Math.max(0, t - 1)] - 1) * 100 + 4 * gFlow();
      if (eventStart >= 0 && t >= eventStart && t < eventStart + 5) {
        f += 120 + 30 * rand(); // big lot accumulation
      }
      return { date: d, netFlowM: +f.toFixed(2) };
    });

    return { def, series, fundamentals, flows };
  });

  return { dates, marketClose, marketVol20, stocks };
}
