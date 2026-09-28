/**
 * apex.ts — L7 Apex Layer (ชั้นสูงสุด: หลอม Part IV/V + microstructure + Kelly)
 *
 * องค์ประกอบ 4 ระบบ:
 *   1. Kelly-Vol Sizing   — Fractional Kelly (0.25–0.5) × Vol Targeting × Drawdown throttle
 *                           × Knight haircut → ขนาดไม้สุดท้าย (เทียบกับ CVaR sizing ของ G4)
 *   2. Crisis Stress Test — Monte Carlo สถานการณ์วิกฤต: gap ข้ามคืน, สภาพคล่องแห้ง,
 *                           ตลาดถล่ม 20 วัน, reflexivity collapse — stop รอดจริงไหม
 *   3. Model Registry     — สุขภาพ/สถานะของทุกโมเดลในระบบ (ACTIVE/PROBATION/DEAD)
 *                           self-repudiating: โมเดลรู้ว่าตัวเองตายเมื่อไหร่
 *   4. Apex Verdict       — คำสั่งขนาดไม้สุดท้าย + Execution Adapter (exit > entry)
 *
 * กฎเหล็กซ้ำจาก Meta-Risk: Absorbing Barrier มาก่อนทุกตัวเลข — ตัวนี้คือชั้นถัดจากนั้น
 */

import type { MarketState } from './types';
import { evaluateGates, currentRegimeSummary } from './gates';
import type { BacktestResult } from './backtest';
import { mean, clamp, psi } from '../stats';
import { mulberry32, gaussianFactory, studentTFactory } from '../rng';
import { microstructureMetrics, type MicroMetrics } from './micro';
import { reflexivityPhase } from './meta-risk';
import type { RiskMdx } from './mdx';

/** คำสั่ง size override จาก Risk MDX (meta-risk) ที่ Apex ต้องเคารพ — NONE = ไม่ได้ส่ง MDX มา (ขนาดไม่ถูกหั่น) */
export type MdxOverride = RiskMdx['override'] | 'NONE';
export const MDX_OVERRIDE_FACTOR: Record<MdxOverride, number> = { OK: 1, HALF: 0.5, ZERO: 0, NONE: 1 };

// ───────────────────────── 1. Kelly-Vol Sizing ─────────────────────────

export interface KellySizing {
  p: number; // P(win) จาก walk-forward out-of-sample
  r: number; // reward:risk (avgWin/avgLoss)
  fullKelly: number; // f* = p − (1−p)/R
  kellyFraction: number; // ใช้ 0.5 (ครึ่ง Kelly — กรอบ 0.25–0.5)
  fracKelly: number; // f* × fraction
  volAnn: number;
  targetVol: number;
  volTargetMult: number;
  ddThrottle: number; // จาก maxDD ของ walk-forward (ตัวแทนความถ่อมตัว)
  uncertaintyHaircut: number; // จาก Knight classification
  riskPerTradePct: number; // % ของพอร์ตที่ยอมเสี่ยงต่อไม้
  lossAtStopPct: number; // ระยะจาก entry ถึง stop แข็ง (%)
  kellySizePct: number; // ขนาดไม้ตาม Kelly (% ของพอร์ต)
  cvarSizePct: number; // ขนาดไม้ตาม CVaR budget (ระบบเดิม G4)
  sizeBeforeMdxPct: number; // min(Kelly, CVaR, cap 25) ก่อนคำสั่ง MDX
  mdxOverride: MdxOverride; // OK | HALF (×0.5) | ZERO (ห้ามเปิดไม้) | NONE (ไม่ได้ประเมิน MDX)
  mdxComposite: number | null; // คะแนน MDX รวม 0–100 ที่ใช้ตัดสิน (null เมื่อ NONE)
  finalSizePct: number; // sizeBeforeMdxPct × ตัวคูณ MDX
  riskPerTradeFinalPct: number;
  edgeGuard: boolean; // Kelly ≤ 0 → ไม่มี edge ห้ามเดิมพัน
  source: string;
  note: string;
}

