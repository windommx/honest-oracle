/**
 * robustness.ts — ความทนทานของผลข้าม seed (worklog Task 1-4 เลือก seed 20250902 ให้ regime ปลายทางดี)
 *
 * คำถามที่ตอบ: ถ้าโลกจำลองถูกสุ่มใหม่ (seed อื่น โครงสร้าง regime เดิม) กติกาชุดเดียวกันยังให้ผลทางเดียวกันไหม?
 *  - รัน generator → panel → walk-forward backtest + gate attribution ต่อ seed
 *  - สรุป: hit rate / Sharpe / MaxDD กระจายแค่ไหน · แต่ละ gate SPEAKS_TRUTH กี่ seed จาก N · ทิศ edge กลับด้านไหม
 * ผลนี้ยังเป็นเรื่องของ "ท่อ + กติกา" บนข้อมูลจำลอง — ไม่ใช่หลักฐานว่ามี edge ในตลาดจริง (มิติ 3 ของ scorecard)
 */

import { generateMarket } from '../market';
import { mean, std } from '../stats';
import { buildMarketState } from './panel';
import { runBacktest } from './backtest';
import { currentRegimeSummary } from './gates';
import { RULES, RULES_HASH } from './rules';

export interface SeedRun {
  seed: number;
  nSignals: number;
  hitRate: number;
  hitRateCI: [number, number];
  sharpe: number;
  maxDD: number;
  cumStrat: number;
  cumBase: number;
  regime: string;
  attribution: Array<{ gate: string; edge: number; p: number; verdict: string }>;
  tookMs: number;
}

export interface GateRobustness {
  gate: string;
  speaksTruth: number; // จำนวน seed ที่ SPEAKS_TRUTH
  positiveEdge: number; // จำนวน seed ที่ edge > 0
  meanEdge: number;
  minEdge: number;
  maxEdge: number;
  label: 'ROBUST' | 'FRAGILE' | 'NOISE';
}

export interface RobustnessReport {
  rulesHash: string;
  /** seed ของข้อมูล demo (RULES.seed) — แถวนี้ต้องตรงกับแท็บ Backtest */
  demoSeed: number;
  seeds: number[];
  runs: SeedRun[];
  summary: {
    hitRate: { mean: number; min: number; max: number; std: number };
    sharpe: { mean: number; min: number; max: number; std: number };
    maxDD: { mean: number; min: number; max: number };
    beatsBuyHold: number; // จำนวน seed ที่กลยุทธ์ชนะซื้อถือ
    gates: GateRobustness[];
    verdict: 'STABLE' | 'MIXED' | 'UNSTABLE';
    note: string;
  };
  computedAt: string;
  tookMs: number;
}

/** seed ตั้งต้น = seed ของ demo + seed อื่นที่ไม่ได้ถูกเลือกด้วยมือ */
export const DEFAULT_ROBUSTNESS_SEEDS = [RULES.seed, 11, 2024, 31337, 777];

function dist(xs: number[]) {
  return { mean: +mean(xs).toFixed(2), min: +Math.min(...xs).toFixed(2), max: +Math.max(...xs).toFixed(2), std: +(xs.length > 1 ? std(xs) : 0).toFixed(2) };
}

