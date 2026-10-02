'use client';

/**
 * หน้า "ทดสอบเดินหน้า (Walk-forward)" — นำแนวคิดของ PyBroker มาใช้กับเอนจิน 5 ด่านของ OQE:
 *  หน้าต่าง train → test เดินหน้าตามเวลา · เลือกกติกาออก (แบบ Optuna) บน train เท่านั้น · วัดบน test ที่ไม่เคยเห็น
 *  · เทียบการสุ่มเข้าในหน้าต่างเดียวกัน · bootstrap · ตารางไม้ + MAE/MFE · กับดัก 9 ข้อ · ส่งไฟล์ต่อให้ PyBroker ตรวจซ้ำ
 */

import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Download, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { signedFmt, StatusBadge } from '@/components/atlas/atlas-charts';
import { useApi } from '@/hooks/use-api';
import { thDate } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import type { OptimizerKey, WalkforwardResponse, WfLevel, WfTrap } from '@/lib/walkforward/types';
import { EquityChart, FoldDiagram, FoldTable, MaeMfeScatter, MaeMfeTable, OPT_COLOR, OptimizerForests, OptimizerTable, TradesTable } from './walkforward-charts';

const LEVEL: Record<WfLevel, { label: string; color: string; box: string }> = {
  evidence: { label: 'มีหลักฐานนอกตัวอย่าง', color: '#199e70', box: 'border-emerald-500/40 bg-emerald-500/10' },
  none: { label: 'ยังสรุปไม่ได้', color: '#a1a1aa', box: 'border-zinc-700 bg-zinc-900/60' },
  worse: { label: 'แย่กว่าการสุ่ม', color: '#e66767', box: 'border-rose-500/40 bg-rose-500/10' },
};
const TRAP: Record<WfTrap['status'], { label: string; icon: LucideIcon; color: string }> = {
  ok: { label: 'จัดการแล้ว', icon: CheckCircle2, color: '#199e70' },
  warn: { label: 'ระวัง', icon: AlertTriangle, color: '#c98500' },
  block: { label: 'ติดขัด', icon: XCircle, color: '#e66767' },
  info: { label: 'ข้อมูล', icon: Info, color: '#3987e5' },
};
const sectionCls = 'scroll-mt-4 space-y-3 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 p-3 sm:p-4';

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

function Bridge({ d }: { d: WalkforwardResponse }) {
  const link = 'inline-flex min-h-9 items-center gap-1.5 rounded-md border border-zinc-600 bg-zinc-800 px-3 text-xs font-medium text-zinc-50 hover:bg-zinc-700';
  return (
    <div className="space-y-2 text-xs leading-relaxed text-zinc-200">
      <div className="flex flex-wrap gap-2">
        <a className={link} href="/api/walkforward/export?format=csv" download>
          <Download className="h-3.5 w-3.5" aria-hidden /> ดาวน์โหลด CSV ({d.bridge.rows.toLocaleString()} แถว · {d.bridge.symbols} หุ้น · {d.bridge.signals} สัญญาณ)
        </a>
        <a className={link} href="/api/walkforward/export?format=py" download>
          <Download className="h-3.5 w-3.5" aria-hidden /> ดาวน์โหลดสคริปต์ PyBroker (.py)
        </a>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-200">
        {`pip install -U lib-pybroker==${d.bridge.pybroker}\npython oqe_pybroker.py oqe_pybroker.csv`}
      </pre>
      <ul className="list-disc space-y-0.5 pl-5 text-[11px] text-zinc-300">
        <li>สคริปต์เล่นซ้ำสัญญาณ 5 ด่านด้วยกติกาการส่งคำสั่งชุดเดียวกับโบรกเกอร์กระดาษ (limit ที่ขอบบนโซน · ซื้อราคาเปิดสำหรับ momentum · stop/เป้า/วันถือที่ล็อก · ค่าธรรมเนียม) แล้วรัน Strategy.optimize() แบบ walk-forward ของ PyBroker เอง</li>
        <li>ทดสอบแล้วกับ lib-pybroker {d.bridge.pybroker} บนข้อมูลสาธิต: ไม้ปิดและอัตราชนะสุทธิเท่ากับการเล่นซ้ำของ OQE · ไม้ส่วนใหญ่ตรงกันทุกช่อง</li>
        <li>ความต่างที่รู้: วันได้ของที่ราคาลงถึง stop (OQE ออกวันนั้น · PyBroker ตรวจวันถัดไป) · เปิดกระโดดเหนือเป้า (OQE ออกที่ราคาเปิด · PyBroker ที่ราคาเป้า) · return_pct ของ PyBroker ยังไม่หักค่าธรรมเนียม (สคริปต์หักให้)</li>
        <li>หน้าต่างของ PyBroker แบ่งตามเวลาเท่า ๆ กัน — เมื่อสัญญาณกระจุก บางหน้าต่าง train มีไม้ไม่พอ สคริปต์จะบอกว่าหน้าต่างไหน “ไม่ได้จูน”</li>
      </ul>
    </div>
  );
}

