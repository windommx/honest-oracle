'use client';

/**
 * แดชบอร์ด Commitments of Traders (COT) — จัดวางตามภาพตัวอย่าง:
 *  ซ้าย: รายชื่อตลาดแยกกลุ่ม · กลาง-ซ้าย: ราคา / Legacy net / Disaggregated net / Open Interest / COT Index
 *  กลาง-ขวา: ตาราง Legacy + Disaggregated (สถานะ, การเปลี่ยนแปลง, % OI, จำนวนผู้ค้า, net) + วงกลม insight
 *  ล่าง/ขวา: แท่ง net ต่อกลุ่ม · มาตรวัด COT Index 6/36 เดือน · สัดส่วนของ OI
 */

import { useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useApi } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type { CotDashboard, CotRange, CotTableRow } from '@/lib/cot/types';
import { COT_COLORS, CotIndexChart, IndexGauge, MiniPie, NetBars, NetLinesChart, OpenInterestChart, PriceChart } from './cot-charts';

interface MarketsResponse {
  reportDate: string;
  groups: Array<{ group: string; markets: Array<{ id: string; name: string; exchange: string; unit: string; financial: boolean }> }>;
}

const RANGES: CotRange[] = ['6m', '1y', '2y', '3y'];
const INDEX_GROUPS: Array<{ key: string; label: string }> = [
  { key: 'commercials', label: 'Commercials' },
  { key: 'largeSpecs', label: 'Large Speculators' },
  { key: 'smallTraders', label: 'Small Traders' },
  { key: 'producer', label: 'Producer/Merchant' },
  { key: 'swap', label: 'Swap Dealers' },
  { key: 'managed', label: 'Managed Money' },
  { key: 'other', label: 'Other Reportables' },
];
const DECIMALS: Record<string, number> = { eur: 4, jpy: 4, gbp: 4, aud: 4, btc: 0, eth: 0, ng: 3, ho: 4, silver: 3, copper: 4, cocoa: 0, dji: 0, ty: 3, us: 3 };

const fmt = (v: number) => Math.round(v).toLocaleString('en-US');

function Change({ v }: { v: number | null }) {
  if (v === null) return null;
  const up = v > 0;
  const zero = v === 0;
  return (
    <span
      className={cn(
        'mt-0.5 inline-block rounded px-1 font-mono text-[10px] font-semibold text-white',
        zero ? 'bg-zinc-600' : up ? 'bg-emerald-700' : 'bg-red-700',
      )}
    >
      {up ? '+' : zero ? '±' : '−'}
      {fmt(Math.abs(v))}
    </span>
  );
}

function NetPct({ v }: { v: number | null }) {
  if (v === null) return null;
  return (
    <span className={cn('ml-1 rounded px-1 font-mono text-[10px] text-white', v >= 0 ? 'bg-emerald-700' : 'bg-red-700')}>
      {v >= 0 ? '+' : '−'}
      {Math.abs(v).toFixed(0)}%
    </span>
  );
}

function Cell2({ value, change }: { value: number; change?: number | null }) {
  return (
    <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-100">
      <div>{fmt(value)}</div>
      {change !== undefined && <Change v={change} />}
    </td>
  );
}

