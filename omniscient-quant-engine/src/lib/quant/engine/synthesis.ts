/**
 * synthesis.ts — หลอมรวม (Convergent-Evidence Synthesis)
 *
 * แนวคิดเดียวกับ multi-omics integration: ตัดสิน "หุ้นตัวเดียว" ด้วยหลักฐานอิสระหลายสาย
 * แล้วหลอมให้เป็นบทวิเคราะห์เดียวที่อ่านรู้เรื่อง พร้อมคะแนนบรรจบ (convergence score)
 *
 * สายหลักฐาน (strands) — แต่ละสาย "โหวต" LONG / SHORT / NEUTRAL พร้อมน้ำหนัก:
 *   1. G1_REGIME      สภาพตลาดรวม (F_stress, F_momentum slope)      — L1/L6
 *   2. G2_DEPENDENCE  copula Θ z-score + LTD (ความอิสระจากตลาด)      — L2
 *   3. G3_TECHNICAL   Wyckoff-lite phase + RSI + OBV + volume        — L1
 *   4. G4_RISK        CVaR 97.5% vs งบความเสี่ยง (sizing feasibility) — L5
 *   5. G5_EXECUTION   ราคาเทียบ entry zone / RSI จับจังหวะ            — L6
 *   6. ML_PROB        โมเดล walk-forward ให้ P(up)                     — L4
 *   7. FLOW           เงินไหลสุทธิ 5 วัน                               — L1
 *   8. VALUATION      P/E, P/B เทียบ median หมวดอุตสาหกรรม            — L1
 *   9. FACTOR         exposure ต่อ F1–F4 × ทิศ trajectory ของ factor   — L3
 *  10. FUNDAMENTAL    PIT: revG, net profit, D/E (announce เท่านั้น)   — L0
 *  11. HUB            ตำแหน่ง network (hub / edge weight) ใน bipartite — L3
 *  12. REFLEXIVITY    เฟสวงจรสะท้อนกลับ (Soros feedback loop)         — L7
 *  13. MICROSTRUCTURE CLV / spread / mirage / exit complexity          — L7
 *
 * คะแนนบรรจบ = 100 × Σ(w·vote) / Σw  → −100 … +100
 * ความเชื่อใจ (trusted) ต่อสายมาจาก gate attribution ของ walk-forward backtest:
 *   gate ที่ SPEAKS_TRUTH ได้น้ำหนักเต็ม, NOISE ถูกหั่นครึ่ง
 */

import type { MarketState } from './types';
import { evaluateGates, currentRegimeSummary, type GateEval } from './gates';
import { riskAssessment } from './risk';
import { linregSlope, median, psi } from '../stats';
import type { FactorModelResult } from './factors';
import type { BacktestResult } from './backtest';
import { reflexivityPhase } from './meta-risk';
import { microstructureMetrics } from './micro';
import { RULES } from './rules';

export type Vote = 'LONG' | 'SHORT' | 'NEUTRAL';

export interface EvidenceStrand {
  key: string;
  label: string;
  layer: string;
  gate?: string; // G1..G5 ถ้าผูกกับ gate โดยตรง
  vote: Vote;
  weight: number; // 0–1 (ก่อนหั่นด้วย attribution)
  effWeight: number; // หลังหั่นด้วย attribution (weight × multiplier)
  trusted: boolean;
  value: string; // ค่าที่อ่านได้ เช่น "Θz −1.82 · LTD 0.21"
  detail: string; // เหตุผลภาษาไทย
}

export interface SynthesisVerdict {
  code: 'STRONG_LONG' | 'LEAN_LONG' | 'MIXED' | 'LEAN_SHORT' | 'STRONG_SHORT';
  label: string;
  action: string;
}

export interface SynthesisDossier {
  symbol: string;
  name: string;
  sector: string;
  theme: string;
  date: string;
  price: number;
  regime: string;
  regimeStress: number;
  regimeMomentumSlope: number;
  drift: string;
  strands: EvidenceStrand[];
  score: number; // −100…+100
  agreement: number; // 0–1 สัดส่วนน้ำหนักของสายที่เห็นตามทิศสุทธิ
  nLong: number;
  nShort: number;
  nNeutral: number;
  verdict: SynthesisVerdict;
  strengthNotes: string[]; // หลักฐานกระทิงแรงสุด 3 สาย
  weaknessNotes: string[]; // หลักฐานหมีแรงสุด 3 สาย
  killSwitches: string[];
  roadmap: string[];
  attribution: Array<{ gate: string; edge: number; verdict: string }>;
  plan: GateEval['plan'] | null;
}

