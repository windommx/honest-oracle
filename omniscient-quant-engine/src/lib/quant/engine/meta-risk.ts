/**
 * meta-risk.ts — Meta-Risk Engine (หลอมรวม Part IV + Part V)
 *
 * แปลมโนทัศน์จากเอกสาร "Anatomy of True Risk Mastery" + "The Meta-Architecture"
 * ให้เป็นตัวเลขที่วัดได้จากข้อมูลสดของแพลตฟอร์ม:
 *
 *  1. Ruin Math          — เส้นโค้งขาดทุนอสมมาตร (loss → required recovery)
 *  2. Risk of Ruin       — Monte Carlo ต่อพอร์ต (fixed sizing vs drawdown-scaled)
 *  3. Defense in Depth   — สถานะเกราะ 5 ชั้น ต่อหุ้น + พอร์ต
 *  4. Advanced Metrics   — Sortino / Calmar / Profit Factor / Expectancy (จาก backtest)
 *  5. Death Conditions   — เงื่อนไข "ตาย" ของโมเดล (self-repudiating) ตรวจสด
 *  6. Reflexivity Phase  — ตำแหน่งในวงจรสะท้อนกลับ (ยังไม่เริ่ม/จุดติด/กำลังไป/เหนื่อย/พัง)
 *  7. Meta-Checklist     — ข้อ 1–7 (Part IV) + ข้อ 1–5 (Part V) คำนวณจากข้อมูลจริง
 *
 * กฎเหล็ก: Absorbing Barrier — คำตอบของ "ยังอยู่ในเกมไหมถ้าผิด" มาก่อนทุกตัวเลขอื่น
 */

import type { MarketState } from './types';
import { evaluateGates, currentRegimeSummary } from './gates';
import type { BacktestResult } from './backtest';
import { mean, psi } from '../stats';
import { mulberry32 } from '../rng';
import { microstructureMetrics } from './micro';
import { buildRiskMdx, buildAntifragility, type RiskMdx, type AntifragilityIndex } from './mdx';

// ───────────────────────── 1. Ruin Math ─────────────────────────

/** % กำไรที่ต้องการเพื่อคืนทุนหลังขาดทุน lossPct (%) */
export function recoveryNeeded(lossPct: number): number {
  const l = Math.min(99.9, Math.max(0.0001, lossPct));
  return (1 / (1 - l / 100) - 1) * 100;
}

export interface RuinRow {
  lossPct: number;
  recoveryPct: number;
  difficulty: 'ง่าย' | 'ปานกลาง' | 'ยาก' | 'ยากมาก' | 'แทบเป็นไปไม่ได้' | 'จบเกม';
}

export function ruinTable(): RuinRow[] {
  return [-5, -10, -20, -30, -50, -70, -90].map((l) => {
    const r = recoveryNeeded(-l);
    const diff: RuinRow['difficulty'] =
      r <= 12 ? 'ง่าย' : r <= 30 ? 'ปานกลาง' : r <= 60 ? 'ยาก' : r <= 150 ? 'ยากมาก' : r <= 400 ? 'แทบเป็นไปไม่ได้' : 'จบเกม';
    return { lossPct: l, recoveryPct: +r.toFixed(1), difficulty: diff };
  });
}

// ───────────────────────── 2. Risk of Ruin (Monte Carlo) ─────────────────────────

export interface RuinPathStats {
  pRuin30: number; // P(พอร์ตหลุด −30% ช่วงใดช่วงหนึ่งใน 12 เดือน) %
  pRuin50: number; // P(หลุด −50%) %
  medianMaxDD: number; // median ของ max drawdown %
  medianFinal: number; // median มูลค่าปลายทาง (เท่าของทุนตั้งต้น)
  paths: number;
}