export function kellyVolSizing(
  bt: BacktestResult | undefined,
  symbol: string,
  volAnn: number,
  maxDDPct: number,
  entryRef: number, // fill แย่สุดใน entry zone (ราคาสูงสุดของโซน)
  stopHard: number,
  cvarSizePct: number,
  knightHaircut: number,
  mdx: Pick<RiskMdx, 'override' | 'composite'> | null = null,
): KellySizing {
  const sigAll = (bt?.trades ?? []).filter((tr) => tr.signal);
  const sigSym = sigAll.filter((tr) => tr.symbol === symbol);
  const pool = sigSym.length >= 15 ? sigSym : sigAll;
  const wins = pool.filter((tr) => tr.fwdRet > 0);
  const losses = pool.filter((tr) => tr.fwdRet <= 0);
  const p = pool.length ? wins.length / pool.length : 0.5;
  const avgWinPct = wins.length ? mean(wins.map((tr) => tr.fwdRet)) * 100 : 0;
  const avgLossPct = losses.length ? Math.abs(mean(losses.map((tr) => tr.fwdRet))) * 100 : 1;
  const r = avgLossPct > 1e-9 ? avgWinPct / avgLossPct : 0;

  const fullKelly = Math.max(0, p - (1 - p) / Math.max(0.01, r));
  const kellyFraction = 0.5; // ครึ่ง Kelly — กรอบ 0.25–0.5 ของ Part V
  const fracKelly = fullKelly * kellyFraction;
  const edgeGuard = fullKelly <= 0.001 || pool.length < 20;

  const targetVol = 0.20;
  const volTargetMult = clamp(targetVol / Math.max(0.05, volAnn), 0.25, 1.25);
  // drawdown throttle: maxDD ยิ่งลึกยิ่งถ่อมตัว (proxy ของ DD ปัจจุบันจาก walk-forward)
  const ddThrottle = Math.max(0.25, 1 - Math.max(0, maxDDPct / 100) / 0.2);
  const uncertaintyHaircut = knightHaircut;

  const riskPerTradePct = fracKelly * 100 * volTargetMult * ddThrottle * uncertaintyHaircut;
  // ระยะความเสี่ยง: วัดจาก fill แย่สุดใน entry zone (ราคาสูงสุด) ถึง stop แข็ง — conservative
  const lossAtStopPct = Math.max(0.5, ((entryRef - stopHard) / entryRef) * 100);
  const kellySizePct = Math.min(25, (riskPerTradePct / lossAtStopPct) * 100);
  const sizeBeforeMdxPct = edgeGuard ? 0 : Math.min(kellySizePct, cvarSizePct, 25);
  // Risk MDX (7 มิติ) ออกคำสั่งบังคับ: HALF ลดครึ่ง · ZERO ห้ามเปิดไม้ใหม่ — Apex คือขนาดสุดท้ายจึงต้องเคารพคำสั่งนี้
  const mdxOverride: MdxOverride = mdx ? mdx.override : 'NONE';
  const finalSizePct = sizeBeforeMdxPct * MDX_OVERRIDE_FACTOR[mdxOverride];
  const riskPerTradeFinalPct = (finalSizePct / 100) * lossAtStopPct;

  const source = sigSym.length >= 15
    ? `สถิติเฉพาะ ${symbol} (${pool.length} ไม้ walk-forward)`
    : `สถิติระบบทั้งหมด (${pool.length} ไม้ — ${symbol} มีไม้เฉพาะตัวน้อยกว่า 15)`;

  const mdxNote =
    mdxOverride === 'ZERO'
      ? ` · Risk MDX ${mdx?.composite ?? '?'} (วิกฤต) สั่ง ZERO — ห้ามเปิดไม้ใหม่ ขนาด ${sizeBeforeMdxPct.toFixed(1)}% ถูกลดเป็น 0`
      : mdxOverride === 'HALF'
        ? ` · Risk MDX ${mdx?.composite ?? '?'} (สูง) สั่ง HALF — ขนาด ${sizeBeforeMdxPct.toFixed(1)}% ถูกลดครึ่งเหลือ ${finalSizePct.toFixed(1)}%`
        : mdxOverride === 'OK'
          ? ` · Risk MDX ${mdx?.composite ?? '?'} ต่ำกว่า 50 — ไม่ต้องลดขนาด`
          : '';
  const note = edgeGuard
    ? `Kelly f* = ${fullKelly.toFixed(3)} ≤ 0 — P(win) ${(p * 100).toFixed(0)}% กับ R 1:${r.toFixed(2)} ไม่มี edge ทางสถิติพอจะเดิมพัน (Kelly บอกว่า "ไม่เดิมพัน" ก็คือคำตอบที่ถูก)`
    : `Kelly f* = ${fullKelly.toFixed(3)} → ใช้ครึ่ง Kelly ${fracKelly.toFixed(3)} · vol target 20% → ×${volTargetMult.toFixed(2)} · DD throttle ×${ddThrottle.toFixed(2)} · Knight haircut ×${uncertaintyHaircut.toFixed(2)} → เสี่ยง ${riskPerTradePct.toFixed(2)}%/ไม้ = ขนาด ${kellySizePct.toFixed(1)}% แล้วจำกัดด้วย CVaR budget ที่ ${cvarSizePct.toFixed(1)}%${mdxNote}`;

  return {
    p: +p.toFixed(3),
    r: +r.toFixed(2),
    fullKelly: +fullKelly.toFixed(4),
    kellyFraction,
    fracKelly: +fracKelly.toFixed(4),
    volAnn: +volAnn.toFixed(3),
    targetVol,
    volTargetMult: +volTargetMult.toFixed(2),
    ddThrottle: +ddThrottle.toFixed(2),
    uncertaintyHaircut,
    riskPerTradePct: +riskPerTradePct.toFixed(2),
    lossAtStopPct: +lossAtStopPct.toFixed(2),
    kellySizePct: +kellySizePct.toFixed(1),
    cvarSizePct: +cvarSizePct.toFixed(1),
    sizeBeforeMdxPct: +sizeBeforeMdxPct.toFixed(1),
    mdxOverride,
    mdxComposite: mdx ? mdx.composite : null,
    finalSizePct: +finalSizePct.toFixed(1),
    riskPerTradeFinalPct: +riskPerTradeFinalPct.toFixed(2),
    edgeGuard,
    source,
    note,
  };
}