function MarketNav({ data, current, onPick }: { data: MarketsResponse | null; current: string; onPick: (id: string) => void }) {
  return (
    <nav aria-label="ตลาดที่มีรายงาน COT" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">Markets</p>
      {!data ? (
        <p className="text-xs text-zinc-400">กำลังโหลด…</p>
      ) : (
        <ul className="space-y-1">
          {data.groups.map((g) => {
            const open = g.markets.some((m) => m.id === current);
            return (
              <li key={g.group}>
                <details open={open} className="group">
                  <summary className="flex min-h-7 cursor-pointer list-none items-center gap-1 rounded px-1 text-sm font-medium text-zinc-200 hover:bg-zinc-800">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" aria-hidden />
                    {g.group}
                  </summary>
                  <ul className="ml-5 mt-0.5 space-y-0.5">
                    {g.markets.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => onPick(m.id)}
                          aria-current={m.id === current ? 'true' : undefined}
                          className={cn(
                            'min-h-6 w-full rounded px-1.5 text-left text-[13px]',
                            m.id === current ? 'bg-amber-500/15 font-semibold text-amber-300' : 'text-zinc-300 hover:bg-zinc-800',
                          )}
                        >
                          {m.name}
                        </button>
                      </li>
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

function LegacyTable({ d }: { d: CotDashboard }) {
  const r = Object.fromEntries(d.legacy.rows.map((x) => [x.key, x])) as Record<string, CotTableRow>;
  const com = r.commercials;
  const ls = r.largeSpecs;
  const sm = r.smallTraders;
  const totLong = com.long + ls.long + (ls.spread ?? 0);
  const totShort = com.short + ls.short + (ls.spread ?? 0);
  const totChgL = com.changeLong + ls.changeLong + (ls.changeSpread ?? 0);
  const totChgS = com.changeShort + ls.changeShort + (ls.changeSpread ?? 0);
  const oi = d.legacy.openInterest;
  const p = (x: number) => `${((x / oi) * 100).toFixed(1)}%`;
  const th = 'px-2 py-1.5 text-right font-medium';
  return (
    <div tabIndex={0} role="region" aria-label="ตาราง COT Legacy" className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[640px] text-xs">
        <caption className="sr-only">COT Legacy {d.market.name} ณ {d.reportDate} เทียบ {d.prevReportDate}</caption>
        <thead className="bg-zinc-900 text-[11px] text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">Cot Legacy</th>
            <th scope="colgroup" colSpan={2} className="px-2 py-1.5 text-center font-semibold">COMMERCIALS</th>
            <th scope="colgroup" colSpan={3} className="px-2 py-1.5 text-center font-semibold">LARGE SPECULATORS</th>
            <th scope="colgroup" colSpan={2} className="px-2 py-1.5 text-center font-semibold">TOTAL</th>
            <th scope="colgroup" colSpan={2} className="px-2 py-1.5 text-center font-semibold">SMALL TRADERS</th>
          </tr>
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-mono font-medium text-amber-300">{d.reportDate}</th>
            {['Long', 'Short', 'Long', 'Short', 'Spread', 'Long', 'Short', 'Long', 'Short'].map((h, i) => (
              <th key={i} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-zinc-300">Positions</th>
            <Cell2 value={com.long} />
            <Cell2 value={com.short} />
            <Cell2 value={ls.long} />
            <Cell2 value={ls.short} />
            <Cell2 value={ls.spread ?? 0} />
            <Cell2 value={totLong} />
            <Cell2 value={totShort} />
            <Cell2 value={sm.long} />
            <Cell2 value={sm.short} />
          </tr>
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-zinc-300">Changes</th>
            {[com.changeLong, com.changeShort, ls.changeLong, ls.changeShort, ls.changeSpread, totChgL, totChgS, sm.changeLong, sm.changeShort].map((v, i) => (
              <td key={i} className="px-2 py-1.5 text-right">
                <Change v={v} />
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-zinc-300">Percent of OI</th>
            {[com.pctOiLong, com.pctOiShort, ls.pctOiLong, ls.pctOiShort, ls.pctOiSpread ?? 0].map((v, i) => (
              <td key={i} className="px-2 py-1.5 text-right font-mono text-zinc-200">{v.toFixed(1)}%</td>
            ))}
            <td className="px-2 py-1.5 text-right font-mono text-zinc-200">{p(totLong)}</td>
            <td className="px-2 py-1.5 text-right font-mono text-zinc-200">{p(totShort)}</td>
            <td className="px-2 py-1.5 text-right font-mono text-zinc-200">{sm.pctOiLong.toFixed(1)}%</td>
            <td className="px-2 py-1.5 text-right font-mono text-zinc-200">{sm.pctOiShort.toFixed(1)}%</td>
          </tr>
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-zinc-300">Traders</th>
            {[com.tradersLong, com.tradersShort, ls.tradersLong, ls.tradersShort, ls.tradersSpread ?? 0, com.tradersLong + ls.tradersLong, com.tradersShort + ls.tradersShort].map((v, i) => (
              <td key={i} className="px-2 py-1.5 text-right font-mono text-zinc-200">{v}</td>
            ))}
            <td className="px-2 py-1.5 text-right text-zinc-400">—</td>
            <td className="px-2 py-1.5 text-right text-zinc-400">—</td>
          </tr>
          <tr>
            <th scope="row" className="px-2 py-1.5 text-left font-medium text-zinc-300">Net Positions</th>
            <td colSpan={2} className="px-2 py-1.5 text-center font-mono text-zinc-50">
              {fmt(com.net)}
              <NetPct v={com.netChangePct} />
            </td>
            <td colSpan={3} className="px-2 py-1.5 text-center font-mono text-zinc-50">
              {fmt(ls.net)}
              <NetPct v={ls.netChangePct} />
            </td>
            <td colSpan={2} className="px-2 py-1.5 text-center font-mono text-zinc-50">{fmt(totLong - totShort)}</td>
            <td colSpan={2} className="px-2 py-1.5 text-center font-mono text-zinc-50">
              {fmt(sm.net)}
              <NetPct v={sm.netChangePct} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DisaggTable({ d }: { d: CotDashboard }) {
  const th = 'px-2 py-1.5 text-right font-medium';
  return (
    <div tabIndex={0} role="region" aria-label="ตาราง COT Disaggregated" className="overflow-x-auto rounded-lg border border-zinc-800">
      <table className="w-full min-w-[720px] text-xs">
        <caption className="sr-only">COT Disaggregated {d.market.name} ณ {d.reportDate}</caption>
        <thead className="bg-zinc-900 text-[11px] text-zinc-300">
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-semibold">Disaggregated</th>
            <th scope="colgroup" colSpan={3} className="px-2 py-1.5 text-center font-semibold">LONG</th>
            <th scope="colgroup" colSpan={3} className="px-2 py-1.5 text-center font-semibold">SHORT</th>
            <th scope="colgroup" colSpan={3} className="px-2 py-1.5 text-center font-semibold">SPREAD</th>
            <th scope="col" className="px-2 py-1.5 text-right font-semibold">NET</th>
          </tr>
          <tr>
            <th scope="col" className="px-2 py-1.5 text-left font-mono font-medium text-amber-300">{d.reportDate}</th>
            {['Positions', 'OI', 'Traders', 'Positions', 'OI', 'Traders', 'Positions', 'OI', 'Traders', 'Positions'].map((h, i) => (
              <th key={i} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/70">
          {d.disagg.rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" className="px-2 py-1.5 text-left align-top font-medium text-zinc-200">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: COT_COLORS[r.key as keyof typeof COT_COLORS] }} aria-hidden />
                {r.label}
              </th>
              <Cell2 value={r.long} change={r.changeLong} />
              <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{r.pctOiLong.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{r.tradersLong || '—'}</td>
              <Cell2 value={r.short} change={r.changeShort} />
              <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{r.pctOiShort.toFixed(1)}%</td>
              <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{r.tradersShort || '—'}</td>
              {r.spread === null ? (
                <td colSpan={3} className="px-2 py-1.5 text-center align-top text-zinc-400">—</td>
              ) : (
                <>
                  <Cell2 value={r.spread} change={r.changeSpread} />
                  <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{(r.pctOiSpread ?? 0).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right align-top font-mono text-zinc-200">{r.tradersSpread ?? '—'}</td>
                </>
              )}
              <td className="px-2 py-1.5 text-right align-top font-mono font-semibold text-zinc-50">{fmt(r.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Insights({ title, rows, colors }: { title: string; rows: CotTableRow[]; colors: Record<string, string> }) {
  const withShare = rows.filter((r) => r.long + r.short > 0);
  return (
    <section aria-label={title} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <h3 className="mb-2 text-center text-xs font-semibold text-zinc-200">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <p className="mb-1 text-[11px] text-zinc-400">Long vs Short</p>
          <div className="flex flex-wrap justify-around gap-2">
            {withShare.map((r) => (
              <MiniPie
                key={r.key}
                title={r.label}
                slices={[
                  { label: 'Long', value: r.long, color: '#16a34a' },
                  { label: 'Short', value: r.short, color: '#dc2626' },
                ]}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] text-zinc-400">Open Int. %</p>
          <div className="flex justify-around gap-2">
            <MiniPie title="% OI Long" slices={rows.map((r) => ({ label: r.label, value: r.long + (r.spread ?? 0), color: colors[r.key] }))} />
            <MiniPie title="% OI Short" slices={rows.map((r) => ({ label: r.label, value: r.short + (r.spread ?? 0), color: colors[r.key] }))} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function CotDashboardView() {
  const [market, setMarket] = useState('gold');
  const [range, setRange] = useState<CotRange>('1y');
  const [indexGroup, setIndexGroup] = useState('commercials');
  const markets = useApi<MarketsResponse>('/api/cot');
  const q = useApi<CotDashboard>(`/api/cot/${market}?range=${range}&index=${indexGroup}`);
  const d = q.data;
  const decimals = DECIMALS[market] ?? 2;

  return (
    <div className="grid gap-4 lg:grid-cols-[190px_minmax(0,1fr)]">
      <MarketNav data={markets.data} current={market} onPick={setMarket} />

      <div className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-50">Commitments of Traders Report (COT) – {d?.market.name ?? '…'}</h2>
            <p className="text-xs text-zinc-400">
              {d ? `${d.market.exchange} · ${d.market.unit} · รายงาน ${d.reportDate} (เทียบ ${d.prevReportDate})` : 'กำลังโหลด…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="cot-index-group" className="text-xs text-zinc-300">
              COT Index ของ
            </label>
            <select
              id="cot-index-group"
              value={indexGroup}
              onChange={(e) => setIndexGroup(e.target.value)}
              className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-100"
            >
              {INDEX_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
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
            {d.market.financial && ' · ตลาดการเงินในรายงาน CFTC จริงใช้รูปแบบ TFF (Dealer/Asset Manager/Leveraged Funds) แทน Disaggregated'}
          </p>
        )}

        {q.error ? (
          <p role="alert" className="text-sm text-rose-300">โหลดรายงาน COT ไม่สำเร็จ: {q.error}</p>
        ) : !d ? (
          <p role="status" className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> กำลังโหลดรายงาน COT…
          </p>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Commitments of Traders {d.market.name} – Historical</h3>
                <PriceChart data={d.series} decimals={decimals} />
                <NetLinesChart
                  title="Legacy – Net"
                  data={d.series}
                  lines={[
                    { key: 'commercials', label: 'Commercials', color: COT_COLORS.commercials },
                    { key: 'largeSpecs', label: 'Large Speculators', color: COT_COLORS.largeSpecs },
                    { key: 'smallTraders', label: 'Small Traders', color: COT_COLORS.smallTraders },
                  ]}
                />
                <NetLinesChart
                  title="Disaggregated – Net"
                  data={d.series}
                  lines={[
                    { key: 'producer', label: 'Producer/Merchant', color: COT_COLORS.producer },
                    { key: 'swap', label: 'Swap Dealer', color: COT_COLORS.swap },
                    { key: 'managed', label: 'Managed Money', color: COT_COLORS.managed },
                    { key: 'other', label: 'Other Reportables', color: COT_COLORS.other },
                  ]}
                />
                <OpenInterestChart data={d.series} />
                <CotIndexChart data={d.series} group={d.cotIndex.group} />
              </div>

              <div className="min-w-0 space-y-3">
                <h3 className="text-sm font-semibold text-zinc-200">Cot Legacy Report – {d.market.name}</h3>
                <LegacyTable d={d} />
                <Insights title="Cot Legacy Insights" rows={d.legacy.rows} colors={COT_COLORS as unknown as Record<string, string>} />
                <h3 className="pt-1 text-sm font-semibold text-zinc-200">{d.market.name} – Disaggregated Report</h3>
                <DisaggTable d={d} />
                <Insights title="Cot Disaggregated Insights" rows={d.disagg.rows} colors={COT_COLORS as unknown as Record<string, string>} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <NetBars
                title="Net Positions – Legacy"
                bars={d.legacy.rows.map((r) => ({ label: r.label, value: r.net, color: COT_COLORS[r.key as keyof typeof COT_COLORS] }))}
              />
              <IndexGauge label={`COT Index 6 Month (${d.cotIndex.group})`} value={d.cotIndex.m6} />
              <IndexGauge label={`COT Index 36 Month (${d.cotIndex.group})`} value={d.cotIndex.m36} />
              <NetBars
                title="Net Positions – Disaggregated"
                bars={d.disagg.rows.map((r) => ({ label: r.label, value: r.net, color: COT_COLORS[r.key as keyof typeof COT_COLORS] }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