function simRuin(
  p: number,
  avgWin: number,
  avgLoss: number,
  riskPerTrade: number,
  drawdownScaled: boolean,
  paths: number,
  seed: number,
  tradesPerYear = 48,
): RuinPathStats {
  const rand = mulberry32(seed);
  const R = avgLoss > 1e-9 ? Math.abs(avgWin / avgLoss) : 1.5; // reward:risk (หน่วยเป็น % ทั้งคู่ → ratio ปลอดหน่วย)
  const riskFrac = Math.max(0.0005, riskPerTrade / 100); // % → fraction ของพอร์ต
  let ruin30 = 0;
  let ruin50 = 0;
  const maxDDs: number[] = [];
  const finals: number[] = [];
  for (let pi = 0; pi < paths; pi++) {
    let eq = 1;
    let peak = 1;
    let mdd = 0;
    let dead30 = false;
    let dead50 = false;
    for (let tr = 0; tr < tradesPerYear; tr++) {
      // drawdown-scaled sizing: ลดความเสี่ยงเมื่อพอร์ตติดลบ (antifragile throttle)
      const dd = peak > 0 ? (peak - eq) / peak : 0;
      const scale = drawdownScaled ? Math.max(0.25, 1 - dd / 0.2) : 1;
      const risk = riskFrac * scale;
      if (rand() < p) eq *= 1 + risk * R;
      else eq *= 1 - risk;
      peak = Math.max(peak, eq);
      mdd = Math.max(mdd, (peak - eq) / peak);
      if ((peak - eq) / peak >= 0.3) dead30 = true;
      if ((peak - eq) / peak >= 0.5) dead50 = true;
    }
    if (dead30) ruin30++;
    if (dead50) ruin50++;
    maxDDs.push(mdd);
    finals.push(eq);
  }
  maxDDs.sort((a, b) => a - b);
  finals.sort((a, b) => a - b);
  return {
    pRuin30: +((ruin30 / paths) * 100).toFixed(1),
    pRuin50: +((ruin50 / paths) * 100).toFixed(1),
    medianMaxDD: +(maxDDs[Math.floor(paths / 2)] * 100).toFixed(1),
    medianFinal: +finals[Math.floor(paths / 2)].toFixed(3),
    paths,
  };
}

// ───────────────────────── 3. Defense in Depth (5 layers) ─────────────────────────

export interface DefenseLayer {
  layer: string;
  name: string;
  status: 'PASS' | 'WARN' | 'FAIL' | 'N/A';
  evidence: string;
}