// ───────────────────────── 2. Crisis Stress Test ─────────────────────────

export interface CrisisScenario {
  key: string;
  name: string;
  desc: string;
  plannedLossPct: number; // ความเสียหายที่แผนคาด (ที่ stop)
  actualLossPct: number; // ความเสียหายจริงในสถานการณ์
  portDamagePct: number; // actualLoss × ขนาดไม้
  stopExecuted: boolean | null;
  survived: boolean; // portDamage ≤ 2%
  note: string;
}

export interface CrisisResult {
  scenarios: CrisisScenario[];
  survivalScore: number; // 0–100
  verdict: string;
  paths: number;
}

const CRISIS_WEIGHTS: Record<string, number> = {
  GAP_5: 0.15, GAP_8: 0.2, GAP_12: 0.25, DROUGHT: 0.15, CRASH_20: 0.15, REFLEX: 0.1,
};

function gapScenario(
  key: string,
  gapPct: number,
  lossAtStopPct: number,
  sizePct: number,
  stopHard: number,
  entryMid: number,
): CrisisScenario {
  // gap ผ่าน stop: ออกที่ราคา open ไม่ใช่ราคา stop — ความจริงของ stop ในโลกจริง
  const gapThrough = gapPct > lossAtStopPct;
  const actual = gapThrough ? gapPct : Math.min(gapPct, lossAtStopPct);
  const portDamage = (actual / 100) * sizePct;
  const openPx = entryMid * (1 - gapPct / 100);
  return {
    key,
    name: `Gap ข้ามคืน −${gapPct}%`,
    desc: `พรุ่งนี้เปิดตลาดเหวี่ยง −${gapPct}% ทันที (ข่าวร้ายกลางคืน) — ${gapThrough ? `open ${openPx.toFixed(2)} ต่ำกว่า stop แข็ง ${stopHard.toFixed(2)} → stop โดน "ผ่าน" ออกที่ open แย่กว่าราคา stop` : `open ยังอยู่เหนือ stop → ยังไม่ถูกบังคับออก แต่ mark-to-market ติดลบทันที`}`,
    plannedLossPct: +lossAtStopPct.toFixed(2),
    actualLossPct: +actual.toFixed(2),
    portDamagePct: +portDamage.toFixed(2),
    stopExecuted: gapThrough,
    survived: portDamage <= 2,
    note: gapThrough
      ? `Stop ไม่ได้รับประกัน "ราคา" — มันรับประกันได้แค่ "วินัย" (ออกจริง −${actual.toFixed(1)}% vs แผน −${lossAtStopPct.toFixed(1)}%)`
      : `ยังไม่ถึง stop — ความเสี่ยงจริงคือใจเย็นของเจ้าของพอร์ต ไม่ใช่ระบบ`,
  };
}

function droughtScenario(
  lossAtStopPct: number,
  sizePct: number,
  slippagePct: number,
  exitComplexity: number,
): CrisisScenario {
  // สภาพคล่องแห้ง 10 วัน: −1.5%/วัน ≈ −14% + หนังสือสั่งซื้อบาง → slippage ×2–3
  const fullLoss = 14 + slippagePct * 3;
  const pStop = exitComplexity <= 50 ? 0.7 : 0.4;
  const stopLoss = lossAtStopPct + slippagePct * 2;
  const eLoss = pStop * stopLoss + (1 - pStop) * fullLoss;
  const portDamage = (eLoss / 100) * sizePct;
  return {
    key: 'DROUGHT',
    name: 'สภาพคล่องแห้ง 10 วัน',
    desc: `ราคาไหลลง −1.5%/วัน (รวม ≈ −14%) พร้อม volume หาย 70% — มีคนซื้อคืนน้อยมาก ออกได้เฉพาะราคาเลว`,
    plannedLossPct: +lossAtStopPct.toFixed(2),
    actualLossPct: +eLoss.toFixed(2),
    portDamagePct: +portDamage.toFixed(2),
    stopExecuted: pStop >= 0.5,
    survived: portDamage <= 2,
    note: `P(stop ทำงานได้) ≈ ${(pStop * 100).toFixed(0)}% (จาก exit complexity ${exitComplexity}/100) · ถ้าออกได้ที่ stop: −${stopLoss.toFixed(1)}% · ถ้าออกไม่ได้เลย: −${fullLoss.toFixed(1)}% — นี่คือเหตุผลที่ "exit > entry"`,
  };
}

