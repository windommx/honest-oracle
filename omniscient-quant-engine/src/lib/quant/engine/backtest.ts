/**
 * backtest.ts — L4 Walk-Forward Backtest + Gate Attribution
 *
 * กฎเหล็ก:
 *  - Purged walk-forward: train window → embargo 5 วัน → test window
 *  - Logistic regression (GD) บนฟีเจอร์จาก L2/L3 → P(up 1d)
 *  - Signal = ทุก gate ผ่าน && P(up) > threshold
 *  - Gate attribution: MWU ของ forward return เมื่อ gate ผ่าน vs ตก
 */

import type { MarketState } from './types';
import { evaluateGates } from './gates';
import { mean, std, mannWhitneyU, logistic, clamp, wilsonInterval } from '../stats';
import { RULES } from './rules';

export interface BtTrade {
  date: string;
  symbol: string;
  prob: number;
  signal: boolean;
  fwdRet: number;
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  g5: boolean;
}

export interface AttributionRow {
  gate: string;
  meanWhenPass: number;
  meanWhenFail: number;
  edge: number;
  p: number;
  nPass: number;
  verdict: 'SPEAKS_TRUTH' | 'NOISE' | 'INSUFFICIENT';
}

export interface BacktestResult {
  trades: BtTrade[];
  equity: Array<{ date: string; equity: number; buyHold: number }>;
  metrics: {
    nDays: number;
    nSignals: number;
    hitRate: number;
    cumStrat: number;
    cumBase: number;
    sharpe: number;
    maxDD: number;
    avgEdge: number;
    sortino: number;
    calmar: number;
    profitFactor: number;
    expectancy: number; // % ต่อไม้ (win%×avgWin − loss%×avgLoss)
    /** Wilson 95% CI ของ hit rate (%) — ไม้น้อย = ช่วงกว้าง ต้องแสดงคู่กับค่ากลางเสมอ */
    hitRateCI: [number, number];
  };
  attribution: AttributionRow[];
  calibration: Array<{ bucket: string; predicted: number; actual: number; n: number }>;
}

// ── tiny logistic regression (gradient descent, standardized) ──

interface LogitModel {
  w: number[];
  b: number;
  mu: number[];
  sd: number[];
}

function fitLogit(X: number[][], y: number[], epochs = 220, lr = 0.35): LogitModel {
  const n = X.length;
  const p = X[0].length;
  const mu = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j])));
  const sd = Array.from({ length: p }, (_, j) => Math.max(1e-9, std(X.map((r) => r[j]))));
  const Z = X.map((r) => r.map((v, j) => (v - mu[j]) / sd[j]));
  const w = new Array(p).fill(0);
  let b = 0;
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(p).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const z = Z[i].reduce((s, v, j) => s + v * w[j], b);
      const ph = logistic(z);
      const err = ph - y[i];
      for (let j = 0; j < p; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < p; j++) w[j] -= (lr * gw[j]) / n;
    b -= (lr * gb) / n;
  }
  return { w, b, mu, sd };
}

function predictLogit(m: LogitModel, x: number[]): number {
  const z = x.reduce((s, v, j) => s + ((v - m.mu[j]) / m.sd[j]) * m.w[j], m.b);
  return logistic(z);
}

function featuresAt(state: MarketState, si: number, t: number): number[] {
  const s = state.stocks[si];
  const r = s.rows[t];
  return [r.thetaZ, r.ltd, r.z.ret21, r.volRatio, r.rsi14 / 100, r.z.flow5, r.z.vol21];
}

/** Wilson 95% CI ของ hit rate → [lo, hi] ในหน่วย % (ทศนิยม 1 ตำแหน่ง) */
function wilsonPct(k: number, n: number): [number, number] {
  const w = wilsonInterval(k, n);
  return [+(w.lo * 100).toFixed(1), +(w.hi * 100).toFixed(1)];
}

