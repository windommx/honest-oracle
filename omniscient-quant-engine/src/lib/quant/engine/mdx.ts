/**
 * mdx.ts — Risk MDX: การถอดรหัสความเสี่ยง 7 มิติ + ดัชนี Antifragility
 *
 * ปิดช่องสุดท้ายของ Part IV ("7 มิติความเสี่ยง — เน้น Liquidity + Behavioral")
 * และ Part V (Antifragility ของ Taleb) ให้เป็นตัวเลขสด:
 *
 *  MDX — ถอดความเสี่ยงของไม้ 1 ตัวออกเป็น 7 มิติ (score 0–100, ยิ่งสูงยิ่งเสี่ยง):
 *    1. MARKET        beta ของสภาพแวดล้อม (F_stress, regime, decouple wave)
 *    2. LIQUIDITY  ⭐  สเปรด/impact/exit complexity/ความบางของหนังสือคำสั่ง
 *    3. BEHAVIORAL ⭐  กับดักพฤติกรรม: mirage, ไล่ราคา, วงจร reflexivity, สายแพ้, ไม่มีแผน
 *    4. MODEL         ความเสี่ยงของโมเดล: เงื่อนไขตาย, calibration, PSI drift, hit rate
 *    5. CONCENTRATION กระจุกตัว: ขนาดไม้, ธีมเดียวกัน, การใช้เงินรวม, cash
 *    6. TAIL          หางหนา: CVaR, LTD, gap risk, P(ruin −50%)
 *    7. EXECUTION     ความจริงของการปฏิบัติ: slippage, R/R, ระยะจากโซนเข้า
 *
 *  ค่ารวม (composite) = Σ(w·score) → ผูก "size override" เชิงบังคับ:
 *    OK (คะแนน < 50) · HALF (50–74: ลดขนาดครึ่งหนึ่ง) · ZERO (≥ 75: ห้ามเปิดไม้ใหม่)
 *
 *  Antifragility Index — "ระบบนี้อยู่รอดแล้วได้ประโยชน์จากความโกลาหลแค่ไหน":
 *    - Drawdown throttle  (sizing หดเมื่อพอร์ตเจ็บ — พิสูจน์ด้วย MC fixed vs scaled)
 *    - Cash optionality   (เงินสดสำรอง = กระสุนซื้อของถูกตอนคนอื่น panic)
 *    - Automated brakes   (เกราะชั้น 3–5 ทำงานเองแม้คนหลับ)
 *    - Crisis survival    (รอด MC วิกฤต 6 สถานการณ์)
 *    - Reflex discipline  (กันวงจรพังทลายด้วยวินัย ไม่ใช่ความเชื่อ)
 */

import type { TradePlan, DayRow } from './types';
import type { MicroMetrics } from './micro';
import { crisisStressTest } from './apex';
import type { currentRegimeSummary } from './gates';
import type { ReflexivityState } from './meta-risk';
import { clamp } from '../stats';

// ───────────────────────── types ─────────────────────────

export type MdxKey =
  | 'MARKET' | 'LIQUIDITY' | 'BEHAVIORAL' | 'MODEL'
  | 'CONCENTRATION' | 'TAIL' | 'EXECUTION';

export interface MdxDim {
  key: MdxKey;
  name: string;
  weight: number;
  score: number; // 0–100 (ยิ่งสูงยิ่งเสี่ยง)
  band: 'ต่ำ' | 'กลาง' | 'สูง' | 'วิกฤต';
  evidence: string;
}

export interface RiskMdx {
  composite: number;
  band: MdxDim['band'];
  override: 'OK' | 'HALF' | 'ZERO';
  overrideNote: string;
  dims: MdxDim[];
  topRisk: { key: string; name: string; score: number; evidence: string } | null;
}

export interface AntifragilityIndex {
  index: number; // 0–100 (ยิ่งสูงยิ่ง antifragile)
  verdict: string;
  components: Array<{ key: string; name: string; score: number; evidence: string }>;
}

// ───────────────────────── helpers ─────────────────────────

export function bandOf(score: number): MdxDim['band'] {
  return score < 25 ? 'ต่ำ' : score < 50 ? 'กลาง' : score < 75 ? 'สูง' : 'วิกฤต';
}

/** step: cuts เรียงมาก→น้อย เช่น [[80,90],[70,65]] = rsi≥80→90, ≥70→65, อื่น ๆ → fallback */
const step = (x: number, cuts: Array<[number, number]>, fallback: number): number => {
  for (const [t, s] of cuts) if (x >= t) return s;
  return fallback;
};

