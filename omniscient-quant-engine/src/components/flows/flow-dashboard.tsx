'use client';

/**
 * แดชบอร์ดเงินไหลนักลงทุน (หุ้นไทยเท่านั้น) — โครงเดียวกับแดชบอร์ด COT เดิม:
 *  ซ้าย: SET ทั้งตลาด + หุ้นรายตัวแยกหมวด · กลาง-ซ้าย: ราคา / สุทธิสะสม / สุทธิรายสัปดาห์ / (short sale) / มูลค่า / Flow Index
 *  กลาง-ขวา: ตารางซื้อ-ขาย-สุทธิของสัปดาห์ที่ครบ + สัดส่วนมูลค่า + เงินไหลสุทธิตามช่วงเวลา
 *  ล่าง: สุทธิสัปดาห์ · มาตรวัด Flow Index 6/36 เดือน · สุทธิตั้งแต่ต้นปี
 */

import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import { thDate, thSpan } from '@/lib/flows/format';
import {
  FLOW_LABEL,
  FLOW_SHORT,
  type FlowDashboard,
  type FlowEntitiesResponse,
  type FlowGroup,
  type FlowRange,
} from '@/lib/flows/types';
import { FLOW_COLORS, FlowIndexChart, IndexGauge, LinesChart, Meter, NetBars, PriceChart, ShareBars, fmtMb, fmtSignedMb, type LineSpec } from './flow-charts';

const RANGES: FlowRange[] = ['6m', '1y', '2y', '3y'];
const MARKET_ID = 'SET';
const DEFAULT_INDEX: Record<'market' | 'stock', FlowGroup> = { market: 'foreign', stock: 'nvdr' };

const SECTOR_TH: Record<string, string> = {
  Renewable: 'พลังงานหมุนเวียน',
  Energy: 'พลังงาน',
  Banking: 'ธนาคาร',
  Consumer: 'พาณิชย์ & อุปโภค',
  Tourism: 'ท่องเที่ยว',
  Digital: 'สื่อสาร & ดิจิทัล',
};
const sectorLabel = (s: string) => SECTOR_TH[s] ?? s;


function Change({ v }: { v: number }) {
  const zero = Math.round(v) === 0;
  return (
    <span
      className={cn(
        'mt-0.5 inline-block rounded px-1 font-mono text-[10px] font-semibold text-white',
        zero ? 'bg-zinc-600' : v > 0 ? 'bg-emerald-700' : 'bg-red-700',
      )}
    >
      {fmtSignedMb(zero ? 0 : v)}
    </span>
  );
}

function Signed({ v, digits = 0, suffix = '' }: { v: number | null; digits?: number; suffix?: string }) {
  if (v === null) return <span className="text-zinc-500">—</span>;
  const s = digits ? `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(digits)}` : fmtSignedMb(v);
  return <span className={v > 0 ? 'text-emerald-300' : v < 0 ? 'text-rose-300' : 'text-zinc-300'}>{s + suffix}</span>;
}

