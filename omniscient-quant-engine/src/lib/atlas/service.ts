// ============================================================
// Atlas พฤติกรรมระบบ — ประกอบจาก MarketState + walk-forward backtest + ตารางด่านของหน้าจังหวะตลาด (server-only)
// คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล (cache ผูกกับ MarketState) — bootstrap/เลื่อนวงกลมใช้ seed คงที่ ผลจึงเท่าเดิมทุกครั้ง
// ============================================================

import { getDataProvenance } from '@/lib/data/provenance';
import { getBacktest } from '@/lib/quant/engine/api';
import { loadMarketState } from '@/lib/quant/engine/panel';
import type { MarketState } from '@/lib/quant/engine/types';
import { dayFeatureMatrix } from '@/lib/rhythm/compute';
import { rhythmBase } from '@/lib/rhythm/service';
import { computeAtlas } from './compute';
import type { AtlasResponse } from './types';

const cache = new WeakMap<MarketState, { key: string; value: AtlasResponse }>();

/** null = ข้อมูลย้อนหลังไม่พอ (หน้าต่างวิเคราะห์สั้นกว่าเกณฑ์ของหน้าจังหวะตลาด) */
export async function getAtlas(): Promise<AtlasResponse | null> {
  // โหลด state ก่อน: DB ว่างจะถูก seed ในขั้นนี้ แล้วจึงอ่านที่มาของข้อมูล
  const state = await loadMarketState();
  const [backtest, provenance] = await Promise.all([getBacktest(), getDataProvenance()]);
  const data = { kind: provenance.kind, label: provenance.label };
  const key = `${data.kind}|${data.label}`;
  const hit = cache.get(state);
  if (hit && hit.key === key) return hit.value;
  const base = rhythmBase(state);
  if (!base) return null;
  const value = computeAtlas({
    state,
    t0: base.t0,
    t1: base.t1,
    gates: base.gates,
    dayMap: base.dayMap,
    breadth: base.breadth,
    features: dayFeatureMatrix(state, base.t0, base.t1),
    backtest,
    data,
  });
  cache.set(state, { key, value });
  return value;
}