function defenseLayers(
  plan: ReturnType<typeof evaluateGates>['plan'],
  probUp: number,
  rr: number,
  sameThemeActive: number,
  totalPlannedPct: number,
  losingStreak: number,
): DefenseLayer[] {
  const layers: DefenseLayer[] = [];
  // ชั้น 1 PRE-TRADE
  const l1ok = probUp >= 0.55 && rr >= 1.5;
  layers.push({
    layer: 'ชั้น 1', name: 'Pre-Trade (คัดกรองก่อนเข้า)',
    status: l1ok ? 'PASS' : probUp >= 0.5 ? 'WARN' : 'FAIL',
    evidence: `P(up) ${(probUp * 100).toFixed(0)}% · R/R 1:${rr.toFixed(2)} ${rr >= 1.5 ? '≥ 1:1.5 ✓' : '< 1:1.5 — รางวัลไม่คุ้มความเสี่ยง'}`,
  });
  // ชั้น 2 AT-TRADE
  const l2ok = plan.sizePct > 0 && plan.sizePct <= 20 && plan.cvar * (plan.sizePct / 100) * 100 <= 2;
  layers.push({
    layer: 'ชั้น 2', name: 'At-Trade (ขนาดไม้ + วินัยราคา)',
    status: l2ok ? 'PASS' : plan.sizePct <= 20 ? 'WARN' : 'FAIL',
    evidence: `size ${plan.sizePct.toFixed(1)}% · CVaR97.5 ${(plan.cvar * 100).toFixed(1)}% → ความเสียหายต่อพอร์ต ${(plan.cvar * (plan.sizePct / 100) * 100).toFixed(2)}% (เพดาน 2%) · เข้าด้วย limit order ห้ามไล่ราคา`,
  });
  // ชั้น 3 POST-ENTRY
  const l3ok = plan.stopHard > 0 && plan.stopStruct > 0 && plan.killSwitch.length > 0;
  layers.push({
    layer: 'ชั้น 3', name: 'Post-Entry (stop อัตโนมัติ)',
    status: l3ok ? 'PASS' : 'FAIL',
    evidence: `stop แข็ง ${plan.stopHard.toFixed(2)} (vol-based) / stop โครงสร้าง ${plan.stopStruct.toFixed(2)} (พื้นโครงสร้าง) · kill switch: ${plan.killSwitch ? 'กำหนดแล้ว' : 'ยังไม่กำหนด'} · ห้ามเลื่อน stop ลงเด็ดขาด`,
  });
  // ชั้น 4 PORTFOLIO
  const l4ok = plan.sizePct <= 15 && sameThemeActive <= 2;
  layers.push({
    layer: 'ชั้น 4', name: 'Portfolio (เพดานต่อตัว/ต่อธีม)',
    status: l4ok ? 'PASS' : sameThemeActive > 2 ? 'WARN' : 'FAIL',
    evidence: `เพดานต่อตัว ${plan.sizePct.toFixed(1)}% (cap 15%) · สัญญาณที่ยัง active ในธีมเดียวกัน ${sameThemeActive} ตัว (cap 2) — กระจายข้ามธีม ไม่ใช่ข้ามชื่อหุ้น`,
  });
  // ชั้น 5 SYSTEMIC
  const cashImplied = Math.max(0, 100 - totalPlannedPct);
  const l5ok = cashImplied >= 20 && losingStreak < 3;
  layers.push({
    layer: 'ชั้น 5', name: 'Systemic (เงินสด + circuit breaker)',
    status: l5ok ? 'PASS' : losingStreak >= 3 ? 'FAIL' : 'WARN',
    evidence: `cash buffer โดยนัย ${cashImplied.toFixed(0)}% (เป้า ≥ 20%) · สายแพ้ติดกันใน Journal ${losingStreak} ไม้ ${losingStreak >= 3 ? '→ ตัดวงจร: หยุด 1 สัปดาห์' : '(เพดาน 3)'}`,
  });
  return layers;
}

// ───────────────────────── 4. Reflexivity Phase ─────────────────────────

export interface ReflexivityState {
  phase: 'PRE_IGNITION' | 'IGNITION' | 'RUNNING' | 'EXHAUSTION' | 'COLLAPSE';
  label: string;
  detail: string;
}

export function reflexivityPhase(distHigh: number, ret21: number, flow5: number, rsi: number): ReflexivityState {
  if (ret21 < -0.1) {
    return { phase: 'COLLAPSE', label: 'วงจรพังทลาย', detail: 'ราคาลบหนัก (21d) — วงจรด้านลบกำลังเดิน: ความเชื่อมั่นหาย → ระดมทุนแพง → โครงการชะลอ อย่าฝืนรับมีด' };
  }
  if (distHigh >= -0.02 && rsi > 70) {
    return { phase: 'EXHAUSTION', label: 'เหนื่อย/ฟอง', detail: 'ราคาแตะจุดสูงสุดและ RSI ร้อน — feedback loop บวกใกล้หมดแรง ระวังเป็นคนซื้อรอบสุดท้าย' };
  }
  if (distHigh >= -0.05 && flow5 > 0) {
    return { phase: 'RUNNING', label: 'วงจรบวกกำลังเดิน', detail: 'ราคาใกล้จุดสูง + เงินไหลเข้า — loop บวกจุดติดแล้ว ถือตามแผนพร้อม trail stop' };
  }
  if (distHigh >= -0.3 && ret21 > 0 && flow5 > 0) {
    return { phase: 'IGNITION', label: 'จุดประกาย (Ignition)', detail: 'เรื่องเล่าเริ่มถูกจับตา เงินสถาบันเริ่มสะสม — หน้าต่าง reflexivity ที่นักเทรดระดับสูงมองหา: เข้าก่อน loop จุดติดเต็มระบบ' };
  }
  return { phase: 'PRE_IGNITION', label: 'ยังไม่เริ่ม', detail: 'หุ้นยังไม่ถูกค้นพบ — reflexivity อ่อน ราคาขับเคลื่อนด้วย fundamentals ส่วนใหญ่ รอสัญญาณเงินไหลเข้าร่วมวงจร' };
}