function EntityNav({ data, current, onPick }: { data: FlowEntitiesResponse | null; current: string; onPick: (id: string) => void }) {
  const item = (id: string, primary: string, secondary?: string) => (
    <button
      type="button"
      onClick={() => onPick(id)}
      aria-current={id === current ? 'true' : undefined}
      className={cn(
        'flex min-h-6 w-full items-baseline gap-1.5 rounded px-1.5 py-0.5 text-left text-[13px]',
        id === current ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-300 hover:bg-zinc-800',
      )}
    >
      <span className="font-semibold">{primary}</span>
      {secondary && <span className={cn('truncate text-[11px]', id === current ? 'text-amber-200/80' : 'text-zinc-400')}>{secondary}</span>}
    </button>
  );
  return (
    <nav aria-label="ตลาดและหุ้นไทยที่ติดตามเงินไหล" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">ตลาดหุ้นไทย</p>
      {!data ? (
        <p className="text-xs text-zinc-400">กำลังโหลด…</p>
      ) : (
        <ul className="space-y-1">
          {data.market.map((m) => (
            <li key={m.id}>{item(m.id, m.name)}</li>
          ))}
          <li className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">หุ้นรายตัว (NVDR)</li>
          {data.sectors.map((g) => {
            const open = g.stocks.some((s) => s.id === current);
            return (
              <li key={g.sector}>
                <details open={open} className="group">
                  <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1 rounded px-1 text-sm font-medium text-zinc-200 hover:bg-zinc-800">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
                    {sectorLabel(g.sector)}
                  </summary>
                  <ul className="ml-5 mt-0.5 space-y-0.5">
                    {g.stocks.map((s) => (
                      <li key={s.id}>{item(s.id, s.id, s.name)}</li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

function FlowTable({ d }: { d: FlowDashboard }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  const num = 'px-2 py-1.5 text-right align-top font-mono';
  return (
    <div tabIndex={0} role="region" aria-label="ตารางการซื้อขายตามประเภทนักลงทุน" className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[560px] text-xs">
        <caption className="sr-only">
          การซื้อขาย {d.entity.id} สัปดาห์ {d.week.start} ถึง {d.week.end} เทียบสัปดาห์ {d.prevWeek.start} ถึง {d.prevWeek.end} หน่วยล้านบาท
        </caption>
        <thead className="bg-zinc-900 text-[11px] text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">
              ประเภท <span className="font-mono font-medium text-amber-300">{thSpan(d.week.start, d.week.end)}</span>
            </th>
            <th scope="col" className={th}>ซื้อ</th>
            <th scope="col" className={th}>% ซื้อ</th>
            <th scope="col" className={th}>ขาย</th>
            <th scope="col" className={th}>% ขาย</th>
            <th scope="col" className={th}>สุทธิ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {d.table.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left align-top font-medium text-zinc-200">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: FLOW_COLORS[r.key] }} aria-hidden />
                {r.label}
              </th>
              <td className={cn(num, 'text-zinc-100')}>
                <div>{fmtMb(r.buy)}</div>
                <Change v={r.changeBuy} />
              </td>
              <td className={cn(num, 'text-zinc-200')}>{r.pctBuy.toFixed(1)}%</td>
              <td className={cn(num, 'text-zinc-100')}>
                <div>{fmtMb(r.sell)}</div>
                <Change v={r.changeSell} />
              </td>
              <td className={cn(num, 'text-zinc-200')}>{r.pctSell.toFixed(1)}%</td>
              <td className={cn(num, 'font-semibold')}>
                <div>
                  <Signed v={r.net} />
                </div>
                <Change v={r.changeNet} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-zinc-700 text-zinc-200">
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-semibold">
              รวม (ซื้อ = ขาย)
            </th>
            <td className={num}>
              <div>{fmtMb(d.table.value)}</div>
              <Change v={d.table.changeValue} />
            </td>
            <td className={num}>100%</td>
            <td className={num}>{fmtMb(d.table.value)}</td>
            <td className={num}>100%</td>
            <td className={num}>0</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function PeriodTable({ d }: { d: FlowDashboard }) {
  return (
    <div tabIndex={0} role="region" aria-label="ตารางเงินไหลสุทธิตามช่วงเวลา" className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[600px] text-xs">
        <caption className="sr-only">เงินไหลสุทธิของ {d.entity.id} ตามช่วงเวลา ถึงวันที่ {d.lastDate} หน่วยล้านบาท</caption>
        <thead className="bg-zinc-900 text-[11px] text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">
              ถึง <span className="font-mono font-medium text-amber-300">{thDate(d.lastDate)}</span>
            </th>
            {d.periods.columns.map((c) => (
              <th key={c.key} scope="col" className="whitespace-nowrap px-2 py-1.5 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {d.periods.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="whitespace-nowrap px-2 py-1.5 text-left font-medium text-zinc-200">
                {r.key in FLOW_COLORS && (
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: FLOW_COLORS[r.key as FlowGroup] }} aria-hidden />
                )}
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={d.periods.columns[i].key} className="px-2 py-1.5 text-right font-mono">
                  {r.kind === 'net' ? (
                    <Signed v={v} />
                  ) : v === null ? (
                    <span className="text-zinc-500">—</span>
                  ) : (
                    <span className="text-zinc-200">{r.kind === 'pct' ? `${v.toFixed(1)}%` : fmtMb(v)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ShareSection({ d }: { d: FlowDashboard }) {
  const week = thSpan(d.week.start, d.week.end);
  if (d.entity.kind === 'market') {
    const seg = (side: 'buy' | 'sell') =>
      d.table.rows.map((r) => ({ key: r.key, label: r.label, value: r[side], color: FLOW_COLORS[r.key] }));
    return (
      <ShareBars
        title={`สัดส่วนมูลค่าซื้อขายตามประเภทนักลงทุน — ${week}`}
        rows={[
          { label: 'ฝั่งซื้อ', segments: seg('buy') },
          { label: 'ฝั่งขาย', segments: seg('sell') },
        ]}
      />
    );
  }
  const nvdr = d.table.rows.find((r) => r.key === 'nvdr');
  return (
    <section aria-label="สัดส่วน NVDR และ short sale" className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <h3 className="text-xs font-semibold text-zinc-200">สัดส่วน NVDR และ Short sale — {week}</h3>
      {nvdr && (
        <>
          <Meter label="NVDR % ของมูลค่าซื้อ" value={nvdr.pctBuy} max={50} color={FLOW_COLORS.nvdr} />
          <Meter label="NVDR % ของมูลค่าขาย" value={nvdr.pctSell} max={50} color={FLOW_COLORS.nvdr} />
        </>
      )}
      {d.short && (
        <Meter
          label="Short sale % ของมูลค่าซื้อขาย"
          value={d.short.pctValue}
          max={30}
          color={FLOW_COLORS.short}
          caption={`${fmtMb(d.short.value)} ล้านบาท · เฉลี่ย 13 สัปดาห์ ${d.short.avgPct13w.toFixed(1)}%`}
        />
      )}
    </section>
  );
}

function StatTile({ label, value, unit, sub, tone }: { label: string; value: string; unit?: string; sub?: React.ReactNode; tone?: 'up' | 'down' }) {
  return (
    <section aria-label={label} className="flex flex-col justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="text-xs font-medium text-zinc-300">{label}</h3>
      <p className="mt-1">
        <span className={cn('font-mono text-2xl font-semibold', tone === 'up' ? 'text-emerald-300' : tone === 'down' ? 'text-rose-300' : 'text-zinc-50')}>{value}</span>
        {unit && <span className="ml-1.5 text-xs text-zinc-400">{unit}</span>}
      </p>
      {sub && <div className="mt-1 text-[11px] text-zinc-400">{sub}</div>}
    </section>
  );
}

function BottomRow({ d }: { d: FlowDashboard }) {
  const week = thSpan(d.week.start, d.week.end);
  const g36 = d.flowIndex.weeks36 < 156 ? `ใช้ข้อมูลเท่าที่มี ${d.flowIndex.weeks36} สัปดาห์` : undefined;
  const gauges = (
    <>
      <IndexGauge label={`Flow Index 6 เดือน (${d.flowIndex.group})`} value={d.flowIndex.m6} />
      <IndexGauge label={`Flow Index 36 เดือน (${d.flowIndex.group})`} value={d.flowIndex.m36} sub={g36} />
    </>
  );
  if (d.entity.kind === 'market') {
    const ytdCol = d.periods.columns.findIndex((c) => c.key === 'YTD');
    const ytd = d.periods.rows.filter((r) => r.kind === 'net');
    return (
      <div className="grid gap-4 @min-[560px]:grid-cols-2 @min-[1000px]:grid-cols-4">
        <NetBars
          title={`สุทธิ ${week} (ล้านบาท)`}
          bars={d.table.rows.map((r) => ({ label: FLOW_SHORT[r.key], value: r.net, color: FLOW_COLORS[r.key] }))}
        />
        {gauges}
        <NetBars
          title="สุทธิตั้งแต่ต้นปี (ล้านบาท)"
          bars={ytd.map((r) => ({ label: FLOW_SHORT[r.key as FlowGroup], value: r.values[ytdCol] ?? 0, color: FLOW_COLORS[r.key as FlowGroup] }))}
        />
      </div>
    );
  }
  const nvdr = d.table.rows.find((r) => r.key === 'nvdr');
  return (
    <div className="grid gap-4 @min-[560px]:grid-cols-2 @min-[1000px]:grid-cols-4">
      {nvdr && (
        <StatTile
          label={`NVDR สุทธิ ${week}`}
          value={fmtSignedMb(nvdr.net)}
          unit="ล้านบาท"
          tone={nvdr.net > 0 ? 'up' : nvdr.net < 0 ? 'down' : undefined}
          sub={
            <>
              เทียบสัปดาห์ก่อน <Signed v={nvdr.changeNet} /> ล้านบาท
            </>
          }
        />
      )}
      {gauges}
      {d.short && (
        <StatTile
          label={`Short sale ${week}`}
          value={`${d.short.pctValue.toFixed(1)}%`}
          unit="ของมูลค่าซื้อขาย"
          sub={
            <>
              {fmtMb(d.short.value)} ล้านบาท (<Signed v={d.short.changeValue} />) · เฉลี่ย 13 สัปดาห์ {d.short.avgPct13w.toFixed(1)}%
            </>
          }
        />
      )}
    </div>
  );
}

export function FlowDashboardView() {
  const [entityId, setEntityId] = useState(MARKET_ID);
  const [range, setRange] = useState<FlowRange>('1y');
  const [indexByKind, setIndexByKind] = useState(DEFAULT_INDEX);
  const kind = entityId === MARKET_ID ? 'market' : 'stock';
  const indexGroup = indexByKind[kind];
  const list = useApi<FlowEntitiesResponse>('/api/flows');
  const q = useApi<FlowDashboard>(`/api/flows/${encodeURIComponent(entityId)}?range=${range}&index=${indexGroup}`);
  const d = q.data;
  const isMarket = d?.entity.kind === 'market';
  const chartGroups: FlowGroup[] = !d ? [] : isMarket ? d.entity.groups : ['nvdr'];
  const lines = (get: (g: FlowGroup) => LineSpec['get']): LineSpec[] =>
    chartGroups.map((g) => ({ key: g, label: FLOW_LABEL[g], color: FLOW_COLORS[g], get: get(g) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
      <EntityNav data={list.data} current={entityId} onPick={setEntityId} />

      <div className="@container min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-50">
              เงินไหลนักลงทุน – {d ? (isMarket ? d.entity.name : `${d.entity.id} · ${d.entity.name}`) : '…'}
            </h2>
            <p className="text-xs text-zinc-400">
              {d
                ? `${isMarket ? 'ตลาดหลักทรัพย์แห่งประเทศไทย · ประเภทนักลงทุน 4 กลุ่ม' : `${sectorLabel(d.entity.sector ?? '')} · NVDR และ Short sale`} · หน่วย ล้านบาท · ข้อมูลถึง ${thDate(d.lastDate)}`
                : 'กำลังโหลด…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="flow-index-group" className="text-xs text-zinc-300">
              Flow Index ของ
            </label>
            <select
              id="flow-index-group"
              value={indexGroup}
              onChange={(e) => setIndexByKind({ ...indexByKind, [kind]: e.target.value as FlowGroup })}
              className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
            >
              {(kind === 'market' ? (['foreign', 'institution', 'prop', 'retail'] as FlowGroup[]) : (['nvdr', 'others'] as FlowGroup[])).map((g) => (
                <option key={g} value={g}>
                  {FLOW_LABEL[g]}
                </option>
              ))}
            </select>
            <div role="group" aria-label="ช่วงเวลา" className="flex gap-1">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'h-8 min-w-11 rounded-md border px-2 font-mono text-xs',
                    range === r ? 'border-amber-500/60 bg-amber-500/15 text-amber-200' : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </header>

        {d && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
            <strong>{d.source.label}</strong> — {d.source.note}
            {d.partialWeek &&
              ` · สัปดาห์ปัจจุบัน (${thSpan(d.partialWeek.start, d.partialWeek.end)}, ${d.partialWeek.days} วันทำการ) ยังไม่จบ: แสดงเป็นแท่งสุดท้ายในกราฟ แต่ตารางใช้สัปดาห์ที่ครบล่าสุด`}
          </p>
        )}

        {q.error ? (
          <p role="alert" className="text-sm text-rose-300">โหลดข้อมูลเงินไหลไม่สำเร็จ: {q.error}</p>
        ) : !d ? (
          <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังโหลดข้อมูลเงินไหล…
          </p>
        ) : (
          <>
            <div className="grid gap-4 @min-[1300px]:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">ราคาและเงินไหลรายสัปดาห์ – {isMarket ? 'SET' : d.entity.id}</h3>
                <PriceChart title={isMarket ? 'SET proxy (ดัชนีของแพลตฟอร์ม)' : `${d.entity.id} – ราคา (บาท)`} data={d.series} />
                <LinesChart
                  title={isMarket ? 'เงินไหลสุทธิสะสมในช่วงที่แสดง (ล้านบาท)' : 'NVDR สุทธิสะสมในช่วงที่แสดง (ล้านบาท) · ผู้ลงทุนอื่น = −NVDR'}
                  data={d.series}
                  lines={lines((g) => (p) => p.cum[g] ?? null)}
                />
                <LinesChart
                  title={isMarket ? 'เงินไหลสุทธิรายสัปดาห์ (ล้านบาท)' : 'NVDR สุทธิรายสัปดาห์ (ล้านบาท)'}
                  data={d.series}
                  lines={lines((g) => (p) => p.net[g] ?? null)}
                />
                {!isMarket && (
                  <LinesChart
                    title="Short sale (% ของมูลค่าซื้อขายรายสัปดาห์)"
                    data={d.series}
                    height={120}
                    zeroLine={false}
                    fromZero
                    format={(v) => `${v.toFixed(1)}%`}
                    axisFormat={(v) => `${v}%`}
                    lines={[{ key: 'short', label: 'Short sale', color: FLOW_COLORS.short, get: (p) => p.shortPct }]}
                  />
                )}
                <LinesChart
                  title="มูลค่าซื้อขายรวม (ล้านบาท/สัปดาห์)"
                  data={d.series}
                  height={120}
                  zeroLine={false}
                  fromZero
                  lines={[{ key: 'value', label: 'มูลค่าซื้อขาย', color: '#d4d4d8', get: (p) => p.value }]}
                />
                <FlowIndexChart data={d.series} group={d.flowIndex.group} />
              </div>

              <div className="min-w-0 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">
                  {isMarket ? 'การซื้อขายตามประเภทนักลงทุน' : `การซื้อขายผ่าน NVDR – ${d.entity.id}`} (ล้านบาท)
                </h3>
                <FlowTable d={d} />
                <ShareSection d={d} />
                <h3 className="pt-1 text-sm font-semibold text-zinc-200">เงินไหลสุทธิตามช่วงเวลา (ล้านบาท)</h3>
                <PeriodTable d={d} />
                <section aria-label="สรุปจากตัวเลข" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <h3 className="mb-2 text-xs font-semibold text-zinc-200">สรุปจากตัวเลข</h3>
                  <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-zinc-300">
                    {d.insights.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-zinc-400">สรุปด้วยกฎตายตัวจากตัวเลขบนหน้านี้ ({d.source.label}) — ไม่ใช่คำแนะนำการลงทุน</p>
                </section>
              </div>
            </div>

            <BottomRow d={d} />
          </>
        )}
      </div>
    </div>
  );
}
