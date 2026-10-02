'use client';

/**
 * กราฟของหน้า "ทดสอบเดินหน้า" — แผนภาพหน้าต่าง train → test แบบ PyBroker · ผลรวมสะสมนอกตัวอย่าง · forest plot
 * · แผนภาพกระจาย MAE/MFE · ตารางไม้แบบ result.trades
 * สี: แต่ละวิธีมีสีประจำตัว (ช่อง categorical ลำดับคงที่) · การสุ่ม = เทาเส้นประ · train = ส้ม · test = น้ำเงิน (ตามภาพต้นแบบ)
 */

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ForestPlot, pFmt, signedFmt, StatusBadge } from '@/components/atlas/atlas-charts';
import { AXIS, BASELINE, CATEGORICAL, ChartFrame, DIV_NEG, DIV_POS, GRID, niceTicks, SURFACE, TipBox, type LegendItem, type TipProps } from '@/components/charts/chart-kit';
import { thDate, thMonthTick } from '@/lib/flows/format';
import { cn } from '@/lib/utils';
import type { OptimizerKey, WalkforwardResponse, WfFold, WfOptimizer, WfTrade } from '@/lib/walkforward/types';

const TRAIN = CATEGORICAL[1];
const TEST = CATEGORICAL[0];
const RANDOM = '#a1a1aa';
const CONTEXT = '#71717a';
const POS = DIV_POS[3];
const NEG = DIV_NEG[3];
export const OPT_COLOR: Record<OptimizerKey | 'random', string> = {
  locked: '#d4d4d8',
  maxExp: CATEGORICAL[1],
  maxWin: CATEGORICAL[2],
  maeMfe: CATEGORICAL[4],
  random: RANDOM,
};
const figureCls = 'rounded-xl border border-zinc-800 bg-zinc-900/40 p-3';
const captionCls = 'text-[11px] font-semibold uppercase tracking-wider text-zinc-300';
const pct = (v: number | null, d = 1) => (v === null ? '—' : `${v.toFixed(d)}%`);
const pEq = (p: number | null) => (p === null ? 'p = —' : p < 0.001 ? 'p < 0.001' : `p = ${p.toFixed(3)}`);
const ms = (d: string) => new Date(`${d}T00:00:00Z`).getTime();

// ─────────────────────────── หน้าต่าง train → test ───────────────────────────

