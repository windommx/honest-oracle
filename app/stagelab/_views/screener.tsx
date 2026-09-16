"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  NumberField,
  ProgressBar,
  ScorePill,
  Skeleton,
  StageBadge,
  TableWrap,
  Td,
  Th,
  Toggle,
  ViewHeader,
} from "../_ui";
import { useResource } from "../_api";
import { EMPTY_DRAFT, WatchlistFormModal, type WatchlistDraft } from "./_watchlist-form";
import { DEFAULT_FILTERS, fmt, fmtPct, runFunnel, type FunnelFilters } from "@/lib/stagelab/utils";
import type { StockWithTech } from "@/lib/stagelab/types";

type SortKey = "price" | "weeklyVolumeM" | "mansfieldRs" | "epsGrowthPct" | "rsScore";

interface UniverseResponse {
  stocks: StockWithTech[];
}
interface SectorsResponse {
  sectors: { id: number; name: string; score: number }[];
}

export default function ScreenerView({
  compact = false,
  onSaved,
}: {
  compact?: boolean;
  /** Fired after a stock is added, so an embedding view can refresh its counts. */
  onSaved?: () => void;
}) {
  const universe = useResource<UniverseResponse>("/universe?enrich=1");
  const sectors = useResource<SectorsResponse>("/sectors");

  const [filters, setFilters] = useState<FunnelFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("rsScore");
  const [sortDesc, setSortDesc] = useState(true);
  const [draft, setDraft] = useState<WatchlistDraft | null>(null);

  // Seed the sector filter from the customer's own ranking — once. After that
  // their chip edits win, even if the sector board reloads underneath.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !sectors.data) return;
    seeded.current = true;
    const strong = sectors.data.sectors.filter((s) => s.score >= 4).map((s) => s.name);
    if (strong.length > 0) setFilters((f) => ({ ...f, strongSectors: strong }));
  }, [sectors.data]);

  // `?? []` inline would be a fresh array each render and defeat every useMemo below.
  const stocks = useMemo(() => universe.data?.stocks ?? [], [universe.data]);
  const funnel = useMemo(() => runFunnel(stocks, filters), [stocks, filters]);

  const rows = useMemo(() => {
    const sorted = [...funnel.result];
    sorted.sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDesc ? -diff : diff;
    });
    return sorted;
  }, [funnel.result, sortKey, sortDesc]);

  const sectorNames = useMemo(
    () => Array.from(new Set(stocks.map((s) => s.sector))).sort(),
    [stocks],
  );

  function toggleSector(name: string) {
    setFilters((f) => ({
      ...f,
      strongSectors: f.strongSectors.includes(name)
        ? f.strongSectors.filter((x) => x !== name)
        : [...f.strongSectors, name],
    }));
  }

  function sortBy(key: SortKey) {
    if (key === sortKey) setSortDesc((d) => !d);
    else {
      setSortKey(key);
      setSortDesc(true);
    }
  }

  function addFrom(stock: StockWithTech) {
    setDraft({
      ...EMPTY_DRAFT,
      symbol: stock.symbol,
      sector: stock.sector,
      stage: stock.stage,
      // A 7% stop and a 20% target are the manual's starting geometry, not a
      // recommendation — the form shows the resulting R:R so it gets adjusted.
      entryPrice: stock.price,
      stopLoss: Number((stock.price * 0.93).toFixed(2)),
      targetPrice: Number((stock.price * 1.2).toFixed(2)),
      rsScore: stock.rsScore,
      fundScore: stock.fundScore,
      priority: stock.rsScore >= 8 ? "A" : "B",
    });
  }

  if (universe.loading && !universe.data) {
    return (
      <div className="space-y-4">
        {!compact && <Skeleton className="h-8 w-48" />}
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (universe.error) {
    return (
      <EmptyState
        title="โหลดจักรวาลหุ้นไม่สำเร็จ"
        hint={universe.error}
        action={
          <Button size="sm" variant="primary" onClick={() => void universe.reload()}>
            ลองใหม่
          </Button>
        }
      />
    );
  }

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {!compact && (
        <ViewHeader
          title="Screener"
          subtitle={`กรอง ${stocks.length} ตัวด้วย Funnel 6 ชั้น — เหลือ ${funnel.result.length} ตัว`}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card
            title="ตัวกรอง"
            action={
              <Button size="sm" variant="subtle" onClick={() => setFilters(DEFAULT_FILTERS)}>
                รีเซ็ต
              </Button>
            }
          >
            <div className="space-y-3">
              <NumberField
                label="ปริมาณซื้อขายขั้นต่ำ (ล้านหุ้น/สัปดาห์)"
                value={filters.minVolume}
                onChange={(n) => setFilters((f) => ({ ...f, minVolume: n }))}
                step={1}
                min={0}
              />
              <NumberField
                label="ความชัน 30W MA ขั้นต่ำ (%)"
                value={filters.minSlope}
                onChange={(n) => setFilters((f) => ({ ...f, minSlope: n }))}
                step={0.1}
              />
              <NumberField
                label="EPS Growth ขั้นต่ำ (%)"
                value={filters.minEps}
                onChange={(n) => setFilters((f) => ({ ...f, minEps: n }))}
                step={1}
              />
              <Toggle
                label="ต้องอยู่เหนือ 30W MA"
                checked={filters.requireAboveMa}
                onChange={(v) => setFilters((f) => ({ ...f, requireAboveMa: v }))}
              />
              <Toggle
                label="ต้องมี Mansfield RS เป็นบวก"
                checked={filters.requireRsPositive}
                onChange={(v) => setFilters((f) => ({ ...f, requireRsPositive: v }))}
                hint="แรงกว่าตลาดโดยรวม"
              />
            </div>
          </Card>

          <Card title="กลุ่มอุตสาหกรรมที่ยอมรับ" subtitle="ไม่เลือกเลย = ไม่กรองกลุ่ม">
            <div className="flex flex-wrap gap-1.5">
              {sectorNames.map((name) => (
                <Chip
                  key={name}
                  label={name}
                  active={filters.strongSectors.includes(name)}
                  onClick={() => toggleSector(name)}
                />
              ))}
            </div>
          </Card>

          <Card title="Funnel" subtitle="หุ้นที่เหลือในแต่ละชั้น">
            <ol className="space-y-2.5">
              {funnel.steps.map((step, i) => {
                const last = i === funnel.steps.length - 1;
                return (
                  <li key={step.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`text-xs ${last ? "font-semibold text-amber-300" : "text-zinc-200"}`}>
                        {step.label}
                      </span>
                      <span className={`font-mono text-xs tabular-nums ${last ? "text-amber-300" : "text-zinc-400"}`}>
                        {step.count}
                      </span>
                    </div>
                    <div className="mt-1">
                      <ProgressBar
                        value={step.count}
                        max={Math.max(1, funnel.steps[0].count)}
                        tone={last ? "warn" : "good"}
                      />
                    </div>
                    <p className="mt-0.5 text-[0.65rem] text-zinc-400">{step.sub}</p>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title="ผลลัพธ์" subtitle={`${rows.length} ตัวผ่านทุกชั้น`}>
            {rows.length === 0 ? (
              <EmptyState
                title="ไม่มีหุ้นผ่าน Funnel"
                hint="ผ่อนเกณฑ์ลงทีละชั้น แล้วดูว่าชั้นไหนเป็นตัวตัด — นั่นคือข้อมูลที่มีค่ากว่าผลลัพธ์"
              />
            ) : (
              <TableWrap minWidth={760}>
                <thead>
                  <tr>
                    <Th>หุ้น</Th>
                    <Th align="center">Stage</Th>
                    <SortableTh label="ราคา" col="price" sortKey={sortKey} desc={sortDesc} onClick={sortBy} />
                    <Th align="right">เทียบ MA</Th>
                    <SortableTh label="ปริมาณ" col="weeklyVolumeM" sortKey={sortKey} desc={sortDesc} onClick={sortBy} />
                    <SortableTh label="RS" col="mansfieldRs" sortKey={sortKey} desc={sortDesc} onClick={sortBy} />
                    <SortableTh label="EPS" col="epsGrowthPct" sortKey={sortKey} desc={sortDesc} onClick={sortBy} />
                    <SortableTh label="คะแนน" col="rsScore" sortKey={sortKey} desc={sortDesc} onClick={sortBy} />
                    <Th align="right">เพิ่ม</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const vsMa = (s.price / s.ma30w - 1) * 100;
                    return (
                      <tr key={s.id} className="hover:bg-zinc-800/30">
                        <Td>
                          <span className="font-mono font-medium text-zinc-100">{s.symbol}</span>
                          <span className="ml-2 text-xs text-zinc-400">{s.sector}</span>
                          {s.tech.breakout && (
                            <span className="ml-2 rounded bg-emerald-500/15 px-1 text-[0.6rem] text-emerald-300">
                              breakout
                            </span>
                          )}
                        </Td>
                        <Td align="center"><StageBadge stage={s.stage} short /></Td>
                        <Td align="right" mono>{fmt(s.price)}</Td>
                        <Td align="right" mono className={vsMa >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {fmtPct(vsMa)}
                        </Td>
                        <Td align="right" mono>{fmt(s.weeklyVolumeM, 1)}M</Td>
                        <Td align="right" mono className={s.mansfieldRs >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {fmt(s.mansfieldRs, 2)}
                        </Td>
                        <Td align="right" mono>{fmtPct(s.epsGrowthPct, 0)}</Td>
                        <Td align="right">
                          <span className="inline-flex gap-2">
                            <ScorePill label="RS" value={s.rsScore} />
                            <ScorePill label="พื้นฐาน" value={s.fundScore} />
                          </span>
                        </Td>
                        <Td align="right">
                          <Button size="sm" onClick={() => addFrom(s)} aria-label={`เพิ่ม ${s.symbol} เข้า Watchlist`}>
                            + เฝ้าดู
                          </Button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>

      <WatchlistFormModal
        open={draft !== null}
        draft={draft ?? EMPTY_DRAFT}
        onClose={() => setDraft(null)}
        onSaved={() => onSaved?.()}
      />
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  desc,
  onClick,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  desc: boolean;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    // aria-sort belongs on the header cell, not on the button inside it — the
    // button's implicit role does not support it and a screen reader drops it.
    <th
      className="whitespace-nowrap border-b border-zinc-800 px-2 py-2 text-right"
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
    >
      <button
        onClick={() => onClick(col)}
        className={`text-[0.7rem] font-medium uppercase tracking-wide transition-colors ${
          active ? "text-emerald-400" : "text-zinc-400 hover:text-zinc-200"
        }`}
      >
        {label} {active ? (desc ? "↓" : "↑") : "↕"}
      </button>
    </th>
  );
}
