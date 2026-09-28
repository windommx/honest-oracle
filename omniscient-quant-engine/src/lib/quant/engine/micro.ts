/**
 * micro.ts — Microstructure Engine (L7 Apex · ความจริงของหุ้นเล็ก 5 ข้อ)
 *
 * แปล "5 ความจริงของ microstructure หุ้นเล็ก" (Part V) ให้เป็นตัวเลขสดจาก OHLCV ดิบ:
 *   1. Bid-ask bounce  → Roll spread estimator (spread เป็น bps ของราคา)
 *   2. Volume mirage   → volume spike แต่ราคาไม่ยืนยัน (โยนกันลากราคา)
 *   3. Informed counterparty → Big-lot intensity (flow สถาบันเทียบ turnover)
 *   4. Exit > Entry    → slippage + exit complexity score (ออกยากกว่าเข้าเสมอ)
 *   5. Knight Uncertainty → จำแนกความเสี่ยงที่ "วัดได้" ออกจากที่ "วัดไม่ได้"
 *
 * แหล่งข้อมูล: generator cache (seed เดียวกับ DB — OHLCV ดิบที่ DB ไม่ได้เก็บใน panel)
 */

import type { MarketState } from './types';
import { getGenerated } from './panel';
import { mean, std, psi, clamp } from '../stats';

// ───────────────────────── types ─────────────────────────

export interface MirageFlag {
  flagged: boolean;
  reason: string;
}

export interface KnightClass {
  cls: 'RISK' | 'UNCERTAINTY';
  reason: string;
  haircut: number; // ตัวคูณหั่นขนาดไม้ (0.5 = ลดครึ่ง)
}

export interface MicroMetrics {
  clv20: number; // −1…+1 ปิดใกล้ high มากแค่ไหน (20d mean)
  clv5: number;
  spreadBps: number; // Roll estimator
  amihudBps: number; // impact bps ต่อคำสั่ง 1% ของ ADV20
  bigLotPct: number; // flow5 เป็น % ของ turnover 5 วัน
  volRatio: number;
  adv20MB: number; // มูลค่าซื้อขายเฉลี่ย 20 วัน (ล้านบาท)
  mirage: MirageFlag;
  exitComplexity: number; // 0–100
  exitVerdict: string;
  slippagePct: number; // ครึ่งสเปรด + impact (เข้าจริง/ออกจริง แย่กว่าราคาจอ %)
  gapCount60: number; // จำนวนวัน |ret| > 3σ ใน 60 วัน
  knight: KnightClass;
}

// ───────────────────────── helpers ─────────────────────────

function clvSeries(high: number[], low: number[], close: number[], w: number): number {
  const n = close.length;
  const vals: number[] = [];
  for (let i = Math.max(0, n - w); i < n; i++) {
    const range = high[i] - low[i];
    if (range <= 1e-9) continue;
    vals.push(((close[i] - low[i]) - (high[i] - close[i])) / range);
  }
  return vals.length ? mean(vals) : 0;
}

/** Roll (1984) spread estimator: 2·√(−Cov(Δp_t, Δp_{t−1})) เมื่อ covariance เป็นลบ */
function rollSpreadBps(close: number[], w = 60): number {
  const n = close.length;
  const seg = close.slice(Math.max(0, n - w));
  const dp: number[] = [];
  for (let i = 1; i < seg.length; i++) dp.push(seg[i] - seg[i - 1]);
  if (dp.length < 10) return 0;
  const a = dp.slice(0, -1);
  const b = dp.slice(1);
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  for (let i = 0; i < a.length; i++) cov += (a[i] - ma) * (b[i] - mb);
  cov /= a.length;
  const spread = cov < 0 ? 2 * Math.sqrt(-cov) : 0;
  const lastPx = Math.max(1e-6, seg[seg.length - 1]);
  return (spread / lastPx) * 10000; // bps
}

// ───────────────────────── main ─────────────────────────

