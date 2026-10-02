// ============================================================
// หน้า "เป้าหมายชนะ 80%" (server-only) — ห้องทดลองคำนวณครั้งเดียวต่อเวอร์ชันข้อมูล (cache ผูกกับ MarketState)
// ส่วนที่เปลี่ยนตามเวลา (ล็อกกติกา · ไม้ forward) อ่านใหม่ทุกครั้ง
// ============================================================

import { getDataProvenance } from '@/lib/data/provenance';
import { loadMarketState } from '@/lib/quant/engine/panel';
import { rulesStamp } from '@/lib/quant/engine/rules-registry';
import type { MarketState } from '@/lib/quant/engine/types';
import { rhythmBase } from '@/lib/rhythm/service';
import { EXEC } from '@/lib/workflow/execution';
import { getForwardStats } from '@/lib/workflow/service';
import { computeLab, type LabResult } from './lab';
import { buildWinrate } from './report';
import type { WinrateResponse } from './types';

const cache = new WeakMap<MarketState, LabResult>();

function labFor(state: MarketState): LabResult | null {
  const hit = cache.get(state);
  if (hit) return hit;
  const base = rhythmBase(state);
  if (!base) return null;
  const lab = computeLab(state, base.gates);
  cache.set(state, lab);
  return lab;
}

/** null = ข้อมูลย้อนหลังไม่พอ (หน้าต่างวิเคราะห์สั้นกว่าเกณฑ์ของหน้าจังหวะตลาด) */
export async function getWinrate(now: Date = new Date()): Promise<WinrateResponse | null> {
  // โหลด state ก่อน: DB ว่างจะถูก seed ในขั้นนี้ แล้วจึงอ่านที่มาของข้อมูล
  const state = await loadMarketState();
  const [prov, stamp, fwd] = await Promise.all([getDataProvenance(now), rulesStamp(), getForwardStats()]);
  const lab = labFor(state);
  if (!lab) return null;
  return buildWinrate(lab, {
    data: { kind: prov.kind, label: prov.label },
    rules: { hashShort: stamp.hashShort, locked: stamp.registered !== null, matches: stamp.matchesRegistered },
    exec: { orderDays: EXEC.orderDays, targetR: EXEC.targetR, stopMult: EXEC.stopMult, holdDays: EXEC.holdDays, costPct: EXEC.costPct },
    forward: { closed: fwd.closed, wins: fwd.wins },
  });
}