function crashScenario(
  entryMid: number,
  stopHard: number,
  lossAtStopPct: number,
  sizePct: number,
  slippagePct: number,
  volAnn: number,
  paths = 1200,
): CrisisScenario & { p95Damage: number; stopShare: number } {
  const rand = mulberry32(777123);
  const gauss = gaussianFactory(rand);
  const t4 = studentTFactory(rand, 4);
  const sigmaDaily = (volAnn / Math.sqrt(252)) * 2.2; // วิกฤต = vol ×2.2
  const scale = sigmaDaily * Math.sqrt(2); // คู่ risk.ts (nu=4)
  const drift = -0.0015;
  const crisisSlip = lossAtStopPct + slippagePct * 1.5;
  const losses: number[] = [];
  let stopCount = 0;
  for (let pi = 0; pi < paths; pi++) {
    let c = entryMid;
    let realized: number | null = null;
    for (let d = 0; d < 20 && realized === null; d++) {
      const open = c * (1 - 0.0012 + gauss() * 0.006); // gap ข้ามคืนแบบ crisis
      if (open < stopHard) {
        realized = ((entryMid - open) / entryMid) * 100; // gap ผ่าน stop → ออกที่ open
        stopCount++;
        break;
      }
      const ret = drift + scale * t4();
      const close = open * (1 + ret);
      const low = Math.min(open, close) * (1 - Math.abs(gauss()) * 0.008);
      if (low < stopHard) {
        realized = crisisSlip; // ตัดที่ stop ได้ (มีคนรับในวันนั้น) + crisis slippage
        stopCount++;
        break;
      }
      c = close;
    }
    if (realized === null) realized = ((entryMid - c) / entryMid) * 100; // 20 วันไม่แตะ stop → ยังถือ (mark)
    losses.push(Math.max(0, realized));
  }
  losses.sort((a, b) => a - b);
  const meanLoss = mean(losses);
  const p95 = losses[Math.floor(paths * 0.95)];
  const portDamage = (meanLoss / 100) * sizePct;
  const p95Damage = (p95 / 100) * sizePct;
  return {
    key: 'CRASH_20',
    name: 'ตลาดถล่ม 20 วัน (MC)',
    desc: `จำลอง ${paths.toLocaleString()} เส้นทาง 20 วัน: vol ×2.2, drift ลบ, gap ข้ามคืนแบบ crisis — สถิติวิกฤตจริง ไม่ใช่สมมติ`,
    plannedLossPct: +lossAtStopPct.toFixed(2),
    actualLossPct: +meanLoss.toFixed(2),
    portDamagePct: +portDamage.toFixed(2),
    stopExecuted: stopCount / paths >= 0.5,
    survived: p95Damage <= 2,
    note: `stop ทำงานใน ${((stopCount / paths) * 100).toFixed(0)}% ของเส้นทาง · ความเสียหายเฉลี่ยต่อพอร์ต ${portDamage.toFixed(2)}% · P95 ${p95Damage.toFixed(2)}% (เกณฑ์รอด: P95 ≤ 2%)`,
    p95Damage: +p95Damage.toFixed(2),
    stopShare: +(stopCount / paths).toFixed(3),
  };
}

function reflexScenario(lossAtStopPct: number, sizePct: number, slippagePct: number): CrisisScenario {
  const disc = Math.min(3.5, lossAtStopPct) + slippagePct; // วันแรก −3.5% stop เจอเลย
  const held = 23.5; // −3,−4,−6,−8,−5%
  const portDamage = (disc / 100) * sizePct;
  return {
    key: 'REFLEX',
    name: 'Reflexivity collapse',
    desc: 'วงจรสะท้อนกลับด้านลบจุดติด: −3,−4,−6,−8,−5% ใน 5 วัน (รวม −23.5%) — เรื่องเล่าพังพร้อมกับราคา',
    plannedLossPct: +lossAtStopPct.toFixed(2),
    actualLossPct: +disc.toFixed(2),
    portDamagePct: +portDamage.toFixed(2),
    stopExecuted: true,
    survived: portDamage <= 2,
    note: `มีวินัย: −${disc.toFixed(1)}% · ไม่มีวินัย (เชื่อเรื่องเล่าต่อ): −${held}% — ต่างกัน ${((held - disc) / Math.max(0.5, disc)).toFixed(1)}× นี่คือราคาของคำว่า "รอก่อน"`,
  };
}

