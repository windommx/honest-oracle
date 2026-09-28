/**
 * factors.ts — L3 Multi-View Integration (MOFA2-style)
 * - PCA factor model บน feature panel (cross-sectionally z-scored)
 * - ตั้งชื่อ factor ด้วย correlation กับ anchor features + story concentration
 * - Variance decomposition ต่อ view (PRICE/TECHNICAL/FLOW/FUNDAMENTAL)
 * - Theme enrichment (hypergeometric + BH + Jaccard dedup แบบ REVIGO)
 * - Bipartite Factor↔Stock network + hub detection
 * - PCA scatter + Mahalanobis QC outliers
 * - Factor trajectories (market-level weekly)
 */

import type { MarketState, ViewKey, FeatureKey } from './types';
import { FEATURE_VIEWS, FEATURE_KEYS } from './types';
import {
  pca, mean, std, variance, bhFdr, hypergeomSf, quantile, pearson, clamp,
} from '../stats';

export const TRAIN_WINDOW = 250; // days used to fit factor model
export const N_FACTORS = 4;

export interface FactorInfo {
  id: string; // F1..F4
  name: string;
  desc: string;
  explained: number; // ratio
  viewVariance: Record<ViewKey, number>; // share within view (0..1 across factors)
  topLoadings: Array<{ feature: FeatureKey; loading: number }>;
}

export interface EnrichRow {
  theme: string;
  hits: number;
  count: number; // top-draws size
  bgRatio: number;
  geneRatio: number; // hits / count
  p: number;
  q: number;
  members: string[];
  hitsSymbols: string[];
}

export interface BipartiteEdge {
  factor: string;
  symbol: string;
  loading: number;
}

export interface FactorModelResult {
  factors: FactorInfo[];
  loadings: number[][]; // nFactor × p
  featureKeys: FeatureKey[];
  explainedTotal: number;
  /** per-symbol latest factor exposure (z-scored across stocks) */
  exposures: Array<Record<string, number>>; // per factor → symbol → z
  storyStock: { symbol: string; share: number } | null;
  pcaScatter: Array<{
    symbol: string; pc1: number; pc2: number; outlier: boolean; sector: string;
  }>;
  enrichment: Record<string, EnrichRow[]>; // factorId → rows
  bipartite: { factors: string[]; edges: BipartiteEdge[]; hubs: Array<{ symbol: string; degree: number; weight: number }> };
  trajectories: Array<{ date: string; F1: number; F2: number; F3: number; F4: number; se1: number; se2: number; se3: number; se4: number }>;
  regimeLabel: string;
}

const ANCHORS: Array<{ name: string; desc: string; keys: FeatureKey[]; sign: 1 | -1 }> = [
  { name: 'Market Beta / Momentum', desc: 'แกนขับเคลื่อนหลักของตลาด: โมเมนตัมราคาระยะกลาง + ระยะห่างจากจุดสูงสุด', keys: ['ret21', 'distHigh', 'ma20Gap'], sign: 1 },
  { name: 'Risk / Stress–Severity', desc: 'แกนความกดดัน: ความผันผวนสูง ราคาอ่อนแรง — สัมพันธ์กับ forward vol/drawdown', keys: ['vol21'], sign: 1 },
  { name: 'Flow / Recovery', desc: 'แกนเงินไหลกลับ: fund flow สุทธิ + dependence ฟื้นตัว หลังวิกฤตคลี่คลาย', keys: ['flow5', 'ltd'], sign: 1 },
  { name: 'Value Screen', desc: 'แกนมูลค่า: P/B ต่ำ งบดี — ปัจจัย fundamental ฝั่ง value', keys: ['pb', 'pe'], sign: -1 },
];

function labelFactor(
  scores: number[],
  rowsMeta: Array<{ keyByFeature: Record<FeatureKey, number> }>,
): { name: string; desc: string; corr: number } {
  let best = { name: 'Technical / Residual', desc: 'แกนเทคนิค/เศษเหลือที่ยังไม่จับคู่กับ narrative ชัดเจน', corr: 0 };
  for (const a of ANCHORS) {
    const comp = rowsMeta.map((m) =>
      a.keys.reduce((s, k) => s + (m.keyByFeature[k] ?? 0), 0) / a.keys.length,
    );
    const c = pearson(scores, comp.map((v) => v * a.sign));
    if (Math.abs(c) > Math.abs(best.corr)) {
      best = { name: a.name, desc: a.desc, corr: c };
    }
  }
  return best;
}

