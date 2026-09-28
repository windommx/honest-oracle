/**
 * gates.ts — L6 Decision Engine: ระบบ 5 Gates (convergent evidence)
 *
 * G1 Regime     : F_stress ต่ำ + F_recovery (momentum slope) ไม่ไหลลง
 * G2 Dependence : หุ้น decouple จากตลาด (Θ z-score) หรือ LTD < 0.35
 * G3 Technical  : Phase 4–5 (Wyckoff-lite) + volume confirm + ไม่มี bearish OBV divergence
 * G4 Risk       : size ≤ RiskBudget/CVaR และ ≥ min size
 * G5 Execution  : RSI ≤ 80 (ห้าม chase)
 *
 * Signal: ENTRY_PULLBACK (ทุก gate ผ่าน) | ENTRY_MOMENTUM (ผ่านทุก gate ยกเว้น G5 + breakout) | NO_TRADE
 */

import type { MarketState, GateSnapshot, TradePlan, DayRow } from './types';
import { riskAssessment } from './risk';
import { linregSlope, mean, std, clamp } from '../stats';

export type Phase = 0 | 1 | 2 | 3 | 4 | 5;

export interface GateEval {
  gates: GateSnapshot;
  signal: TradePlan['signal'];
  phase: Phase;
  phaseLabel: string;
  probUp: number;
  plan: TradePlan;
}

export function phaseOf(row: DayRow, ma50: number, ma150: number, ma50Slope: number): { phase: Phase; label: string } {
  if (!Number.isFinite(ma50) || !Number.isFinite(ma150)) return { phase: 0, label: 'Warm-up' };
  const up = ma50 > ma150 && ma50Slope > 0;
  const down = ma50 < ma150 && ma50Slope < 0;
  if (down) return { phase: 0, label: 'Phase 0 · Markdown' };
  if (!up && ma50Slope >= 0) return { phase: 1, label: 'Phase 1 · Accumulation' };
  if (up) {
    const above = row.close > ma50;
    const extended = row.distHigh > -0.03;
    const late = row.rsi14 > 70 || row.distHigh > 0.12;
    if (!above) return { phase: 3, label: 'Phase 3 · Consolidation (pullback)' };
    if (late) return { phase: 5, label: 'Phase 5 · Running (late, watch RSI)' };
    if (extended) return { phase: 4, label: 'Phase 4 · Running' };
    return { phase: 2, label: 'Phase 2 · Early Markup' };
  }
  return { phase: 0, label: 'Phase 0 · Markdown' };
}

function maSeries(x: number[], w: number): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  let acc = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i];
    if (i >= w) acc -= x[i - w];
    if (i >= w - 1) out[i] = acc / w;
  }
  return out;
}