export function crisisStressTest(
  entryMid: number,
  stopHard: number,
  lossAtStopPct: number,
  sizePct: number,
  slippagePct: number,
  exitComplexity: number,
  volAnn: number,
): CrisisResult {
  const scenarios: CrisisScenario[] = [
    gapScenario('GAP_5', 5, lossAtStopPct, sizePct, stopHard, entryMid),
    gapScenario('GAP_8', 8, lossAtStopPct, sizePct, stopHard, entryMid),
    gapScenario('GAP_12', 12, lossAtStopPct, sizePct, stopHard, entryMid),
    droughtScenario(lossAtStopPct, sizePct, slippagePct, exitComplexity),
    crashScenario(entryMid, stopHard, lossAtStopPct, sizePct, slippagePct, volAnn),
    reflexScenario(lossAtStopPct, sizePct, slippagePct),
  ];
  let wSum = 0;
  let wSurv = 0;
  for (const sc of scenarios) {
    const w = CRISIS_WEIGHTS[sc.key] ?? 0.1;
    wSum += w;
    if (sc.survived) wSurv += w;
  }
  const survivalScore = Math.round((wSurv / wSum) * 100);
  const verdict =
    survivalScore >= 85 ? 'ผ่านการทดสอบวิกฤต — โครงสร้างไม้นี้รับช็อกได้ในขนาดที่กลับมาได้' :
    survivalScore >= 60 ? 'รอดในกรอบแต่มีบาดแผล — บางสถานการณ์เจ็บเกิน 2% ของพอร์ต พิจารณาลดขนาด' :
    'โครงสร้างไม่รอด — วิกฤตจริงจะทำให้ไม้นี้เจ็บหนักกว่าแผน ลดขนาดหรืองดเข้า';
  return { scenarios, survivalScore, verdict, paths: 1200 };
}

// ───────────────────────── 3. Model Registry ─────────────────────────

export interface RegistryRow {
  id: string;
  name: string;
  version: string;
  layer: string;
  metric: string;
  health: number; // 0–100
  status: 'ACTIVE' | 'PROBATION' | 'DEAD';
  note: string;
}

export interface RegistryResult {
  rows: RegistryRow[];
  systemHealth: number;
  nActive: number;
  nProbation: number;
  nDead: number;
  verdict: string;
}

function gateHealth(edge: number, p: number, verdict: string): { health: number; status: RegistryRow['status']; note: string } {
  if (verdict === 'SPEAKS_TRUTH' && edge > 0.05 && p < 0.15) {
    return { health: Math.round(clamp(70 + edge * 150, 70, 98)), status: 'ACTIVE', note: `edge +${edge.toFixed(3)} (p=${p.toFixed(3)}) — พูดความจริงใน out-of-sample` };
  }
  if (edge < -0.02 && p > 0.25) {
    return { health: Math.round(clamp(35 + edge * 100, 5, 45)), status: 'DEAD', note: `edge ${edge.toFixed(3)} (p=${p.toFixed(2)}) — สัญญาณกลับด้าน ถือว่าตายจนกว่าจะ refit` };
  }
  return { health: Math.round(clamp(50 + edge * 150, 20, 69)), status: 'PROBATION', note: `edge ${edge >= 0 ? '+' : ''}${edge.toFixed(3)} (p=${p.toFixed(2)}) — ${verdict} · ลดน้ำหนักในการหลอมครึ่งหนึ่งอัตโนมัติแล้ว` };
}

