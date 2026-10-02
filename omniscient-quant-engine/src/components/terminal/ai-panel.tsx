'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bot,
  Loader2,
  MoveRight,
  Send,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmtDate, fmtNum, fmtPct, fmtSigned } from '@/lib/format';
import type { AnalystBriefT } from '@/lib/quant/api-types';
import { GateChips, SignalBadge } from '@/components/quant/quant-widgets';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LLM_MISSING_HINT, READ_ONLY_HINT, useCanWrite, useLlmReady } from '@/components/providers/app-meta';

// ───────────────────────────── helpers ─────────────────────────────

type TrendDir = AnalystBriefT['trend']['dir'];

type ChatMsg = { role: 'user' | 'ai'; text: string };

const ASK_ERROR = 'ขออภัย เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';

const TREND_META: Record<TrendDir, { cls: string; Icon: LucideIcon }> = {
  UP: { cls: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300', Icon: TrendingUp },
  DOWN: { cls: 'border-rose-500/50 bg-rose-500/10 text-rose-300', Icon: TrendingDown },
  SIDE: { cls: 'border-zinc-700 bg-zinc-800/60 text-zinc-400', Icon: MoveRight },
};

const trunc = (s: string, n: number): string =>
  s.length > n ? `${s.slice(0, n).trimEnd()}...` : s;

function rsiChip(rsi: number): { label: string; cls: string } {
  if (rsi > 70) return { label: 'ซื้อเกิน', cls: 'border-rose-500/40 text-rose-300' };
  if (rsi < 30) return { label: 'ขายเกิน', cls: 'border-emerald-500/40 text-emerald-300' };
  return { label: 'กลาง', cls: 'border-zinc-700 text-zinc-400' };
}

// ─────────────────────── module-level sub-components ───────────────────────

function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[10px] uppercase tracking-wider text-zinc-600">{children}</p>
      {right}
    </div>
  );
}

function StatBox({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
      <p className="text-[9px] text-zinc-500">{label}</p>
      <p className={cn('mt-0.5 font-mono text-sm', valueClass)}>{value}</p>
    </div>
  );
}

function MetricRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="flex items-center gap-1 font-mono text-zinc-200">{children}</span>
    </div>
  );
}

function SrBox({ title, values, tone }: { title: string; values: number[]; tone: 'support' | 'resistance' }) {
  const shown = values.slice(0, 2);
  return (
    <div
      className={cn(
        'rounded-lg border p-2.5',
        tone === 'support' ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-amber-500/40 bg-amber-500/10',
      )}
    >
      <p className={cn('text-[9px] font-bold', tone === 'support' ? 'text-emerald-400' : 'text-amber-400')}>{title}</p>
      <div className="mt-1 space-y-0.5">
        {shown.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500">—</p>
        ) : (
          shown.map((v, i) => (
            <p key={i} className={cn('font-mono text-sm', tone === 'support' ? 'text-emerald-300' : 'text-amber-300')}>
              {fmtNum(v)}
            </p>
          ))
        )}
      </div>
    </div>
  );
}

function Skel({ className }: { className: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-zinc-800/70', className)} />;
}

/** โครง skeleton ครบทุก section ขณะโหลด */
function LoadingBody() {
  return (
    <div className="space-y-4 px-4 py-3">
      <div className="space-y-2">
        <Skel className="h-3 w-24" />
        <div className="flex items-center justify-between">
          <Skel className="h-7 w-44 rounded-md" />
          <Skel className="h-3 w-20" />
        </div>
        <Skel className="h-3 w-full" />
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skel key={i} className="h-6 w-8" />
          ))}
          <Skel className="ml-2 h-3 w-16" />
        </div>
      </div>
      <Skel className="h-32 w-full rounded-lg" />
      <div className="space-y-2">
        <Skel className="h-3 w-32" />
        <Skel className="h-24 w-full rounded-lg" />
      </div>
      <div className="space-y-2">
        <Skel className="h-3 w-28" />
        <div className="grid grid-cols-2 gap-2">
          <Skel className="h-16 rounded-lg" />
          <Skel className="h-16 rounded-lg" />
        </div>
      </div>
      <div className="space-y-2">
        <Skel className="h-3 w-20" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skel key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ error }: { error: string }) {
  return (
    <div className="m-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
      <p className="flex items-start gap-1.5 text-xs text-rose-300">
        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
        <span>โหลดวิเคราะห์ไม่สำเร็จ: {error}</span>
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <p className="text-[11px] text-zinc-600">ยังไม่มีข้อมูลวิเคราะห์</p>
    </div>
  );
}