/** stepDown: cuts เรียงน้อย→มาก เช่น [[1,85],[1.5,60]] = rr≤1→85, ≤1.5→60, อื่น ๆ → fallback */
const stepDown = (x: number, cuts: Array<[number, number]>, fallback: number): number => {
  for (const [t, s] of cuts) if (x <= t) return s;
  return fallback;
};

// ───────────────────────── Risk MDX (7 มิติ) ─────────────────────────

export interface MdxInput {
  plan: TradePlan;
  row: DayRow;
  reg: ReturnType<typeof currentRegimeSummary>;
  reflexPhase: ReflexivityState['phase'];
  micro: MicroMetrics | null;
  psiStress: number;
  sameThemeActive: number;
  totalPlannedPct: number;
  cashImpliedPct: number;
  losingStreak: number;
  planReady: boolean;
  rr: number;
  entryMid: number;
  lossAtStopPct: number;
  ruinFixedP50: number;
  ruinScaledP50: number;
  calibrationSkew: number;
  deathsTriggered: number;
  mlHitRate: number;
}

export function buildRiskMdx(input: MdxInput): RiskMdx {
  const { plan, row, reg, reflexPhase, micro, psiStress } = input;

  // ── D1 MARKET ──
  const stressScore = clamp(reg.stress * 80, 0, 80);
  const crisisBonus = reg.regime.includes('CRISIS') ? 20 : reg.regime.includes('DISTRIBUTION') ? 10 : 0;
  const slopePenalty = reg.momentumSlope20 < -0.005 ? 10 : 0;
  const d1: MdxDim = {
    key: 'MARKET', name: 'สภาพตลาด (Market)', weight: 0.12,
    score: Math.round(clamp(stressScore + crisisBonus + slopePenalty, 0, 100)),
    band: 'ต่ำ',
    evidence: `F_stress ${reg.stress.toFixed(2)} · regime ${reg.regime} · โมเมนตัม ${reg.momentumSlope20 >= 0 ? '+' : ''}${(reg.momentumSlope20 * 100).toFixed(1)}/21d · หุ้น decouple ทั้งกระดาน ${reg.decoupleCount} ตัว`,
  };

  // ── D2 LIQUIDITY (⭐ emphasis) ──
  const d2: MdxDim = micro
    ? {
        key: 'LIQUIDITY', name: 'สภาพคล่อง (Liquidity)', weight: 0.2,
        score: Math.round(
          clamp((micro.spreadBps / 250) * 100, 0, 100) * 0.3 +
          clamp((micro.amihudBps / 200) * 100, 0, 100) * 0.2 +
          micro.exitComplexity * 0.3 +
          stepDown(micro.adv20MB, [[20, 90], [50, 70], [150, 45], [400, 25]], 8) * 0.2,
        ),
        band: 'ต่ำ',
        evidence: `spread ${micro.spreadBps.toFixed(0)} bps · impact ${micro.amihudBps.toFixed(0)} bps/1%ADV · exit ${micro.exitComplexity}/100 · ADV20 ${micro.adv20MB.toFixed(0)}MB${micro.volRatio < 0.6 ? ' · volume แห้ง (volRatio < 0.6)' : ''}`,
      }
    : {
        key: 'LIQUIDITY', name: 'สภาพคล่อง (Liquidity)', weight: 0.2,
        score: 50, band: 'กลาง',
        evidence: 'ยังประเมินไม่ได้ (ไม่มีข้อมูล OHLCV ดิบของหุ้นนี้) — ถือว่าเสี่ยงกลางไว้ก่อน',
      };

  // ── D3 BEHAVIORAL (⭐ emphasis) ──
  const mirageScore = micro ? (micro.mirage.flagged ? 85 : micro.volRatio >= 2 ? 55 : 25) : 50;
  const chaseScore = step(row.rsi14, [[80, 90], [70, 65], [60, 40]], 20);
  const reflexMap: Record<ReflexivityState['phase'], number> = {
    COLLAPSE: 90, EXHAUSTION: 75, RUNNING: 35, IGNITION: 30, PRE_IGNITION: 25,
  };
  const reflexScore = reflexMap[reflexPhase] ?? 45;
  const streakScore = step(input.losingStreak, [[3, 90], [2, 65], [1, 40]], 20);
  const planScore = input.planReady ? 20 : 50;
  const d3: MdxDim = {
    key: 'BEHAVIORAL', name: 'พฤติกรรม (Behavioral)', weight: 0.18,
    score: Math.round((mirageScore + chaseScore + reflexScore + streakScore + planScore) / 5),
    band: 'ต่ำ',
    evidence: [
      micro?.mirage.flagged ? 'volume mirage ติดธง (อย่าเชื่อ breakout)' : `RSI ${row.rsi14.toFixed(0)}${row.rsi14 > 70 ? ' — โซนไล่ราคา' : ''}`,
      `วงจร reflexivity: ${reflexPhase}`,
      input.losingStreak >= 2 ? `สายแพ้ติดกัน ${input.losingStreak} ไม้ (จำกัด 3 = ตัดวงจร)` : 'วินัยต่อไม้ปกติ',
      input.planReady ? 'แผนเข้า/stop/ขนาด กำหนดล่วงหน้าครบ (precommitment)' : 'ยังไม่มีไม้ที่ผ่านครบ — การเข้าตอนนี้คือการตัดสินใจสด',
      micro && micro.volRatio >= 2.6 ? 'volume spike ผิดปกติ — ตรวจ Big Lot ก่อนเชื่อ' : null,
    ].filter(Boolean).join(' · '),
  };

  // ── D4 MODEL ──
  let d4Score = 15 + input.deathsTriggered * 18;
  if (input.calibrationSkew > 10) d4Score += 15;
  if (psiStress > 0.2) d4Score += 25;
  else if (psiStress > 0.1) d4Score += 12;
  if (input.mlHitRate > 0 && input.mlHitRate < 45) d4Score += 15;
  const d4: MdxDim = {
    key: 'MODEL', name: 'โมเดล/AI (Model Risk)', weight: 0.15,
    score: Math.round(clamp(d4Score, 0, 100)),
    band: 'ต่ำ',
    evidence: `เงื่อนไขตายยิงแล้ว ${input.deathsTriggered}/5 · calibration คลาดเคลื่อน ${input.calibrationSkew.toFixed(1)} จุด · PSI ${psiStress.toFixed(3)}${psiStress > 0.2 ? ' HEAVY' : ''} · hit rate ${input.mlHitRate.toFixed(1)}%`,
  };

  // ── D5 CONCENTRATION ──
  let d5Score = step(input.sameThemeActive, [[3, 70], [2, 50], [1, 30]], 15);
  if (input.totalPlannedPct > 80) d5Score += 20;
  else if (input.totalPlannedPct > 60) d5Score += 10;
  if (plan.sizePct > 20) d5Score += 25;
  else if (plan.sizePct > 15) d5Score += 15;
  if (input.cashImpliedPct < 20) d5Score += 15;
  const d5: MdxDim = {
    key: 'CONCENTRATION', name: 'การกระจุกตัว (Concentration)', weight: 0.12,
    score: Math.round(clamp(d5Score, 0, 100)),
    band: 'ต่ำ',
    evidence: `สัญญาณ active ธีมเดียวกัน ${input.sameThemeActive} ตัว (cap 2) · ใช้เงินรวมทุกสัญญาณ ${input.totalPlannedPct.toFixed(0)}% · ไม้นี้ ${plan.sizePct.toFixed(1)}% · cash โดยนัย ${input.cashImpliedPct.toFixed(0)}% (เป้า ≥ 20%)`,
  };

  // ── D6 TAIL ──
  const cvarScore = clamp((plan.cvar * 100 / 8) * 100, 0, 100);
  const ltdScore = step(row.ltd, [[0.5, 85], [0.35, 55]], 25);
  const gapScore = micro ? clamp((micro.gapCount60 / 4) * 100, 0, 100) : 50;
  const ruinScore = step(input.ruinScaledP50, [[8, 90], [2, 55]], 20);
  const d6: MdxDim = {
    key: 'TAIL', name: 'หางหนา (Tail Risk)', weight: 0.15,
    score: Math.round(cvarScore * 0.3 + ltdScore * 0.25 + gapScore * 0.15 + ruinScore * 0.3),
    band: 'ต่ำ',
    evidence: `CVaR97.5 ${(plan.cvar * 100).toFixed(1)}%/วัน · LTD ${row.ltd.toFixed(2)}${row.ltd >= 0.5 ? ' (หางล่างหนา)' : ''} · gap >3σ ใน 60 วัน ${micro?.gapCount60 ?? '—'} ครั้ง · P(ruin −50%) scaled ${input.ruinScaledP50}%`,
  };

  // ── D7 EXECUTION ──
  const slipScore = micro ? step(micro.slippagePct, [[2, 90], [1, 70], [0.5, 50]], 25) : 50;
  const rrScore = stepDown(input.rr, [[1, 85], [1.5, 60], [2, 40]], 20);
  const distScore = row.close > plan.entryHigh ? 55 : 20;
  const d7: MdxDim = {
    key: 'EXECUTION', name: 'การปฏิบัติจริง (Execution)', weight: 0.08,
    score: Math.round(slipScore * 0.4 + rrScore * 0.35 + distScore * 0.25),
    band: 'ต่ำ',
    evidence: `slippage ${micro ? micro.slippagePct.toFixed(2) : '—'}%/ฝั่ง (เข้า+ออก = ${micro ? (micro.slippagePct * 2).toFixed(2) : '—'}%) · R/R 1:${input.rr.toFixed(2)}${input.rr < 1.5 ? ' (ต่ำกว่า 1:1.5)' : ''} · ราคา${row.close > plan.entryHigh ? 'สูงกว่าโซนเข้า = เสี่ยงไล่ราคา' : 'อยู่ไม่ไกลโซนเข้า'}`,
  };

  const dims = [d1, d2, d3, d4, d5, d6, d7].map((x) => ({ ...x, band: bandOf(x.score) }));
  const composite = Math.round(dims.reduce((a, x) => a + x.weight * x.score, 0));
  const band = bandOf(composite);
  const override: RiskMdx['override'] = composite >= 75 ? 'ZERO' : composite >= 50 ? 'HALF' : 'OK';
  const overrideNote =
    override === 'ZERO'
      ? `MDX ${composite} (วิกฤต) — ห้ามเปิดไม้ใหม่จนกว่ามิติเสี่ยงจะลดลง ขนาดไม้ที่คำนวณไว้ (${plan.sizePct.toFixed(1)}%) ถูก override เป็น 0`
      : override === 'HALF'
        ? `MDX ${composite} (สูง) — ขนาดไม้ลดครึ่งจาก ${plan.sizePct.toFixed(1)}% → ${(plan.sizePct / 2).toFixed(1)}% และต้องผ่านเงื่อนไข stop ทุกข้อก่อนเข้า`
        : `MDX ${composite} — ความเสี่ยงรวมอยู่ในกรอบ ใช้ขนาดไม้ตามแผน ${plan.sizePct.toFixed(1)}% พร้อมเคารพ stop เดิม`;

  const top = [...dims].sort((a, b) => b.score - a.score)[0];
  const topRisk = top.score >= 50
    ? { key: top.key, name: top.name, score: top.score, evidence: top.evidence }
    : null;

  return { composite, band, override, overrideNote, dims, topRisk };
}