export function WalkforwardView() {
  const q = useApi<WalkforwardResponse>('/api/walkforward');
  const d = q.data;
  const [shown, setShown] = useState<OptimizerKey>('locked');
  const synthetic = d ? d.data.kind !== 'real' : false;
  const level = d ? LEVEL[d.verdict.level] : null;
  const locked = d?.optimizers.find((o) => o.key === 'locked');
  const maxExp = d?.optimizers.find((o) => o.key === 'maxExp');
  const best = d ? [...d.optimizers].filter((o) => o.expectancy).sort((a, b) => b.expectancy!.mean - a.expectancy!.mean)[0] : undefined;
  const worse = d ? d.optimizers.filter((o) => o.excess && o.excess.hi < 0).length : 0;
  const shownOpt = d?.optimizers.find((o) => o.key === shown);

  return (
    <div className="@container min-w-0 space-y-4">
      <header>
        <h2 className="text-lg font-bold text-zinc-50">ทดสอบเดินหน้า (Walk-forward) – หุ้นไทย</h2>
        <p className="text-xs text-zinc-400">
          {d
            ? `แนวคิดจาก PyBroker: เลือกกติกาออกบน train แล้ววัดบน test ที่ไม่เคยเห็น · ${d.window.folds} หน้าต่าง · ${d.window.signals} สัญญาณ · ${thDate(d.window.start)} – ${thDate(d.window.end)}`
            : 'แนวคิดจาก PyBroker: เลือกกติกาออกบน train แล้ววัดบน test ที่ไม่เคยเห็น เทียบการสุ่มเข้า พร้อมตารางไม้ MAE/MFE และไฟล์ส่งต่อให้ PyBroker'}
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
          {synthetic && ' — ตัวเลขในหน้านี้มาจากข้อมูลจำลอง ใช้ซ้อมวิธีทดสอบเท่านั้น ไม่ใช่ผลของตลาดหุ้นไทยจริง'} · ผลสุทธิหลังค่าธรรมเนียมไป-กลับ {d.costPct}% · ไม่ใช่คำแนะนำการลงทุน
        </p>
      )}

      {q.error ? (
        <p role="alert" className="text-sm text-rose-300">
          โหลดการทดสอบเดินหน้าไม่สำเร็จ: {q.error}
        </p>
      ) : !d || !level ? (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังเดินหน้าทีละหน้าต่าง (เลือกบน train · วัดบน test · เทียบการสุ่ม)…
        </p>
      ) : (
        <>
          <section aria-labelledby="wf-verdict-h" className={cn('rounded-xl border p-3', level.box)}>
            <p className="flex flex-wrap items-center gap-2">
              <StatusBadge text={level.label} color={level.color} />
              <span className="text-[11px] text-zinc-300">คำตัดสินจากไม้นอกตัวอย่างเท่านั้น</span>
            </p>
            <h3 id="wf-verdict-h" className="mt-1 text-base font-semibold text-zinc-50">
              {d.verdict.title}
            </h3>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-zinc-200">
              {d.verdict.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ol>
          </section>

          <dl className="grid grid-cols-2 gap-2 @min-[700px]:grid-cols-3 @min-[1100px]:grid-cols-6">
            <Tile label="หน้าต่าง test" value={String(d.window.folds)} sub={d.folds.length ? `${thDate(d.folds[0].testStart)} – ${thDate(d.folds[d.folds.length - 1].testEnd)}` : '—'} />
            <Tile
              label="กติกาที่ล็อก (นอกตัวอย่าง)"
              value={locked?.expectancy ? `${signedFmt(locked.expectancy.mean)}%` : '—'}
              sub={locked ? `${locked.trades} ไม้ · ชนะ ${locked.winRate ?? '—'}%` : '—'}
            />
            <Tile label="ดีที่สุดนอกตัวอย่าง" value={best?.expectancy ? `${signedFmt(best.expectancy.mean)}%` : '—'} sub={best ? best.label : '—'} />
            <Tile label="WFE ของการจูนกำไรสูงสุด" value={maxExp?.wfe === null || maxExp?.wfe === undefined ? '—' : maxExp.wfe.toFixed(2).replace('-', '−')} sub="ใกล้ 1 = ส่งต่อได้ · ต่ำ = จูนติดอดีต" />
            <Tile label="แย่กว่าการสุ่มอย่างมีนัย" value={`${worse}/${d.optimizers.length}`} sub="วิธี (CI ของส่วนต่างต่ำกว่า 0 ทั้งช่วง)" />
            <Tile label="E-ratio สัญญาณ / สุ่ม" value={`${d.maeMfe.signal.eRatio ?? '—'} / ${d.maeMfe.random.eRatio ?? '—'}`} sub={`MFE ÷ MAE ถือ ${d.maeMfe.horizon} วัน`} />
          </dl>

          <Section
            id="wf-folds"
            title="หน้าต่าง train → test (แบบ walkforward ของ PyBroker)"
            lead={`train เริ่มต้น = ${Math.round(d.window.initialShare * 100)}% แรกของสัญญาณ · แต่ละหน้าต่างเลือกกติกาออกจากสัญญาณก่อนหน้าเท่านั้น แล้วใช้กับ test ถัดไป · ไม้ปิดใน train ต้อง ≥ ${d.window.minTrain}`}
          >
            <FoldDiagram folds={d.folds} start={d.window.start} end={d.window.end} embargo={d.window.embargo} />
          </Section>

          <Section
            id="wf-results"
            title="4 วิธีเลือกกติกาออก — ผลนอกตัวอย่าง"
            lead={`กติกาที่ล็อก: ${d.locked.label} · วิธีอื่นค้นหาจาก ${d.window.configs} แบบ หรือคำนวณจาก MAE/MFE ใน train · ทุกไม้เทียบการสุ่มเข้า ${d.window.randomPerSignal} วันต่อสัญญาณในหน้าต่างเดียวกัน`}
          >
            <EquityChart curves={d.curves} />
            <OptimizerForests optimizers={d.optimizers} />
            <OptimizerTable optimizers={d.optimizers} />
          </Section>

          <Section id="wf-picks" title="แต่ละหน้าต่างเลือกอะไร" lead="ค่าที่ดีที่สุดใน train (ในตัวอย่าง) เทียบผลจริงใน test ถัดไป — ช่องว่างระหว่างสองค่านี้คือราคาของการจูนติดอดีต">
            <FoldTable folds={d.folds} optimizers={d.optimizers} />
          </Section>

          <Section
            id="wf-mae"
            title="MAE / MFE — ราคาวิ่งสวน/วิ่งตามหลังสัญญาณ"
            lead="ต้นแบบเสนอ stop = MAE เปอร์เซ็นไทล์ 95 และเป้า = MFE เปอร์เซ็นไทล์ 75 · ที่นี่วัดจากการเดินราคาแบบไม่มีเป้า (MAE ของไม้ที่มี stop อยู่แล้วถูกตัดที่ stop) และเทียบกับวันสุ่ม — ถ้าสัญญาณไม่ต่างจากวันสุ่ม การตั้ง stop/เป้าจาก MAE/MFE ไม่ได้สร้าง edge"
          >
            <div className="grid gap-3 @min-[1100px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <MaeMfeScatter m={d.maeMfe} />
              <MaeMfeTable m={d.maeMfe} />
            </div>
          </Section>

          <Section id="wf-trades" title="ตารางไม้นอกตัวอย่าง (แบบ result.trades ของ PyBroker)" lead="ทุกไม้ที่ปิดแล้วในหน้าต่าง test เรียงตามวันออก · MAE/MFE เป็นหน่วย R ของ stop ที่ใช้จริง">
            <div role="group" aria-label="วิธีที่แสดงในตาราง" className="flex flex-wrap gap-1.5">
              {d.optimizers.map((o) => (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={shown === o.key}
                  onClick={() => setShown(o.key)}
                  className={cn(
                    'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs',
                    shown === o.key ? 'border-zinc-400 bg-zinc-800 font-semibold text-zinc-50' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800',
                  )}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: OPT_COLOR[o.key] }} aria-hidden />
                  {o.label} ({o.trades})
                </button>
              ))}
            </div>
            <TradesTable trades={d.trades.filter((t) => t.optimizer === shown)} label={shownOpt?.label ?? shown} />
          </Section>

          <Section id="wf-traps" title="กับดัก 9 ข้อก่อนเชื่อผล backtest — สถานะใน OQE" lead="6 ข้อจากข้อความต้นแบบ + 3 ข้อที่ต้นแบบไม่ได้พูดถึง (การจูนคือการทดสอบหลายแบบ · MAE ถูกตัดที่ stop · ต้นทุนการซื้อขาย)">
            <ul className="grid gap-2 @min-[900px]:grid-cols-2">
              {d.traps.map((t) => {
                const st = TRAP[t.status];
                const Icon = st.icon;
                return (
                  <li key={t.key} className="flex min-w-0 flex-col gap-1 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-xs font-semibold text-zinc-100">{t.title}</h4>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-100">
                        <Icon className="h-3 w-3" style={{ color: st.color }} aria-hidden />
                        {st.label}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-300">{t.detail}</p>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="wf-bridge" title="ส่งต่อไป PyBroker — ตรวจผลซ้ำด้วยเครื่องมืออิสระ" lead="ใช้ใน Colab หรือเครื่องของคุณ: ไฟล์ข้อมูล + สคริปต์ที่ตั้งค่าตามกติกาที่ล็อกอยู่ตอนนี้">
            <Bridge d={d} />
          </Section>

          <Section id="wf-method" title="วิธีคิด (ตั้งไว้ก่อนดูผล)">
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