// ───────────────────────── 5. Death Conditions (self-repudiating) ─────────────────────────

export interface DeathCondition {
  model: string;
  condition: string;
  live: string;
  triggered: boolean;
}

function deathConditions(bt: BacktestResult | undefined, psiStress: number, symbol: string): DeathCondition[] {
  const sig = bt?.trades.filter((tr) => tr.signal) ?? [];
  const sigSym = sig.filter((tr) => tr.symbol === symbol);
  const pool = sigSym.length >= 15 ? sigSym : sig;
  const recent = pool.slice(-60);
  const recentFail = recent.length ? recent.filter((tr) => tr.fwdRet <= 0).length / recent.length : 0;
  const hitRate = bt?.metrics.hitRate ?? 0;
  const nTruth = (bt?.attribution ?? []).filter((a) => a.verdict === 'SPEAKS_TRUTH').length;
  const calSkew = bt?.calibration.length
    ? mean(bt.calibration.map((c) => Math.abs(c.predicted - c.actual)))
    : 0;

  return [
    {
      model: 'โมเดล ML (walk-forward)',
      condition: 'hit rate ต่ำกว่า 45% ใน out-of-sample',
      live: `hit rate ${hitRate.toFixed(1)}% (n=${bt?.metrics.nSignals ?? 0})`,
      triggered: hitRate < 45,
    },
    {
      model: 'ระบบ 5 Gates',
      condition: 'ไม่มี gate ใด SPEAKS_TRUTH → ระบบตัดสินด้วยเสียงดัง ไม่ใช่ข้อมูล',
      live: `gate ที่พูดความจริง ${nTruth}/5`,
      triggered: nTruth === 0,
    },
    {
      model: 'สมมติฐาน Regime',
      condition: 'PSI drift > 0.2 → การกระจายของตลาดเปลี่ยน โมเดลเก่าหมดอายุ',
      live: `PSI stress ${psiStress.toFixed(3)}`,
      triggered: psiStress > 0.2,
    },
    {
      model: 'Calibration (ความเชื่อของโมเดล)',
      condition: 'คลาดเคลื่อนเฉลี่ย predicted vs actual > 10 จุด → อย่าเชื่อ P(up) เป็นค่าเด็ดขาด',
      live: `คลาดเคลื่อนเฉลี่ย ${calSkew.toFixed(1)} จุด`,
      triggered: calSkew > 10,
    },
    {
      model: `สัญญาณล่าสุดของ ${symbol}`,
      condition: 'false signal > 40% ใน 60 สัญญาณหลัง → ปิดกลยุทธ์ชั่วคราว',
      live: `แพ้ ${recent.length ? (recentFail * 100).toFixed(0) : '—'}% ของ ${recent.length} สัญญาณหลัง`,
      triggered: recent.length >= 20 && recentFail > 0.4,
    },
  ];
}

// ───────────────────────── 6. Meta-Checklist (7 + 5) ─────────────────────────

export interface ChecklistItem {
  part: 'IV' | 'V';
  question: string;
  answer: string;
  pass: boolean | null; // null = ตัดสินไม่ได้จากข้อมูล
}

// ───────────────────────── main dossier ─────────────────────────

