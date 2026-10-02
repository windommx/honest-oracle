// ============================================================
// จังหวะตลาด — ประกอบ 5 แผงจาก MarketState ปัจจุบัน (server-only)
// ส่วนที่ไม่ขึ้นกับหุ้นที่เลือก + ตารางด่านของทุกหุ้น-วัน คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล (cache ผูกกับ MarketState)
// ============================================================

import { getDataProvenance } from '@/lib/data/provenance';
import { loadMarketState } from '@/lib/quant/engine/panel';
import type { MarketState } from '@/lib/quant/engine/types';
import {
  computeBreadth,
  computeDayMap,
  computeGateBlockMatrix,
  computeSeasonality,
  computeSectors,
  MARKET_SYMBOL,
  rhythmWindow,
  summarizeGateBlocks,
  type GateBlockMatrix,
} from './compute';
import type { BreadthPanel, DayMapPanel, RhythmResponse, RhythmSummary, SectorPanel } from './types';

export interface RhythmBase {
  t0: number;
  t1: number;
  breadth: BreadthPanel;
  sectors: SectorPanel;
  dayMap: DayMapPanel;
  gates: GateBlockMatrix;
}

const cache = new WeakMap<MarketState, RhythmBase>();

/** ส่วนที่ใช้ร่วมทุกสัญลักษณ์ — null = ข้อมูลไม่พอ */
export function rhythmBase(state: MarketState): RhythmBase | null {
  const hit = cache.get(state);
  if (hit) return hit;
  const w = rhythmWindow(state);
  if (!w) return null;
  const base: RhythmBase = {
    ...w,
    breadth: computeBreadth(state, w.t0, w.t1),
    sectors: computeSectors(state, w.t0, w.t1),
    dayMap: computeDayMap(state, w.t0, w.t1),
    gates: computeGateBlockMatrix(state, w.t0, w.t1),
  };
  cache.set(state, base);
  return base;
}

export type RhythmResult = { ok: true; data: RhythmResponse } | { ok: false; reason: 'unknown_symbol' | 'insufficient_data' };

/** symbol: 'SET' = ทั้งตลาด · สัญลักษณ์หุ้น = ฤดูกาลและด่านที่บล็อกของหุ้นนั้น (แผงอื่นเป็นระดับตลาดเสมอ) */
export function rhythmFromState(state: MarketState, symbol: string, data: RhythmResponse['data']): RhythmResult {
  const sym = symbol.toUpperCase();
  const base = rhythmBase(state);
  if (!base) return { ok: false, reason: 'insufficient_data' };
  const seasonality = computeSeasonality(state, sym);
  const gates = summarizeGateBlocks(state, base.gates, sym === MARKET_SYMBOL ? 'ALL' : sym);
  if (!seasonality || !gates) return { ok: false, reason: 'unknown_symbol' };
  const days = base.breadth.days;
  return {
    ok: true,
    data: {
      asOf: days[days.length - 1].date,
      start: days[0].date,
      nDays: days.length,
      symbol: sym,
      symbols: state.stocks.map((s) => ({ id: s.symbol, name: s.name, sector: s.sector })),
      data,
      breadth: base.breadth,
      seasonality,
      sectors: base.sectors,
      dayMap: base.dayMap,
      gates,
    },
  };
}

export async function getRhythm(symbol: string): Promise<RhythmResult> {
  // โหลด state ก่อน: DB ว่างจะถูก seed ในขั้นนี้ — อ่าน provenance พร้อมกันจะได้ป้าย "ไม่ทราบที่มา" ของ DB ก่อน seed
  const state = await loadMarketState();
  const provenance = await getDataProvenance();
  return rhythmFromState(state, symbol, { kind: provenance.kind, label: provenance.label });
}

/** ย่อผลเต็มเหลือตัวเลขที่ Command Center ใช้ (เดือนล่าสุดของด่านที่บล็อก · วันแบบไหน · ความกว้าง) */
export function rhythmSummary(r: RhythmResponse): RhythmSummary {
  const cl = r.dayMap.clusters[r.dayMap.latest.cluster];
  const m = r.gates.months[r.gates.months.length - 1];
  const gatesOnly = r.gates.categories.filter((c) => c.key !== 'SIGNAL');
  const top = gatesOnly.reduce((a, c) => (m.shares[c.key] > m.shares[a.key] ? c : a), gatesOnly[0]);
  return {
    asOf: r.asOf,
    nStocks: r.breadth.nStocks,
    data: r.data,
    breadth: { value: r.breadth.latest.breadth, mean20: r.breadth.latest.breadthMean20, extreme: r.breadth.latest.extreme },
    dayType: { id: cl.id, label: cl.label, share: cl.share, fwdUp: cl.fwdUp, baselineUp: r.dayMap.baseline.fwdUp, recent: r.dayMap.recent.map((x) => x.c) },
    gates: { month: m.month, top: { key: top.key, label: top.label, share: m.shares[top.key] }, signalShare: m.shares.SIGNAL },
    findings: [r.breadth.title, r.seasonality.title, r.sectors.title, r.dayMap.title, r.gates.title],
  };
}
