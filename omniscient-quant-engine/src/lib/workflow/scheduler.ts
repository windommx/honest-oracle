// ============================================================
// ตัวตั้งเวลารอบประจำวันในเซิร์ฟเวอร์ (เปิดด้วย OQE_CYCLE_AUTO=1)
// ตรวจทุก 10 นาที: วันซื้อขาย + เลย 17:45 น. (กรุงเทพ) + ข้อมูลของวันนี้เข้าแล้ว + ยังไม่เคยรันรอบของวันนี้ → รันรอบ
// การดึงข้อมูลเองอยู่นอกเซิร์ฟเวอร์ (cron: bun scripts/daily-cycle.ts --fetch yahoo หรือนำเข้า CSV) — เซิร์ฟเวอร์เห็นข้อมูลใหม่เองจาก data version
// ============================================================

import { bangkokClock, EOD_READY_MINUTES, isTradingDay } from '@/lib/data/calendar';
import { log } from '@/lib/log';

/** รันรอบหลังข้อมูล EOD พร้อม 15 นาที */
export const CYCLE_READY_MINUTES = EOD_READY_MINUTES + 15;
export const CYCLE_READY_LABEL = `${String(Math.floor(CYCLE_READY_MINUTES / 60)).padStart(2, '0')}:${String(CYCLE_READY_MINUTES % 60).padStart(2, '0')}`;
export const CYCLE_CHECK_MS = 10 * 60_000;

export function cycleAutoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test((env.OQE_CYCLE_AUTO ?? '').trim());
}

/** pure — ควรรันรอบตอนนี้ไหม */
export function shouldRunCycle(now: Date, latestSession: string | null, lastRunSession: string | null): boolean {
  const b = bangkokClock(now);
  if (!isTradingDay(b.date) || b.minutes < CYCLE_READY_MINUTES) return false;
  if (latestSession !== b.date) return false;
  return lastRunSession !== b.date;
}

const g = globalThis as unknown as { __oqeCycleTimer?: ReturnType<typeof setInterval> };

/** เริ่มตัวตั้งเวลา (เรียกซ้ำได้ — มีตัวเดียวต่อโปรเซส) · คืนฟังก์ชันหยุด */
export function startCycleScheduler(): () => void {
  if (g.__oqeCycleTimer) return () => stopCycleScheduler();
  const tick = async () => {
    try {
      const { latestSessionAndLastRun, runCycle } = await import('./service');
      const { session, lastRunSession } = await latestSessionAndLastRun();
      if (!shouldRunCycle(new Date(), session, lastRunSession)) return;
      const r = await runCycle({ actor: 'scheduler' });
      log.info('workflow cycle (auto)', { session: r.session, recorded: r.recorded, resolved: r.resolved, blocked: r.blocked, tookMs: r.tookMs });
    } catch (e) {
      log.warn('workflow cycle (auto) failed', { error: (e as Error)?.message ?? String(e) });
    }
  };
  g.__oqeCycleTimer = setInterval(() => void tick(), CYCLE_CHECK_MS);
  g.__oqeCycleTimer.unref?.();
  setTimeout(() => void tick(), 60_000).unref?.();
  log.info('workflow cycle scheduler started', { readyAfter: CYCLE_READY_LABEL, everyMin: CYCLE_CHECK_MS / 60_000 });
  return () => stopCycleScheduler();
}

export function stopCycleScheduler(): void {
  if (g.__oqeCycleTimer) clearInterval(g.__oqeCycleTimer);
  g.__oqeCycleTimer = undefined;
}