// ───────────────────────── Antifragility Index ─────────────────────────

export function buildAntifragility(input: MdxInput): AntifragilityIndex {
  const { plan, row, micro, sameThemeActive, cashImpliedPct } = input;

  // 1. Drawdown throttle — พิสูจน์ด้วย MC: scaled ลด P(ruin −50%) กว่า fixed แค่ไหน
  let throttle: number;
  let throttleEv: string;
  if (input.ruinFixedP50 <= 0.05 && input.ruinScaledP50 <= 0.05) {
    throttle = 75;
    throttleEv = 'ทั้งสองโหมด P(ruin −50%) ≈ 0% — ระบบ robust อยู่แล้ว การหดขนาดตอน DD ยิ่งเสริมเกราะ';
  } else {
    const ratio = input.ruinFixedP50 > 0 ? 1 - input.ruinScaledP50 / input.ruinFixedP50 : 0.5;
    throttle = Math.round(clamp(ratio * 100, 0, 100));
    throttleEv = `sizing หดตาม drawdown ลด P(ruin −50%) จาก ${input.ruinFixedP50}% → ${input.ruinScaledP50}% — ตลาดเป็นคนสั่งลดขนาด ไม่ใช่อารมณ์`;
  }

  // 2. Cash optionality
  const cash = Math.round(clamp((cashImpliedPct / 40) * 100, 0, 100));
  const cashEv = `เงินสดโดยนัย ${cashImpliedPct.toFixed(0)}% (คะแนนเต็มที่ ≥ 40%) — cash ไม่ใช่ขี้เกียจ มันคือสิทธิ์ซื้อของถูกตอนวิกฤต`;

  // 3. Automated brakes — เกราะชั้น 3–5 (POST-ENTRY / PORTFOLIO / SYSTEMIC)
  const l3ok = plan.stopHard > 0 && plan.stopStruct > 0 && plan.killSwitch.length > 0;
  const l4ok = plan.sizePct <= 15 && sameThemeActive <= 2;
  const l5ok = cashImpliedPct >= 20 && input.losingStreak < 3;
  const brakes = Math.round(((l3ok ? 1 : 0) + (l4ok ? 1 : sameThemeActive <= 3 ? 0.5 : 0) + (l5ok ? 1 : 0)) / 3 * 100);
  const brakesEv = `stop แข็ง/โครงสร้าง + kill switch ${l3ok ? 'ครบ' : 'ไม่ครบ'} · เพดานตัว/ธีม ${l4ok ? 'ผ่าน' : sameThemeActive <= 3 ? 'บางส่วน' : 'ติด'} · cash+ตัดวงจร ${l5ok ? 'ผ่าน' : 'ติด'} — เบรกต้องทำงานเองแม้คนหลับ`;

  // 4. Crisis survival + 5. Reflex discipline — จาก MC วิกฤต 6 สถานการณ์
  let survival = 50;
  let survivalEv = 'ยังประเมินไม่ได้ (ไม่มีข้อมูล microstructure)';
  let reflexDisc = 50;
  let reflexEv = 'ยังประเมินไม่ได้';
  if (micro) {
    const crisis = crisisStressTest(
      input.entryMid,
      plan.stopHard,
      input.lossAtStopPct,
      plan.sizePct,
      micro.slippagePct,
      micro.exitComplexity,
      row.vol21,
    );
    survival = crisis.survivalScore;
    survivalEv = `รอด ${crisis.survivalScore}/100 จาก 6 สถานการณ์วิกฤต (gap ข้ามคืน/สภาพคล่องแห้ง/ตลาดถล่ม MC) — ${crisis.verdict.split('—')[0].trim()}`;
    const reflexSc = crisis.scenarios.find((s) => s.key === 'REFLEX');
    if (reflexSc) {
      reflexDisc = reflexSc.survived ? 100 : 40;
      reflexEv = reflexSc.survived
        ? 'วงจรพังทลาย −23.5% ใน 5 วัน: วินัยตัดตาม stop ทำให้ความเสียหายอยู่ในขนาดที่กลับมาได้'
        : 'วงจรพังทลายทำให้ไม้นี้เจ็บเกิน 2% ของพอร์ต — ระบบยังพึ่ง "ความเงียบของตลาด" อยู่';
    }
  }

  const components = [
    { key: 'THROTTLE', name: 'Drawdown Throttle (หดขนาดเมื่อเจ็บ)', score: throttle, evidence: throttleEv },
    { key: 'CASH', name: 'Cash Optionality (กระสุนสำรอง)', score: cash, evidence: cashEv },
    { key: 'BRAKES', name: 'Automated Brakes (เบรกอัตโนมัติ 3 ชั้น)', score: brakes, evidence: brakesEv },
    { key: 'SURVIVAL', name: 'Crisis Survival (รอด MC วิกฤต)', score: survival, evidence: survivalEv },
    { key: 'REFLEX', name: 'Reflex Discipline (กันวงจรพัง)', score: reflexDisc, evidence: reflexEv },
  ];
  const index = Math.round(components.reduce((a, c) => a + c.score, 0) / components.length);
  const verdict =
    index >= 75
      ? 'ANTIFRAGILE — โครงสร้างนี้ยิ่งเจอความโกลาหลยิ่งได้เปรียบ: หดขนาดก่อนเจ็บหนัก มีกระสุนซื้อของถูก และเบรกทำงานเอง'
      : index >= 55
        ? 'ROBUST — อยู่รอดได้ในความโกลาหล แต่ยังไม่ "ได้กำไร" จากมัน — เพิ่ม cash และปล่อยให้ throttle ทำงานเต็มที่'
        : index >= 35
          ? 'FRAGILE — ระบบนี้พึ่งความเงียบของตลาด: พอวิกฤตมาจริง ความเสียหายจะเกินแผน — ลดขนาดไม้ทั้งพอร์ต'
          : 'บอบช้ำ — ช็อกเล็กก็ล้ม: หยุดเปิดไม้ใหม่ ทบทวนเกราะ 5 ชั้น และเพิ่มเงินสดก่อน';

  return { index, verdict, components };
}