/** คำนวณ gate snapshot + trade plan ณ วัน t ของหุ้น symbol */
export function evaluateGates(
  state: MarketState,
  symbol: string,
  t: number,
  opts: { riskBudgetPct?: number; probUp?: number; light?: boolean } = {},
): GateEval {
  const N = state.dates.length;
  const stock = state.stocks.find((s) => s.symbol === symbol);
  if (!stock) throw new Error(`unknown symbol ${symbol}`);
  const row = stock.rows[t];

  // ── G1 Regime (market-level) ──
  const stress = state.fStress[t];
  // 42-day slope: จับ "recovery arc" ไม่ให้สั่นตาม noise ระยะสั้น
  const momWin = state.fMomentum.slice(Math.max(0, t - 42), t + 1);
  const momSlope = linregSlope(
    momWin.map((_, i) => i),
    momWin,
  );
  const g1 = stress < 0.8 && momSlope > -0.005;

  // ── G2 Dependence (stock-level) ──
  const decoupled = row.decoupled;
  const g2 = decoupled || row.ltd < 0.35;

  // ── G3 Technical ──
  const closes = state.stocks.find((s) => s.symbol === symbol)!.rows.map((r) => r.close);
  const ma50s = maSeries(closes, 50);
  const ma150s = maSeries(closes, 150);
  const ma50Slope = ma50s[t - 10] && Number.isFinite(ma50s[t - 10])
    ? (ma50s[t] / ma50s[t - 10] - 1) * 100
    : 0;
  const { phase, label } = phaseOf(row, ma50s[t], ma150s[t], ma50Slope);
  const volConfirm = row.volRatio >= 0.75 && row.volRatio <= 2.6;
  const noDiv = row.obvSlope > -0.18 && row.ret21 > -0.08;
  const g3 = phase >= 4 && volConfirm && noDiv;

  // ── G4 Risk ──
  const riskBudget = opts.riskBudgetPct ?? 1.0;
  const rowsForRisk = stock.rows.slice(Math.max(0, t - 99), t + 1);
  // light mode: parametric Student-t(4) approximation (เร็ว ~200×) สำหรับ history/backtest
  const light = opts.light ?? false;
  const risk = light
    ? parametricRisk(rowsForRisk, row.close, riskBudget)
    : riskAssessment(rowsForRisk, riskBudget, 4, 8000, 424242 + t);
  const maxSize = risk.maxSizePct;
  const g4 = maxSize >= 8;

  // ── G5 Execution ──
  const g5 = row.rsi14 <= 80;

  const gates: GateSnapshot = { g1, g2, g3, g4, g5 };

  // momentum trigger: 20d high + OBV new high
  const high20 = Math.max(...stock.rows.slice(Math.max(0, t - 19), t).map((r) => r.close)) * 1.005;
  const obvRecent = stock.rows.slice(Math.max(0, t - 20), t + 1).map((r) => r.obvSlope);
  const obvHigh = Math.max(...obvRecent) > 0.05;
  const breakout = row.close > high20 && obvHigh;

  const failingGates = (Object.entries(gates) as Array<[string, boolean]>)
    .filter(([, ok]) => !ok)
    .map(([k]) => k.toUpperCase());

  let signal: TradePlan['signal'] = 'NO_TRADE';
  if (Object.values(gates).every(Boolean)) signal = 'ENTRY_PULLBACK';
  else if (g1 && g2 && g3 && g4 && breakout) signal = 'ENTRY_MOMENTUM';

  const entryLow = Math.max(risk.structStop * 1.01, row.close * (1 - Math.max(0.02, Math.abs(row.ma20Gap)) * 1.2));
  const entryHigh = Math.min(row.close * 0.995, row.close * (1 - Math.max(0.004, Math.abs(row.ma20Gap) * 0.4)));
  const zoneLo = Math.min(entryLow, entryHigh);
  const zoneHi = Math.max(entryLow, entryHigh, row.close * 0.985);

  const probUp = opts.probUp ?? clamp(0.5 + 0.06 * row.z.flow5 - 0.05 * row.z.vol21 + 0.04 * row.z.ret21, 0.15, 0.85);

  const plan: TradePlan = {
    signal,
    entryLow: +zoneLo.toFixed(3),
    entryHigh: +zoneHi.toFixed(3),
    trigger: +high20.toFixed(3),
    stopStruct: +risk.structStop.toFixed(3),
    stopHard: +risk.hardStop.toFixed(3),
    sizePct: +maxSize.toFixed(1),
    cvar: +risk.cvar975.toFixed(4),
    var99: +risk.var99.toFixed(4),
    probUp: +probUp.toFixed(3),
    failingGates,
    killSwitch: 'Θ re-couple (thetaZ > 0) + F_stress ไหลขึ้น + OBV divergence → ปิดทุกไม้ทันที',
    reasons: {
      g1: `F_stress=${stress.toFixed(2)} (ต้อง < 0.8) · F_momentum slope=${momSlope >= 0 ? '+' : ''}${(momSlope * 100).toFixed(1)}/42d`,
      g2: `${decoupled ? 'DECOUPLE = True' : 'coupled'} · LTD=${row.ltd.toFixed(2)} (ผ่านถ้า < 0.35) · Θ=${row.theta.toFixed(2)}`,
      g3: `${label} · volRatio=${row.volRatio.toFixed(2)} · OBV slope=${row.obvSlope.toFixed(2)}`,
      g4: `max size=${maxSize.toFixed(1)}% ของพอร์ต (CVaR 1d = ${(risk.cvar975 * 100).toFixed(2)}%)`,
      g5: `RSI=${row.rsi14.toFixed(1)} (ห้าม chase ถ้า > 80)`,
    },
  };

  return { gates, signal, phase, phaseLabel: label, probUp: plan.probUp, plan };
}

/** Parametric Student-t(4) risk — ใช้ใน light mode เพื่อความเร็ว */
function parametricRisk(rows: DayRow[], close: number, riskBudgetPct: number) {
  const rets = rows.slice(-21).map((r) => r.ret1).filter(Number.isFinite);
  const sigmaDaily = Math.max(1e-5, std(rets));
  const muDaily = mean(rows.slice(-10).map((r) => r.ret1));
  // t4 quantiles (unit variance scaled): q99 ≈ 3.42σ·sqrt(2/5)... ใช้ค่าที่ calibrate แล้ว
  const scale = sigmaDaily * Math.sqrt(2);
  const var99 = Math.max(0.004, muDaily * -1 + 2.36 * scale);
  const cvar = Math.max(var99 * 1.18, 0.006);
  const hardStop = close * (1 - Math.min(0.25, var99));
  const structStop = Math.min(...rows.slice(-15).map((r) => r.close * 0.985), close * 0.93);
  const maxSizePct = Math.min(100, riskBudgetPct / Math.max(0.001, cvar));
  return {
    volAnn: sigmaDaily * Math.sqrt(252),
    muDaily,
    var95: muDaily * -1 + 1.65 * scale,
    var99,
    cvar975: cvar,
    hardStop,
    structStop,
    maxSizePct,
    nu: 4,
    paths: 0,
    lossHistogram: [] as Array<{ x: number; n: number }>,
  };
}

export const currentRegimeSummary = (state: MarketState) => {
  const N = state.dates.length;
  const stress = state.fStress[N - 1];
  const mom = state.fMomentum[N - 1];
  const flow = state.fFlow[N - 1];
  const momSlope = linregSlope(
    Array.from({ length: 21 }, (_, i) => i),
    state.fMomentum.slice(N - 21),
  );
  const decoupleCount = state.stocks.filter((s) => s.rows[N - 1].decoupled).length;
  const regime =
    stress > 0.8 ? 'CRISIS / Risk-Off' :
    mom > 0.5 && stress < 0.3 ? 'BULL / Risk-On' :
    flow > 0 && mom > 0 ? 'RECOVERY / Accumulation' :
    mom < -0.3 ? 'DISTRIBUTION / Weak' : 'SIDEWAYS / Neutral';
  return {
    date: state.dates[N - 1].toISOString().slice(0, 10),
    regime,
    stress: +stress.toFixed(3),
    momentum: +mom.toFixed(3),
    flow: +flow.toFixed(3),
    momentumSlope20: +momSlope.toFixed(4),
    decoupleCount,
    marketChg1d: +(state.marketClose[N - 1] / state.marketClose[N - 2] - 1).toFixed(4),
  };
};

export { mean };