export function microstructureMetrics(state: MarketState, symbol: string): MicroMetrics | null {
  const si = state.stocks.findIndex((s) => s.symbol === symbol);
  if (si < 0) return null;
  const s = state.stocks[si];
  const N = state.dates.length;
  const row = s.rows[N - 1];

  // raw OHLCV จาก generator cache (seed เดียวกับ DB)
  const gen = getGenerated();
  const gs = gen.stocks.find((x) => x.def.symbol === symbol);
  if (!gs) return null;
  const { open, high, low, close, volume } = gs.series;

  const clv20 = clvSeries(high, low, close, 20);
  const clv5 = clvSeries(high, low, close, 5);
  const spreadBps = rollSpreadBps(close);

  // Amihud illiquidity: |ret| ต่อมูลค่าซื้อขาย (ล้านบาท) — แปลงเป็น impact bps ของคำสั่ง 1% ADV20
  const rets = s.rows.slice(-20).map((r) => Math.abs(r.ret1));
  const dv = close.slice(-20).map((c, i) => (volume.slice(-20)[i] ?? 0) * c); // ล้านบาท
  const illiq = mean(rets.map((r, i) => r / Math.max(1e-6, dv[i] ?? 1e-6)));
  const adv20MB = mean(dv);
  const amihudBps = illiq * (adv20MB * 0.01) * 10000;

  // Big-lot intensity: เงินไหลสุทธิ 5 วัน เทียบ turnover 5 วัน
  const flow5 = row.flow5;
  const turnover5 = mean(dv.slice(-5)) * 5;
  const bigLotPct = turnover5 > 1e-6 ? (flow5 / turnover5) * 100 : 0;

  // gap risk: |ret| > 3σ ใน 60 วัน
  const ret60 = s.rows.slice(-60).map((r) => r.ret1).filter(Number.isFinite);
  const sig = std(ret60) || 1e-9;
  const gapCount60 = ret60.filter((r) => Math.abs(r) > 3 * sig).length;

  // volume mirage: ปริมาณพุ่งแต่ราคา/OBV ไม่ยืนยัน
  let mirage: MirageFlag = { flagged: false, reason: 'volume และราคายืนยันกันเอง ไม่มีสัญญาณลากราคา' };
  if (row.volRatio >= 2.0 && clv5 < 0.15) {
    mirage = { flagged: true, reason: `vol ratio ${row.volRatio.toFixed(2)}× พุ่งแต่ CLV5 ${clv5.toFixed(2)} — คนเทรดกันเยอะแต่ราคาปิดไม่ได้ยืนยัน = volume mirage อาจเป็นการโยนกันลากราคา` };
  } else if (row.volRatio >= 2.6 && row.obvSlope < 0.1) {
    mirage = { flagged: true, reason: `vol ratio ${row.volRatio.toFixed(2)}× สูงผิดปกติแต่ OBV slope ${row.obvSlope.toFixed(2)} ไม่ไหลขึ้น — ตรวจ Big Lot ก่อนเชื่อ breakout` };
  }

  // exit complexity 0–100
  const spreadScore = clamp(spreadBps / 150, 0, 1) * 40;
  const amihudScore = clamp(amihudBps / 150, 0, 1) * 25;
  const drynessScore = row.volRatio < 0.6 ? 20 : row.volRatio < 0.8 ? 10 : 0;
  const gapScore = Math.min(1, gapCount60 / 3) * 15;
  const exitComplexity = Math.round(spreadScore + amihudScore + drynessScore + gapScore);
  const exitVerdict =
    exitComplexity <= 25 ? 'ออกง่าย — สภาพคล่องรองรับ' :
    exitComplexity <= 50 ? 'ปานกลาง — แบ่งคำสั่งได้ตามปกติ' :
    exitComplexity <= 75 ? 'ยาก — ออกแพงกว่าเข้า ต้องกัน slippage พิเศษ' :
    'ออกยากมาก — exit > entry ชัดเจน เล็กเกินกว่าจะให้เดิมพันใหญ่';

  const slippagePct = +(spreadBps / 2 / 100 + amihudBps / 100).toFixed(3);

  // Knight uncertainty: ความเสี่ยงวัดได้ vs วัดไม่ได้
  // เช็กเงื่อนไขเฉพาะหุ้นก่อน (informative กว่า) แล้วปิดท้ายด้วย drift ระดับตลาด
  const psiStress = psi(
    state.fStress.slice(Math.max(0, N - 240), N - 60),
    state.fStress.slice(N - 60),
  );
  let knight: KnightClass;
  if (exitComplexity > 65) {
    knight = { cls: 'UNCERTAINTY', reason: `exit complexity ${exitComplexity}/100 — การออกจากไม้วัดผลไม่ได้ล่วงหน้า (slippage ควบคุมไม่ได้ในตอน panic) ลดขนาดครึ่งหนึ่งเป็นการป้องกันเชิงโครงสร้าง`, haircut: 0.5 };
  } else if (row.decoupled && spreadBps > 80) {
    knight = { cls: 'UNCERTAINTY', reason: `หุ้น decouple (Θz ${row.thetaZ.toFixed(2)}) พร้อม spread ${spreadBps.toFixed(0)} bps — ราคาเคลื่อนด้วยผู้เล่นน้อยราย โมเดลความน่าจะเป็นใช้กับระบบนี้ได้จำกัด`, haircut: 0.5 };
  } else if (psiStress > 0.2) {
    knight = { cls: 'UNCERTAINTY', reason: `PSI stress ${psiStress.toFixed(3)} > 0.2 — การกระจายของตลาดเปลี่ยนแล้ว ตัวเลข CVaR ทั้งหมดมาจากโลกเก่า นี่คือ Knightian uncertainty (วัดไม่ได้) ไม่ใช่ risk (วัดได้)`, haircut: 0.5 };
  } else {
    knight = { cls: 'RISK', reason: `ความเสี่ยงวัดได้ในกรอบ: PSI ${psiStress.toFixed(3)} · spread ${spreadBps.toFixed(0)} bps · exit complexity ${exitComplexity}/100 — CVaR/stop ยังมีความหมายเชิงสถิติ`, haircut: 1 };
  }

  return {
    clv20: +clv20.toFixed(3),
    clv5: +clv5.toFixed(3),
    spreadBps: +spreadBps.toFixed(1),
    amihudBps: +amihudBps.toFixed(1),
    bigLotPct: +bigLotPct.toFixed(2),
    volRatio: +row.volRatio.toFixed(2),
    adv20MB: +adv20MB.toFixed(1),
    mirage,
    exitComplexity,
    exitVerdict,
    slippagePct,
    gapCount60,
    knight,
  };
}