// ───────────────────────── helpers ─────────────────────────

function fmt(x: number, d = 2): string {
  const s = x.toFixed(d);
  return x > 0 ? `+${s}` : s;
}

function regimeToVote(regime: string, momSlope: number): { vote: Vote; detail: string } {
  if (regime === 'CRISIS') {
    return { vote: 'SHORT', detail: `ตลาดโดยรวมอยู่โหมดกลัว (F_stress สูง) — ยังไม่มุ่งหวัง beta จากตลาด${momSlope < 0 ? ' และโมเมนตัมยังไหลลง' : ''}` };
  }
  if (regime === 'RECOVERY') {
    return { vote: 'LONG', detail: `ตลาดกำลังฟื้นตัว โมเมนตัมไหลขึ้น (${fmt(momSlope, 3)}/วัน) — หุ้นที่ผ่านเกณฑ์เทคนิคมักได้เปรียบ` };
  }
  if (regime === 'BULL') {
    return { vote: 'LONG', detail: 'ตลาดขาขึ้นเต็มตัว — tailwind ด้านเดียว แต่ต้องระวังหุ้น RSI ร้อนแรงเกิน' };
  }
  return { vote: 'NEUTRAL', detail: 'ตลาด sideways — อัลฟาต้องมาจากตัวหุ้นเอง (idiosyncratic) ไม่ใช่ beta ของตลาด' };
}

// ───────────────────────── main ─────────────────────────

