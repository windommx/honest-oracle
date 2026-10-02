/**
 * rules.ts — กติกาทั้งหมดของเอนจินในที่เดียว (config-as-data) + hash สำหรับ pre-registration
 *
 * ทำไมต้องมี: ต้นฉบับฝังเกณฑ์ไว้ตามไฟล์ (gates.ts, backtest.ts, synthesis.ts, mdx.ts, apex.ts, panel.ts …)
 * และ worklog Task 1-4 บันทึกว่าเกณฑ์หลายตัวถูก "จูน" กับข้อมูลจำลองชุดเดียวกับที่ใช้รายงานผล
 * (เช่น slope G1 21→42 วัน, threshold decouple, และเลือก seed 20250902 เพราะ regime ปลายทางดี)
 * การรวมไว้ที่เดียวทำให้ (1) ทุกรายงานติด hash ของกติกาที่ใช้จริง (2) ล็อกกติกาก่อนแตะข้อมูลจริงได้
 * (3) เปลี่ยนค่าใดค่าหนึ่งแล้ว hash เปลี่ยน — ผลที่อ้าง hash เก่าจะถูกจับได้ทันที
 *
 * ค่าทุกตัวเท่ากับต้นฉบับ (ไม่เปลี่ยนพฤติกรรม) — เปลี่ยนค่าที่นี่ = เปลี่ยน RULES_VERSION ด้วยเสมอ
 * โมดูลนี้เป็น server-only (ใช้ node:crypto) — client อ่านผ่าน GET /api/rules
 */

import { createHash } from 'node:crypto';
import { EXECUTION_RULES } from './execution-rules';

export const RULES = {
  /** seed ของ generator ข้อมูลจำลอง — worklog: "default seed 20250902 (healthy ending regime)" */
  seed: 20250902,
  dependence: {
    /** หน้าต่าง Kendall τ → Clayton Θ (วัน) */
    window: 60,
    /** หน้าต่าง z-score ของ Θ (วัน) */
    zWindow: 120,
    /** thetaZ ต่ำกว่านี้ = decoupled (worklog: "decouple threshold z<-1.5") */
    decoupleZ: -1.5,
    /** quintile ล่างของผลตอบแทนตลาดที่ใช้วัด lower-tail dependence */
    ltdBottomQuantile: 0.2,
  },
  regime: {
    /** risk_off เมื่อดัชนีต่ำกว่า MA นี้ หรือ vol20 อยู่เหนือ quantile นี้ */
    maWindow: 100,
    volQuantile: 0.75,
  },
  gates: {
    g1: { stressMax: 0.8, momSlopeMin: -0.005, momWindow: 42 },
    g2: { ltdMax: 0.35 },
    g3: { phaseMin: 4, volRatioMin: 0.75, volRatioMax: 2.6, obvSlopeMin: -0.18, ret21Min: -0.08 },
    g4: { minSizePct: 8 },
    g5: { rsiMax: 80 },
    momentum: { breakoutBuffer: 1.005, obvHighMin: 0.05, highWindow: 20 },
  },
  risk: {
    /** งบความเสี่ยงต่อไม้ (% ของพอร์ต) = ตัวตั้งของ size = budget / CVaR */
    budgetPct: 1.0,
    nu: 4,
    paths: 20000,
    lightPaths: 8000,
    synthesisPaths: 4000,
  },
  backtest: {
    train: 252,
    test: 21,
    embargo: 5,
    pThr: 0.55,
    lookback: 640,
    attribution: { minPass: 30, edgeMin: 0.0002, pMax: 0.2 },
  },
  probs: { floor: 0.4, cap: 0.95, embargo: 5, window: 400, minStart: 180 },
  synthesis: {
    weights: {
      G1_REGIME: 0.9, G2_DEPENDENCE: 0.7, G3_TECHNICAL: 0.9, G4_RISK: 0.6, G5_EXECUTION: 0.4,
      ML_PROB: 0.8, FLOW: 0.6, VALUATION: 0.5, FACTOR: 0.6, FUNDAMENTAL: 0.5, HUB: 0.3,
      REFLEXIVITY: 0.65, MICROSTRUCTURE: 0.55,
    },
    /** ตัวคูณน้ำหนักเมื่อ gate ไม่ผ่าน attribution (ไม่ใช่ SPEAKS_TRUTH) */
    untrustedMultiplier: 0.5,
    bands: { strong: 55, lean: 25, agreeMin: 0.6 },
  },
  mdx: {
    weights: { MARKET: 0.12, LIQUIDITY: 0.2, BEHAVIORAL: 0.18, MODEL: 0.15, CONCENTRATION: 0.12, TAIL: 0.15, EXECUTION: 0.08 },
    overrideHalf: 50,
    overrideZero: 75,
    topRiskMin: 50,
  },
  kelly: {
    fraction: 0.5,
    targetVol: 0.2,
    volMultMin: 0.25,
    volMultMax: 1.25,
    ddRef: 0.2,
    ddFloor: 0.25,
    capPct: 25,
    minTrades: 20,
    edgeEps: 0.001,
  },
  ruin: { paths: 3000, tradesPerYear: 48, pRuin50Max: 5, portLossMaxPct: 2, plannedMaxPct: 80 },
  /** การส่งคำสั่ง/ออก/ค่าธรรมเนียมของโบรกเกอร์กระดาษ — อยู่ในกติกาเพื่อให้การล็อกครอบคลุมกติกาออกด้วย */
  execution: EXECUTION_RULES,
} as const;

export type Rules = typeof RULES;

/** เปลี่ยนทุกครั้งที่แก้ค่าใน RULES (มนุษย์อ่าน) — hash คือตัวตัดสินจริง */
export const RULES_VERSION = '2026-10-02.1';

/** ที่มาของค่า — ต้องแสดงคู่กับทุกผลลัพธ์ที่ใช้กติกาชุดนี้ */
export const RULES_PROVENANCE = {
  tunedOn: 'ข้อมูลจำลอง (synthetic) seed 20250902 · 22 หุ้น × 750 วัน',
  note:
    'เกณฑ์ถูกปรับระหว่างพัฒนาบนข้อมูลชุดเดียวกับที่รายงานผล (worklog Task 1-4: slope G1 21→42 วัน, threshold decouple z<−1.5, ' +
    'concentration story factor >0.10, และเลือก seed ให้ regime ปลายทางดี) — ยังไม่เคยถูกทดสอบบนข้อมูลจริง ' +
    'ก่อนใช้กับข้อมูลจริงให้ล็อกกติกา (POST /api/rules) แล้วห้ามแก้ค่าจนกว่าจะเผยผล',
  source: 'worklog.md Task 1-4 · docs/scorecard.md §2',
};

/** JSON แบบ canonical (เรียง key ทุกชั้น) — hash จึงไม่ขึ้นกับลำดับที่เขียน */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashRules(rules: unknown = RULES): string {
  return createHash('sha256').update(canonicalJson(rules)).digest('hex');
}

/** sha256 ของ RULES (คำนวณครั้งเดียวตอนโหลดโมดูล) */
export const RULES_HASH = hashRules(RULES);
/** 12 ตัวแรกสำหรับแสดงบน UI */
export const RULES_HASH_SHORT = RULES_HASH.slice(0, 12);