export interface MetaRiskDossier {
  symbol: string;
  name: string;
  date: string;
  price: number;
  regime: string;
  totalPlannedPct: number;
  cashImpliedPct: number;
  // ruin math
  ruinRows: RuinRow[];
  planLoss: { label: string; lossPct: number; recoveryPct: number }[];
  // risk of ruin
  entry: { low: number; high: number; stopStruct: number; stopHard: number; sizePct: number; cvar: number; rr: number };
  ruinFixed: RuinPathStats;
  ruinScaled: RuinPathStats;
  ruinInputs: { p: number; avgWinPct: number; avgLossPct: number; n: number; riskPerTrade: number; source: string };
  // defense
  defense: DefenseLayer[];
  // advanced metrics
  advanced: { sortino: number; calmar: number; profitFactor: number; expectancy: number; maxDD: number; hitRate: number };
  // reflexivity + meta
  reflexivity: ReflexivityState;
  deaths: DeathCondition[];
  checklist: ChecklistItem[];
  absorbingBarrier: { inGame: boolean; verdict: string };
  // Part IV ปิดช่องสุดท้าย: 7 มิติความเสี่ยง + ดัชนี antifragility
  riskMdx: RiskMdx;
  antifragility: AntifragilityIndex;
}

export function buildMetaRiskDossier(
  state: MarketState,
  symbol: string,
  bt: BacktestResult | undefined,
  board: { rows: Array<{ symbol: string; theme: string; signal: string; maxSizePct: number }>; summary: { psiStress: number } },
  journal: Array<{ symbol: string; status: string; pnlPct: number | null }>,
  probUp: number,
): MetaRiskDossier | null {
  const si = state.stocks.findIndex((s) => s.symbol === symbol);
  if (si < 0) return null;
  const s = state.stocks[si];
  const N = state.dates.length;
  const t = N - 1;
  const row = s.rows[t];
  const reg = currentRegimeSummary(state);
  const ev = evaluateGates(state, symbol, t, { riskBudgetPct: 1.0, probUp });
  const plan = ev.plan;

  // ── R/R: reward ใช้ high 20 วัน (conservative target), risk = entryMid − stopStruct
  const entryMid = (plan.entryLow + plan.entryHigh) / 2;
  const high20 = Math.max(...s.rows.slice(Math.max(0, t - 19), t + 1).map((r) => r.close));
  const riskDist = Math.max(1e-6, entryMid - plan.stopStruct);
  const rewardDist = Math.max(0.01, high20 * 1.005 - entryMid);
  const rr = rewardDist / riskDist;

  // ── win/loss stats ของระบบ (ต่อหุ้นถ้า n พอ, ไม่งั้นใช้ทั้งระบบ)
  const sigAll = (bt?.trades ?? []).filter((tr) => tr.signal);
  const sigSym = sigAll.filter((tr) => tr.symbol === symbol);
  const pool = sigSym.length >= 15 ? sigSym : sigAll;
  const winsP = pool.filter((tr) => tr.fwdRet > 0);
  const lossP = pool.filter((tr) => tr.fwdRet <= 0);
  const p = pool.length ? winsP.length / pool.length : 0.5;
  const avgWinPct = winsP.length ? mean(winsP.map((tr) => tr.fwdRet)) * 100 : 1.5;
  const avgLossPct = lossP.length ? Math.abs(mean(lossP.map((tr) => tr.fwdRet))) * 100 : 1.5;
  const riskPerTrade = Math.max(0.25, Math.min(2, plan.cvar * (plan.sizePct / 100) * 100));

  // ── Risk of Ruin: fixed vs drawdown-scaled (antifragile throttle)
  const ruinFixed = simRuin(p, avgWinPct, avgLossPct, riskPerTrade, false, 3000, 777001);
  const ruinScaled = simRuin(p, avgWinPct, avgLossPct, riskPerTrade, true, 3000, 777001);

  // ── defense layers (ใช้ board rows ที่ประเมินด้วย eval แบบเต็มแล้ว — ไม่ประเมินซ้ำ)
  const sameThemeActive = board.rows.filter((r) => r.symbol !== symbol && r.theme === s.theme && r.signal !== 'NO_TRADE').length;
  const totalPlannedPct = board.rows.reduce((acc, r) => acc + (r.signal !== 'NO_TRADE' ? r.maxSizePct : 0), 0);
  // losing streak จาก Journal (ปิดไม้ล่าสุดไล่กลับ)
  let losingStreak = 0;
  for (const j of journal) {
    if (j.status !== 'CLOSED') continue;
    if ((j.pnlPct ?? 0) < 0) losingStreak++;
    else break;
  }
  const defense = defenseLayers(plan, probUp, rr, sameThemeActive, totalPlannedPct, losingStreak);

  // ── reflexivity
  const reflex = reflexivityPhase(row.distHigh, row.ret21, row.flow5, row.rsi14);

  // ── death conditions
  const psiStress = board.summary.psiStress ?? psi(state.fStress.slice(N - 240, N - 60), state.fStress.slice(N - 60));
  const deaths = deathConditions(bt, psiStress, symbol);

  // ── checklist (Part IV 7 ข้อ + Part V 5 ข้อ)
  const lossAtStop = ((entryMid - plan.stopHard) / entryMid) * 100;
  const portLossPct = (lossAtStop / 100) * plan.sizePct;
  const calSkew = bt?.calibration.length ? mean(bt.calibration.map((c) => Math.abs(c.predicted - c.actual))) : 0;
  const checklist: ChecklistItem[] = [
    { part: 'IV', question: '1. ความเสียหายสูงสุดถ้าผิด = กี่ % ของพอร์ต? (≤ 2%)', answer: `stop แข็ง −${lossAtStop.toFixed(1)}% × size ${plan.sizePct.toFixed(1)}% = −${portLossPct.toFixed(2)}% ของพอร์ต`, pass: portLossPct <= 2 },
    { part: 'IV', question: '2. ถ้าสภาพคล่องแห้ง ออกได้ไหม? (small-cap test)', answer: `vol ratio (5/60) ${row.volRatio.toFixed(2)} · LTD ${row.ltd.toFixed(2)} ${row.volRatio < 0.6 ? '— ปริมาณซื้อขายร่อง ออกยากตอน panic' : '— ยังมีหน่วยเทรดหมุนอยู่'}`, pass: row.volRatio >= 0.6 },
    { part: 'IV', question: '3. correlation กับพอร์ตจริงหรือหลอก?', answer: `Θz ${row.thetaZ.toFixed(2)} · LTD ${row.ltd.toFixed(2)} · ธีม "${s.theme}" มีสัญญาณ active ${sameThemeActive} ตัวอื่น ${row.ltd >= 0.5 ? '— หางล่างหนา กระจายแบบนี้ไม่ช่วยตอนตลาดลบ' : ''}`, pass: row.ltd < 0.5 && sameThemeActive <= 2 },
    { part: 'IV', question: '4. กำไรมาจากเงินสดจริงหรือ accounting?', answer: `revG ${row.revG.toFixed(1)}% · ROE ${row.roe.toFixed(1)}% · D/E ${row.de.toFixed(2)} ${row.revG > 0 && row.de < 1.5 ? '' : '— คุณภาพกำไรต้องตรวจงบชั้นต้นก่อนเชื่อ'}`, pass: row.revG > 0 && row.de < 1.5 },
    { part: 'IV', question: '5. เทรดตามแผนหรือตามอารมณ์?', answer: plan.failingGates.length === 0 && plan.stopHard > 0 ? 'มีแผนครบ: entry/stop/size กำหนดล่วงหน้าทั้งหมด (precommitment)' : 'ยังไม่มีไม้ที่ผ่านครบ — การเข้าตอนนี้คือการตัดสินใจสด = ความเสี่ยงพฤติกรรม', pass: plan.failingGates.length === 0 && plan.stopHard > 0 },
    { part: 'IV', question: '6. ข่าวร้ายสุดพรุ่งนี้ พอร์ตยังยืนไหม?', answer: `CVaR97.5 ${(plan.cvar * 100).toFixed(1)}% × size ${plan.sizePct.toFixed(1)}% = ${(plan.cvar * (plan.sizePct / 100) * 100).toFixed(2)}% ของพอร์ต · cash โดยนัย ${Math.max(0, 100 - totalPlannedPct).toFixed(0)}%`, pass: plan.cvar * (plan.sizePct / 100) * 100 <= 2 },
    { part: 'IV', question: '7. ยังอยู่ในเกมไหมถ้าผิด? (absorbing barrier)', answer: `ไม่มี leverage · size ถูก cap ที่ ${plan.sizePct.toFixed(1)}% · แม้ stop แข็งโดนทุกไม้ active พอร์ตเสีย ≤ ${(totalPlannedPct * plan.cvar).toFixed(2)}% — อยู่ได้`, pass: true },
    { part: 'V', question: '1. เทรด "แผนที่" หรือ "ดินแดน"?', answer: `คลาดเคลื่อน calibration ${calSkew.toFixed(1)} จุด ${calSkew > 10 ? '— โมเดลหลงตัวเอง เชื่อราคา+งบจริงมากกว่า P(up)' : '— โมเดลยังตรงโลกจริงในระดับใช้ได้'}`, pass: calSkew <= 10 },
    { part: 'V', question: '2. reflexivity loop อยู่ phase ไหน?', answer: `${reflex.label}: ${reflex.detail}`, pass: reflex.phase === 'IGNITION' || reflex.phase === 'RUNNING' || reflex.phase === 'PRE_IGNITION' },
    { part: 'V', question: '3. ใครอยู่ฝั่งตรงข้ามและเขารู้มากกว่าไหม?', answer: `vol ratio ${row.volRatio.toFixed(2)} ${row.volRatio > 2.6 ? '— volume spike ผิดปกติ ตรวจ Big Lot ก่อนเชื่อ breakout (อาจเป็นการโยนกันลากราคา)' : row.volRatio < 0.75 ? '— เงียบผิดวิสัย รอ volume ยืนยัน' : '— อยู่ในแถบที่ volume ยังเชื่อได้'}`, pass: row.volRatio >= 0.75 && row.volRatio <= 2.6 },
    { part: 'V', question: '4. ระบบที่ใช้เหมาะกับ regime ปัจจุบันไหม?', answer: `regime ${reg.regime} · signal ${plan.signal} ${reg.regime === 'CRISIS' ? '— regime นี้ breakout/pullback ทุกแบบพัง ระบบควรปิดสวิตช์ (cash = king)' : '— ระบบ trend/pullback ยังเหมาะกับสภาวะนี้'}`, pass: reg.regime !== 'CRISIS' },
    { part: 'V', question: '5. ถ้าโมเดลผิดพร้อมกันวันนี้ ยังอยู่ในเกมไหม?', answer: `Risk of Ruin(−50%) แบบ drawdown-scaled = ${ruinScaled.pRuin50}% (fixed = ${ruinFixed.pRuin50}%) · cash โดยนัย ${Math.max(0, 100 - totalPlannedPct).toFixed(0)}% → ${ruinScaled.pRuin50 <= 2 ? 'โครงสร้างรับช็อกได้' : 'ลดขนาดไม้ทั้งพอร์ตจนกว่า P(ruin) ≤ 2%'}`, pass: ruinScaled.pRuin50 <= 2 },
  ];

  // ── absorbing barrier verdict
  const deathsTriggered = deaths.filter((d) => d.triggered).length;
  const inGame = ruinScaled.pRuin50 <= 5 && portLossPct <= 2 && totalPlannedPct <= 80;
  const absorbingBarrier = {
    inGame,
    verdict: inGame
      ? `อยู่ในเกม ✓ — แม้วันร้ายสุดพร้อมกัน (โมเดลพัง ${deathsTriggered}/5 เงื่อนไข) พอร์ตยังเสียในขนาดที่กลับมาได้ และมี cash ${Math.max(0, 100 - totalPlannedPct).toFixed(0)}% ซื้อของถูกตอนคนอื่น panic`
      : `เสี่ยงเกินขอบเขต — ลดขนาดไม้ทันที (P(ruin) ${ruinScaled.pRuin50}% / ความเสียหายต่อไม้ ${portLossPct.toFixed(2)}% / การใช้เงินรวม ${totalPlannedPct.toFixed(0)}%)`,
  };

  // ── Risk MDX (7 มิติ) + Antifragility Index — Part IV/V ชิ้นสุดท้าย
  const micro = microstructureMetrics(state, symbol);
  const mdxInput = {
    plan,
    row,
    reg,
    reflexPhase: reflex.phase,
    micro,
    psiStress,
    sameThemeActive,
    totalPlannedPct,
    cashImpliedPct: Math.max(0, 100 - totalPlannedPct),
    losingStreak,
    planReady: plan.failingGates.length === 0 && plan.stopHard > 0,
    rr,
    entryMid,
    lossAtStopPct: lossAtStop,
    ruinFixedP50: ruinFixed.pRuin50,
    ruinScaledP50: ruinScaled.pRuin50,
    calibrationSkew: calSkew,
    deathsTriggered,
    mlHitRate: bt?.metrics.hitRate ?? 0,
  };
  const riskMdx = buildRiskMdx(mdxInput);
  const antifragility = buildAntifragility(mdxInput);

  // plan loss rows (สถานการณ์เฉพาะหุ้น)
  const planLoss = [
    { label: 'ที่ stop แข็ง', lossPct: -lossAtStop, recoveryPct: +recoveryNeeded(lossAtStop).toFixed(1) },
    { label: 'ที่ stop โครงสร้าง', lossPct: -(((entryMid - plan.stopStruct) / entryMid) * 100), recoveryPct: +recoveryNeeded(((entryMid - plan.stopStruct) / entryMid) * 100).toFixed(1) },
    { label: 'ถ้าไม่ตัดเลย −10%', lossPct: -10, recoveryPct: +recoveryNeeded(10).toFixed(1) },
    { label: 'ถ้าไม่ตัดเลย −20%', lossPct: -20, recoveryPct: +recoveryNeeded(20).toFixed(1) },
  ];

  return {
    symbol,
    name: s.name,
    date: state.dates[t].toISOString().slice(0, 10),
    price: +row.close.toFixed(2),
    regime: reg.regime,
    totalPlannedPct: +totalPlannedPct.toFixed(1),
    cashImpliedPct: +Math.max(0, 100 - totalPlannedPct).toFixed(1),
    ruinRows: ruinTable(),
    planLoss,
    entry: { low: plan.entryLow, high: plan.entryHigh, stopStruct: plan.stopStruct, stopHard: plan.stopHard, sizePct: plan.sizePct, cvar: plan.cvar, rr: +rr.toFixed(2) },
    ruinFixed,
    ruinScaled,
    ruinInputs: { p: +p.toFixed(3), avgWinPct: +avgWinPct.toFixed(2), avgLossPct: +avgLossPct.toFixed(2), n: pool.length, riskPerTrade: +riskPerTrade.toFixed(2), source: sigSym.length >= 15 ? `สถิติเฉพาะ ${symbol} (${pool.length} ไม้)` : 'สถิติระบบทั้งหมด (หุ้นนี้มีไม้น้อยกว่า 15)' },
    defense,
    advanced: {
      sortino: bt?.metrics.sortino ?? 0,
      calmar: bt?.metrics.calmar ?? 0,
      profitFactor: bt?.metrics.profitFactor ?? 0,
      expectancy: bt?.metrics.expectancy ?? 0,
      maxDD: bt?.metrics.maxDD ?? 0,
      hitRate: bt?.metrics.hitRate ?? 0,
    },
    reflexivity: reflex,
    deaths,
    checklist,
    absorbingBarrier,
    riskMdx,
    antifragility,
  };
}