export function buildSynthesisDossier(
  state: MarketState,
  symbol: string,
  factors: FactorModelResult | undefined,
  backtest: BacktestResult | undefined,
): SynthesisDossier | null {
  const si = state.stocks.findIndex((s) => s.symbol === symbol);
  if (si < 0) return null;
  const s = state.stocks[si];
  const N = state.dates.length;
  const t = N - 1;
  const row = s.rows[t];
  const reg = currentRegimeSummary(state);

  // gate attribution → trusted map
  const attr = (backtest?.attribution ?? []).map((a) => ({ gate: a.gate, edge: +a.edge.toFixed(3), verdict: a.verdict }));
  const trustMap: Record<string, boolean> = {};
  for (const a of attr) trustMap[a.gate] = a.verdict === 'SPEAKS_TRUTH';
  const mult = (gate?: string): { eff: number; trusted: boolean } => {
    if (!gate) return { eff: 1, trusted: false };
    const trusted = trustMap[gate] ?? false;
    return { eff: trusted ? 1 : RULES.synthesis.untrustedMultiplier, trusted };
  };

  const ev = evaluateGates(state, symbol, t, { riskBudgetPct: RULES.risk.budgetPct });
  const risk = riskAssessment(s.rows.slice(-100), RULES.risk.budgetPct, RULES.risk.nu, RULES.risk.synthesisPaths, 909090);
  const sectorCloses = state.stocks.filter((x) => x.sector === s.sector);
  const sectorPe = median(sectorCloses.map((x) => x.rows[t].pe).filter(Number.isFinite));
  const sectorPb = median(sectorCloses.map((x) => x.rows[t].pb).filter(Number.isFinite));

  const strands: EvidenceStrand[] = [];

  // 1. G1 Regime
  {
    const momSlope = linregSlope(
      state.fMomentum.slice(Math.max(0, t - 41), t + 1).map((_, i) => i),
      state.fMomentum.slice(Math.max(0, t - 41), t + 1),
    );
    const { vote, detail } = regimeToVote(reg.regime, momSlope);
    const w = RULES.synthesis.weights.G1_REGIME, m = mult('G1');
    strands.push({
      key: 'G1_REGIME', label: 'สภาพตลาด (Regime)', layer: 'L1·L6', gate: 'G1',
      vote, weight: w, effWeight: +(w * m.eff).toFixed(2), trusted: m.trusted,
      value: `${reg.regime} · stress ${fmt(reg.stress, 2)}`,
      detail,
    });
  }

  // 2. G2 Dependence
  {
    let vote: Vote = 'NEUTRAL';
    let detail = 'การพึ่งพาตลาดอยู่ในเกณฑ์ปกติ — ไม่ให้ทั้งอัลฟาบวกและความเสี่ยงพิเศษ';
    if (row.decoupled) {
      vote = 'LONG';
      detail = `หลุดวงจรตลาด (Θz ${fmt(row.thetaZ)}) — เดินตามเรื่องของตัวเอง เหมาะยกเป็นเกมอัลฟา แต่ kill switch ต้องไว`;
    } else if (row.ltd >= 0.5) {
      vote = 'SHORT';
      detail = `หางล่างหนา (LTD ${fmt(row.ltd)}) — เมื่อตลาดลบหนักหุ้นนี้จะลบตามแรง เพิ่มความเสี่ยงช่วงวิกฤต`;
    } else if (row.ltd < 0.35) {
      vote = 'LONG';
      detail = `หางล่างบาง (LTD ${fmt(row.ltd)}) — กันชนตอนตลาดสั่นดีกว่าค่ากลาง`;
    }
    const w = RULES.synthesis.weights.G2_DEPENDENCE, m = mult('G2');
    strands.push({
      key: 'G2_DEPENDENCE', label: 'การพึ่งพาตลาด (Copula)', layer: 'L2', gate: 'G2',
      vote, weight: w, effWeight: +(w * m.eff).toFixed(2), trusted: m.trusted,
      value: `Θz ${fmt(row.thetaZ)} · LTD ${fmt(row.ltd)}${row.decoupled ? ' · DECOUPLED' : ''}`,
      detail,
    });
  }

  // 3. G3 Technical (Wyckoff-lite)
  {
    let vote: Vote = 'NEUTRAL';
    let detail = `โครงสร้างราคายังไม่เข้าเฟสเดิน — รอหลักฐานยืนยันเพิ่ม`;
    if (ev.phase >= 4) {
      vote = 'LONG';
      detail = `${ev.phaseLabel} + OBV ${fmt(row.obvSlope)} · vol ratio ${fmt(row.volRatio)} — โครงสร้างขาขึ้นมีเงินยืนยัน`;
    } else if (ev.phase === 3) {
      vote = 'NEUTRAL';
      detail = `${ev.phaseLabel} — จังหวะรอย่อ ให้ตั้งรับใน entry zone ไม่ไล่ราคา`;
    } else if (ev.phase === 2) {
      vote = 'LONG';
      detail = `${ev.phaseLabel} — เริ่มต้นขาขึ้น ยังมีห้องให้เดิน`;
    } else {
      vote = 'SHORT';
      detail = `${ev.phaseLabel} — โครงสร้างยังลบ ไม่ต้านเทรนด์`;
    }
    if (row.rsi14 > 78 && vote === 'LONG') detail += ' (แต่ RSI ร้อน — บริหารด้วย G5)';
    const w = RULES.synthesis.weights.G3_TECHNICAL, m = mult('G3');
    strands.push({
      key: 'G3_TECHNICAL', label: 'เทคนิค (Wyckoff-lite)', layer: 'L1', gate: 'G3',
      vote, weight: w, effWeight: +(w * m.eff).toFixed(2), trusted: m.trusted,
      value: `${ev.phaseLabel.split('·')[1]?.trim() ?? ev.phaseLabel} · RSI ${row.rsi14.toFixed(0)}`,
      detail,
    });
  }

  // 4. G4 Risk
  {
    let vote: Vote = 'NEUTRAL';
    let detail = 'ขนาดทุนที่ความเสี่ยงอนุญาตอยู่ในระดับใช้งานได้';
    if (risk.maxSizePct >= 15) {
      vote = 'LONG';
      detail = `CVaR ${(risk.cvar975 * 100).toFixed(1)}% ทำให้ขนาดทุน ${risk.maxSizePct.toFixed(0)}% ของพอร์ต — ความเสี่ยงต่อไม้ยอมรับได้`;
    } else if (risk.maxSizePct < 8) {
      vote = 'SHORT';
      detail = `CVaR ${(risk.cvar975 * 100).toFixed(1)}% บีบขนาดทุนเหลือ ${risk.maxSizePct.toFixed(0)}% — เล็กเกินกว่าจะคุ้มค่าเวลา`;
    } else {
      detail = `CVaR ${(risk.cvar975 * 100).toFixed(1)}% → ขนาดทุนสูงสุด ${risk.maxSizePct.toFixed(0)}% — ใช้ได้แต่ไม่ฟุ่มเฟือย`;
    }
    const w = RULES.synthesis.weights.G4_RISK, m = mult('G4');
    strands.push({
      key: 'G4_RISK', label: 'ความเสี่ยง (CVaR Sizing)', layer: 'L5', gate: 'G4',
      vote, weight: w, effWeight: +(w * m.eff).toFixed(2), trusted: m.trusted,
      value: `CVaR ${(risk.cvar975 * 100).toFixed(1)}% · size ${risk.maxSizePct.toFixed(0)}%`,
      detail,
    });
  }

  // 5. G5 Execution
  {
    const inZone = row.close >= ev.plan.entryLow && row.close <= ev.plan.entryHigh;
    const nearZone = row.close <= ev.plan.entryHigh * 1.05;
    let vote: Vote = 'NEUTRAL';
    let detail = `ราคา ${row.close.toFixed(2)} อยู่นอก entry zone ${ev.plan.entryLow.toFixed(2)}–${ev.plan.entryHigh.toFixed(2)} — ตั้ง alert รอเข้าใกล้`;
    if (inZone) {
      vote = 'LONG';
      detail = `ราคาอยู่ใน entry zone พอดี — ใช้ limit ${ev.plan.entryLow.toFixed(2)}–${ev.plan.entryHigh.toFixed(2)} ได้เลย`;
    } else if (nearZone && row.rsi14 <= 80) {
      vote = 'NEUTRAL';
      detail = 'ราคาใกล้ entry zone — เตรียมแผนไว้ ยิงเมื่อแตะโซน';
    } else if (row.rsi14 > 80) {
      vote = 'SHORT';
      detail = `RSI ${row.rsi14.toFixed(0)} ร้อนเกิน — ไล่ราคา = รับความเสี่ยง execution ฟรี ๆ`;
    }
    const w = RULES.synthesis.weights.G5_EXECUTION, m = mult('G5');
    strands.push({
      key: 'G5_EXECUTION', label: 'จังหวะเข้า (Execution)', layer: 'L6', gate: 'G5',
      vote, weight: w, effWeight: +(w * m.eff).toFixed(2), trusted: m.trusted,
      value: `close ${row.close.toFixed(2)} · zone ${ev.plan.entryLow.toFixed(2)}–${ev.plan.entryHigh.toFixed(2)}`,
      detail,
    });
  }

  // 6. ML Prob (walk-forward model)
  {
    const p = ev.probUp;
    let vote: Vote = 'NEUTRAL';
    let detail = 'โมเดลยังไม่ชี้ทิศชัด (≈ 50:50) — ให้น้ำหนักหลักฐานสายอื่นนำ';
    if (p >= 0.58) {
      vote = 'LONG';
      detail = `โมเดล walk-forward ให้ P(ขึ้น 21d) = ${(p * 100).toFixed(0)}% — เหนือเกณฑ์ตั้งต้นชัดเจน`;
    } else if (p <= 0.45) {
      vote = 'SHORT';
      detail = `โมเดลให้ P(ขึ้น) = ${(p * 100).toFixed(0)}% — ต่ำกว่ากลาง ไม่สนับสนุนการซื้อ`;
    }
    const w = RULES.synthesis.weights.ML_PROB;
    strands.push({
      key: 'ML_PROB', label: 'โมเดล ML (P·up 21d)', layer: 'L4',
      vote, weight: w, effWeight: w, trusted: true,
      value: `P(up) ${(p * 100).toFixed(0)}%`,
      detail,
    });
  }

  // 7. Flow
  {
    let vote: Vote = 'NEUTRAL';
    let detail = 'เงินไหลสุทธิเป็นกลาง — สถาบันยังไม่เลือกฝั่ง';
    if (row.flow5 > 2) {
      vote = 'LONG';
      detail = `เงินไหลเข้าสุทธิ ${fmt(row.flow5, 1)} ล้านบาทใน 5 วัน — มีมือใหญ่สะสม`;
    } else if (row.flow5 < -2) {
      vote = 'SHORT';
      detail = `เงินไหลออกสุทธิ ${fmt(row.flow5, 1)} ล้านบาท — ระวังสวนกระแสเงินสถาบัน`;
    }
    strands.push({
      key: 'FLOW', label: 'เงินไหลสถาบัน 5d', layer: 'L1',
      vote, weight: RULES.synthesis.weights.FLOW, effWeight: RULES.synthesis.weights.FLOW, trusted: true,
      value: `${fmt(row.flow5, 1)} MB`,
      detail,
    });
  }

  // 8. Valuation vs sector
  {
    let vote: Vote = 'NEUTRAL';
    let detail = `มูลค่า (P/E ${row.pe.toFixed(1)}) ใกล้ค่ากลางหมวด ${s.sector} — ไม่เป็นทั้งใบเบิกทางและข้อหา`;
    const peRatio = sectorPe > 0 ? row.pe / sectorPe : 1;
    if (row.pe > 0 && peRatio < 0.8 && row.roe > 8) {
      vote = 'LONG';
      detail = `P/E ${row.pe.toFixed(1)} ถูกกว่า median หมวด (${sectorPe.toFixed(1)}) ทั้งที่ ROE ${row.roe.toFixed(1)}% — value ที่มีคุณภาพรองรับ`;
    } else if (row.pe > 0 && peRatio > 1.5) {
      vote = 'SHORT';
      detail = `P/E ${row.pe.toFixed(1)} แพงกว่า median หมวด (${sectorPe.toFixed(1)}) ~${((peRatio - 1) * 100).toFixed(0)}% — ต้องการเรื่องเล่ามาซัพพอร์ต`;
    } else if (row.roe > 12) {
      vote = 'NEUTRAL';
      detail = `ROE ${row.roe.toFixed(1)}% โดดเด่น แม้ราคาจะไม่ถูก — คุณภาพเป็นข้อต่อยอด ไม่ใช่เหตุซื้อเดี่ยว ๆ`;
    }
    strands.push({
      key: 'VALUATION', label: 'มูลค่าเทียบหมวด', layer: 'L1',
      vote, weight: RULES.synthesis.weights.VALUATION, effWeight: RULES.synthesis.weights.VALUATION, trusted: true,
      value: `P/E ${row.pe.toFixed(1)} vs ${sectorPe.toFixed(1)} · P/B ${row.pb.toFixed(2)} vs ${sectorPb.toFixed(2)}`,
      detail,
    });
  }

  // 9. Factor alignment (L3 multi-view)
  {
    let vote: Vote = 'NEUTRAL';
    let value = 'ไม่มี factor model';
    let detail = 'ยังไม่มีโครงสร้างปัจจัยให้อ้างอิง';
    if (factors) {
      // net alignment = Σ sign(exposure)×sign(trajectory 21d slope)·|exposure|
      let net = 0;
      const parts: string[] = [];
      for (let f = 0; f < factors.exposures.length; f++) {
        const z = factors.exposures[f][symbol] ?? 0;
        const traj = factors.trajectories;
        const win = traj.slice(-21).map((r) => r[`F${f + 1}` as 'F1']);
        const slope = linregSlope(win.map((_, i) => i), win);
        net += Math.sign(z) * Math.sign(slope) * Math.min(Math.abs(z), 2);
        if (Math.abs(z) > 0.8) parts.push(`F${f + 1} ${z > 0 ? 'โหลด+' : 'โหลด−'}${Math.abs(z).toFixed(1)} (factor${slope > 0 ? 'กำลังขึ้น' : 'กำลังลง'})`);
      }
      value = parts.length ? parts.join(' · ') : 'exposure กลาง ๆ ทุก factor';
      if (net > 0.7) {
        vote = 'LONG';
        detail = 'ตัวหุ้นยืนอยู่บน factor ที่กำลังเดินทางขึ้น — โครงสร้างปัจจัยหนุน';
      } else if (net < -0.7) {
        vote = 'SHORT';
        detail = 'แรงปัจจัยที่หุ้นโหลดไว้กำลังเดินสวนทิศ — ไม่ใช่จุดพึ่ง windfall จาก L3';
      } else {
        detail = 'การจัดวางตัวบน factor map ยังเป็นกลาง — ทิศราคาจะมาจากเรื่องของตัวเอง';
      }
    }
    strands.push({
      key: 'FACTOR', label: 'การจัดวางบน Factor (L3)', layer: 'L3',
      vote, weight: RULES.synthesis.weights.FACTOR, effWeight: RULES.synthesis.weights.FACTOR, trusted: true,
      value,
      detail,
    });
  }

  // 10. Fundamental PIT (revG เก็บเป็น % ตาม panel)
  {
    let vote: Vote = 'NEUTRAL';
    let detail = `งบล่าสุด: revG ${fmt(row.revG, 1)}% · D/E ${row.de.toFixed(2)} — ยังไม่ชี้ทิศชัด`;
    if (row.revG > 8 && row.de < 1.2) {
      vote = 'LONG';
      detail = `รายได้โต ${fmt(row.revG, 1)}% พร้อม D/E ${row.de.toFixed(2)} — พื้นฐานหนุนเรื่องเล่า (ใช้เฉพาะ announce ที่ผ่านมาแล้ว = PIT)`;
    } else if (row.revG < -5 || row.de > 2) {
      vote = 'SHORT';
      detail = `revG ${fmt(row.revG, 1)}% / D/E ${row.de.toFixed(2)} — พื้นฐานเป็นภาระของเรื่องราคา`;
    }
    strands.push({
      key: 'FUNDAMENTAL', label: 'พื้นฐาน (PIT)', layer: 'L0',
      vote, weight: RULES.synthesis.weights.FUNDAMENTAL, effWeight: RULES.synthesis.weights.FUNDAMENTAL, trusted: true,
      value: `revG ${fmt(row.revG, 1)}% · ROE ${row.roe.toFixed(1)}% · D/E ${row.de.toFixed(2)}`,
      detail,
    });
  }

  // 11. Network hub (L3 bipartite)
  {
    const hub = factors?.bipartite.hubs.find((h) => h.symbol === symbol);
    const edgeCount = factors?.bipartite.edges.filter((e) => e.symbol === symbol).length ?? 0;
    let vote: Vote = 'NEUTRAL';
    let detail = 'หุ้นเป็นสมาชิกธรรมดาของเครือข่าย factor — ไม่มีพลังกระจายพิเศษ';
    if (hub) {
      vote = 'LONG';
      detail = `เป็น HUB ของเครือข่าย (degree ${hub.degree}) — เมื่อเรื่องของมันเดิน เพื่อนบ้าน factor เดียวกันมักถูกลากไปด้วย`;
    } else if (edgeCount === 0) {
      detail = 'ไม่โหลดหนักกับ factor ใด — หุ้นโดด (idiosyncratic) ทั้งเป็นทั้งตายอยู่ที่เรื่องของตัวเอง';
    }
    strands.push({
      key: 'HUB', label: 'ตำแหน่งในเครือข่าย', layer: 'L3',
      vote, weight: RULES.synthesis.weights.HUB, effWeight: RULES.synthesis.weights.HUB, trusted: true,
      value: hub ? `HUB ×${hub.degree}` : edgeCount ? `edge ×${edgeCount}` : 'isolated',
      detail,
    });
  }

  // 12. Reflexivity phase (L7 — วงจรสะท้อนกลับแบบ Soros)
  {
    const reflex = reflexivityPhase(row.distHigh, row.ret21, row.flow5, row.rsi14);
    let vote: Vote = 'NEUTRAL';
    if (reflex.phase === 'IGNITION' || reflex.phase === 'RUNNING') vote = 'LONG';
    else if (reflex.phase === 'EXHAUSTION' || reflex.phase === 'COLLAPSE') vote = 'SHORT';
    const w = RULES.synthesis.weights.REFLEXIVITY;
    strands.push({
      key: 'REFLEXIVITY', label: 'วงจรสะท้อนกลับ (Reflexivity)', layer: 'L7',
      vote, weight: w, effWeight: w, trusted: true,
      value: reflex.label,
      detail: reflex.detail,
    });
  }

  // 13. Microstructure (L7 — ความจริงของหุ้นเล็ก)
  {
    const micro = microstructureMetrics(state, symbol);
    let vote: Vote = 'NEUTRAL';
    let detail = 'microstructure ยังไม่ชี้ทิศ — สภาพคล่องและการปิดราคาอยู่ในเกณฑ์ปกติ';
    let value = 'n/a';
    if (micro) {
      value = `CLV20 ${micro.clv20.toFixed(2)} · spread ${micro.spreadBps.toFixed(0)}bps · exit ${micro.exitComplexity}/100`;
      if (micro.mirage.flagged || micro.exitComplexity > 65 || micro.clv20 < -0.2) {
        vote = 'SHORT';
        detail = micro.mirage.flagged
          ? micro.mirage.reason
          : `exit complexity ${micro.exitComplexity}/100 กับ CLV20 ${micro.clv20.toFixed(2)} — โครงสร้างตลาดตัวนี้ออกยากกว่าเข้า (exit > entry) ใครถือไว้คือคนเสียเปรียบ`;
      } else if (micro.clv20 > 0.25 && !micro.mirage.flagged) {
        vote = 'LONG';
        detail = `ปิดราคาใกล้ high ต่อเนื่อง (CLV20 ${micro.clv20.toFixed(2)}) พร้อม spread ${micro.spreadBps.toFixed(0)} bps และ exit complexity ต่ำ — มีคนซื้อจริงจังและยังออกได้ไม่ลำบาก`;
      } else {
        detail = `CLV20 ${micro.clv20.toFixed(2)} · spread ${micro.spreadBps.toFixed(0)} bps · ${micro.exitVerdict}`;
      }
    }
    strands.push({
      key: 'MICROSTRUCTURE', label: 'Microstructure (CLV/สเปรด)', layer: 'L7',
      vote, weight: RULES.synthesis.weights.MICROSTRUCTURE, effWeight: RULES.synthesis.weights.MICROSTRUCTURE, trusted: true,
      value,
      detail,
    });
  }

  // ── score ──
  const sumW = strands.reduce((a, x) => a + x.effWeight, 0) || 1;
  const net = strands.reduce((a, x) => a + x.effWeight * (x.vote === 'LONG' ? 1 : x.vote === 'SHORT' ? -1 : 0), 0);
  const score = Math.round((100 * net) / sumW);
  const dir = score > 0 ? 'LONG' : score < 0 ? 'SHORT' : null;
  const aligned = strands
    .filter((x) => x.vote !== 'NEUTRAL')
    .reduce((a, x) => a + x.effWeight, 0);
  const agreeW = strands
    .filter((x) => x.vote !== 'NEUTRAL' && (!dir || x.vote === dir))
    .reduce((a, x) => a + x.effWeight, 0);
  const agreement = aligned > 0 ? +(agreeW / aligned).toFixed(2) : 0;

  let verdict: SynthesisVerdict;
  if (score >= RULES.synthesis.bands.strong && agreement >= RULES.synthesis.bands.agreeMin) {
    verdict = { code: 'STRONG_LONG', label: 'หลักฐานบรรจบขาขึ้น', action: 'หลอมรวมแล้วชี้ทิศเดียวกันแน่น — ลงมือตามแผน พร้อมเคารพ stop ทุกข้อ' };
  } else if (score >= RULES.synthesis.bands.lean) {
    verdict = { code: 'LEAN_LONG', label: 'เอียงขาขึ้น', action: 'ทิศดีแต่ยังมีเสียงแทรก — เข้าได้ตาม entry zone ขนาดทุนตาม G4' };
  } else if (score > -RULES.synthesis.bands.lean) {
    verdict = { code: 'MIXED', label: 'หลักฐานยังไม่บรรจบ', action: 'สายหลักฐานขัดกัน — ความเสี่ยงอยู่ที่ "เดา" จึงไม่ควรเสี่ยง ให้จดเฝ้าดู' };
  } else if (score > -RULES.synthesis.bands.strong) {
    verdict = { code: 'LEAN_SHORT', label: 'เอียงขาลง', action: 'แรงต้านมาจากหลายสาย — งดซื้อ ถือไว้ตรวจสอบอีกครั้งเมื่อหลักฐานเปลี่ยน' };
  } else {
    verdict = { code: 'STRONG_SHORT', label: 'หลักฐานบรรจบขาลง', action: 'ทุกสายชี้ไปทางเดียวกันทางลบ — ห้ามซื้อ พิจารณาลดถ้าถืออยู่' };
  }

  const bulls = strands
    .filter((x) => x.vote === 'LONG')
    .sort((a, b) => b.effWeight - a.effWeight)
    .slice(0, 3)
    .map((x) => `${x.label}: ${x.detail}`);
  const bears = strands
    .filter((x) => x.vote === 'SHORT')
    .sort((a, b) => b.effWeight - a.effWeight)
    .slice(0, 3)
    .map((x) => `${x.label}: ${x.detail}`);

  const killSwitches: string[] = [];
  if (ev.plan.killSwitch) killSwitches.push(ev.plan.killSwitch);
  if (row.decoupled) killSwitches.push(`Θ re-couple (Θz > −0.5) ขณะ F_stress ขึ้น — ถอยทันที (ปัจจุบัน Θz ${fmt(row.thetaZ)})`);
  killSwitches.push(`ราคาปิดต่ำกว่า hard stop ${ev.plan.stopHard.toFixed(2)} — ตัดไม่ต่อรอง`);
  killSwitches.push('PSI drift เข้าโซน HEAVY — หยุดเทรดด้วยโมเดลเดิมจนกว่าจะ refit');

  const roadmap: string[] = ev.plan.failingGates.length
    ? [
        `รอปลดล็อก gate ที่ยังติด: ${ev.plan.failingGates.join(', ')}`,
        `ตั้ง alert ราคา ${ev.plan.entryLow.toFixed(2)}–${ev.plan.entryHigh.toFixed(2)} (trigger ${ev.plan.trigger.toFixed(2)})`,
        `ถ้าเข้าได้: stop โครงสร้าง ${ev.plan.stopStruct.toFixed(2)} / stop แข็ง ${ev.plan.stopHard.toFixed(2)} · ทุนสูงสุด ${ev.plan.sizePct.toFixed(0)}%`,
      ]
    : [
        `วาง limit ${ev.plan.entryLow.toFixed(2)}–${ev.plan.entryHigh.toFixed(2)} ไม่ไล่ราคา`,
        `stop โครงสร้าง ${ev.plan.stopStruct.toFixed(2)} · stop แข็ง ${ev.plan.stopHard.toFixed(2)}`,
        `ทุนไม้นี้ไม่เกิน ${ev.plan.sizePct.toFixed(0)}% ของพอร์ต (CVaR ${(ev.plan.cvar * 100).toFixed(1)}%)`,
        'จดเข้า Journal ทุกไม้ — ข้อมูลจริงเท่านั้นที่ตัดสิน gate attribution เดือนหน้า',
      ];

  return {
    symbol,
    name: s.name,
    sector: s.sector,
    theme: s.theme,
    date: state.dates[t].toISOString().slice(0, 10),
    price: +row.close.toFixed(2),
    regime: reg.regime,
    regimeStress: +reg.stress.toFixed(2),
    regimeMomentumSlope: +reg.momentumSlope20.toFixed(3),
    drift: +psi(state.fStress.slice(N - 240, N - 60), state.fStress.slice(N - 60)).toFixed(3) > 0.2
      ? 'HEAVY'
      : +psi(state.fStress.slice(N - 240, N - 60), state.fStress.slice(N - 60)).toFixed(3) > 0.1
        ? 'MODERATE'
        : 'STABLE',
    strands,
    score,
    agreement,
    nLong: strands.filter((x) => x.vote === 'LONG').length,
    nShort: strands.filter((x) => x.vote === 'SHORT').length,
    nNeutral: strands.filter((x) => x.vote === 'NEUTRAL').length,
    verdict,
    strengthNotes: bulls,
    weaknessNotes: bears,
    killSwitches,
    roadmap,
    attribution: attr,
    plan: ev.plan,
  };
}

