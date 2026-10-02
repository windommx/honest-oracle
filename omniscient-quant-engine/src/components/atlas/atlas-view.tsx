'use client';

/**
 * หน้า "Atlas พฤติกรรมระบบ" (หุ้นไทย) — วิจัยเอนจิน 5 ด่านแบบ 360° ตามรูปแบบ Grid Behavior Atlas:
 *  A แผนที่สถานะตลาด · B จังหวะเวลา · C ความลึก (สัญญาณพร้อมกัน) · D ส่วนผสมกำไร/ขาดทุน · E เริ่ม/จบอย่างไร · F ทดสอบความฉลาดแบบ walk-forward
 * ทุกมุม: หัวข้อ = ข้อค้นพบจากตัวเลข · ฐาน = ข้อมูลที่ใช้ · สรุป = สถิติพร้อมช่วงความเชื่อมั่น · ที่มา = โค้ดที่คำนวณ
 * ข้อเสนอเพื่อเพิ่มประสิทธิภาพสร้างที่ server จากผลที่ผ่านเกณฑ์สถิติเท่านั้น (ไม่ใช้ LLM)
 */

import { useState, type ReactNode } from 'react';
import { Eye, FlaskConical, Loader2, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import type { AtlasResponse, AtlasSection } from '@/lib/atlas/types';
import { thDate } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import {
  AucForest,
  CalibrationChart,
  ClusterOutcomeTable,
  ConcentrationBars,
  CrowdingForest,
  DepthChart,
  DepthMonthlyChart,
  EndMixBar,
  ExitLeverForest,
  FeatureCorrBars,
  KindForest,
  LeverForest,
  MixMonthlyChart,
  MonthlyEndChart,
  MonthlyStartChart,
  NeighborCard,
  RegimeForest,
  SectorMixChart,
  ShareVsDays,
  signedFmt,
  StartForest,
  StateMapChart,
  TimingHeatmap,
  type MapMode,
} from './atlas-charts';

const SECTIONS = [
  { id: 'atlas-a', letter: 'A', name: 'แผนที่สถานะตลาด', question: 'ตำแหน่งบนแผนที่บอกได้ไหมว่าวันไหนระบบทำงานดี' },
  { id: 'atlas-b', letter: 'B', name: 'จังหวะเวลา', question: 'สัญญาณเกิดเมื่อไหร่ และผลต่างกันตามวัน/เดือนไหม' },
  { id: 'atlas-c', letter: 'C', name: 'ความลึก (สัญญาณพร้อมกัน)', question: 'พร้อมกันได้กี่ตัว — หางของการกระจาย' },
  { id: 'atlas-d', letter: 'D', name: 'ส่วนผสมของกำไร/ขาดทุน', question: 'กำไร/ขาดทุนมาจากไหน กระจุกแค่ไหน' },
  { id: 'atlas-e', letter: 'E', name: 'เริ่มอย่างไร จบอย่างไร', question: 'ภาวะตอนเข้า · ถึงเป้า / หมดเวลา / stop · กติกาออกทางเลือก' },
  { id: 'atlas-f', letter: 'F', name: 'ทดสอบความฉลาดแบบ walk-forward', question: 'ส่วนที่ “ฉลาด” ช่วยจริงไหม และคันโยกไหนควรปรับ' },
] as const;

const TONE: Record<AtlasResponse['actions'][number]['tone'], { label: string; icon: LucideIcon; color: string }> = {
  try: { label: 'ทดลอง', icon: FlaskConical, color: '#3987e5' },
  keep: { label: 'คงไว้', icon: ShieldCheck, color: '#199e70' },
  watch: { label: 'เฝ้าระวัง', icon: Eye, color: '#c98500' },
};
const TONE_ORDER = ['try', 'keep', 'watch'] as const;

function Section({ index, sec, children }: { index: number; sec: AtlasSection; children: ReactNode }) {
  const s = SECTIONS[index];
  return (
    <section id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-4">
      <header>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-300">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-zinc-600 font-mono text-zinc-50">{s.letter}</span>
          {s.name}
          <span className="font-normal normal-case tracking-normal text-zinc-400">— {s.question}</span>
        </p>
        <h3 id={`${s.id}-h`} className="mt-1 text-sm font-semibold leading-snug text-zinc-50">
          {sec.title}
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{sec.basis}</p>
      </header>
      {children}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs leading-relaxed text-zinc-200">
        <p>
          <span className="font-semibold text-zinc-50">สรุป: </span>
          {sec.conclusion}
        </p>
        <p className="mt-1.5 break-words font-mono text-[10.5px] text-zinc-400">ที่มา: {sec.source}</p>
      </div>
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <dt className="text-[11px] text-zinc-400">{label}</dt>
      <dd className="font-mono text-lg font-semibold text-zinc-50">{value}</dd>
      <dd className="text-[11px] text-zinc-400">{sub}</dd>
    </div>
  );
}

function Actions({ items }: { items: AtlasResponse['actions'] }) {
  const sorted = [...items].sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone));
  return (
    <section aria-labelledby="atlas-actions-h" className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-3">
      <h3 id="atlas-actions-h" className="text-xs font-semibold text-zinc-100">
        ข้อเสนอเพื่อเพิ่มประสิทธิภาพ
      </h3>
      <p className="mt-0.5 text-[11px] text-zinc-400">
        สร้างจากผลที่ผ่านเกณฑ์สถิติเท่านั้น (q &lt; 0.1 และช่วงความเชื่อมั่นไม่คร่อมศูนย์) — ที่เหลือแสดงเป็น “ยังสรุปไม่ได้” · ทุกข้อต้องยืนยันแบบ forward ก่อนใช้จริง
      </p>
      <ul className="mt-2 space-y-1.5">
        {sorted.map((a) => {
          const t = TONE[a.tone];
          const Icon = t.icon;
          return (
            <li key={a.text} className="flex gap-2 text-xs leading-relaxed text-zinc-200">
              <span className="mt-0.5 inline-flex h-5 shrink-0 items-center gap-1 rounded border border-zinc-700 px-1.5 text-[10.5px] font-medium text-zinc-100">
                <Icon className="h-3 w-3" style={{ color: t.color }} aria-hidden />
                {t.label}
              </span>
              <span>{a.text}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AtlasView() {
  const q = useApi<AtlasResponse>('/api/atlas');
  const [mode, setMode] = useState<MapMode>('outcome');
  const [picked, setPicked] = useState<number | null>(null);
  const d = q.data;
  const busiest = d ? d.stateMap.clusters.reduce((a, c) => (c.nSignals > a.nSignals ? c : a), d.stateMap.clusters[0]) : null;
  const selected = picked ?? busiest?.id ?? 0;
  const synthetic = d ? d.header.data.kind !== 'real' : false;
  const h = d?.header;

  return (
    <div className="@container min-w-0 space-y-4">
      <header>
        <h2 className="text-lg font-bold text-zinc-50">Atlas พฤติกรรมระบบ – หุ้นไทย</h2>
        <p className="text-xs text-zinc-400">
          {h
            ? `เอนจิน 5 ด่าน · หุ้น ${h.nStocks} ตัว · ${thDate(h.start)} – ${thDate(h.end)} (${h.nDays} วันทำการ) · walk-forward ${thDate(h.backtest.start)} – ${thDate(h.backtest.end)}`
            : 'วิจัยระบบแบบ 360°: แผนที่สถานะตลาด · จังหวะเวลา · สัญญาณพร้อมกัน · ส่วนผสมกำไร/ขาดทุน · เริ่ม/จบอย่างไร · ทดสอบความฉลาด'}
        </p>
      </header>

      {d && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-xs leading-relaxed',
            synthetic ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-200',
          )}
        >
          <strong>{d.header.data.label}</strong>
          {synthetic && ' — ผลในหน้านี้มาจากข้อมูลจำลอง ใช้สาธิตวิธีวิจัยระบบเท่านั้น ไม่ใช่พฤติกรรมจริงของระบบบนตลาดหุ้นไทย'} · ไม้จำลองไม่หักค่าธรรมเนียม · ไม่ใช่คำแนะนำการลงทุน
        </p>
      )}

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          โหลด Atlas ไม่สำเร็จ: {q.error}
        </p>
      ) : !d || !h ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังคำนวณ Atlas (bootstrap + ทดสอบคันโยก — ครั้งแรกอาจใช้เวลาสักครู่)…
        </p>
      ) : (
        <>
          <p className="max-w-5xl text-xs leading-relaxed text-zinc-300">{d.intro}</p>

          <dl className="grid grid-cols-2 gap-2 @min-[700px]:grid-cols-3 @min-[1100px]:grid-cols-6">
            <Tile label="สัญญาณตามกติกา" value={String(h.nSignals)} sub={`ปิดแล้ว ${h.nClosed} · ยังเปิด ${h.nSignals - h.nClosed}`} />
            <Tile label="อัตราชนะ (ไม้ที่ปิด)" value={`${h.winRate.toFixed(1)}%`} sub={`โดน stop ${h.nStops} ไม้`} />
            <Tile label="ผลเฉลี่ยต่อไม้" value={`${signedFmt(h.meanRet)}%`} sub="เข้าราคาปิด · ไม่หักค่าธรรมเนียม" />
            <Tile label="ผลรวมทุกไม้" value={signedFmt(h.sumRet, 1)} sub="จุด % (ไม่ใช่ % ของพอร์ต)" />
            <Tile label="walk-forward นอกตัวอย่าง" value={`${h.backtest.nSignals} สัญญาณ`} sub={`${h.backtest.nDays} วันทดสอบ · ขึ้น ${h.backtest.hitRate}%`} />
            <Tile label="ความฉลาดของ P(up)" value={`AUC ${d.intel.auc[0]?.auc.toFixed(3) ?? '—'}`} sub={d.intel.auc[0] ? `CI [${d.intel.auc[0].lo.toFixed(2)}, ${d.intel.auc[0].hi.toFixed(2)}] · 0.5 = โยนเหรียญ` : ''} />
          </dl>

          <Actions items={d.actions} />

          <nav aria-label="หกมุมของ Atlas" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
            <h3 className="mb-1.5 text-xs font-semibold text-zinc-200">ข้อค้นพบทั้ง 6 มุม (กดเพื่อไปที่มุมนั้น)</h3>
            <ol className="space-y-1 text-xs leading-relaxed">
              {[d.stateMap, d.timing, d.depth, d.mix, d.lifecycle, d.intel].map((sec, i) => (
                <li key={SECTIONS[i].id} className="flex gap-2">
                  <span className="font-mono text-zinc-400">{SECTIONS[i].letter}.</span>
                  <a href={`#${SECTIONS[i].id}`} className="block min-h-6 py-0.5 text-zinc-200 underline-offset-2 hover:text-zinc-50 hover:underline">
                    {sec.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <Section index={0} sec={d.stateMap}>
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0 space-y-2">
                <div role="group" aria-label="สีของจุดบนแผนที่" className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['outcome', 'สีตามผลของโมเดลวันนั้น'],
                      ['cluster', 'ไฮไลต์กลุ่มวัน'],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                      className={cn(
                        'min-h-8 rounded-md border px-2.5 text-xs',
                        mode === m ? 'border-zinc-400 bg-zinc-800 font-semibold text-zinc-50' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <StateMapChart p={d.stateMap} mode={mode} selected={selected} />
              </div>
              <div className="min-w-0 space-y-3">
                <NeighborCard p={d.stateMap} />
                <FeatureCorrBars p={d.stateMap} />
              </div>
            </div>
            {/* ตารางกลุ่มวันเต็มแถว: คอลัมน์ผลของระบบ (ผล/ไม้ · ส่วนต่างโมเดล) ต้องเห็นโดยไม่ต้องเลื่อน */}
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <ClusterOutcomeTable
                p={d.stateMap}
                selected={selected}
                onSelect={(id) => {
                  setPicked(id);
                  setMode('cluster');
                }}
              />
              <RegimeForest p={d.stateMap} />
            </div>
          </Section>

          <Section index={1} sec={d.timing}>
            <TimingHeatmap p={d.timing} />
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <ShareVsDays title="วันในสัปดาห์: สัดส่วนสัญญาณเทียบสัดส่วนวันทำการ" unitLabel="วัน" rows={d.timing.byWeekday} />
              <ShareVsDays title="เดือน: สัดส่วนสัญญาณเทียบสัดส่วนวันทำการ" unitLabel="เดือน" rows={d.timing.byMonth} />
            </div>
          </Section>

          <Section index={2} sec={d.depth}>
            <DepthChart p={d.depth} />
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <DepthMonthlyChart p={d.depth} />
              <CrowdingForest p={d.depth} />
            </div>
          </Section>

          <Section index={3} sec={d.mix}>
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <MixMonthlyChart p={d.mix} />
              <ConcentrationBars p={d.mix} h={h} />
            </div>
            <SectorMixChart p={d.mix} />
          </Section>

          <Section index={4} sec={d.lifecycle}>
            <EndMixBar p={d.lifecycle} />
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <MonthlyEndChart p={d.lifecycle} />
              <MonthlyStartChart p={d.lifecycle} />
            </div>
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <StartForest p={d.lifecycle} />
              <KindForest p={d.lifecycle} />
            </div>
            <ExitLeverForest p={d.lifecycle} />
          </Section>

          <Section index={5} sec={d.intel}>
            <div className="grid gap-3 @min-[1100px]:grid-cols-2">
              <AucForest p={d.intel} />
              <CalibrationChart p={d.intel} />
            </div>
            <LeverForest p={d.intel} />
            <p className="text-[11px] leading-relaxed text-zinc-400">
              หน้าต่าง walk-forward: train {d.intel.window.train} วัน → embargo {d.intel.window.embargo} วัน → test {d.intel.window.test} วัน · เกณฑ์ P(up) {d.intel.window.pThr} · โมเดลไม่เคยเห็นข้อมูลของวันที่ทดสอบ แต่ทุกคันโยกทดสอบบนข้อมูลชุดเดียวกัน จึงยังต้องยืนยันกับข้อมูลใหม่
            </p>
          </Section>
        </>
      )}
    </div>
  );
}