/** Section 1–5 เมื่อมีข้อมูลครบ */
function BriefContent({ data }: { data: AnalystBriefT }) {
  const { trend, plan, sr, synth } = data;
  const ind = data.indicators;
  const tm = TREND_META[trend.dir];
  const noTrade = data.signal === 'NO_TRADE';
  const entryMid = (plan.entryLow + plan.entryHigh) / 2;
  const rc = rsiChip(ind.rsi);

  return (
    <>
      {/* SECTION 1 — แนวโน้มรายวัน */}
      <section className="space-y-2 px-4 py-3">
        <SectionLabel>แนวโน้มรายวัน</SectionLabel>
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex items-center gap-1.5 rounded-md border px-2 py-1', tm.cls)}>
            <tm.Icon className="size-3" />
            <span className="text-xs font-semibold">{trend.label}</span>
          </span>
          <span className="ml-auto font-mono text-[10px] text-zinc-500">1D · {data.date}</span>
        </div>
        <p className="font-mono text-[11px] text-zinc-400">
          ราคา {fmtNum(trend.close)} · EMA20 {fmtNum(trend.ema20)} · EMA50 {fmtNum(trend.ema50)} · ห่าง ATH{' '}
          {fmtPct(trend.distHighPct, 1)}
        </p>
        <div className="flex items-center justify-between gap-2">
          <GateChips gates={data.gates} size="md" />
          <span className="text-[10px] text-zinc-500">{data.phase}</span>
        </div>
      </section>

      {/* SECTION 2 — CONDITIONAL PLAN */}
      <section className="px-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-bold tracking-wider text-amber-300">CONDITIONAL PLAN</p>
            <SignalBadge signal={data.signal} />
          </div>
          {noTrade ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">
              รอเงื่อนไข:{' '}
              {plan.failingGates.length > 0 && (
                <span className="inline-flex flex-wrap items-center gap-1 align-middle">
                  {plan.failingGates.map((g) => (
                    <span
                      key={g}
                      className="rounded border border-rose-500/40 bg-rose-500/10 px-1 font-mono text-[10px] text-rose-300"
                    >
                      {g}
                    </span>
                  ))}
                </span>
              )}
              {plan.reasons.g3 && <span> — {trunc(plan.reasons.g3, 140)}</span>}
            </p>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-zinc-300">
              เข้าโซน <span className="font-mono">{fmtNum(plan.entryLow)}–{fmtNum(plan.entryHigh)}</span> เมื่อยืนยันเหนือ{' '}
              <span className="font-mono">{fmtNum(plan.trigger)}</span> · stop แข็ง{' '}
              <span className="font-mono">{fmtNum(plan.stopHard)}</span> · ขนาด{' '}
              <span className="font-mono">{fmtNum(plan.sizePct, 1)}%</span> ของพอร์ต
            </p>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <StatBox label="ราคาปัจจุบัน" value={fmtNum(trend.close)} valueClass="text-zinc-100" />
            <StatBox label="จุดเข้าโซนกลาง" value={fmtNum(entryMid)} valueClass="text-emerald-300" />
          </div>
          {plan.killSwitch && (
            <p className="mt-2 flex items-start gap-1.5 text-[10px] text-zinc-500">
              <AlertTriangle className="mt-0.5 size-2.5 shrink-0 text-amber-400" />
              <span>{trunc(plan.killSwitch, 90)}</span>
            </p>
          )}
        </div>
      </section>

      {/* SECTION 3 — AI ANALYST · LOCAL */}
      <section className="px-4 py-3">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="size-3 text-amber-400" />
          <p className="text-[10px] font-bold tracking-wider text-zinc-400">AI ANALYST — LOCAL</p>
          <span className="ml-auto text-[9px] text-zinc-600">grounded · rule-based</span>
        </div>
        {synth || data.brief.length > 0 ? (
          <div className="space-y-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            {synth && (
              <>
                <p className="text-xs font-semibold text-zinc-100">{synth.headline}</p>
                <p className="line-clamp-4 text-[11px] leading-relaxed text-zinc-400">{synth.summary}</p>
                <div className="flex items-center gap-2 pt-0.5">
                  <span
                    className={cn(
                      'font-mono text-xs font-semibold',
                      synth.score > 0 ? 'text-emerald-300' : synth.score < 0 ? 'text-rose-300' : 'text-zinc-400',
                    )}
                  >
                    {fmtSigned(synth.score, 0)}
                  </span>
                  <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1 font-mono text-[9px] uppercase text-zinc-300">
                    {synth.verdict}
                  </span>
                </div>
              </>
            )}
            {data.brief.length > 0 && (
              <>
                <p className="text-[10px] text-zinc-500">บทวิเคราะห์เชิงระบบ:</p>
                <ul className="list-inside list-disc space-y-1 text-[11px] text-zinc-400">
                  {data.brief.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-zinc-600">ยังไม่มีบทวิเคราะห์</p>
        )}
      </section>

      {/* SECTION 4 — แนวรับ-แนวต้าน */}
      <section className="space-y-2 px-4 py-3">
        <SectionLabel right={<span className="text-[10px] text-zinc-600">Pivots ระยะ 90 วัน</span>}>
          แนวรับ-แนวต้าน
        </SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <SrBox title="SUPPORT" values={sr.supports} tone="support" />
          <SrBox title="RESISTANCE" values={sr.resistances} tone="resistance" />
        </div>
        <p className="font-mono text-[10px] text-zinc-500">
          Stop แข็ง {fmtNum(plan.stopHard)} · Stop โครงสร้าง {fmtNum(plan.stopStruct)}
        </p>
      </section>

      {/* SECTION 5 — ตัวชี้วัดหลัก */}
      <section className="px-4 pb-3">
        <SectionLabel>ตัวชี้วัดหลัก</SectionLabel>
        <div className="mt-1 divide-y divide-zinc-800/60">
          <MetricRow label="กำลังซื้อขาย (volRatio)">
            <span className={ind.volRatio > 1.5 ? 'text-emerald-300' : ind.volRatio < 0.6 ? 'text-zinc-500' : 'text-zinc-200'}>
              {fmtNum(ind.volRatio, 2)}×
            </span>
          </MetricRow>
          <MetricRow label="RSI 14">
            <span>{fmtNum(ind.rsi, 1)}</span>
            <span className={cn('rounded border px-1 text-[9px]', rc.cls)}>{rc.label}</span>
          </MetricRow>
          <MetricRow label="MACD Histogram">
            <span className={ind.macdH >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtSigned(ind.macdH, 3)}</span>
            {ind.macdH >= ind.macdHPrev ? (
              <TrendingUp className="size-2.5 text-emerald-300" />
            ) : (
              <TrendingDown className="size-2.5 text-rose-300" />
            )}
          </MetricRow>
          <MetricRow label="Fund Flow 5d">
            <span className={ind.flow5 >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtSigned(ind.flow5, 1)}M</span>
          </MetricRow>
          <MetricRow label="Θ Dependence z">
            <span>{fmtNum(ind.thetaZ, 2)}</span>
            {ind.decoupled && (
              <span className="rounded border border-rose-500/50 px-1 text-[9px] text-rose-300">DECOUPLE</span>
            )}
          </MetricRow>
          <MetricRow label="ProbUp (ML)">
            <span>{fmtNum(plan.probUp * 100, 1)}%</span>
          </MetricRow>
          <MetricRow label="CVaR 1d (97.5%)">
            <span className="text-rose-300">{fmtNum(plan.cvar * 100, 2)}%</span>
          </MetricRow>
          <MetricRow label="Volatility 21d">
            <span className="text-zinc-300">{fmtNum(ind.vol21, 1)}%</span>
          </MetricRow>
        </div>
      </section>
    </>
  );
}

// ───────────────────────────── main panel ─────────────────────────────

export interface AiPanelProps {
  data: AnalystBriefT | null;
  loading: boolean;
  error?: string | null;
  asking?: boolean;
  onAsk: (q: string) => Promise<string>;
}

export function AiPanel({ data, loading, error = null, asking = false, onAsk }: AiPanelProps) {
  const [question, setQuestion] = useState('');
  const canWrite = useCanWrite();
  const llmReady = useLlmReady();
  const chatBlocked = !canWrite ? READ_ONLY_HINT : !llmReady ? LLM_MISSING_HINT : null;
  // เก็บแชทคู่กับ symbol — เมื่อเปลี่ยนหุ้น msgs จะว่างทันทีโดยไม่ต้องใช้ effect
  const [chat, setChat] = useState<{ sym: string; msgs: ChatMsg[] }>({ sym: '', msgs: [] });
  const busyRef = useRef(false);

  const symbol = data?.symbol ?? '';
  const msgs = chat.sym === symbol ? chat.msgs : [];

  async function handleAsk() {
    const q = question.trim();
    if (!q || asking || busyRef.current || chatBlocked) return;
    busyRef.current = true;
    setQuestion('');
    const base: ChatMsg[] = chat.sym === symbol ? chat.msgs : [];
    const history: ChatMsg[] = [...base, { role: 'user', text: q }];
    setChat({ sym: symbol, msgs: history });
    try {
      const answer = await onAsk(q);
      setChat({ sym: symbol, msgs: [...history, { role: 'ai', text: answer }] });
    } catch {
      setChat({ sym: symbol, msgs: [...history, { role: 'ai', text: ASK_ERROR }] });
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-900/30">
      {/* HEADER */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="text-[11px] font-bold tracking-widest text-zinc-400">AI ANALYSIS</span>
            <span className="truncate font-mono text-[11px] text-zinc-600">/ {symbol || '—'}</span>
          </div>
          <span className="shrink-0 rounded border border-emerald-500/50 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
            RULE ENGINE
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="truncate text-xs text-zinc-500">{data?.name || '—'}</p>
          <span className="shrink-0 rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            {fmtDate(data?.date)}
          </span>
        </div>
      </header>

      {/* SCROLL AREA */}
      <div className="min-h-0 flex-1 overflow-y-auto" aria-busy={loading} tabIndex={0} role="region" aria-label={`บทวิเคราะห์ ${symbol || ""}`.trim()}>
        {loading ? <LoadingBody /> : error ? <ErrorBox error={error} /> : data ? <BriefContent data={data} /> : <EmptyState />}
      </div>

      {/* FOOTER — CHAT */}
      <footer className="mt-auto border-t border-zinc-800 p-3">
        {(msgs.length > 0 || asking) && (
          <div className="mb-2 max-h-40 space-y-2 overflow-y-auto" aria-live="polite" tabIndex={0} role="log" aria-label="บทสนทนากับ AI">
            {msgs.map((m, i) => (
              <div
                key={`${i}-${m.role}`}
                className={cn(
                  'max-w-[85%] rounded-lg border px-2.5 py-1.5 text-[11px]',
                  m.role === 'user'
                    ? 'ml-auto border-amber-500/30 bg-amber-500/10 text-amber-100'
                    : 'mr-auto whitespace-pre-wrap border-zinc-700 bg-zinc-800/80 text-zinc-200',
                )}
              >
                {m.text}
              </div>
            ))}
            {asking && (
              <div className="mr-auto inline-flex max-w-[85%] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-2.5 py-1.5 text-[11px] text-zinc-200">
                <Loader2 className="size-3 animate-spin text-zinc-400" />
                <span>กำลังคิด...</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500"
          >
            <Bot className="size-3.5 text-white" />
          </span>
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleAsk();
              }
            }}
            placeholder={chatBlocked ? (canWrite ? 'แชทต้องตั้งค่า LLM ก่อน' : 'ผู้ชม: อ่านอย่างเดียว') : 'ถาม AI นักวิเคราะห์...'}
            aria-label="ถาม AI นักวิเคราะห์"
            aria-describedby={chatBlocked ? 'ai-chat-blocked' : undefined}
            disabled={Boolean(chatBlocked)}
            maxLength={600}
            className="h-9 flex-1 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200 placeholder:text-zinc-400"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="ส่งคำถาม"
            disabled={!question.trim() || asking || Boolean(chatBlocked)}
            onClick={() => void handleAsk()}
            className="shrink-0 border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800 hover:text-emerald-300"
          >
            <Send className="size-3.5" aria-hidden />
          </Button>
        </div>
        {chatBlocked && (
          <p id="ai-chat-blocked" className="mt-1.5 text-[10.5px] leading-snug text-zinc-400">
            {chatBlocked}
          </p>
        )}
      </footer>
    </div>
  );
}

export default AiPanel;
