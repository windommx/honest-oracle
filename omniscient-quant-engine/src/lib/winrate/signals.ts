// ============================================================
// สัญญาณตามกติกา 5 ด่าน + แผนเทรด ณ วันสัญญาณ สำหรับห้องทดลองที่เล่นซ้ำด้วยโบรกเกอร์กระดาษ (pure)
// ใช้ร่วม: ห้องทดลองอัตราชนะ (winrate/lab) · ทดสอบเดินหน้า (walkforward) — นิยามสัญญาณ/แผน/การส่งคำสั่งชุดเดียวกัน
// สัญญาณ = ตารางด่านของหน้าจังหวะตลาด (cat 5) · แผน = evaluateGates แบบเร็ว (risk parametric) ณ วันนั้น
// ============================================================

import { evaluateGates } from '@/lib/quant/engine/gates';
import type { MarketState } from '@/lib/quant/engine/types';
import type { GateBlockMatrix } from '@/lib/rhythm/compute';
import { floorToTick, scaledStop, simulatePlan, type Bars, type ExecRule, type PaperResult } from '@/lib/workflow/execution';
import { barsOf } from '@/lib/workflow/replay';

export interface SignalPlan {
  close: number;
  /** ขอบบนของโซนเข้า (ราคาตั้งซื้อของ pullback ก่อนปัด tick) */
  zoneHi: number;
  stopHard: number;
  probUp: number;
}

export interface SignalRow {
  /** ลำดับหุ้นใน MarketState */
  si: number;
  t: number;
  date: string;
  /** วันจันทร์ของสัปดาห์ = กลุ่มของความไม่แน่นอนแบบ cluster-robust */
  week: string;
  kind: 'pullback' | 'momentum';
  /** จำนวนสัญญาณทั้งตลาดในวันเดียวกัน */
  crowd: number;
  plan: SignalPlan;
}

export interface SignalSet {
  dates: string[];
  /** เรียงตามวัน แล้วตามลำดับหุ้น */
  sigs: SignalRow[];
  /** แผน ณ วันใดก็ได้ของหุ้นใดก็ได้ (cache) — ใช้กับวันสุ่มเข้า */
  planAt: (si: number, t: number) => SignalPlan;
  bars: Bars[];
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

/** วันจันทร์ของสัปดาห์ */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

export function signalSet(state: MarketState, gates: GateBlockMatrix): SignalSet {
  const dates = state.dates.map(keyOf);
  const N = dates.length;
  const plans = new Map<number, SignalPlan>();
  const planAt = (si: number, t: number): SignalPlan => {
    const k = si * N + t;
    let p = plans.get(k);
    if (!p) {
      const ev = evaluateGates(state, state.stocks[si].symbol, t, { light: true });
      p = { close: state.stocks[si].rows[t].close, zoneHi: ev.plan.entryHigh, stopHard: ev.plan.stopHard, probUp: ev.probUp };
      plans.set(k, p);
    }
    return p;
  };
  const crowd = new Array<number>(N).fill(0);
  state.stocks.forEach((_, si) => {
    for (let t = gates.t0; t <= gates.t1; t++) if (gates.cat[si][t - gates.t0] === 5) crowd[t]++;
  });
  const sigs: SignalRow[] = [];
  state.stocks.forEach((_, si) => {
    for (let t = gates.t0; t <= gates.t1; t++) {
      const i = t - gates.t0;
      if (gates.cat[si][i] !== 5) continue;
      sigs.push({
        si,
        t,
        date: dates[t],
        week: weekOf(dates[t]),
        kind: gates.kind[si][i] === 2 ? 'momentum' : 'pullback',
        crowd: crowd[t],
        plan: planAt(si, t),
      });
    }
  });
  sigs.sort((a, b) => a.t - b.t || a.si - b.si);
  return { dates, sigs, planAt, bars: state.stocks.map((_, si) => barsOf(state, si, dates)) };
}

/** ส่งคำสั่งตามแผน ณ วัน t ด้วยตัวคูณ stop และกติกาออกที่กำหนด (ปัดราคาตาม tick ของ SET แบบเดียวกับรอบประจำวัน) */
export function simulateSignal(bars: Bars, t: number, kind: SignalRow['kind'], plan: SignalPlan, stopMult: number, rule: ExecRule): PaperResult {
  const limit = kind === 'pullback' ? floorToTick(plan.zoneHi) : null;
  const stop = floorToTick(scaledStop(limit ?? plan.close, plan.stopHard, stopMult));
  return simulatePlan(bars, t, { kind, close: plan.close, limit, stop }, rule);
}
