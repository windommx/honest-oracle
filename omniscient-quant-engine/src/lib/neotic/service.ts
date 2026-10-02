// ============================================================
// หน้า "สแกน Neotic 3D" (server-only) — คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล (cache ผูกกับ MarketState)
// + ส่งออก CSV/สคริปต์สำหรับ PyBroker
// ============================================================

import { getDataProvenance } from '@/lib/data/provenance';
import { loadMarketState } from '@/lib/quant/engine/panel';
import type { MarketState } from '@/lib/quant/engine/types';
import { neoBridgeCounts, neoBridgeCsv, neoBridgeScript } from './bridge';
import { computeNeotic, neoFeatures, type NeoComputed, type NeoFeatures } from './compute';
import { buildNeotic } from './report';
import type { NeoticResponse } from './types';

const cache = new WeakMap<MarketState, { f: NeoFeatures; c: NeoComputed | null }>();

function computedFor(state: MarketState) {
  const hit = cache.get(state);
  if (hit) return hit;
  const f = neoFeatures(state);
  const out = { f, c: computeNeotic(state, f) };
  cache.set(state, out);
  return out;
}

/** null = ประวัติราคาไม่พอคำนวณ ROC 252 วัน */
export async function getNeotic(): Promise<NeoticResponse | null> {
  // โหลด state ก่อน: DB ว่างจะถูก seed ในขั้นนี้ แล้วจึงอ่านที่มาของข้อมูล
  const state = await loadMarketState();
  const prov = await getDataProvenance();
  const { f, c } = computedFor(state);
  if (!c) return null;
  return buildNeotic(c, { data: { kind: prov.kind, label: prov.label }, bridge: { ...neoBridgeCounts(state, f), signals: c.facts.signals } });
}

/** ไฟล์สำหรับ PyBroker — null = ข้อมูลไม่พอ */
export async function getNeoticFile(format: 'csv' | 'py'): Promise<string | null> {
  const state = await loadMarketState();
  const { f, c } = computedFor(state);
  if (!c) return null;
  if (format === 'csv') return neoBridgeCsv(state, f).csv;
  const prov = await getDataProvenance();
  return neoBridgeScript({ dataLabel: prov.label });
}
