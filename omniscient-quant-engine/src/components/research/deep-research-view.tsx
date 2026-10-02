'use client';

/**
 * Deep Research — รายงานเชิงลึกรายหุ้นฉบับเดียวที่รวมผลทุกชั้น (หลอมรวม 13 สาย, 5 Gates, ความเสี่ยง, ขนาดไม้, เงินไหล, หลักฐานย้อนหลัง)
 * ตัวเลขมาจาก GET /api/research/deep/{symbol} (ไม่ใช้ LLM) · ปุ่ม AI = POST (ผู้ดูแล + ตั้งค่า LLM แล้วเท่านั้น)
 * ดาวน์โหลด Markdown · พิมพ์/บันทึก PDF (ซ่อน sidebar/ปุ่ม ตอนพิมพ์)
 */

import { useCallback, useState } from 'react';
import { Download, FileSearch, Loader2, Printer, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LLM_MISSING_HINT, READ_ONLY_HINT, useCanWrite, useLlmReady } from '@/components/providers/app-meta';
import { apiCall, useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { thDate } from '@/lib/flows/format';
import { STANCE_LABEL, type DeepResearchReport, type ResearchNarrative, type ResearchSection, type Stance } from '@/lib/research/types';
import { cn } from '@/lib/utils';

const STANCE_CLS: Record<Stance, string> = {
  positive: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
  negative: 'border-rose-500/50 bg-rose-500/10 text-rose-200',
  neutral: 'border-zinc-600 bg-zinc-800/60 text-zinc-200',
  abstain: 'border-dashed border-zinc-600 bg-transparent text-zinc-300',
  info: 'border-sky-500/50 bg-sky-500/10 text-sky-200',
};

const VOTE_TH: Record<string, string> = { LONG: 'หนุน', SHORT: 'ถ่วง', NEUTRAL: 'กลาง' };
const VOTE_CLS: Record<string, string> = { LONG: 'text-emerald-300', SHORT: 'text-rose-300', NEUTRAL: 'text-zinc-300' };

const px = (x: number) => x.toFixed(2);
const chg = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(2)}%`;

function StanceBadge({ stance }: { stance: Stance }) {
  return <span className={cn('inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold', STANCE_CLS[stance])}>{STANCE_LABEL[stance]}</span>;
}

function SectionCard({ s, index }: { s: ResearchSection; index: number }) {
  return (
    <section id={`research-${s.key}`} aria-labelledby={`research-${s.key}-title`} className="break-inside-avoid rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={`research-${s.key}-title`} className="text-sm font-semibold text-zinc-100">
            {index + 1}. {s.title}
          </h3>
          <p className="text-[11px] text-zinc-400">{s.layer}</p>
        </div>
        <StanceBadge stance={s.stance} />
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-zinc-200">{s.summary}</p>
      {s.facts.length > 0 && (
        <dl className="divide-y divide-zinc-800/70 rounded-lg border border-zinc-800 text-xs">
          {s.facts.map((f) => (
            <div key={f.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-1.5">
              <dt className="text-zinc-300">{f.label}</dt>
              <dd className="text-right font-mono text-zinc-50">{f.value}</dd>
              {f.note && <dd className="col-span-2 text-[11px] leading-snug text-zinc-400">{f.note}</dd>}
            </div>
          ))}
        </dl>
      )}
      {s.bullets.length > 0 && (
        <ul className="mt-3 list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-300">
          {s.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function DeepResearchView({ symbols, symbol, onSymbolChange }: { symbols: string[]; symbol: string; onSymbolChange: (s: string) => void }) {
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const llmReady = useLlmReady();
  const [refreshKey, setRefreshKey] = useState(0);
  const [ai, setAi] = useState<{ symbol: string; narrative: ResearchNarrative; markdown: string; filename: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const q = useApi<DeepResearchReport>(`/api/research/deep/${encodeURIComponent(symbol)}?r=${refreshKey}`);
  const r = q.data;
  const narrative = ai && ai.symbol === symbol ? ai : null;

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await apiCall<{ narrative: ResearchNarrative; markdown: string; filename: string }>(`/api/research/deep/${encodeURIComponent(symbol)}`, { method: 'POST' });
      setAi({ symbol, ...res });
      toast({ title: 'เรียบเรียงด้วย AI เสร็จ', description: `บทวิเคราะห์ ${symbol} พร้อมอ่านด้านบนรายงาน` });
    } catch (e) {
      toast({ title: 'เรียบเรียงด้วย AI ไม่สำเร็จ', description: e instanceof Error ? e.message : 'unknown error', variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }, [symbol, toast]);

  const aiBlocked = !canWrite ? READ_ONLY_HINT : !llmReady ? LLM_MISSING_HINT : null;
  const btn = 'gap-1.5 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800';

  return (
    <div className="space-y-4">
      {/* แถบเครื่องมือ (ซ่อนตอนพิมพ์) */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Select value={symbol} onValueChange={onSymbolChange}>
          <SelectTrigger className="w-[170px] border-zinc-800 bg-zinc-900 font-mono text-sm" aria-label="เลือกหุ้นสำหรับ Deep Research">
            <SelectValue placeholder="เลือกหุ้น" />
          </SelectTrigger>
          <SelectContent className="max-h-72 border-zinc-800 bg-zinc-900 text-zinc-200">
            {symbols.map((s) => (
              <SelectItem key={s} value={s} className="font-mono text-xs">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={handleGenerate}
          disabled={generating || !r || aiBlocked !== null}
          title={aiBlocked ?? undefined}
          className="gap-1.5 bg-amber-500 font-semibold text-zinc-950 hover:bg-amber-400"
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />}
          {generating ? 'กำลังเรียบเรียง…' : 'เรียบเรียงด้วย AI'}
        </Button>
        {narrative ? (
          <Button variant="outline" className={btn} onClick={() => download(narrative.filename, narrative.markdown)}>
            <Download className="h-4 w-4" aria-hidden /> ดาวน์โหลด Markdown (รวมบท AI)
          </Button>
        ) : (
          <a
            href={`/api/research/deep/${encodeURIComponent(symbol)}?format=md`}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            <Download className="h-4 w-4" aria-hidden /> ดาวน์โหลด Markdown
          </a>
        )}
        <Button variant="outline" className={btn} onClick={() => window.print()} disabled={!r}>
          <Printer className="h-4 w-4" aria-hidden /> พิมพ์ / บันทึก PDF
        </Button>
        <Button variant="ghost" size="icon" className="border border-zinc-800" aria-label="สร้างรายงานใหม่" title="สร้างรายงานใหม่" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className={cn('h-4 w-4', q.loading && 'animate-spin')} aria-hidden />
        </Button>
        {aiBlocked && <p className="w-full text-[11px] leading-snug text-amber-200 sm:w-auto">{aiBlocked}</p>}
      </div>

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          สร้าง Deep Research ไม่สำเร็จ: {q.error}
        </p>
      ) : !r ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังรวบรวมหลักฐานจากทุกชั้นของ {symbol}…
        </p>
      ) : (
        <article aria-labelledby="research-title" className="research-print space-y-4">
          <header className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              <FileSearch className="h-3.5 w-3.5" aria-hidden /> Deep Research
            </p>
            <h2 id="research-title" className="mt-1 text-xl font-bold text-zinc-50">
              {r.symbol} · {r.name}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {r.sector} · {r.theme} · ข้อมูล ณ {thDate(r.asOf)} · ราคา {px(r.price)} บาท (วันนี้ {chg(r.change.d1)} · 5 วัน {chg(r.change.d5)} · 21 วัน {chg(r.change.d21)})
            </p>
            <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-sm font-semibold text-amber-100">{r.verdict.headline}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-zinc-100">{r.verdict.summary}</p>
            </div>
            <p className="mt-2 text-[11px] text-zinc-400">
              {r.data.label} · กติกา v{r.rules.version} ({r.rules.hashShort}) {r.rules.matchesRegistered ? '· ตรงกับชุดที่ล็อกไว้' : '· ยังไม่ได้ล็อกกติกา'}
            </p>
          </header>

          <section aria-label="ตัวเลขสำคัญ" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {r.kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <p className="text-[11px] text-zinc-300">{k.label}</p>
                <p className="mt-1 font-mono text-lg font-semibold text-zinc-50">{k.value}</p>
                {k.note && <p className="text-[11px] text-zinc-400">{k.note}</p>}
              </div>
            ))}
          </section>

          {narrative && (
            <section aria-labelledby="research-ai" className="rounded-xl border border-amber-500/40 bg-zinc-900/60 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> บทเรียบเรียงจาก AI
              </p>
              <h3 id="research-ai" className="mt-1 text-base font-semibold text-zinc-50">
                {narrative.narrative.headline}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-zinc-200">{narrative.narrative.summary}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                {(
                  [
                    ['มุมบวก', narrative.narrative.bullCase],
                    ['มุมลบ', narrative.narrative.bearCase],
                    ['สิ่งที่ต้องติดตาม', narrative.narrative.watchList],
                  ] as const
                ).map(([title, xs]) => (
                  <div key={title}>
                    <h4 className="text-xs font-semibold text-zinc-200">{title}</h4>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-zinc-300">
                      {xs.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {narrative.narrative.conclusion && <p className="mt-3 text-[13px] text-zinc-100">บทสรุป: {narrative.narrative.conclusion}</p>}
              <p className="mt-2 text-[11px] text-zinc-400">เรียบเรียงโดย LLM จากตัวเลขในรายงานนี้เท่านั้น — เป็นการเรียบเรียง ไม่ใช่การคำนวณ และอาจผิดได้</p>
            </section>
          )}

          <nav aria-label="สารบัญรายงาน" className="flex flex-wrap gap-1.5 print:hidden">
            {r.sections.map((s, i) => (
              <a key={s.key} href={`#research-${s.key}`} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-zinc-100">
                {i + 1}. {s.title}
              </a>
            ))}
          </nav>

          <div className="grid gap-4 xl:grid-cols-2">
            {r.sections.map((s, i) => (
              <SectionCard key={s.key} s={s} index={i} />
            ))}
          </div>

          <section aria-labelledby="research-strands" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 id="research-strands" className="mb-2 text-sm font-semibold text-zinc-100">
              หลักฐาน 13 สาย
            </h3>
            <div tabIndex={0} role="region" aria-label="ตารางหลักฐาน 13 สาย" className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-zinc-900 text-[11px] text-zinc-300">
                  <tr>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">สาย</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">ชั้น</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">โหวต</th>
                    <th scope="col" className="px-2 py-1.5 text-right font-semibold">น้ำหนัก</th>
                    <th scope="col" className="px-2 py-1.5 text-left font-semibold">ค่า · เหตุผล</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
                  {r.strands.map((s) => (
                    <tr key={s.key}>
                      <th scope="row" className="px-2 py-1.5 text-left align-top font-medium text-zinc-100">
                        {s.label}
                      </th>
                      <td className="px-2 py-1.5 align-top text-zinc-300">{s.layer}</td>
                      <td className={cn('whitespace-nowrap px-2 py-1.5 align-top font-semibold', s.abstain ? 'text-zinc-400' : VOTE_CLS[s.vote])}>
                        {s.abstain ? 'งดออกเสียง' : VOTE_TH[s.vote]}
                        {s.trusted && <span className="ml-1 text-[10px] font-normal text-zinc-400">✓ ผ่าน attribution</span>}
                      </td>
                      <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{s.weight.toFixed(2)}</td>
                      <td className="px-2 py-1.5 align-top text-zinc-300">
                        <span className="font-mono text-zinc-100">{s.value}</span>
                        <span className="block text-[11px] leading-snug text-zinc-400">{s.detail}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="research-plan" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <h3 id="research-plan" className="mb-2 text-sm font-semibold text-zinc-100">
                แผนเทรด — {r.verdict.signalLabel}
              </h3>
              <ul className="space-y-1 text-xs text-zinc-200">
                <li>
                  โซนเข้า <span className="font-mono">{px(r.plan.entryLow)} – {px(r.plan.entryHigh)}</span> บาท · จุดยืนยัน <span className="font-mono">{px(r.plan.trigger)}</span>
                </li>
                <li>
                  Stop โครงสร้าง <span className="font-mono">{px(r.plan.stopStruct)}</span> · Stop แข็ง <span className="font-mono">{px(r.plan.stopHard)}</span> บาท
                </li>
                <li>
                  ขนาดไม้ตาม CVaR {r.plan.cvarSizePct.toFixed(1)}% → สุดท้าย <strong>{r.plan.finalSizePct.toFixed(1)}%</strong> ของพอร์ต (เสี่ยง {r.plan.riskPerTradePct.toFixed(2)}% ต่อไม้)
                </li>
                {r.plan.failingGates.length > 0 && <li>ด่านที่ยังไม่ผ่าน: {r.plan.failingGates.join(', ')}</li>}
              </ul>
              {r.plan.execution.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-zinc-300">
                  {r.plan.execution.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="research-risks" className="rounded-xl border border-rose-500/30 bg-zinc-900/40 p-4">
              <h3 id="research-risks" className="mb-2 text-sm font-semibold text-zinc-100">
                สิ่งที่อาจทำให้ข้อสรุปผิด
              </h3>
              <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-300">
                {r.risks.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              {r.roadmap.length > 0 && (
                <>
                  <h4 className="mb-1 mt-3 text-xs font-semibold text-zinc-200">แผนการเดินเกม</h4>
                  <ol className="list-decimal space-y-1 pl-4 text-xs text-zinc-300">
                    {r.roadmap.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          </div>

          <section aria-labelledby="research-checklist" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <h3 id="research-checklist" className="mb-2 text-sm font-semibold text-zinc-100">
              เช็กลิสต์ (จากแท็บ Meta-Risk)
            </h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {(
                [
                  ['IV', 'Part IV — ก่อนกดซื้อทุกครั้ง'],
                  ['V', 'Part V — ตัวระบบและการรับรู้ของผู้เทรด'],
                ] as const
              ).map(([part, title]) => (
                <div key={part}>
                  <h4 className="mb-1 text-xs font-semibold text-zinc-200">{title}</h4>
                  <ul className="space-y-1.5 text-xs">
                    {r.checklist
                      .filter((c) => c.part === part)
                      .map((c) => (
                        <li key={c.question} className="flex gap-2">
                          <span className={cn('shrink-0 font-semibold', c.pass === true ? 'text-emerald-300' : c.pass === false ? 'text-rose-300' : 'text-zinc-400')}>
                            {c.pass === true ? 'ผ่าน' : c.pass === false ? 'ไม่ผ่าน' : 'ไม่ทราบ'}
                          </span>
                          <span className="text-zinc-300">
                            <span className="text-zinc-100">{c.question}</span> — {c.answer}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="research-caveats" className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h3 id="research-caveats" className="mb-2 text-sm font-semibold text-amber-100">
              ข้อจำกัดของรายงาน
            </h3>
            <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-200">
              {r.caveats.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        </article>
      )}
    </div>
  );
}