export function modelRegistry(
  bt: BacktestResult | undefined,
  psiStress: number,
  micro: MicroMetrics,
  recentFailRate: number,
  kelly: KellySizing,
): RegistryResult {
  const rows: RegistryRow[] = [];
  const gateMeta: Array<[string, string, string]> = [
    ['G1', 'Regime Gate', 'L1/L6'],
    ['G2', 'Dependence Gate', 'L2'],
    ['G3', 'Technical Gate', 'L1'],
    ['G4', 'Risk Gate', 'L5'],
    ['G5', 'Execution Gate', 'L6'],
  ];
  for (const [id, name, layer] of gateMeta) {
    const a = (bt?.attribution ?? []).find((x) => x.gate === id);
    const g = a
      ? gateHealth(a.edge, a.p, a.verdict)
      : { health: 50, status: 'PROBATION' as const, note: 'ยังไม่มี attribution — ต้องรัน backtest ให้ครบ' };
    rows.push({
      id, name, version: 'v1.3', layer,
      metric: a ? `edge ${a.edge >= 0 ? '+' : ''}${a.edge.toFixed(3)} · p ${a.p.toFixed(3)}` : 'no attribution',
      health: g.health, status: g.status, note: g.note,
    });
  }

  // ML model
  const hit = bt?.metrics.hitRate ?? 0;
  const mlStatus: RegistryRow['status'] = hit < 45 ? 'DEAD' : hit < 52 ? 'PROBATION' : 'ACTIVE';
  rows.push({
    id: 'ML', name: 'Walk-forward ML (P·up)', version: 'v2.0', layer: 'L4',
    metric: `hit ${hit.toFixed(1)}% · n=${bt?.metrics.nSignals ?? 0}`,
    health: Math.round(clamp((hit - 40) * 3, 5, 98)),
    status: mlStatus,
    note: mlStatus === 'DEAD' ? 'hit rate < 45% — เงื่อนไขตายยิงแล้ว ห้ามใช้ P(up) ตัดสิน' : mlStatus === 'PROBATION' ? 'hit rate อยู่โซนเสี่ยง — ใช้เป็นเสียงประกอบ ไม่ใช่ผู้ตัดสิน' : 'out-of-sample hit rate ผ่านเกณฑ์',
  });

  // Calibration
  const cal = bt?.calibration.length ? mean(bt.calibration.map((c) => Math.abs(c.predicted - c.actual))) : 99;
  rows.push({
    id: 'CAL', name: 'Calibration', version: 'v1.1', layer: 'L4',
    metric: `คลาดเคลื่อน ${cal.toFixed(1)} จุด`,
    health: Math.round(clamp(100 - cal * 6, 5, 98)),
    status: cal > 15 ? 'DEAD' : cal > 10 ? 'PROBATION' : 'ACTIVE',
    note: cal > 10 ? 'โมเดลเชื่อตัวเองเกินจริง — อย่าใช้ P(up) เป็นค่าเด็ดขาด' : 'ความเชื่อของโมเดลตรงโลกจริง',
  });

  // Regime assumption (PSI)
  rows.push({
    id: 'PSI', name: 'สมมติฐาน Regime (drift)', version: 'v1.0', layer: 'L0/L1',
    metric: `PSI stress ${psiStress.toFixed(3)}`,
    health: Math.round(clamp(100 - psiStress * 250, 5, 98)),
    status: psiStress > 0.2 ? 'DEAD' : psiStress > 0.1 ? 'PROBATION' : 'ACTIVE',
    note: psiStress > 0.2 ? 'การกระจายเปลี่ยน — โมเดลทุกตัวหมดอายุจนกว่าจะ refit (self-repudiation)' : psiStress > 0.1 ? 'drift เริ่มขยับ — เฝ้าระวัง' : 'การกระจายนิ่ง สมมติฐานยังยืน',
  });

  // Microstructure (L7)
  rows.push({
    id: 'MICRO', name: 'Microstructure (L7)', version: 'v1.0', layer: 'L7',
    metric: `exit ${micro.exitComplexity}/100 · spread ${micro.spreadBps.toFixed(0)} bps`,
    health: Math.round(clamp(100 - micro.exitComplexity, 10, 98)),
    status: micro.knight.cls === 'UNCERTAINTY' ? 'PROBATION' : 'ACTIVE',
    note: micro.knight.cls === 'UNCERTAINTY' ? `Knightian uncertainty: ${micro.knight.reason.split('—')[0]}` : 'ตลาดหุ้นตัวนี้ยัง "อ่านได้" ในระดับ microstructure',
  });

  // Kelly sizing engine (L7)
  rows.push({
    id: 'KELLY', name: 'Kelly-Vol Sizing (L7)', version: 'v1.0', layer: 'L7',
    metric: `f* ${kelly.fullKelly.toFixed(3)} · P(win) ${(kelly.p * 100).toFixed(0)}%`,
    health: kelly.edgeGuard ? 25 : Math.round(clamp(kelly.p * 100, 30, 95)),
    status: kelly.edgeGuard ? 'PROBATION' : 'ACTIVE',
    note: kelly.edgeGuard ? 'ไม่มี edge ทางสถิติ — Kelly engine ขอ "ไม่เดิมพัน" ในหุ้นนี้' : 'edge ผ่านเกณฑ์ Kelly > 0 พร้อม haircut ครบชุด',
  });

  // Synthesis fuser
  const synHealth = Math.round(clamp(100 - recentFailRate * 100, 30, 98));
  rows.push({
    id: 'SYNTH', name: 'Convergent Synthesis (หลอมรวม)', version: 'v2.1', layer: 'L7',
    metric: `false-signal ${Math.round(recentFailRate * 100)}% (60 สัญญาณหลัง)`,
    health: synHealth,
    status: recentFailRate > 0.4 ? 'PROBATION' : 'ACTIVE',
    note: recentFailRate > 0.4 ? 'สัญญาณล่าสุดแพ้เกิน 40% — หลอมรวมยังทำงานแต่ต้องเช็ก evidence ใหม่' : 'หลักฐาน 13 สายยังบรรจบได้จริงใน out-of-sample',
  });

  const nDead = rows.filter((r) => r.status === 'DEAD').length;
  const nProbation = rows.filter((r) => r.status === 'PROBATION').length;
  const nActive = rows.filter((r) => r.status === 'ACTIVE').length;
  const systemHealth = Math.round(mean(rows.map((r) => r.health)));
  const verdict = nDead > 0
    ? `${nDead} โมเดลตาย · ${nProbation} อยู่ระหว่างพิจารณา — ระบบตระหนักถึงขีดจำกัดของตัวเอง (นี่คือคุณสมบัติ ไม่ใช่ความล้มเหลว)`
    : nProbation > 2
      ? 'ไม่มีโมเดลตาย แต่หลายตัวอยู่โซนพิจารณา — ลดความเชื่อมั่นลงหนึ่งขั้น'
      : 'ทุกโมเดลยังมีชีวิตและผ่านการตรวจ out-of-sample';
  return { rows, systemHealth, nActive, nProbation, nDead, verdict };
}

