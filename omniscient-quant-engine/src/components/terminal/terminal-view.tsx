'use client';

/**
 * TerminalView — หน้า Market Intelligence Terminal (ปรับจากดีไซน์ Nugaom AI Pick)
 * ซ้าย: Live Market Watch · กลาง: กราฟแท่งเทียน · ขวา: AI Analysis
 * ข้อมูลทั้งหมดมาจากเอนจินของแพลตฟอร์ม (board + quotes + series + analyst)
 */

import { useCallback, useMemo, useState } from 'react';
import { CategoryChips } from '@/components/terminal/category-chips';
import { Watchlist, type WatchTab } from '@/components/terminal/watchlist';
import PriceChart from '@/components/terminal/price-chart';
import AiPanel from '@/components/terminal/ai-panel';
import { useApi, apiCall } from '@/hooks/use-api';
import type { QuotesResponse, SeriesResponse, AnalystBriefT, QuoteRowT } from '@/lib/quant/api-types';
import { dataKindTag, useAppMeta } from '@/components/providers/app-meta';

const SIGNAL_RANK: Record<string, number> = { ENTRY_PULLBACK: 0, ENTRY_MOMENTUM: 1, NO_TRADE: 2 };

function buildCategories(quotes: QuoteRowT[], dataTag: string) {
  const cats: Array<{ key: string; label: string; sub: string; count: number }> = [
    { key: 'all', label: 'หุ้นไทย', sub: `SET · EOD${dataTag ? ` ${dataTag}` : ''}`, count: quotes.length },
    {
      key: 'signal',
      label: 'สัญญาณ',
      sub: 'Pullback · Momentum',
      count: quotes.filter((q) => q.signal !== 'NO_TRADE').length,
    },
  ];
  const order = ['Renewable', 'Energy', 'Banking', 'Digital', 'Consumer', 'Tourism'];
  const sectors = [...new Set(quotes.map((q) => q.sector))].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b),
  );
  for (const s of sectors) {
    const inSector = quotes.filter((q) => q.sector === s);
    cats.push({
      key: `sector:${s}`,
      label: s,
      sub: inSector.slice(0, 3).map((q) => q.symbol).join(' · '),
      count: inSector.length,
    });
  }
  cats.push({
    key: 'decoupled',
    label: 'Decouple',
    sub: 'Θ z < −1.5 · เคลื่อนอิสระ',
    count: quotes.filter((q) => q.decoupled).length,
  });
  return cats;
}

export function TerminalView({
  symbol,
  onSymbolChange,
  tick,
}: {
  symbol: string;
  onSymbolChange: (s: string) => void;
  tick: number;
}) {
  const [tf, setTf] = useState<'1D' | '1W'>('1D');
  const [watchTab, setWatchTab] = useState<WatchTab>('market');
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return (JSON.parse(window.localStorage.getItem('oqe-favs') ?? '[]') as string[]).filter(
        (x) => typeof x === 'string',
      );
    } catch {
      return [];
    }
  });
  const [asking, setAsking] = useState(false);

  const quotesQ = useApi<QuotesResponse>(`/api/market/quotes?tick=${tick}`);
  const seriesQ = useApi<SeriesResponse>(`/api/market/series/${symbol}?tf=${tf}&bars=180&tick=${tick}`);
  const analystQ = useApi<AnalystBriefT>(`/api/analyst/${symbol}?tick=${tick}`);

  const quotes = useMemo(() => quotesQ.data?.quotes ?? [], [quotesQ.data]);

  const toggleFav = useCallback((s: string) => {
    setFavorites((prev) => {
      const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
      try {
        window.localStorage.setItem('oqe-favs', JSON.stringify(next));
      } catch {
        /* storage ไม่พร้อมใช้ — ข้าม */
      }
      return next;
    });
  }, []);

  const handleAsk = useCallback(
    async (question: string) => {
      setAsking(true);
      try {
        const res = await apiCall<{ answer: string }>(`/api/analyst/${symbol}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
        });
        return res.answer;
      } catch (e) {
        return `ขออภัย เชื่อมต่อ AI ไม่สำเร็จ (${e instanceof Error ? e.message : 'unknown'})`;
      } finally {
        setAsking(false);
      }
    },
    [symbol],
  );

  const { refresh: refreshQuotes } = quotesQ;
  const { refresh: refreshSeries } = seriesQ;
  const { refresh: refreshAnalyst } = analystQ;
  const refreshAll = useCallback(() => {
    refreshQuotes();
    refreshSeries();
    refreshAnalyst();
  }, [refreshQuotes, refreshSeries, refreshAnalyst]);

  const plan = useMemo(() => {
    const a = analystQ.data;
    if (!a) return null;
    return { entryLow: a.plan.entryLow, entryHigh: a.plan.entryHigh, stopHard: a.plan.stopHard };
  }, [analystQ.data]);

  const { meta } = useAppMeta();
  const dataTag = dataKindTag(meta);
  const cats = useMemo(() => buildCategories(quotes, dataTag), [quotes, dataTag]);
  const [activeCat, setActiveCat] = useState('all');

  const filteredQuotes = useMemo(() => {
    let list = quotes;
    if (activeCat === 'signal') list = list.filter((q) => q.signal !== 'NO_TRADE');
    else if (activeCat === 'decoupled') list = list.filter((q) => q.decoupled);
    else if (activeCat.startsWith('sector:')) {
      const s = activeCat.slice(7);
      list = list.filter((q) => q.sector === s);
    }
    return [...list].sort(
      (a, b) => (SIGNAL_RANK[a.signal] ?? 9) - (SIGNAL_RANK[b.signal] ?? 9) || b.chg1d - a.chg1d,
    );
  }, [quotes, activeCat]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      {/* แถวชิปหมวดหมู่ (เหมือนแถวชิปในดีไซน์อ้างอิง) */}
      <CategoryChips cats={cats} active={activeCat} onSelect={setActiveCat} className="shrink-0" />

      {/* 3 คอลัมน์: watchlist / chart / AI panel
          มือถือ: สูงคงที่ + สกรอลล์ภาชนะ · lg: 2 คอลัมน์ (AI อยู่ใต้ chart) · xl: 3 คอลัมน์เต็มสูง */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1.6fr)_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)_360px] xl:grid-rows-1">
        <div className="flex h-[420px] min-h-0 flex-col lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-auto xl:row-span-1">
          <Watchlist
            quotes={filteredQuotes}
            lastDate={quotesQ.data?.lastDate ?? ''}
            loading={quotesQ.loading}
            symbol={symbol}
            onSelect={onSymbolChange}
            favorites={favorites}
            onToggleFav={toggleFav}
            activeTab={watchTab}
            onTabChange={setWatchTab}
            className="min-h-0 flex-1"
          />
        </div>

        <div className="flex h-[680px] min-h-0 flex-col lg:col-start-2 lg:row-start-1 lg:h-auto xl:row-start-1">
          <PriceChart
            data={seriesQ.data}
            loading={seriesQ.loading}
            error={seriesQ.error}
            plan={plan}
            tf={tf}
            onTfChange={setTf}
            onRefresh={refreshAll}
          />
        </div>

        <div className="flex h-[680px] min-h-0 flex-col lg:col-start-2 lg:row-start-2 lg:h-auto xl:col-start-3 xl:row-start-1">
          <AiPanel
            data={analystQ.data}
            loading={analystQ.loading}
            error={analystQ.error}
            asking={asking}
            onAsk={handleAsk}
          />
        </div>
      </div>
    </div>
  );
}

export default TerminalView;