export function FoldDiagram({ folds, start, end, embargo }: { folds: WfFold[]; start: string; end: string; embargo: number }) {
  const a = ms(start);
  const b = ms(end);
  const x = (d: string) => Math.max(0, Math.min(100, ((ms(d) - a) / Math.max(1, b - a)) * 100));
  // tick รายไตรมาส
  const ticks: string[] = [];
  const s = new Date(a);
  for (let y = s.getUTCFullYear(), m = Math.ceil((s.getUTCMonth() + 1) / 3) * 3; ; m += 3) {
    const d = new Date(Date.UTC(y + Math.floor(m / 12), m % 12, 1));
    if (d.getTime() > b) break;
    if (d.getTime() >= a) ticks.push(d.toISOString().slice(0, 10));
  }
  return (
    <figure className={cn('@container', figureCls)}>
      <figcaption className={cn('mb-2', captionCls)}>หน้าต่าง walk-forward: train (ส้ม) → ช่วงตัดรอยต่อ → test (น้ำเงิน)</figcaption>
      <ol className="space-y-2">
        {folds.map((f) => (
          <li key={f.index} className="grid items-center gap-x-3 gap-y-1 @min-[720px]:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
            <div className="min-w-0 text-[11px] leading-snug">
              <p className="font-semibold text-zinc-100">หน้าต่าง {f.index}</p>
              <p className="text-zinc-400">
                train {thDate(f.trainStart)} – {thDate(f.trainEnd)} ({f.trainSignals} สัญญาณ)
              </p>
              <p className="text-zinc-400">
                test {thDate(f.testStart)} – {thDate(f.testEnd)} ({f.testSignals} สัญญาณ)
              </p>
            </div>
            <div className="relative h-6 rounded-sm bg-zinc-800/60" aria-hidden>
              <span className="absolute inset-y-0.5 rounded-sm" style={{ left: `${x(f.trainStart)}%`, width: `${Math.max(0.5, x(f.trainEnd) - x(f.trainStart))}%`, background: TRAIN }} />
              <span
                className="absolute inset-y-0.5"
                style={{ left: `${x(f.trainEnd)}%`, width: `${Math.max(0, x(f.testStart) - x(f.trainEnd))}%`, background: 'repeating-linear-gradient(135deg, #52525b 0 3px, transparent 3px 6px)' }}
              />
              <span className="absolute inset-y-0.5 rounded-sm" style={{ left: `${x(f.testStart)}%`, width: `${Math.max(0.6, x(f.testEnd) - x(f.testStart))}%`, background: TEST }} />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-1 grid gap-x-3 @min-[720px]:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]" aria-hidden>
        <span className="hidden @min-[720px]:block" />
        <div className="relative h-4 border-t border-zinc-700">
          {ticks.map((t) => (
            <span key={t} className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-zinc-400" style={{ left: `${x(t)}%` }}>
              {thMonthTick(t)}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-400">
        train เริ่มจากต้นข้อมูลเสมอ (anchored) และหยุดก่อน test {embargo} วันทำการ (ลาย) ให้ไม้ของ train ปิดก่อน test เริ่ม · หน้าต่างตัดตามจำนวนสัญญาณ เพราะสัญญาณกระจุกตามสภาวะตลาด
      </p>
    </figure>
  );
}

// ─────────────────────────── ผลรวมสะสมนอกตัวอย่าง ───────────────────────────

type EqRow = { date: string } & Partial<Record<OptimizerKey | 'random', number>>;

export function EquityChart({ curves }: { curves: WalkforwardResponse['curves'] }) {
  const dates = [...new Set(curves.flatMap((c) => c.points.map((p) => p.date)))].sort();
  const last: Partial<Record<string, number>> = {};
  const idx: Record<string, number> = {};
  const rows: EqRow[] = dates.map((d) => {
    const row: EqRow = { date: d };
    for (const c of curves) {
      let i = idx[c.key] ?? 0;
      while (i < c.points.length && c.points[i].date <= d) last[c.key] = c.points[i++].cum;
      idx[c.key] = i;
      row[c.key] = last[c.key] ?? 0;
    }
    return row;
  });
  const legend: LegendItem[] = curves.map((c) => ({ label: c.label, color: OPT_COLOR[c.key], dashed: c.key === 'random', value: `${signedFmt(c.points.at(-1)?.cum ?? 0, 1)}` }));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<EqRow>;
    const r = payload?.[0]?.payload;
    if (!active || !r) return null;
    return <TipBox title={thDate(r.date)} rows={curves.map((c) => ({ label: c.label, value: `${signedFmt(r[c.key] ?? 0, 1)} จุด`, color: OPT_COLOR[c.key] }))} />;
  };
  // ป้ายแกนเวลาเฉพาะวันแรกของแต่ละเดือนที่มีข้อมูล (แกนแบบหมวดหมู่ซ้ำชื่อเดือนถ้าปล่อยให้เลือกเอง)
  const monthTicks = rows.filter((r, i) => i === 0 || r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7)).map((r) => r.date);
  const vals = rows.flatMap((r) => curves.map((c) => r[c.key] ?? 0));
  const lo = Math.min(0, ...vals);
  const hi = Math.max(0, ...vals);
  const ticks = niceTicks(lo, hi, 5);
  return (
    <ChartFrame
      title="ผลรวมสุทธิสะสมนอกตัวอย่าง (จุด % · ไม้ละหน่วยเท่ากัน)"
      height={280}
      legend={legend}
      label={`ผลรวมสุทธิสะสมนอกตัวอย่างของแต่ละวิธี: ${curves.map((c) => `${c.label} ${signedFmt(c.points.at(-1)?.cum ?? 0, 1)} จุด`).join(' · ')}`}
      note="เส้นเทาประ = สุ่มเข้าในหน้าต่าง test เดียวกันด้วยกติกาที่ล็อก (เฉลี่ยต่อสัญญาณ) · ขึ้น = กำไรสุทธิหลังค่าธรรมเนียม · ไม่ใช่ % ของพอร์ต"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tick={AXIS} ticks={monthTicks} interval={0} tickFormatter={thMonthTick} stroke={BASELINE} />
          <YAxis tick={AXIS} width={40} stroke={BASELINE} domain={[ticks[0] ?? lo, ticks[ticks.length - 1] ?? hi]} ticks={ticks} tickFormatter={(v: number) => (v < 0 ? `−${Math.abs(v)}` : String(v))} />
          <ReferenceLine y={0} stroke={BASELINE} />
          <Tooltip content={tip} isAnimationActive={false} />
          {curves.map((c) => (
            <Line
              key={c.key}
              dataKey={c.key}
              type="stepAfter"
              stroke={OPT_COLOR[c.key]}
              strokeWidth={c.key === 'random' ? 1.5 : 2}
              strokeDasharray={c.key === 'random' ? '5 3' : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function OptimizerForests({ optimizers }: { optimizers: WfOptimizer[] }) {
  const exp = optimizers.filter((o) => o.expectancy);
  const ex = optimizers.filter((o) => o.excess);
  return (
    <div className="grid gap-3 @min-[1100px]:grid-cols-2">
      <ForestPlot
        title="ผลสุทธิต่อไม้นอกตัวอย่าง (%) · CI 95%"
        rows={exp.map((o) => ({
          key: o.key,
          label: o.label,
          ci: o.expectancy!,
          color: OPT_COLOR[o.key],
          hollow: o.key === 'locked',
          sub: `${o.trades} ไม้ · ชนะ ${pct(o.winRate)} · สุ่มเข้า ${o.random.expectancy === null ? '—' : `${signedFmt(o.random.expectancy)}%`}`,
        }))}
        refNote="เส้นตั้ง = เท่าทุนหลังค่าธรรมเนียม · ช่วงที่คร่อมเส้น = ยังไม่รู้ว่ากำไรหรือขาดทุน"
      />
      <ForestPlot
        title="ผลต่อไม้เหนือการสุ่มเข้า (จุด %) · CI 95%"
        rows={ex.map((o) => ({
          key: o.key,
          label: o.label,
          ci: o.excess!,
          color: o.excess!.lo > 0 ? POS : o.excess!.hi < 0 ? NEG : '#d4d4d8',
          badge: <StatusBadge text={o.excess!.lo > 0 ? 'เหนือการสุ่ม' : o.excess!.hi < 0 ? 'แย่กว่าการสุ่ม' : 'ยังสรุปไม่ได้'} color={o.excess!.lo > 0 ? POS : o.excess!.hi < 0 ? NEG : CONTEXT} />,
          sub: `${pEq(o.pExcess)} · สุ่มเข้าชนะ ${pct(o.random.winRate)}`,
        }))}
        refNote="เส้นตั้ง = เท่าการสุ่มเข้าในหน้าต่างเดียวกันด้วยกติกาออกเดียวกัน (ไม่มีฝีมือ)"
      />
    </div>
  );
}

export function OptimizerTable({ optimizers }: { optimizers: WfOptimizer[] }) {
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>สรุปนอกตัวอย่างต่อวิธี (แบบ metrics + bootstrap ของ PyBroker)</figcaption>
      <div tabIndex={0} role="region" aria-label="ตารางสรุปนอกตัวอย่างของแต่ละวิธีเลือกกติกาออก" className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 font-medium">วิธี</th>
              <th className="px-2 font-medium">ไม้</th>
              <th className="px-2 font-medium">ชนะ [Wilson]</th>
              <th className="px-2 font-medium">สุ่มชนะ</th>
              <th className="px-2 font-medium">ผลรวม (จุด)</th>
              <th className="px-2 font-medium">profit factor [bootstrap]</th>
              <th className="px-2 font-medium">drawdown / 95%</th>
              <th className="px-2 font-medium">ในตัวอย่าง → นอก (%/ไม้)</th>
              <th className="px-2 font-medium">WFE</th>
              <th className="pl-2 font-medium">เทียบกติกาที่ล็อก (จุด/สัญญาณ)</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-100">
            {optimizers.map((o) => (
              <tr key={o.key} className="border-b border-zinc-800/60">
                <td className="py-1.5 pr-2 font-sans text-zinc-200">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: OPT_COLOR[o.key] }} aria-hidden />
                  {o.label}
                </td>
                <td className="px-2">{o.trades}</td>
                <td className="px-2">
                  {pct(o.winRate)} <span className="text-zinc-400">{o.wilson ? `[${o.wilson.lo.toFixed(0)}, ${o.wilson.hi.toFixed(0)}]` : ''}</span>
                </td>
                <td className="px-2">{pct(o.random.winRate)}</td>
                <td className="px-2">{signedFmt(o.sumPct, 1)}</td>
                <td className="px-2">
                  {o.profitFactor === null ? '—' : o.profitFactor.toFixed(2)} <span className="text-zinc-400">{o.pfCI ? `[${o.pfCI.lo.toFixed(2)}, ${o.pfCI.hi.toFixed(2)}]` : ''}</span>
                </td>
                <td className="px-2">
                  {o.maxDD === null ? '—' : o.maxDD.toFixed(1)} / {o.maxDD95 === null ? '—' : o.maxDD95.toFixed(1)}
                </td>
                <td className="px-2">
                  {o.isExpectancy === null ? '—' : signedFmt(o.isExpectancy)} → {o.expectancy ? signedFmt(o.expectancy.mean) : '—'}
                </td>
                <td className="px-2">{o.wfe === null ? '—' : o.wfe.toFixed(2).replace('-', '−')}</td>
                <td className="pl-2">
                  {o.vsLocked ? `${signedFmt(o.vsLocked.mean)} [${signedFmt(o.vsLocked.lo)}, ${signedFmt(o.vsLocked.hi)}] · p หลังปรับ ${o.pVsLockedAdj === null ? '—' : pFmt(o.pVsLockedAdj)}` : 'ฐานเทียบ'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-zinc-400">
        drawdown = ลดลงสูงสุดของผลรวมต่อไม้ตามลำดับเวลาจริง · 95% = drawdown ที่เกิดได้เมื่อสลับลำดับสัปดาห์ (bootstrap 1,000 รอบ) · WFE = ผลนอกตัวอย่าง ÷ ผลในตัวอย่าง
      </p>
    </figure>
  );
}

export function FoldTable({ folds, optimizers }: { folds: WfFold[]; optimizers: WfOptimizer[] }) {
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>แต่ละหน้าต่างเลือกอะไร และได้ผลเท่าไร</figcaption>
      <div tabIndex={0} role="region" aria-label="ตารางกติกาออกที่แต่ละวิธีเลือกในแต่ละหน้าต่าง" className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[11px]">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 font-medium">หน้าต่าง</th>
              <th className="px-2 font-medium">วิธี</th>
              <th className="px-2 font-medium">กติกาออกที่เลือก (จาก train)</th>
              <th className="px-2 font-medium">train: ไม้ · ชนะ · %/ไม้</th>
              <th className="px-2 font-medium">test: ไม้ · ชนะ · %/ไม้</th>
              <th className="pl-2 font-medium">สุ่มเข้า: ชนะ · %/ไม้</th>
            </tr>
          </thead>
          <tbody className="text-zinc-100">
            {folds.flatMap((f) =>
              optimizers.map((o, j) => {
                const p = f.picks[o.key];
                return (
                  <tr key={`${f.index}-${o.key}`} className={cn('border-b border-zinc-800/60', j === optimizers.length - 1 && 'border-zinc-700')}>
                    <td className="py-1.5 pr-2 font-mono text-zinc-300">{j === 0 ? `${f.index} · ${thDate(f.testStart)}` : ''}</td>
                    <td className="px-2 text-zinc-200">{o.label}</td>
                    <td className="px-2 text-zinc-200">
                      {p.label} {p.fallback && <StatusBadge text="ไม้ไม่พอ → ใช้กติกาที่ล็อก" color={CONTEXT} />}
                    </td>
                    <td className="px-2 font-mono">
                      {p.isTrades} · {pct(p.isWin, 0)} · {p.isExp === null ? '—' : signedFmt(p.isExp)}
                    </td>
                    <td className="px-2 font-mono">
                      {p.oosTrades} · {pct(p.oosWin, 0)} · {p.oosExp === null ? '—' : signedFmt(p.oosExp)}
                    </td>
                    <td className="pl-2 font-mono">
                      {pct(p.randWin, 0)} · {p.randExp === null ? '—' : signedFmt(p.randExp)}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

// ─────────────────────────── MAE / MFE ───────────────────────────

type MPoint = { mae: number; mfe: number; win: boolean };

function mDot(fill: string) {
  return function Dot(props: unknown) {
    const { cx = 0, cy = 0 } = props as { cx?: number; cy?: number };
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="transparent" />
        <circle cx={cx} cy={cy} r={3.2} fill={fill} stroke={SURFACE} strokeWidth={0.75} />
      </g>
    );
  };
}

export function MaeMfeScatter({ m }: { m: WalkforwardResponse['maeMfe'] }) {
  const wins = m.points.filter((p) => p.win);
  const losses = m.points.filter((p) => !p.win);
  const xMax = Math.max(1, ...m.points.map((p) => p.mae));
  const yMax = Math.max(1, ...m.points.map((p) => p.mfe));
  const tip = (props: unknown) => {
    const { active, payload } = props as TipProps<MPoint>;
    const p = payload?.[0]?.payload;
    if (!active || !p || p.mae === undefined) return null;
    return (
      <TipBox
        title={p.win ? 'ปิดเป็นกำไรสุทธิ' : 'ปิดเป็นขาดทุนสุทธิ'}
        rows={[
          { label: 'MAE (วิ่งสวน)', value: `${p.mae.toFixed(2)}R` },
          { label: 'MFE (วิ่งตาม)', value: `${p.mfe.toFixed(2)}R` },
        ]}
      />
    );
  };
  const legend: LegendItem[] = [
    { label: `ปิดกำไร (${wins.length})`, color: TEST, shape: 'dot' },
    { label: `ปิดขาดทุน (${losses.length})`, color: TRAIN, shape: 'dot' },
  ];
  return (
    <ChartFrame
      title={`MAE × MFE ของทุกสัญญาณ (ไม่มีเป้า · stop ${m.wideStop}× · ถือ ${m.horizon} วัน · หน่วย R ของแผน)`}
      height={320}
      legend={legend}
      label={`แผนภาพกระจาย MAE กับ MFE ของ ${m.points.length} สัญญาณ · MAE เปอร์เซ็นไทล์ 95 = ${m.signal.maeP95}R · MFE เปอร์เซ็นไทล์ 75 = ${m.signal.mfeP75}R · E-ratio สัญญาณ ${m.signal.eRatio} การสุ่ม ${m.random.eRatio}`}
      note={`เส้นประตั้ง = MAE เปอร์เซ็นไทล์ 95 (${m.signal.maeP95}R → stop ตามกติกาต้นแบบ) · เส้นประนอน = MFE เปอร์เซ็นไทล์ 75 (${m.signal.mfeP75}R → เป้า) · ใช้ข้อมูลทั้งหน้าต่างเพื่ออธิบายเท่านั้น — การวัดผลนอกตัวอย่างคำนวณจาก train ของแต่ละหน้าต่าง`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 14, left: 0, bottom: 4 }}>
          <CartesianGrid stroke={GRID} />
          <XAxis type="number" dataKey="mae" name="MAE" tick={AXIS} stroke={BASELINE} domain={[0, Math.ceil(xMax)]} ticks={niceTicks(0, Math.ceil(xMax), 5)} tickFormatter={(v: number) => `${v}R`} />
          <YAxis type="number" dataKey="mfe" name="MFE" tick={AXIS} width={36} stroke={BASELINE} domain={[0, Math.ceil(yMax)]} ticks={niceTicks(0, Math.ceil(yMax), 5)} tickFormatter={(v: number) => `${v}R`} />
          {m.signal.maeP95 !== null && <ReferenceLine x={m.signal.maeP95} stroke="#f4f4f5" strokeDasharray="4 3" />}
          {m.signal.mfeP75 !== null && <ReferenceLine y={m.signal.mfeP75} stroke="#f4f4f5" strokeDasharray="4 3" />}
          <Tooltip content={tip} cursor={false} isAnimationActive={false} />
          <Scatter data={losses} isAnimationActive={false} shape={mDot(TRAIN)} />
          <Scatter data={wins} isAnimationActive={false} shape={mDot(TEST)} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function MaeMfeTable({ m }: { m: WalkforwardResponse['maeMfe'] }) {
  const row = (label: string, q: WalkforwardResponse['maeMfe']['signal']) => (
    <tr className="border-b border-zinc-800/60">
      <td className="py-1.5 pr-2 font-sans text-zinc-200">{label}</td>
      <td className="px-2">{q.n}</td>
      <td className="px-2">{q.maeP50 ?? '—'} / {q.maeP75 ?? '—'} / {q.maeP95 ?? '—'}</td>
      <td className="px-2">{q.mfeP50 ?? '—'} / {q.mfeP75 ?? '—'} / {q.mfeP95 ?? '—'}</td>
      <td className="pl-2">{q.eRatio ?? '—'}</td>
    </tr>
  );
  return (
    <figure className={figureCls}>
      <figcaption className={cn('mb-2', captionCls)}>สัญญาณเทียบการสุ่มเข้า (หน่วย R ของแผน)</figcaption>
      <div tabIndex={0} role="region" aria-label="ตารางเปอร์เซ็นไทล์ MAE MFE ของสัญญาณเทียบการสุ่ม" className="overflow-x-auto">
        <table className="w-full min-w-[380px] text-left text-[11px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="text-zinc-400">
            <tr className="border-b border-zinc-800">
              <th className="py-1.5 pr-2 font-medium" />
              <th className="px-2 font-medium">ไม้</th>
              <th className="px-2 font-medium">MAE p50/75/95</th>
              <th className="px-2 font-medium">MFE p50/75/95</th>
              <th className="pl-2 font-medium">E-ratio</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-100">
            {row('สัญญาณ', m.signal)}
            {row('สุ่มเข้า', m.random)}
          </tbody>
        </table>
      </div>
      <ul className="mt-2 space-y-0.5 text-[11px] text-zinc-300">
        {m.byHorizon.map((h) => (
          <li key={h.horizon} className="flex flex-wrap justify-between gap-x-3">
            <span>E-ratio ถือ {h.horizon} วัน</span>
            <span className="font-mono">
              สัญญาณ {h.signal ?? '—'} · สุ่ม {h.random ?? '—'}{' '}
              {h.signal !== null && h.random !== null && <StatusBadge text={h.signal > h.random ? 'สัญญาณดีกว่า' : 'ไม่ดีกว่าการสุ่ม'} color={h.signal > h.random ? POS : CONTEXT} />}
            </span>
          </li>
        ))}
      </ul>
      {m.fullWindowRule && (
        <p className="mt-2 text-[11px] leading-snug text-zinc-400">
          กติกาต้นแบบจากทั้งหน้าต่าง: stop {m.fullWindowRule.stopMult}× · เป้า {m.fullWindowRule.targetR}R (ถ้าใช้ตัวเลขนี้ย้อนทดสอบบนข้อมูลเดิม = จูนติดอดีต — ผลที่เชื่อได้คือแถว “SL = MAE p95 · TP = MFE p75” ในตารางนอกตัวอย่าง)
        </p>
      )}
    </figure>
  );
}

// ─────────────────────────── ตารางไม้ ───────────────────────────

const EXIT_TH: Record<WfTrade['exitKind'], string> = { target: 'ถึงเป้า', stop: 'stop', time: 'ครบวัน', trail: 'หลุด EMA' };

export function TradesTable({ trades, label }: { trades: WfTrade[]; label: string }) {
  return (
    <div tabIndex={0} role="region" aria-label={`ตารางไม้นอกตัวอย่างของ ${label}`} className="max-h-[28rem] overflow-auto rounded-xl border border-zinc-800">
      <table className="w-full min-w-[1080px] text-left text-[11px]">
        <thead className="sticky top-0 bg-zinc-950 text-zinc-400">
          <tr className="border-b border-zinc-800">
            {['#', 'หุ้น', 'ชนิด', 'หน้าต่าง', 'เข้า', 'ออก', 'ราคาเข้า', 'ราคาออก', 'สุทธิ %', 'R สุทธิ', 'สะสม', 'แท่ง', '%/แท่ง', 'ออกเพราะ', 'MAE R', 'MFE R'].map((h) => (
              <th key={h} className="px-2 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono text-zinc-100">
          {trades.map((t, i) => (
            <tr key={`${t.symbol}-${t.signalDate}-${i}`} className="border-b border-zinc-800/60">
              <td className="px-2 py-1 text-zinc-400">{i + 1}</td>
              <td className="px-2 font-sans">{t.symbol}</td>
              <td className="px-2 font-sans text-zinc-300">{t.kind}</td>
              <td className="px-2">{t.fold}</td>
              <td className="px-2">{t.entryDate}</td>
              <td className="px-2">{t.exitDate}</td>
              <td className="px-2">{t.entry}</td>
              <td className="px-2">{t.exit}</td>
              <td className={cn('px-2', t.retNetPct > 0 ? 'text-sky-300' : 'text-orange-300')}>{signedFmt(t.retNetPct)}</td>
              <td className="px-2">{signedFmt(t.rNet)}</td>
              <td className="px-2">{signedFmt(t.cumPct, 1)}</td>
              <td className="px-2">{t.bars}</td>
              <td className="px-2">{signedFmt(t.pctPerBar, 3)}</td>
              <td className="px-2 font-sans">{EXIT_TH[t.exitKind]}</td>
              <td className="px-2">{t.maeR ?? '—'}</td>
              <td className="px-2">{t.mfeR ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
