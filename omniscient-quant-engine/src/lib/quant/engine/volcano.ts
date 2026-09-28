/**
 * volcano.ts — L1 Regime Volcano (กระจกของ DESeq2 volcano ฝั่งชีวสารสนเทศ)
 * x = Cohen's d ของ feature ระหว่าง regime (risk_on vs risk_off)
 * y = -log10(q) จาก Mann-Whitney U + BH
 * คำนวณต่อ (stock × feature) → ~350 จุด ให้เห็นทรง volcano จริง
 */

import type { MarketState, FeatureKey } from './types';
import { FEATURE_KEYS, FEATURE_LABELS } from './types';
import { mannWhitneyU, bhFdr, cohensD } from '../stats';

export interface VolcanoPoint {
  stock: string;
  feature: FeatureKey;
  featureLabel: string;
  d: number;
  p: number;
  q: number;
  negLogQ: number;
  significant: boolean;
}

export interface VolcanoResult {
  points: VolcanoPoint[];
  nRiskOn: number;
  nRiskOff: number;
  nSignificant: number;
  upCount: number;
  downCount: number;
  topFeatures: VolcanoPoint[]; // aggregate per-feature ranking
}

export function buildVolcano(state: MarketState, window = 500): VolcanoResult {
  const N = state.dates.length;
  const t0 = Math.max(160, N - window);
  const idxOn: number[] = [];
  const idxOff: number[] = [];
  for (let t = t0; t < N; t += 2) {
    if (state.regime[t] === 'risk_on') idxOn.push(t);
    else idxOff.push(t);
  }
  if (idxOn.length < 30 || idxOff.length < 30) {
    // degenerate: fall back to halves
    const mid = (t0 + N) >> 1;
    for (let t = t0; t < N; t += 2) (t < mid ? idxOn : idxOff).push(t);
  }

  const raw: Array<Omit<VolcanoPoint, 'q' | 'negLogQ' | 'significant'>> = [];
  for (const s of state.stocks) {
    for (const key of FEATURE_KEYS) {
      const a = idxOff.map((t) => s.rows[t].z[key]);
      const b = idxOn.map((t) => s.rows[t].z[key]);
      const d = cohensD(a, b);
      const { p } = mannWhitneyU(a, b, 'two-sided');
      raw.push({
        stock: s.symbol,
        feature: key,
        featureLabel: FEATURE_LABELS[key],
        d,
        p,
      });
    }
  }
  const qs = bhFdr(raw.map((r) => r.p));
  const points: VolcanoPoint[] = raw.map((r, i) => ({
    ...r,
    q: qs[i],
    negLogQ: qs[i] > 0 ? Math.min(30, -Math.log10(Math.max(qs[i], 1e-12))) : 30,
    significant: qs[i] < 0.05 && Math.abs(r.d) >= 0.3,
    d: +r.d.toFixed(4),
  }));

  const nSignificant = points.filter((p) => p.significant).length;
  const sig = points.filter((p) => p.significant);
  const upCount = sig.filter((p) => p.d > 0).length;
  const downCount = sig.filter((p) => p.d < 0).length;

  // aggregate per-feature significance count
  const agg = new Map<FeatureKey, VolcanoPoint>();
  for (const p of points) {
    if (!p.significant) continue;
    const cur = agg.get(p.feature);
    if (!cur || p.negLogQ > cur.negLogQ) agg.set(p.feature, p);
  }
  const topFeatures = [...agg.values()].sort((a, b) => b.negLogQ - a.negLogQ);

  return {
    points,
    nRiskOn: idxOn.length,
    nRiskOff: idxOff.length,
    nSignificant,
    upCount,
    downCount,
    topFeatures,
  };
}