export async function runSeedRobustness(seeds: number[] = DEFAULT_ROBUSTNESS_SEEDS): Promise<RobustnessReport> {
  const t0 = performance.now();
  const runs: SeedRun[] = [];
  for (const seed of seeds) {
    const s0 = performance.now();
    const state = await buildMarketState(generateMarket(seed));
    const bt = runBacktest(state);
    runs.push({
      seed,
      nSignals: bt.metrics.nSignals,
      hitRate: bt.metrics.hitRate,
      hitRateCI: bt.metrics.hitRateCI,
      sharpe: bt.metrics.sharpe,
      maxDD: bt.metrics.maxDD,
      cumStrat: bt.metrics.cumStrat,
      cumBase: bt.metrics.cumBase,
      regime: currentRegimeSummary(state).regime,
      attribution: bt.attribution.map((a) => ({ gate: a.gate, edge: a.edge, p: a.p, verdict: a.verdict })),
      tookMs: Math.round(performance.now() - s0),
    });
  }
  const gates = ['G1', 'G2', 'G3', 'G4', 'G5'].map((gate): GateRobustness => {
    const rows = runs.map((r) => r.attribution.find((a) => a.gate === gate)).filter((x): x is NonNullable<typeof x> => !!x);
    const edges = rows.map((r) => r.edge);
    const speaksTruth = rows.filter((r) => r.verdict === 'SPEAKS_TRUTH').length;
    const positiveEdge = rows.filter((r) => r.edge > 0).length;
    const share = rows.length ? speaksTruth / rows.length : 0;
    const label: GateRobustness['label'] = share >= 0.8 ? 'ROBUST' : share >= 0.4 || positiveEdge >= Math.ceil(rows.length * 0.8) ? 'FRAGILE' : 'NOISE';
    return {
      gate,
      speaksTruth,
      positiveEdge,
      meanEdge: +(edges.length ? mean(edges) : 0).toFixed(3),
      minEdge: +(edges.length ? Math.min(...edges) : 0).toFixed(3),
      maxEdge: +(edges.length ? Math.max(...edges) : 0).toFixed(3),
      label,
    };
  });
  const hit = dist(runs.map((r) => r.hitRate));
  const sharpe = dist(runs.map((r) => r.sharpe));
  const dd = dist(runs.map((r) => r.maxDD));
  const beatsBuyHold = runs.filter((r) => r.cumStrat > r.cumBase).length;
  const robustGates = gates.filter((g) => g.label === 'ROBUST').length;
  const verdict: RobustnessReport['summary']['verdict'] =
    hit.min >= 50 && robustGates >= 2 && beatsBuyHold >= Math.ceil(runs.length * 0.6)
      ? 'STABLE'
      : hit.min >= 45 || robustGates >= 1
        ? 'MIXED'
        : 'UNSTABLE';
  const note =
    verdict === 'STABLE'
      ? `กติกาให้ผลทางเดียวกันใน ${runs.length} seed (hit rate ต่ำสุด ${hit.min}%, gate ที่ทนทาน ${robustGates}/5) — ยังเป็นผลบนข้อมูลจำลอง ไม่ใช่หลักฐานว่ามี edge ในตลาดจริง`
      : verdict === 'MIXED'
        ? `ผลกระจายข้าม seed (hit rate ${hit.min}–${hit.max}%, gate ที่ทนทาน ${robustGates}/5) — บาง gate ให้ผลตามโลกที่สุ่มได้ ต้องระวังการอ่านผลจาก seed เดียว`
        : `ผลไม่ทนทานข้าม seed (hit rate ${hit.min}–${hit.max}%, ไม่มี gate ที่ทนทาน) — ผลที่เห็นจาก seed ${RULES.seed} เป็นเรื่องของโลกจำลองใบนั้นมากกว่ากติกา`;
  return {
    rulesHash: RULES_HASH,
    demoSeed: RULES.seed,
    seeds,
    runs,
    summary: { hitRate: hit, sharpe, maxDD: { mean: dd.mean, min: dd.min, max: dd.max }, beatsBuyHold, gates, verdict, note },
    computedAt: new Date().toISOString(),
    tookMs: Math.round(performance.now() - t0),
  };
}

// cache ต่อ process (ผลขึ้นกับ seeds + กติกาเท่านั้น — ไม่ขึ้นกับ DB)
const holder = globalThis as unknown as { __oqeRobustness?: Map<string, Promise<RobustnessReport>> };

export function getSeedRobustness(seeds: number[] = DEFAULT_ROBUSTNESS_SEEDS): Promise<RobustnessReport> {
  const map = (holder.__oqeRobustness ??= new Map());
  const key = `${RULES_HASH}|${[...seeds].join(',')}`;
  let p = map.get(key);
  if (!p) {
    p = runSeedRobustness(seeds).catch((e) => {
      map.delete(key);
      throw e;
    });
    map.set(key, p);
  }
  return p;
}