/** เรียบเรียง dossier เป็นบทรายงานข้อความ (สำหรับ copy/export) */
export function renderReport(d: SynthesisDossier, narrative?: { headline: string; summary: string; convergence: string; risks: string[] }): string {
  const L: string[] = [];
  L.push(`บทวิเคราะห์หลอมรวม — ${d.symbol} (${d.name}) · ${d.date}`);
  L.push(`${'='.repeat(56)}`);
  L.push(`ราคา ${d.price} · ${d.sector} · ${d.theme} · Regime ${d.regime}`);
  L.push(`คะแนนบรรจบ ${d.score > 0 ? '+' : ''}${d.score}/100 · ความเห็นตายตรงกัน ${Math.round(d.agreement * 100)}% · สรุป: ${d.verdict.label}`);
  L.push(`ท่าที: ${d.verdict.action}`);
  if (narrative) {
    L.push('');
    L.push(`◆ ${narrative.headline}`);
    L.push(narrative.summary);
    L.push('');
    L.push('การหลอมรวมหลักฐาน');
    L.push(narrative.convergence);
  }
  L.push('');
  L.push('สายหลักฐาน (13 สาย)');
  for (const s of d.strands) {
    L.push(`  [${s.vote.padEnd(7)}] w=${s.effWeight.toFixed(2)}${s.trusted ? ' ✓attr' : ''}  ${s.label} — ${s.value}`);
    L.push(`             ${s.detail}`);
  }
  L.push('');
  L.push('จุดแข็งสุด');
  d.strengthNotes.forEach((x) => L.push(`  + ${x}`));
  L.push('จุดอ่อนสุด');
  d.weaknessNotes.forEach((x) => L.push(`  − ${x}`));
  L.push('');
  L.push('แผนการเดินเกม');
  d.roadmap.forEach((x, i) => L.push(`  ${i + 1}. ${x}`));
  L.push('เงื่อนไขยกเลิก (Kill Switch)');
  d.killSwitches.forEach((x) => L.push(`  ! ${x}`));
  if (narrative?.risks.length) {
    L.push('มุมที่ผิดพลาดได้');
    narrative.risks.forEach((x) => L.push(`  ? ${x}`));
  }
  L.push('');
  L.push('— สร้างโดย Omniscient Quant Engine · ไม่ใช่คำแนะนำการลงทุน —');
  return L.join('\n');
}
