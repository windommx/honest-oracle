'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { PulseDot } from '@/components/dashboard/primitives';
import { useAppMeta } from '@/components/providers/app-meta';
import { cn } from '@/lib/utils';

const FRESH_TONE: Record<string, string> = {
  fresh: 'text-emerald-300',
  lagging: 'text-amber-300',
  stale: 'text-rose-300',
  empty: 'text-rose-300',
  synthetic: 'text-amber-200',
};

/** แถบสถานะล่าง: ข้อมูลคืออะไร (จาก provenance จริง ไม่เขียนตายตัว) · กติกา · LLM · ข้อกำหนด */
export function AppFooter({ busy }: { busy: boolean }) {
  const { meta } = useAppMeta();
  return (
    <footer className="shrink-0 border-t border-white/[0.06] bg-zinc-950 pb-[env(safe-area-inset-bottom)] print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-[11px] leading-snug text-zinc-400">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>OQE v{meta?.app.version ?? '—'}</span>
          <span aria-hidden>·</span>
          <span className={cn(meta ? FRESH_TONE[meta.data.freshness.status] : undefined)} title={meta?.data.freshness.notes.join(' · ') || undefined}>
            {meta ? meta.data.label : 'กำลังโหลดที่มาของข้อมูล…'}
          </span>
          {meta && (
            <>
              <span aria-hidden>·</span>
              <span title={meta.rules.hash}>
                กติกา <span className="font-mono text-zinc-300">{meta.rules.hashShort}</span>{' '}
                {meta.rules.registered ? (meta.rules.matchesRegistered ? '(ล็อกแล้ว)' : '(ถูกแก้หลังล็อก)') : '(ยังไม่ล็อก)'}
              </span>
              <span aria-hidden>·</span>
              <span>LLM: {meta.llm.configured ? meta.llm.provider : 'ไม่ได้ตั้งค่า (ใช้ได้เฉพาะเอนจินกฎ)'}</span>
              {!meta.access.canWrite && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-sky-300">ผู้ชม (อ่านอย่างเดียว)</span>
                </>
              )}
            </>
          )}
          <span aria-hidden>·</span>
          <Link href="/terms" className="text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100">
            ข้อกำหนดและข้อจำกัด
          </Link>
          <span aria-hidden>·</span>
          <span className="text-zinc-300">ไม่ใช่คำแนะนำการลงทุน</span>
        </p>
        <p className="font-mono">
          {busy ? (
            <span className="inline-flex items-center gap-1.5" role="status">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> pipeline running...
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <PulseDot tone="up" />
              pipeline ready · walk-forward + 5-gates
            </span>
          )}
        </p>
      </div>
    </footer>
  );
}
