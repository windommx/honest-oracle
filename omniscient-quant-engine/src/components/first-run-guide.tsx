'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { Compass, X } from 'lucide-react';
import { useAppMeta } from '@/components/providers/app-meta';

const KEY = 'oqe-first-run-v1';
const EVENT = 'oqe-first-run-change';

function subscribe(cb: () => void): () => void {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(EVENT, cb);
  };
}

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === 'done';
  } catch {
    return true; // storage ถูกบล็อก — ไม่รบกวนผู้ใช้ด้วยกล่องที่ปิดไม่ได้
  }
}

/** คำแนะนำครั้งแรก — ปิดแล้วจำไว้ในเครื่อง (localStorage) · server render = ซ่อน (ไม่มี hydration mismatch) */
export function FirstRunGuide({ onNavigate }: { onNavigate: (view: string) => void }) {
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  const { meta } = useAppMeta();
  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, 'done');
    } catch {}
    window.dispatchEvent(new Event(EVENT));
  };

  const go = (view: string) => () => onNavigate(view);
  const link = 'rounded px-1 text-emerald-300 underline decoration-emerald-600 underline-offset-2 hover:text-emerald-200';

  return (
    <section
      aria-labelledby="first-run-title"
      className="mx-3 mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4 text-sm text-zinc-200 sm:mx-5"
    >
      <div className="flex items-start gap-3">
        <Compass className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <h2 id="first-run-title" className="font-semibold text-zinc-50">
            เริ่มต้นใช้งานใน 1 นาที
          </h2>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-zinc-300">
            <li>
              ข้อมูลตอนนี้: <strong className="text-zinc-100">{meta?.data.label ?? '…'}</strong>
              {meta?.data.kind === 'synthetic' && ' — ตัวเลขทุกตัวมาจากข้อมูลจำลองเพื่อเรียนรู้ระบบ ไม่ใช่ราคาจริง'}
            </li>
            <li>
              เส้นทางแนะนำ:{' '}
              <button type="button" className={link} onClick={go('decision')}>
                Decision (5 Gates + แผนเทรด)
              </button>{' '}
              →{' '}
              <button type="button" className={link} onClick={go('apex')}>
                Apex (ขนาดไม้สุดท้าย)
              </button>{' '}
              →{' '}
              <button type="button" className={link} onClick={go('backtest')}>
                Backtest (ผลย้อนหลัง + ช่วงความเชื่อมั่น + ความทนทานข้าม seed)
              </button>
            </li>
            <li>ล็อกกติกาในแท็บ Backtest ก่อนดูผลรอบใหม่ — ทุกรายงานจะบอกว่าใช้กติกาชุดที่ล็อกไว้หรือไม่</li>
            <li>
              กด <kbd className="rounded border border-zinc-600 px-1 font-mono text-[11px]">Ctrl</kbd>+
              <kbd className="rounded border border-zinc-600 px-1 font-mono text-[11px]">K</kbd> เพื่อค้นหาหุ้น ·{' '}
              <Link href="/terms" className={link}>
                อ่านข้อกำหนดและข้อจำกัด
              </Link>
            </li>
          </ol>
          <button
            type="button"
            onClick={dismiss}
            className="mt-1 rounded-md border border-emerald-500/50 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/10"
          >
            เข้าใจแล้ว ไม่ต้องแสดงอีก
          </button>
        </div>
        <button type="button" onClick={dismiss} aria-label="ปิดคำแนะนำ" className="rounded p-1.5 text-zinc-300 hover:bg-zinc-800">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}