export function buildFactorModel(state: MarketState): FactorModelResult {
  const N = state.dates.length;
  const tStart = Math.max(150, N - TRAIN_WINDOW);
  const featureKeys = FEATURE_KEYS;
  const stocks = state.stocks;

  // ── assemble training matrix (stock-days) ──
  const X: number[][] = [];
  const meta: Array<{ symbol: string; t: number }> = [];
  for (let t = tStart; t < N; t++) {
    for (const s of stocks) {
      X.push(featureKeys.map((k) => s.rows[t].z[k]));
      meta.push({ symbol: s.symbol, t });
    }
  }

  const model = pca(X, N_FACTORS);

  // ── per-symbol latest exposures: project last 10 days, mean, then z across stocks ──
  const exposures = Array.from({ length: N_FACTORS }, () => ({} as Record<string, number>));
  const perSymbolRaw: number[][] = Array.from({ length: N_FACTORS }, () => stocks.map(() => 0));
  for (let si = 0; si < stocks.length; si++) {
    for (let t = N - 10; t < N; t++) {
      for (let f = 0; f < N_FACTORS; f++) {
        perSymbolRaw[f][si] +=
          featureKeys.reduce((acc, k, j) => acc + model.loadings[f][j] * stocks[si].rows[t].z[k], 0) / 10;
      }
    }
  }
  for (let f = 0; f < N_FACTORS; f++) {
    const m = mean(perSymbolRaw[f]);
    const s = std(perSymbolRaw[f]) || 1e-9;
    stocks.forEach((st, si) => {
      exposures[f][st.symbol] = (perSymbolRaw[f][si] - m) / s;
    });
  }

  // ── naming: correlation with anchors on training scores + story concentration ──
  const usedNames = new Set<string>();
  // story concentration per factor: share of |score| by top symbol
  const symAbs: Array<Record<string, number>> = Array.from({ length: N_FACTORS }, () => ({}));
  for (let f = 0; f < N_FACTORS; f++) {
    const absSum = model.scores.reduce((s, row) => s + Math.abs(row[f]), 0) || 1;
    for (let i = 0; i < model.scores.length; i++) {
      const sym = meta[i].symbol;
      symAbs[f][sym] = (symAbs[f][sym] ?? 0) + Math.abs(model.scores[i][f]) / absSum;
    }
  }
  const concentrations = symAbs.map((bySym) => {
    const top = Object.entries(bySym).sort((a, b) => b[1] - a[1])[0];
    return top ? { symbol: top[0], share: top[1] } : null;
  });
  let storyIdx = -1;
  let storyBest = 0;
  concentrations.forEach((c, f) => {
    if (c && c.share > storyBest) {
      storyBest = c.share;
      storyIdx = f;
    }
  });
  const storyConcentration = storyIdx >= 0 && storyBest > 0.1 ? concentrations[storyIdx] : null;

  const names: Array<{ name: string; desc: string }> = [];
  // pre-build rowsMeta once (aligned to model.scores rows)
  const symIdx = new Map<string, number>();
  stocks.forEach((s, i) => symIdx.set(s.symbol, i));
  const rowsMeta = model.scores.map((_, i) => ({
    keyByFeature: stocks[symIdx.get(meta[i].symbol)!].rows[meta[i].t].z as unknown as Record<FeatureKey, number>,
  }));
  let residualCount = 0;
  for (let f = 0; f < N_FACTORS; f++) {
    const scores = model.scores.map((row) => row[f]);
    let labeled: { name: string; desc: string };
    if (f === storyIdx && storyConcentration && storyConcentration.share > 0.1) {
      labeled = { name: 'Idiosyncratic Story', desc: `แกนเรื่องราวเฉพาะตัว — ความเข้มข้นจาก ${storyConcentration.symbol} ≈ ${(storyConcentration.share * 100).toFixed(0)}% ของ |score| ทั้งหมด` };
    } else {
      const cand = labelFactor(scores, rowsMeta);
      if (Math.abs(cand.corr) < 0.25) {
        residualCount++;
        labeled = {
          name: residualCount > 1 ? `Technical / Residual ${romanize(residualCount)}` : 'Technical / Residual',
          desc: 'แกนเทคนิค/เศษเหลือที่ยังไม่จับคู่ narrative',
        };
      } else if (usedNames.has(cand.name)) {
        residualCount++;
        labeled = {
          name: `Technical / Residual ${romanize(residualCount)}`,
          desc: 'แกนเทคนิค/เศษเหลือ (ชื่อแกนหลักถูกใช้ไปแล้ว)',
        };
      } else {
        labeled = { name: cand.name, desc: cand.desc };
        usedNames.add(cand.name);
      }
    }
    names.push(labeled);
  }

  // ── variance decomposition per view ──
  const viewVariance: Array<Record<ViewKey, number>> = [];
  for (let f = 0; f < N_FACTORS; f++) {
    const v = {} as Record<ViewKey, number>;
    (Object.keys(FEATURE_VIEWS) as ViewKey[]).forEach((view) => {
      const keys = FEATURE_VIEWS[view];
      v[view] = keys.reduce((s, k) => s + model.loadings[f][featureKeys.indexOf(k)] ** 2, 0) / keys.length;
    });
    viewVariance.push(v);
  }
  // normalize within view so factor shares sum ≤ 1 (residual = unexplained)
  const normViewVariance = viewVariance.map((v) => {
    const out = {} as Record<ViewKey, number>;
    (Object.keys(FEATURE_VIEWS) as ViewKey[]).forEach((view) => {
      const total = viewVariance.reduce((s, vv) => s + vv[view], 0) || 1e-9;
      out[view] = v[view] / total;
    });
    return out;
  });

  const factors: FactorInfo[] = names.map((nm, f) => ({
    id: `F${f + 1}`,
    name: nm.name,
    desc: nm.desc,
    explained: model.explained[f],
    viewVariance: normViewVariance[f],
    topLoadings: featureKeys
      .map((k, j) => ({ feature: k, loading: model.loadings[f][j] }))
      .sort((a, b) => Math.abs(b.loading) - Math.abs(a.loading))
      .slice(0, 6),
  }));

  // ── PCA scatter per symbol (mean of last 20 days' PC1/PC2 projections) + QC outliers ──
  const scatter = stocks.map((s) => {
    let pc1 = 0;
    let pc2 = 0;
    for (let t = N - 20; t < N; t++) {
      pc1 += featureKeys.reduce((acc, k, j) => acc + model.loadings[0][j] * s.rows[t].z[k], 0) / 20;
      pc2 += featureKeys.reduce((acc, k, j) => acc + model.loadings[1][j] * s.rows[t].z[k], 0) / 20;
    }
    return { symbol: s.symbol, pc1: pc1 / 1, pc2: pc2 / 1, sector: s.sector, name: s.name };
  });
  // robust Mahalanobis-ish outlier on (pc1, pc2) using MAD
  const madOut = (arr: number[]) => {
    const m = median(arr);
    return 1.4826 * median(arr.map((v) => Math.abs(v - m))) || 1e-9;
  };
  const p1s = scatter.map((d) => d.pc1);
  const p2s = scatter.map((d) => d.pc2);
  const m1 = median(p1s);
  const m2 = median(p2s);
  const s1 = madOut(p1s);
  const s2 = madOut(p2s);
  const scatterOut = scatter.map((d) => ({
    ...d,
    outlier:
      ((d.pc1 - m1) / s1) ** 2 + ((d.pc2 - m2) / s2) ** 2 > 11.8, // χ²2 99.7% approx
    pc1: (d.pc1 - m1) / s1,
    pc2: (d.pc2 - m2) / s2,
  }));

  // ── theme enrichment per factor (top 6 exposures) ──
  const themeMap = buildThemeMap(state);
  const enrichment: Record<string, EnrichRow[]> = {};
  for (let f = 0; f < N_FACTORS; f++) {
    const top = Object.entries(exposures[f])
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 8)
      .map(([sym]) => sym);
    enrichment[`F${f + 1}`] = enrich(top, new Set(stocks.map((s) => s.symbol)), themeMap);
  }

  // ── bipartite network: factor ↔ stock (|z| > 0.6) ──
  const edges: BipartiteEdge[] = [];
  for (let f = 0; f < N_FACTORS; f++) {
    for (const s of stocks) {
      const z = exposures[f][s.symbol];
      if (Math.abs(z) > 0.6) {
        edges.push({ factor: `F${f + 1}`, symbol: s.symbol, loading: z });
      }
    }
  }
  const hubW: Record<string, number> = {};
  for (const e of edges) {
    hubW[e.symbol] = (hubW[e.symbol] ?? 0) + Math.abs(e.loading);
  }
  const hubs = Object.entries(hubW)
    .map(([symbol, weight]) => ({
      symbol,
      degree: edges.filter((e) => e.symbol === symbol).length,
      weight: +weight.toFixed(3),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  // ── trajectories: weekly factor efficacy = long-short forward-return spread ──
  // mean ของ PCA scores ข้ามหุ้น ≈ 0 เสมอ (z-score ผลรวมเป็นศูนย์) จึงใช้
  // "Top quintile − Bottom quintile ของ forward 21d return" แทน: บวก = factor มีฤทธิ์ช่วงนั้น
  const trajectories: FactorModelResult['trajectories'] = [];
  const qSize = Math.max(2, Math.round(stocks.length / 5));
  for (let t = tStart; t < N - 21; t += 5) {
    const row = { date: state.dates[t].toISOString().slice(0, 10), F1: 0, F2: 0, F3: 0, F4: 0, se1: 0, se2: 0, se3: 0, se4: 0 };
    for (let f = 0; f < N_FACTORS; f++) {
      const scores = stocks.map((s) =>
        featureKeys.reduce((acc, k, j) => acc + model.loadings[f][j] * s.rows[t].z[k], 0),
      );
      const idx = scores
        .map((v, i) => ({ v, i }))
        .sort((a, b) => b.v - a.v);
      const top = idx.slice(0, qSize);
      const bot = idx.slice(-qSize);
      const fwd = (si: number) => stocks[si].rows[t + 21].ret21;
      const topRet = top.map((x) => fwd(x.i));
      const botRet = bot.map((x) => fwd(x.i));
      const spread = mean(topRet) - mean(botRet);
      const se = Math.sqrt(variance(topRet) / topRet.length + variance(botRet) / botRet.length);
      row[`F${f + 1}` as 'F1' | 'F2' | 'F3' | 'F4'] = +(spread * 100).toFixed(3);
      row[`se${f + 1}` as 'se1' | 'se2' | 'se3' | 'se4'] = +(se * 100).toFixed(3);
    }
    trajectories.push(row);
  }

  // regime label from current market factors
  const stress = state.fStress[N - 1];
  const mom = state.fMomentum[N - 1];
  const flow = state.fFlow[N - 1];
  const regimeLabel =
    stress > 0.8 ? 'CRISIS / Risk-Off'
      : mom > 0.5 && stress < 0.3 ? 'BULL / Risk-On'
        : flow > 0 && mom > 0 ? 'RECOVERY / Accumulation'
          : mom < -0.3 ? 'DISTRIBUTION / Weak'
            : 'SIDEWAYS / Neutral';

  return {
    factors,
    loadings: model.loadings,
    featureKeys,
    explainedTotal: model.explained.reduce((s, v) => s + v, 0),
    exposures,
    storyStock: storyConcentration && storyConcentration.share > 0.12 ? storyConcentration : null,
    pcaScatter: scatterOut,
    enrichment,
    bipartite: {
      factors: factors.map((f) => f.id),
      edges,
      hubs,
    },
    trajectories,
    regimeLabel,
  };
}

function romanize(n: number): string {
  return ['', 'I', 'II', 'III', 'IV'][n] ?? `${n}`;
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─────────────────────── themes ───────────────────────

export function buildThemeMap(state: MarketState): Record<string, string[]> {
  const N = state.dates.length;
  const map: Record<string, string[]> = {};
  for (const s of state.stocks) {
    (map[s.theme] ??= []).push(s.symbol);
    (map[`Sector: ${s.sector}`] ??= []).push(s.symbol);
  }
  const betas = state.stocks.map((s) => s.beta);
  const betaMed = median(betas);
  map['High-Beta Cohort'] = state.stocks.filter((s) => s.beta >= betaMed).map((s) => s.symbol);
  map['Value Screen (P/B<1.1)'] = state.stocks
    .filter((s) => s.rows[N - 1].pb > 0 && s.rows[N - 1].pb < 1.1)
    .map((s) => s.symbol);
  map['Flow Magnets'] = state.stocks
    .filter((s) => s.rows[N - 1].z.flow5 > 0.3)
    .map((s) => s.symbol);
  map['Momentum Leaders'] = state.stocks
    .filter((s) => s.rows[N - 1].z.ret21 > 0.4)
    .map((s) => s.symbol);
  return map;
}

/** Hypergeometric over-representation + BH + REVIGO-style Jaccard dedup */
export function enrich(
  topStocks: string[],
  universe: Set<string>,
  themeMap: Record<string, string[]>,
  topN = 12,
): EnrichRow[] {
  const N = universe.size;
  const n = topStocks.length;
  const topSet = new Set(topStocks);
  const rows: EnrichRow[] = [];
  for (const [theme, members] of Object.entries(themeMap)) {
    const valid = members.filter((m) => universe.has(m));
    const K = valid.length;
    if (K === 0 || K === N) continue;
    const hits = valid.filter((m) => topSet.has(m));
    const k = hits.length;
    if (k === 0) continue;
    const p = hypergeomSf(k, N, K, n);
    rows.push({
      theme,
      hits: k,
      count: n,
      bgRatio: K / N,
      geneRatio: k / n,
      p,
      q: p,
      members: valid,
      hitsSymbols: hits,
    });
  }
  const qs = bhFdr(rows.map((r) => r.p));
  rows.forEach((r, i) => (r.q = qs[i]));
  // dedup overlapping themes (Jaccard > 0.7 → keep lower q)
  rows.sort((a, b) => a.q - b.q);
  const kept: EnrichRow[] = [];
  for (const r of rows) {
    const set = new Set(r.members);
    const dup = kept.some((kk) => {
      const ks = new Set(kk.members);
      let inter = 0;
      for (const m of set) if (ks.has(m)) inter++;
      const union = new Set([...set, ...ks]).size;
      return union > 0 && inter / union > 0.7;
    });
    if (!dup) kept.push(r);
  }
  return kept.sort((a, b) => b.geneRatio - a.geneRatio).slice(0, topN);
}
