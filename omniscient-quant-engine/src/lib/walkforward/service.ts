// ============================================================
// หน้า "ทดสอบเดินหน้า" (server-only) — คำนวณครั้งเดียวต่อเวอร์ชันข้อมูล (cache ผูกกับ MarketState)
// + ส่งออก CSV/สคริปต์สำหรับ PyBroker
// ============================================================

import { getDataProvenance } from '@/lib/data/provenance';
import { loadMarketState } from '@/lib/quant/engine/panel';
import { RULES_HASH } from '@/lib/quant/engine/rules';
import type { MarketState } from '@/lib/quant/engine/types';
import { rhythmBase } from '@/lib/rhythm/service';
import { bridgeCounts, bridgeCsv, bridgeScript } from './bridge';
import { computeWalkforward, type WfComputed } from './compute';
import { buildWalkforward } from './report';
import type { WalkforwardResponse } from './types';

const cache = new WeakMap<MarketState, WfComputed>();

function computedFor(state: MarketState): WfComputed | null {
  const hit = cache.get(state);
  if (hit) return hit;
  const base = rhythmBase(state);
  if (!base) return null;
  const c = computeWalkforward(state, base.gates);
  cache.set(state, c);
  return c;
}

/** null = ข้อมูลย้อนหลังไม่พอ (หน้าต่างวิเคราะห์สั้นกว่าเกณฑ์ของหน้าจังหวะตลาด) */
export async function getWalkforward(): Promise<WalkforwardResponse | null> {
  // โหลด state ก่อน: DB ว่างจะถูก seed ในขั้นนี้ แล้วจึงอ่านที่มาของข้อมูล
  const state = await loadMarketState();
  const prov = await getDataProvenance();
  const c = computedFor(state);
  const base = rhythmBase(state);
  if (!c || !base) return null;
  return buildWalkforward(c, { data: { kind: prov.kind, label: prov.label }, bridge: { ...bridgeCounts(state, base.gates), signals: c.signals } });
}

/** ไฟล์สำหรับ PyBroker — null = ข้อมูลไม่พอ */
export async function getBridgeFile(format: 'csv' | 'py'): Promise<string | null> {
  const state = await loadMarketState();
  const base = rhythmBase(state);
  if (!base) return null;
  if (format === 'csv') return bridgeCsv(state, base.gates).csv;
  const prov = await getDataProvenance();
  return bridgeScript({ rulesHash: RULES_HASH, dataLabel: prov.label });
}