// ───────────────────────── 4. Apex Dossier ─────────────────────────

export interface ApexDossier {
  symbol: string;
  name: string;
  date: string;
  price: number;
  regime: string;
  beta: number;
  kelly: KellySizing;
  micro: MicroMetrics;
  crisis: CrisisResult;
  registry: RegistryResult;
  reflex: ReturnType<typeof reflexivityPhase>;
  entry: { low: number; high: number; stopStruct: number; stopHard: number; cvarSizePct: number };
  signal: string;
  verdict: {
    headline: string;
    finalSizePct: number;
    riskPerTradePct: number;
    execution: string[];
    risky: boolean;
  };
}

export function buildApexDossier(
  state: MarketState,
  symbol: string,
  bt: BacktestResult | undefined,
  probUp: number,
  opts: { riskMdx?: Pick<RiskMdx, 'override' | 'composite'> | null } = {},
): ApexDossier | null {
  const si = state.stocks.findIndex((s) => s.symbol === symbol);
  if (si < 0) return null;
  const s = state.stocks[si];
  const N = state.dates.length;
  const t = N - 1;
  const row = s.rows[t];

  const ev = evaluateGates(state, symbol, t, { riskBudgetPct: 1.0, probUp });
  const plan = ev.plan;
  const micro = microstructureMetrics(state, symbol);
  if (!micro) return null;

  // fill แย่สุดใน entry zone (ราคาสูงสุด) = ฐานคำนวณความเสี่ยงแบบ conservative (exit > entry)
  const entryRef = plan.entryHigh;
  const kelly = kellyVolSizing(
    bt,
    symbol,
    row.vol21,
    bt?.metrics.maxDD ?? 15,
    entryRef,
    plan.stopHard,
    plan.sizePct,
    micro.knight.haircut,
    opts.riskMdx ?? null,
  );

  const crisis = crisisStressTest(
    entryRef,
    plan.stopHard,
    kelly.lossAtStopPct,
    kelly.finalSizePct,
    micro.slippagePct,
    micro.exitComplexity,
    row.vol21,
  );

  // recent false-signal rate (สำหรับ SYNTH registry)
  const sigAll = (bt?.trades ?? []).filter((tr) => tr.signal);
  const recent = sigAll.slice(-60);
  const recentFailRate = recent.length ? recent.filter((tr) => tr.fwdRet <= 0).length / recent.length : 0;

  const psiStress = psi(
    state.fStress.slice(Math.max(0, N - 240), N - 60),
    state.fStress.slice(N - 60),
  );
  const registry = modelRegistry(bt, psiStress, micro, recentFailRate, kelly);

  const reflex = reflexivityPhase(row.distHigh, row.ret21, row.flow5, row.rsi14);

  // ── Apex verdict + Execution Adapter
  const execution: string[] = [];
  const mdxBlocked = kelly.mdxOverride === 'ZERO' && kelly.sizeBeforeMdxPct > 0;
  if (mdxBlocked) {
    execution.push(`ขนาดไม้ = 0 — Risk MDX ${kelly.mdxComposite} (วิกฤต) ห้ามเปิดไม้ใหม่ แม้ Kelly/CVaR จะให้ ${kelly.sizeBeforeMdxPct.toFixed(1)}% (ดูมิติที่เสี่ยงสุดในแท็บ Meta-Risk แล้วรอให้คะแนนลดต่ำกว่า 75)`);
  }
  if (kelly.finalSizePct > 0) {
    execution.push(`ขนาดไม้สุดท้าย ${kelly.finalSizePct.toFixed(1)}% ของพอร์ต = เสี่ยง ${kelly.riskPerTradeFinalPct.toFixed(2)}% ต่อไม้ (วัดจาก fill แย่สุด ${entryRef.toFixed(2)} ถึง stop แข็ง = −${kelly.lossAtStopPct.toFixed(1)}% · จำกัดด้วย ${kelly.kellySizePct <= kelly.cvarSizePct ? 'Kelly-Vol' : 'CVaR budget'} และ cap 25%${kelly.mdxOverride === 'HALF' ? ` · Risk MDX ${kelly.mdxComposite} สั่งลดครึ่งจาก ${kelly.sizeBeforeMdxPct.toFixed(1)}%` : ''})`);
    execution.push(`เข้าด้วย limit order ในโซน ${plan.entryLow.toFixed(2)}–${plan.entryHigh.toFixed(2)} เท่านั้น — ห้าม market chase (RSI ${row.rsi14.toFixed(0)})`);
    execution.push(`แบ่งคำสั่งไม่เกิน 10% ของ ADV20 (≈ ${(micro.adv20MB * 0.1).toFixed(1)} ล้านบาท/คำสั่ง) เพื่อคุม impact ไม่ให้ตลาดรู้ตัว`);
    execution.push(`กัน slippage budget ${micro.slippagePct.toFixed(2)}% ต่อฝั่ง (เข้า+ออก = ${(micro.slippagePct * 2).toFixed(2)}%) — ถ้าจริงแย่กว่านี้แปลว่า exit complexity ประเมินต่ำไป หยุดและทบทวน`);
    execution.push(`กำหนด exit ก่อนเข้า (exit > entry): stop แข็ง ${plan.stopHard.toFixed(2)} · stop โครงสร้าง ${plan.stopStruct.toFixed(2)} · kill switch ตาม plan`);
  } else if (!mdxBlocked) {
    execution.push('ขนาดไม้ = 0 — Kelly ปฏิเสธไม้นี้ (ไม่มี edge ทางสถิติ) รอหลักฐานใหม่ ไม่ใช่รอใจกล้ามากขึ้น');
    execution.push('จดเฝ้าดูใน Journal: ถ้า edge กลับมา (hit rate/R ดีขึ้น) Kelly จะบอกเองว่าควรกลับเข้าเมื่อไหร่');
  }
  if (micro.knight.cls === 'UNCERTAINTY') {
    execution.push(`Knight haircut ×0.5 ใช้แล้ว: ${micro.knight.reason.split('—')[0].trim()} — ตัวเลขขนาดไม้นี้คือ "ขนาดที่ผิดพลาดได้เมื่อไม่รู้" ไม่ใช่ขนาดที่ถูกต้อง`);
  }
  if (crisis.survivalScore < 60) {
    execution.push('⚠ ผล stress test ต่ำกว่า 60 — ขนาดไม้ต้องลดลงจน survival ≥ 60 ไม่ใช่แค่เชื่อว่า "คราวนี้ต่างจากเดิม"');
  }

  const risky =
    kelly.edgeGuard ||
    kelly.mdxOverride === 'HALF' ||
    kelly.mdxOverride === 'ZERO' ||
    crisis.survivalScore < 60 ||
    micro.knight.cls === 'UNCERTAINTY' ||
    registry.nDead > 0;
  const headline = kelly.edgeGuard
    ? `${symbol}: ไม่มี edge — Kelly ห้ามเดิมพัน`
    : mdxBlocked
      ? `${symbol}: Risk MDX ${kelly.mdxComposite} (วิกฤต) ห้ามเปิดไม้ใหม่ — ขนาดไม้สุดท้าย 0%`
      : `${symbol}: ขนาดไม้สุดท้าย ${kelly.finalSizePct.toFixed(1)}%${kelly.mdxOverride === 'HALF' ? ` (MDX ลดครึ่ง)` : ''} · survival ${crisis.survivalScore}/100 · ระบบรอด ${registry.nActive}/${registry.rows.length} โมเดล`;

  return {
    symbol,
    name: s.name,
    date: state.dates[t].toISOString().slice(0, 10),
    price: +row.close.toFixed(2),
    regime: currentRegimeSummary(state).regime,
    beta: s.beta,
    kelly,
    micro,
    crisis,
    registry,
    reflex,
    entry: { low: plan.entryLow, high: plan.entryHigh, stopStruct: plan.stopStruct, stopHard: plan.stopHard, cvarSizePct: plan.sizePct },
    signal: plan.signal,
    verdict: {
      headline,
      finalSizePct: kelly.finalSizePct,
      riskPerTradePct: kelly.riskPerTradeFinalPct,
      execution,
      risky,
    },
  };
}