export function runBacktest(
  state: MarketState,
  opts: { train?: number; test?: number; embargo?: number; pThr?: number; lookback?: number } = {},
): BacktestResult {
  const train = opts.train ?? RULES.backtest.train;
  const test = opts.test ?? RULES.backtest.test;
  const embargo = opts.embargo ?? RULES.backtest.embargo;
  const pThr = opts.pThr ?? RULES.backtest.pThr;
  const N = state.dates.length;
  const startT = Math.max(140, N - (opts.lookback ?? RULES.backtest.lookback));
  const S = state.stocks.length;

  const trades: BtTrade[] = [];
  const equityPts: Array<{ date: string; equity: number; buyHold: number }> = [];
  let equity = 1;
  let buyHold = 1;
  let first = true;

  // walk-forward
  let i = startT + train;
  while (i + embargo + 1 < N) {
    const trainEnd = i; // exclusive
    const testStart = i + embargo;
    const testEnd = Math.min(N - 1, testStart + test); // exclusive-ish

    // build training set: previous `train` days across all stocks
    const X: number[][] = [];
    const y: number[] = [];
    for (let t = trainEnd - train; t < trainEnd; t++) {
      for (let si = 0; si < S; si++) {
        const fwd = state.stocks[si].rows[t + 1]?.ret1;
        if (fwd === undefined || !Number.isFinite(fwd)) continue;
        X.push(featuresAt(state, si, t));
        y.push(fwd > 0 ? 1 : 0);
      }
    }
    const model = fitLogit(X, y);

    // test window
    for (let t = testStart; t < testEnd; t++) {
      for (let si = 0; si < S; si++) {
        const s = state.stocks[si];
        const fwdRow = s.rows[t + 1];
        if (!fwdRow || !Number.isFinite(fwdRow.ret1)) continue;
        const ev = evaluateGates(state, s.symbol, t, { light: true });
        const prob = predictLogit(model, featuresAt(state, si, t));
        const signal = Object.values(ev.gates).every(Boolean) && prob > pThr;
        trades.push({
          date: state.dates[t].toISOString().slice(0, 10),
          symbol: s.symbol,
          prob: +prob.toFixed(4),
          signal,
          fwdRet: +fwdRow.ret1.toFixed(5),
          g1: ev.gates.g1, g2: ev.gates.g2, g3: ev.gates.g3, g4: ev.gates.g4, g5: ev.gates.g5,
        });
      }
      // daily equity (equal-weight over signaled stocks; cash otherwise)
      const todays = trades.slice(trades.length - S);
      const active = todays.filter((tr) => tr.signal);
      const portRet = active.length ? mean(active.map((tr) => tr.fwdRet)) : 0;
      const baseRet = mean(state.stocks.map((s) => s.rows[t + 1].ret1));
      equity *= 1 + portRet;
      buyHold *= 1 + baseRet;
      if (first || (t - testStart) % 5 === 0 || t === testEnd - 1) {
        equityPts.push({
          date: state.dates[t].toISOString().slice(0, 10),
          equity: +equity.toFixed(4),
          buyHold: +buyHold.toFixed(4),
        });
        first = false;
      }
    }
    i = testEnd;
  }

  // metrics
  const sig = trades.filter((tr) => tr.signal);
  const stratDaily: number[] = [];
  const baseDaily: number[] = [];
  for (let k = 0; k < trades.length; k += S) {
    const todays = trades.slice(k, k + S);
    const active = todays.filter((tr) => tr.signal);
    stratDaily.push(active.length ? mean(active.map((tr) => tr.fwdRet)) : 0);
    baseDaily.push(mean(todays.map((tr) => tr.fwdRet)));
  }
  const sdStrat = std(stratDaily) || 1e-9;
  const sharpe = (mean(stratDaily) / sdStrat) * Math.sqrt(252);
  let peak = 1;
  let maxDD = 0;
  let eqv = 1;
  for (const d of stratDaily) {
    eqv *= 1 + d;
    peak = Math.max(peak, eqv);
    maxDD = Math.max(maxDD, (peak - eqv) / peak);
  }
  const cumStrat = stratDaily.reduce((acc, v) => acc * (1 + v), 1) - 1;
  const cumBase = baseDaily.reduce((acc, v) => acc * (1 + v), 1) - 1;

  // ── advanced risk-adjusted metrics (Part IV Risk Dashboard) ──
  // Sortino: ลงโทษเฉพาะ downside deviation
  const downsideVar = stratDaily.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / Math.max(1, stratDaily.length);
  const downsideDev = Math.sqrt(downsideVar) || 1e-9;
  const sortino = (mean(stratDaily) / downsideDev) * Math.sqrt(252);
  // Calmar: ผลตอบแทนต่อหน่วย MDD
  const nDaysEff = Math.max(1, stratDaily.length);
  const annualRet = Math.pow(1 + cumStrat, 252 / nDaysEff) - 1;
  const calmar = maxDD > 1e-6 ? annualRet / maxDD : 0;
  // Profit Factor + Expectancy จากไม้สัญญาณจริง
  const wins = sig.filter((tr) => tr.fwdRet > 0);
  const losses = sig.filter((tr) => tr.fwdRet <= 0);
  const grossWin = wins.reduce((s, tr) => s + tr.fwdRet, 0);
  const grossLoss = Math.abs(losses.reduce((s, tr) => s + tr.fwdRet, 0));
  const profitFactor = grossLoss > 1e-9 ? Math.min(99, grossWin / grossLoss) : grossWin > 0 ? 99 : 0;
  const winRate = sig.length ? wins.length / sig.length : 0;
  const avgWin = wins.length ? mean(wins.map((tr) => tr.fwdRet)) : 0;
  const avgLoss = losses.length ? mean(losses.map((tr) => tr.fwdRet)) : 0;
  const expectancy = (winRate * avgWin - (1 - winRate) * avgLoss) * 100;

  // gate attribution on ALL rows (pass vs fail → fwd ret)
  const attribution: AttributionRow[] = (['g1', 'g2', 'g3', 'g4', 'g5'] as const).map((g) => {
    const pass = trades.filter((tr) => tr[g]).map((tr) => tr.fwdRet);
    const fail = trades.filter((tr) => !tr[g]).map((tr) => tr.fwdRet);
    const mp = pass.length ? mean(pass) : 0;
    const mf = fail.length ? mean(fail) : 0;
    const mwu = pass.length > 20 && fail.length > 20
      ? mannWhitneyU(pass, fail, 'greater')
      : { p: 1, u: 0, z: 0 };
    const edge = mp - mf;
    const verdict: AttributionRow['verdict'] =
      pass.length < RULES.backtest.attribution.minPass ? 'INSUFFICIENT' : edge > RULES.backtest.attribution.edgeMin && mwu.p < RULES.backtest.attribution.pMax ? 'SPEAKS_TRUTH' : 'NOISE';
    return {
      gate: g.toUpperCase(),
      meanWhenPass: +mp.toFixed(5),
      meanWhenFail: +mf.toFixed(5),
      edge: +(edge * 100).toFixed(3),
      p: +mwu.p.toFixed(4),
      nPass: pass.length,
      verdict,
    };
  });

  // calibration buckets
  const buckets = [0, 0.45, 0.5, 0.55, 0.6, 1.01];
  const calibration = buckets.slice(0, -1).map((lo, bi) => {
    const hi = buckets[bi + 1];
    const b = trades.filter((tr) => tr.prob >= lo && tr.prob < hi);
    return {
      bucket: `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`,
      predicted: +(mean(b.map((tr) => tr.prob)) * 100).toFixed(1),
      actual: +(mean(b.map((tr) => (tr.fwdRet > 0 ? 1 : 0))) * 100).toFixed(1),
      n: b.length,
    };
  }).filter((b) => b.n > 20);

  return {
    trades,
    equity: equityPts,
    metrics: {
      nDays: Math.floor(trades.length / S),
      nSignals: sig.length,
      hitRate: sig.length ? +(mean(sig.map((tr) => (tr.fwdRet > 0 ? 1 : 0))) * 100).toFixed(1) : 0,
      hitRateCI: wilsonPct(sig.filter((tr) => tr.fwdRet > 0).length, sig.length),
      cumStrat: +(cumStrat * 100).toFixed(2),
      cumBase: +(cumBase * 100).toFixed(2),
      sharpe: +sharpe.toFixed(2),
      maxDD: +(maxDD * 100).toFixed(2),
      avgEdge: +(((sig.length ? mean(sig.map((tr) => tr.fwdRet)) : 0) - mean(baseDaily)) * 100).toFixed(3),
      sortino: +sortino.toFixed(2),
      calmar: +calmar.toFixed(2),
      profitFactor: +profitFactor.toFixed(2),
      expectancy: +expectancy.toFixed(3),
    },
    attribution,
    calibration,
  };
}

/** P(up) สำหรับวันปัจจุบัน (train ทั้งหมดยกเว้น embargo 5 วันสุดท้าย — honest) */
export function currentProbs(state: MarketState, pThrFloor = RULES.probs.floor): Record<string, number> {
  const N = state.dates.length;
  const trainEnd = N - RULES.probs.embargo; // embargo
  const X: number[][] = [];
  const y: number[] = [];
  for (let t = Math.max(RULES.probs.minStart, N - RULES.probs.window); t < trainEnd; t++) {
    for (let si = 0; si < state.stocks.length; si++) {
      const fwd = state.stocks[si].rows[t + 1]?.ret1;
      if (fwd === undefined || !Number.isFinite(fwd)) continue;
      X.push(featuresAt(state, si, t));
      y.push(fwd > 0 ? 1 : 0);
    }
  }
  const model = fitLogit(X, y, 260, 0.3);
  const out: Record<string, number> = {};
  state.stocks.forEach((s, si) => {
    out[s.symbol] = +clamp(predictLogit(model, featuresAt(state, si, N - 1)), pThrFloor, RULES.probs.cap).toFixed(3);
  });
  return out;
}
