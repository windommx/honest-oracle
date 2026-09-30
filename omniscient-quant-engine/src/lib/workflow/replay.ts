// ============================================================
// ฐานความคาดหวัง = เล่นกระบวนการซ้ำย้อนหลัง (pure · point-in-time)
// ทุกสัญญาณตามกติกาในหน้าต่าง (ตารางด่านชุดเดียวกับหน้าจังหวะตลาด) ก่อนวันล็อกกติกา → แผนเทรด ณ วันนั้น → โบรกเกอร์กระดาษชุดเดียวกับรอบจริง
// ต่างจากรอบจริงเล็กน้อย: ย้อนหลังใช้ risk แบบ parametric (light) ขณะที่ Decision Board ใช้ Monte Carlo — stop/ขนาดไม้อาจต่างกันเล็กน้อย
// ============================================================

import { evaluateGates } from '@/lib/quant/engine/gates';
import type { MarketState } from '@/lib/quant/engine/types';
import type { GateBlockMatrix } from '@/lib/rhythm/compute';
import { floorToTick, simulatePlan, type Bars, type PaperResult } from './execution';

export interface ReplayTrade {
  session: string;
  symbol: string;
  kind: 'pullback' | 'momentum';
  res: PaperResult;
}

export interface ReplayBaseline {
  trades: ReplayTrade[];
  start: string | null;
  end: string | null;
  sessions: number;
}

const keyOf = (d: Date) => d.toISOString().slice(0, 10);

/** แท่งราคาของหุ้นหนึ่งตัวในรูปที่โบรกเกอร์กระดาษใช้ (dates ส่งมาจากผู้เรียกเพื่อใช้ร่วมกัน) */
export function barsOf(state: MarketState, si: number, dates: readonly string[]): Bars {
  const s = state.stocks[si];
  return { dates, open: s.ohlcv.open, high: s.ohlcv.high, low: s.ohlcv.low, close: s.rows.map((r) => r.close), volume: s.ohlcv.volume };
}

/** beforeDate = วันล็อกกติกา (ไม่รวม) · null = ใช้ทั้งหน้าต่าง */
export function replayBaseline(state: MarketState, gates: GateBlockMatrix, beforeDate: string | null): ReplayBaseline {
  const dates = state.dates.map(keyOf);
  const trades: ReplayTrade[] = [];
  let lastT = gates.t0 - 1;
  for (let t = gates.t0; t <= gates.t1; t++) {
    if (beforeDate && dates[t] >= beforeDate) break;
    lastT = t;
  }
  state.stocks.forEach((s, si) => {
    let bars: Bars | null = null;
    for (let t = gates.t0; t <= lastT; t++) {
      const i = t - gates.t0;
      if (gates.cat[si][i] !== 5) continue;
      const ev = evaluateGates(state, s.symbol, t, { light: true });
      if (ev.signal === 'NO_TRADE') continue;
      const kind = ev.signal === 'ENTRY_MOMENTUM' ? 'momentum' : 'pullback';
      bars ??= barsOf(state, si, dates);
      const res = simulatePlan(bars, t, {
        kind,
        close: s.rows[t].close,
        limit: kind === 'pullback' ? floorToTick(ev.plan.entryHigh) : null,
        stop: floorToTick(ev.plan.stopHard),
      });
      trades.push({ session: dates[t], symbol: s.symbol, kind, res });
    }
  });
  trades.sort((a, b) => a.session.localeCompare(b.session) || a.symbol.localeCompare(b.symbol));
  return {
    trades,
    start: lastT >= gates.t0 ? dates[gates.t0] : null,
    end: lastT >= gates.t0 ? dates[lastT] : null,
    sessions: Math.max(0, lastT - gates.t0 + 1),
  };
}

/** R สะสมตามวันออกของไม้ที่ปิดแล้ว (สำหรับกราฟ) */
export function equityCurve(results: Array<{ res: PaperResult }>): Array<{ date: string; cumR: number }> {
  const closed = results.filter((x) => x.res.state === 'closed' && x.res.exit && x.res.r !== null).sort((a, b) => a.res.exit!.date.localeCompare(b.res.exit!.date));
  const out: Array<{ date: string; cumR: number }> = [];
  let cum = 0;
  for (const x of closed) {
    cum += x.res.r!;
    const v = Math.round(cum * 100) / 100;
    if (out.length && out[out.length - 1].date === x.res.exit!.date) out[out.length - 1].cumR = v;
    else out.push({ date: x.res.exit!.date, cumR: v });
  }
  return out;
}
