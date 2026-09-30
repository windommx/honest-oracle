/**
 * warmup.ts — อุ่น cache งานหนักตอนเซิร์ฟเวอร์เริ่ม (src/instrumentation.ts) แทนที่จะให้ผู้ใช้คนแรกรอ
 * panel → probs/backtest → board → factors → dependence → volcano → จังหวะตลาด → Atlas · ทีละขั้นและคืน event loop ระหว่างขั้น
 * (คำขอที่เข้ามาระหว่างอุ่นได้รับบริการ — ใช้ cache ชุดเดียวกัน ไม่คำนวณซ้ำ)
 * ปิดได้ด้วย OQE_WARM_CACHE=0 · สถานะแสดงที่ /api/health (cache)
 */

import { getAtlas } from '@/lib/atlas/service';
import { log } from '@/lib/log';
import { rhythmBase } from '@/lib/rhythm/service';
import { getBacktest, getBoard, getFactorModel, getThetaMatrix, getVolcano } from './api';
import { ensureSeeded, loadMarketState } from './panel';

export interface WarmState {
  status: 'idle' | 'warming' | 'warm' | 'failed' | 'disabled';
  startedAt: string | null;
  finishedAt: string | null;
  tookMs: number | null;
  steps: Array<{ name: string; ms: number }>;
  error: string | null;
}

const g = globalThis as unknown as { __oqeWarm?: WarmState };

export function warmState(): WarmState {
  return g.__oqeWarm ?? { status: 'idle', startedAt: null, finishedAt: null, tookMs: null, steps: [], error: null };
}

export function warmDisabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(0|false|no|off)$/i.test((env.OQE_WARM_CACHE ?? '').trim());
}

const yieldLoop = () => new Promise<void>((r) => setImmediate(r));

export async function warmCaches(): Promise<WarmState> {
  if (warmDisabled()) {
    g.__oqeWarm = { ...warmState(), status: 'disabled' };
    return g.__oqeWarm;
  }
  if (g.__oqeWarm?.status === 'warming') return g.__oqeWarm;
  const st: WarmState = { status: 'warming', startedAt: new Date().toISOString(), finishedAt: null, tookMs: null, steps: [], error: null };
  g.__oqeWarm = st;
  const t0 = performance.now();
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['seed-check', () => ensureSeeded(false)],
    ['panel', loadMarketState],
    ['backtest', getBacktest],
    ['board', getBoard],
    ['factors', getFactorModel],
    ['dependence', getThetaMatrix],
    ['volcano', getVolcano],
    ['rhythm', async () => rhythmBase(await loadMarketState())],
    ['atlas', getAtlas],
  ];
  try {
    for (const [name, fn] of steps) {
      const s0 = performance.now();
      await fn();
      st.steps.push({ name, ms: Math.round(performance.now() - s0) });
      await yieldLoop();
    }
    st.status = 'warm';
  } catch (e) {
    st.status = 'failed';
    st.error = e instanceof Error ? e.message : String(e);
    log.warn('cache warmup failed', { error: e, steps: st.steps });
  }
  st.finishedAt = new Date().toISOString();
  st.tookMs = Math.round(performance.now() - t0);
  if (st.status === 'warm') log.info('cache warm', { tookMs: st.tookMs, steps: st.steps });
  return st;
}
