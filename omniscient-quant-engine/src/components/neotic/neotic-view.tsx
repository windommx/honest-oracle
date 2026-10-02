'use client';

/**
 * หน้า "สแกน Neotic 3D" — นำ scanner ของผู้ใช้ (RS Rank · โซน B · กำไรเขียว · ปริมาณพุ่ง) มาเป็นชุดสัญญาณที่สองของ OQE
 * แล้วทดสอบด้วยเครื่องมือชุดเดียวกับทั้งแพลตฟอร์ม: โบรกเกอร์กระดาษ · เทียบการสุ่มเข้า · เดินหน้าจูนเกณฑ์ · MAE/MFE · ส่งต่อ PyBroker
 */

import { useState, type ReactNode } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { signedFmt, StatusBadge } from '@/components/atlas/atlas-charts';
import { useApi } from '@/hooks/use-api';
import { thDate } from '@/lib/flows/format';
import type { NeoLevel, NeoticResponse } from '@/lib/neotic/types';
import { cn } from '@/lib/utils';
import { CurveChart, EXIT_TH, ExcursionPanel, FunnelPanel, NeoFoldTable, NeoTradesTable, ReadinessList, ScanTable, ZoneMap } from './neotic-charts';

const LEVEL: Record<NeoLevel, { label: string; color: string; box: string }> = {
  nodata: { label: 'ประเมินไม่ได้', color: '#e66767', box: 'border-rose-500/40 bg-rose-500/10' },
  insufficient: { label: 'ข้อมูลยังไม่พอ', color: '#c98500', box: 'border-amber-500/40 bg-amber-500/10' },
  evidence: { label: 'มีหลักฐานเหนือการสุ่ม', color: '#199e70', box: 'border-emerald-500/40 bg-emerald-500/10' },
  none: { label: 'ยังสรุปไม่ได้', color: '#a1a1aa', box: 'border-zinc-700 bg-zinc-900/60' },
  worse: { label: 'แย่กว่าการสุ่ม', color: '#e66767', box: 'border-rose-500/40 bg-rose-500/10' },
};
const STATE_TH: Record<NeoticResponse['recent'][number]['state'], string> = { closed: 'ปิดแล้ว', open: 'ถืออยู่', order: 'รอซื้อ', gap: 'เปิดหลุด stop (ยกเลิก)', expired: 'ไม่ได้ราคา' };
const sectionCls = 'scroll-mt-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-4';
type Filter = 'all' | 'rs' | 'zone' | 'signal';

function Section({ id, title, lead, children }: { id: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={sectionCls}>
      <header>
        <h3 id={`${id}-h`} className="text-sm font-semibold text-zinc-50">
          {title}
        </h3>
        {lead && <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{lead}</p>}
      </header>
      {children}
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

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 px-3 py-3 text-xs leading-relaxed text-zinc-300">{children}</p>;
}

function Bridge({ d }: { d: NeoticResponse }) {
  const link = 'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-3 text-xs font-medium text-zinc-50 hover:bg-zinc-700';
  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-200">
      <div className="flex flex-wrap gap-2">
        <a className={link} href="/api/neotic/export?format=csv" download>
          <Download className="h-3.5 w-3.5" aria-hidden /> ดาวน์โหลด CSV ({d.bridge.rows.toLocaleString()} แถว · {d.bridge.symbols} หุ้น · {d.bridge.signals} สัญญาณ)
        </a>
        <a className={link} href="/api/neotic/export?format=py" download>
          <Download className="h-3.5 w-3.5" aria-hidden /> ดาวน์โหลดสคริปต์ PyBroker (.py)
        </a>
      </div>
      {/* ตัดบรรทัดแทนการเลื่อนแนวนอน: บนมือถือคำสั่งยาวกว่าจอ และกล่องที่เลื่อนได้ต้องโฟกัสด้วยคีย์บอร์ดได้ */}
      <pre className="whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-200 [overflow-wrap:anywhere]">
        {`pip install -U lib-pybroker==${d.bridge.pybroker}\npython neotic_pybroker.py neotic_pybroker.csv\npython neotic_pybroker.py neotic_pybroker.csv --optimize`}
      </pre>
      <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-zinc-300">
        <li>CSV มีตัวแปรของสแกนที่คำนวณแบบ point-in-time แล้ว ชื่อคอลัมน์ตรงกับโค้ดตัวอย่าง: rs_rank · dist_52wh · vol_ratio · eps_qoq · eps_yoy · ema_20 · neo_signal — PyBroker ไม่ต้องคำนวณซ้ำ</li>
        <li>สคริปต์ใช้ API จริงของ lib-pybroker {d.bridge.pybroker}: register_columns · stop_loss_pct · stop_profit_pct · sell_all_shares · Strategy.optimize (โค้ดตัวอย่างเรียก take_profit_pct และ walk_forward ซึ่งไม่มีใน PyBroker)</li>
        <li>ทดสอบแล้วบนข้อมูลจำลองที่เติมวันปริมาณพุ่ง: จำนวนไม้ วันเข้า ราคาเข้า และอัตราชนะสุทธิตรงกับ OQE · ต่างที่รู้สาเหตุ: stop/เป้าปัด tick ของ SET · เปิดกระโดดเหนือเป้า · วันที่ขายตามเส้น EMA ที่ราคาเปิดแต่ราคาลงถึง stop ระหว่างวัน</li>
      </ul>
    </div>
  );
}

export function NeoticView() {
  const q = useApi<NeoticResponse>('/api/neotic');
  const d = q.data;
  const [filter, setFilter] = useState<Filter>('all');
  const synthetic = d ? d.data.kind !== 'real' : false;
  const level = d ? LEVEL[d.verdict.level] : null;
  const th = d?.spec.thresholds;
  const st = d?.backtest.stats;
  const signalsToday = d ? d.scan.filter((r) => r.signal).length : 0;
  const binding = d?.funnel.binding ? d.funnel.steps.find((s) => s.key === d.funnel.binding) : undefined;
  const filters: Array<{ key: Filter; label: string; keep: (r: NeoticResponse['scan'][number]) => boolean }> = th
    ? [
        { key: 'all', label: 'ทุกหุ้น', keep: () => true },
        { key: 'rs', label: `RS ≥ ${th.rsDiv}`, keep: (r) => r.checks.rs },
        { key: 'zone', label: 'โซน B', keep: (r) => r.zone === 'B' },
        { key: 'signal', label: 'สัญญาณ', keep: (r) => r.signal },
      ]
    : [];
  const active = filters.find((f) => f.key === filter) ?? filters[0];
  const rows = d && active ? d.scan.filter(active.keep) : [];

  return (
    <div className="@container min-w-0 space-y-4">
      <header>
        <h2 className="text-lg font-bold text-zinc-50">สแกน Neotic 3D – หุ้นไทย</h2>
        <p className="text-xs text-zinc-400">
          {d && th
            ? `RS Rank ≥ ${th.rsDiv} · ต่ำกว่าจุดสูงสุด 52 สัปดาห์ ${th.knee}–${th.distB}% · กำไรโต QoQ และ YoY · ปริมาณ ≥ ${th.volTrigger}× — ทดสอบด้วยโบรกเกอร์กระดาษ เทียบการสุ่มเข้า เดินหน้าจูนเกณฑ์ และ MAE/MFE · ${d.window.stocks} หุ้น · ${thDate(d.window.start)} – ${thDate(d.window.end)}`
            : 'สแกนตามสเปก Neotic 3D (RS Rank · โซน B · กำไรเขียว · ปริมาณพุ่ง) แล้วทดสอบด้วยเครื่องมือชุดเดียวกับทั้งแพลตฟอร์ม'}
        </p>
      </header>

      {d && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-xs leading-relaxed',
            synthetic ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-zinc-700 bg-zinc-900/60 text-zinc-200',
          )}
        >
          <strong>{d.data.label}</strong>
          {synthetic && ' — ตัวเลขในหน้านี้มาจากข้อมูลจำลอง ใช้ซ้อมวิธีเท่านั้น ไม่ใช่ผลของตลาดหุ้นไทยจริง'} · ผลสุทธิหลังค่าธรรมเนียมไป-กลับ {d.spec.exits.costPct}% · ไม่ใช่คำแนะนำการลงทุน
        </p>
      )}

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          โหลดสแกน Neotic 3D ไม่สำเร็จ: {q.error}
        </p>
      ) : !d || !level || !th || !st ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังสแกนทั้งตลาดทุกวัน (RS Rank · โซน · งบตามวันประกาศ · ปริมาณ) แล้วทดสอบย้อนหลัง…
        </p>
      ) : (
        <>
          <section aria-labelledby="neo-verdict-h" className={cn('rounded-xl border p-3', level.box)}>
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge text={level.label} color={level.color} />
              <span className="text-[11px] text-zinc-300">ตัดสินจากกติกาตามสเปก (ไม่ได้จูนบนข้อมูลนี้) เทียบการสุ่มเข้าเท่านั้น</span>
            </p>
            <h3 id="neo-verdict-h" className="mt-1 text-base font-semibold text-zinc-50">
              {d.verdict.title}
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-zinc-200">
              {d.verdict.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </section>

          <dl className="grid grid-cols-2 gap-2 @min-[700px]:grid-cols-3 @min-[1100px]:grid-cols-6">
            <Tile label="สัญญาณวันนี้" value={String(signalsToday)} sub={`ณ ${thDate(d.asOf)}`} />
            <Tile label="ในโซน B วันนี้" value={`${d.zones.B}/${d.window.stocks}`} sub={`RS ≥ ${th.rsDiv} · ${th.knee}–${th.distB}% ใต้จุดสูงสุด`} />
            <Tile label="สัญญาณทั้งหน้าต่าง" value={String(st.signals)} sub={`${d.window.sessions.toLocaleString()} วันทำการ (${d.window.years} ปี)`} />
            <Tile label="ผลสุทธิต่อไม้" value={st.expectancy ? `${signedFmt(st.expectancy.mean)}%` : '—'} sub={`${st.trades} ไม้ปิด · ชนะ ${st.winRate ?? '—'}%`} />
            <Tile label="เหนือการสุ่มเข้า" value={st.excess ? `${signedFmt(st.excess.mean)} จุด` : '—'} sub={st.pExcess === null ? 'ยังไม่มีไม้จับคู่' : st.pExcess < 0.001 ? 'p < 0.001' : `p = ${st.pExcess.toFixed(3)}`} />
            <Tile
              label="เงื่อนไขที่หายากสุด"
              value={binding ? { days: '—', rs: `RS ≥ ${th.rsDiv}`, zone: `ระยะ ${th.knee}–${th.distB}%`, growth: 'กำไรเขียว', volume: `ปริมาณ ≥ ${th.volTrigger}×` }[binding.key] : '—'}
              sub={binding && binding.alone !== null ? `เกิดเองเพียง ${binding.alone.toLocaleString()} วัน-หุ้น` : '—'}
            />
          </dl>

          <Section
            id="neo-map"
            title="ชั้น 1 — สแกนวันล่าสุด: แผนที่โซนและตารางหุ้น"
            lead={`RS Rank = เปอร์เซ็นไทล์ทั้งตลาดของ ${d.spec.weights.map((w) => `${w.weight.toFixed(2)}·ROC${w.days}`).join(' + ')} · โซน B = RS ≥ ${th.rsDiv} และต่ำกว่าจุดสูงสุด ${th.knee}–${th.distB}% · สัญญาณ = โซน B + กำไรเขียว + ปริมาณ ≥ ${th.volTrigger}× ค่าเฉลี่ย ${d.spec.volWindow} วัน`}
          >
            <ZoneMap scan={d.scan} th={th} asOf={d.asOf} />
            <div role="group" aria-label="กรองตารางสแกน" className="flex flex-wrap gap-1.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs',
                    filter === f.key ? 'border-zinc-400 bg-zinc-800 font-semibold text-zinc-50' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800',
                  )}
                >
                  {f.label} ({d.scan.filter(f.keep).length})
                </button>
              ))}
            </div>
            {rows.length ? (
              <ScanTable rows={rows} th={th} label={`ตารางสแกน Neotic 3D ณ ${thDate(d.asOf)} (${active?.label ?? ''})`} />
            ) : (
              <Empty>ไม่มีหุ้นที่ผ่านตัวกรอง “{active?.label}” ณ {thDate(d.asOf)}</Empty>
            )}
          </Section>

          <Section
            id="neo-funnel"
            title="กรวยเงื่อนไข — เงื่อนไขไหนตัดสัญญาณ"
            lead={`นับทุกวัน-หุ้นในหน้าต่าง ${thDate(d.window.start)} – ${thDate(d.window.end)} ที่มีตัวแปรครบ · ตัวเลข "อย่างเดียว" บอกว่าเงื่อนไขนั้นเกิดบ่อยแค่ไหนถ้าไม่สนเงื่อนไขอื่น`}
          >
            <FunnelPanel funnel={d.funnel} />
          </Section>

          <Section id="neo-ready" title="ความพร้อมของข้อมูลสำหรับกติกานี้" lead="สิ่งที่ข้อความต้นแบบบอกให้เตรียมก่อนรัน (ส่วนที่ 5) ตรวจกับข้อมูลที่อยู่ในระบบตอนนี้">
            <ReadinessList checks={d.readiness} />
          </Section>

          <Section
            id="neo-backtest"
            title="ชั้น 2 — ผลย้อนหลังของกติกาตามสเปก เทียบการสุ่มเข้า"
            lead={`ซื้อราคาเปิดวันถัดไป · stop ${d.spec.exits.stopPct}% · เป้า ${d.spec.exits.targetPct}% (${d.spec.exits.targetR}R) · ปิดต่ำกว่า EMA${d.spec.exits.trailEma} → ขายราคาเปิดวันถัดไป · ถือไม่เกิน ${d.spec.exits.maxHold} วัน · การสุ่มเข้า = หุ้นเดียวกัน วันใดก็ได้ในหน้าต่างเดียวกัน กติกาออกเดียวกัน`}
          >
            {st.trades ? (
              <>
                <dl className="grid grid-cols-2 gap-2 @min-[800px]:grid-cols-4">
                  <Tile label="อัตราชนะสุทธิ" value={`${st.winRate}%`} sub={st.wilson ? `CI 95% ${st.wilson.lo}–${st.wilson.hi}% · สุ่มเข้า ${st.random.winRate ?? '—'}%` : '—'} />
                  <Tile
                    label="ผลสุทธิต่อไม้ (CI 95%)"
                    value={st.expectancy ? `${signedFmt(st.expectancy.mean)}%` : '—'}
                    sub={st.expectancy ? `[${signedFmt(st.expectancy.lo)}, ${signedFmt(st.expectancy.hi)}] · สุ่มเข้า ${st.random.expectancy === null ? '—' : `${signedFmt(st.random.expectancy)}%`}` : '—'}
                  />
                  <Tile label="Profit factor" value={st.profitFactor === null ? '—' : String(st.profitFactor)} sub={st.pfCI ? `bootstrap ${st.pfCI.lo}–${st.pfCI.hi}` : '—'} />
                  <Tile
                    label="ทางออก"
                    value={`${st.avgDays ?? '—'} วัน`}
                    sub={(Object.keys(EXIT_TH) as Array<keyof typeof EXIT_TH>).map((k) => `${EXIT_TH[k]} ${st.byExit[k]}`).join(' · ')}
                  />
                </dl>
                <CurveChart curve={d.backtest.curve} />
                <NeoTradesTable trades={d.backtest.trades} />
              </>
            ) : (
              <Empty>
                ยังไม่มีไม้ที่ปิดแล้ว ({st.signals} สัญญาณในหน้าต่าง) — ดูกรวยเงื่อนไขด้านบนว่าเงื่อนไขไหนไม่เกิด · เมื่อมีข้อมูลจริงที่มีวันปริมาณพุ่งและงบรายไตรมาส ส่วนนี้จะแสดงอัตราชนะ ผลสุทธิ ส่วนต่างจากการสุ่มเข้า และตารางไม้โดยอัตโนมัติ
              </Empty>
            )}
            {d.recent.length > 0 && (
              <div tabIndex={0} role="region" aria-label="สัญญาณล่าสุดของกติกาตามสเปก" className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full min-w-[640px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
                  <thead className="text-zinc-400">
                    <tr className="border-b border-zinc-800">
                      {['วันสัญญาณ', 'หุ้น', 'RS', 'ต่ำกว่าจุดสูงสุด', 'ปริมาณ', 'สถานะ', 'ผลสุทธิ'].map((h) => (
                        <th key={h} className="px-2 py-1.5 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono text-zinc-100">
                    {d.recent.map((r) => (
                      <tr key={`${r.symbol}-${r.date}`} className="border-b border-zinc-800/60">
                        <td className="px-2 py-1">{r.date}</td>
                        <td className="px-2 font-sans">{r.symbol}</td>
                        <td className="px-2">{r.rsRank}</td>
                        <td className="px-2">{r.dist}%</td>
                        <td className="px-2">{r.volRatio}×</td>
                        <td className="px-2 font-sans">
                          {STATE_TH[r.state]}
                          {r.exitKind ? ` · ${EXIT_TH[r.exitKind]}` : ''}
                        </td>
                        <td className="px-2">{r.retNetPct === null ? '—' : `${signedFmt(r.retNetPct)}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            id="neo-wf"
            title="ชั้น 3 — เดินหน้าจูน 4 เกณฑ์ (RS_DIV · knee · DIST_B · vol_trigger)"
            lead={`แต่ละหน้าต่างเลือกจาก ${d.walkforward.configs} ชุดเกณฑ์ (ช่วงเดียวกับ Optuna ของต้นแบบ: RS ${d.spec.grid.rsDiv.join('/')} · knee ${d.spec.grid.knee.join('/')}% · DIST_B ${d.spec.grid.distB.join('/')}% · ปริมาณ ${d.spec.grid.volTrigger.join('/')}×) ตัวที่ผลสุทธิใน train สูงสุด แล้ววัดบน test ที่ไม่เคยเห็น เทียบเกณฑ์ตามสเปกและการสุ่มเข้า`}
          >
            {d.walkforward.ready && d.walkforward.tuned && d.walkforward.locked ? (
              <>
                <dl className="grid grid-cols-2 gap-2 @min-[800px]:grid-cols-4">
                  <Tile
                    label="จูนแล้ว (นอกตัวอย่าง)"
                    value={d.walkforward.tuned.expectancy ? `${signedFmt(d.walkforward.tuned.expectancy.mean)}%` : '—'}
                    sub={`${d.walkforward.tuned.trades} ไม้ · ชนะ ${d.walkforward.tuned.winRate ?? '—'}%`}
                  />
                  <Tile
                    label="ตามสเปก (นอกตัวอย่าง)"
                    value={d.walkforward.locked.expectancy ? `${signedFmt(d.walkforward.locked.expectancy.mean)}%` : '—'}
                    sub={`${d.walkforward.locked.trades} ไม้ · ชนะ ${d.walkforward.locked.winRate ?? '—'}%`}
                  />
                  <Tile
                    label="จูนแล้ว − สเปก"
                    value={d.walkforward.vsLocked ? `${signedFmt(d.walkforward.vsLocked.mean)} จุด` : '—'}
                    sub={d.walkforward.vsLocked ? `CI [${signedFmt(d.walkforward.vsLocked.lo)}, ${signedFmt(d.walkforward.vsLocked.hi)}]` : '—'}
                  />
                  <Tile label="WFE" value={d.walkforward.wfe === null ? '—' : d.walkforward.wfe.toFixed(2).replace('-', '−')} sub={`ในตัวอย่าง ${d.walkforward.isExpectancy === null ? '—' : `${signedFmt(d.walkforward.isExpectancy)}%`} ต่อไม้`} />
                </dl>
                <NeoFoldTable wf={d.walkforward} />
              </>
            ) : (
              <Empty>{d.walkforward.reason ?? 'ยังเดินหน้าไม่ได้'}</Empty>
            )}
          </Section>

          <Section
            id="neo-mae"
            title="ชั้น 4 — MAE / MFE: ตั้ง stop/เป้าจากข้อมูล"
            lead={`ต้นแบบเสนอ stop = MAE เปอร์เซ็นไทล์ 95 และเป้า = MFE เปอร์เซ็นไทล์ 75 · วัดจากการเดินราคาหลังสัญญาณแบบไม่ถูกตัด (stop กว้าง ${d.excursion.wideStopPct}% · ไม่มีเป้า · ถือ ${d.excursion.horizon} วัน) เทียบวันสุ่มของหุ้นเดียวกัน`}
          >
            {d.excursion.signal.n >= 5 ? <ExcursionPanel e={d.excursion} /> : <Empty>มีสัญญาณที่วัดการเดินราคาได้ {d.excursion.signal.n} ครั้ง — ต้องมีอย่างน้อย 5 ครั้งจึงคำนวณเปอร์เซ็นไทล์ได้</Empty>}
          </Section>

          <Section id="neo-bridge" title="ส่งต่อไป PyBroker — ทดสอบกติกา Neotic ด้วยเครื่องมืออิสระ" lead="ใช้ใน Colab หรือเครื่องของคุณ: ไฟล์ตัวแปรของสแกน + สคริปต์ที่ตั้งเกณฑ์/กติกาออกตามสเปก">
            <Bridge d={d} />
          </Section>

          <Section id="neo-method" title="วิธีคิด (ตั้งไว้ก่อนดูผล)">
            <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-300">
              {d.method.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
