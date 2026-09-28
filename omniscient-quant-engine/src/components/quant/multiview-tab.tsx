'use client';

import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Panel, KpiCard } from './quant-widgets';
import VolcanoChart from '@/components/charts/volcano-chart';
import EnrichmentDotPlot from '@/components/charts/enrichment-dot';
import BipartiteNetwork from '@/components/charts/bipartite-network';
import FactorTrajectoryChart from '@/components/charts/factor-trajectory';
import PcaScatterChart from '@/components/charts/pca-scatter';
import { fmtNum } from '@/lib/format';
import type { FactorsResponse } from '@/lib/quant/api-types';

const VIEW_LABELS: Record<string, string> = {
  PRICE: 'ราคา',
  TECHNICAL: 'เทคนิค',
  FLOW: 'เงินไหล',
  FUNDAMENTAL: 'งบการเงิน',
};

export function MultiviewTab({
  data,
  loading,
}: {
  data: FactorsResponse | null;
  loading: boolean;
}) {
  const [factorId, setFactorId] = useState<string>('F1');
  const [factorIdNet, setFactorIdNet] = useState<string>('F2');

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const activeFactor = data.factors.find((f) => f.id === factorId) ?? data.factors[0];
  const netFactor = data.factors.find((f) => f.id === factorIdNet) ?? data.factors[0];
  const enrichRows = data.enrichment[factorId] ?? [];

  return (
    <div className="space-y-4">
      {/* Factor cards */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.factors.map((f) => (
          <button
            key={f.id}
            onClick={() => setFactorId(f.id)}
            className={`rounded-xl border p-4 text-left transition-colors ${
              f.id === factorId
                ? 'border-amber-500/50 bg-amber-500/[0.06]'
                : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-amber-300">{f.id}</span>
              <span className="font-mono text-xs text-zinc-400">{(f.explained * 100).toFixed(1)}% var</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-zinc-100">{f.name}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500">{f.desc}</p>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${Math.min(100, f.explained * 280)}%` }} />
            </div>
          </button>
        ))}
      </div>

      {/* Variance decomposition per view */}
      <Panel
        title="Variance Decomposition ต่อ View (MOFA-style)"
        subtitle="สัดส่วนของแต่ละ factor ในการอธิบาย variance ของแต่ละมุมมองข้อมูล (normalize ภายใน view)"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {Object.keys(VIEW_LABELS).map((view) => (
            <div key={view} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="mb-2 text-xs font-semibold text-zinc-300">{VIEW_LABELS[view]}</p>
              <div className="flex h-5 w-full overflow-hidden rounded-md">
                {data.factors.map((f, i) => {
                  const share = f.viewVariance[view] ?? 0;
                  const colors = ['#fbbf24', '#fb7185', '#34d399', '#2dd4bf'];
                  return (
                    <div
                      key={f.id}
                      title={`${f.id} · ${(share * 100).toFixed(0)}%`}
                      style={{ width: `${share * 100}%`, backgroundColor: colors[i % 4] }}
                      className="flex items-center justify-center font-mono text-[9px] text-zinc-950/80"
                    >
                      {share > 0.14 ? `${f.id} ${(share * 100).toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-zinc-500">
          รวมทั้ง 4 factors อธิบาย variance {(data.explainedTotal * 100).toFixed(1)}% ของ feature panel
          {data.storyStock && (
            <>
              {' '}· Story stock: <span className="font-mono text-amber-300">{data.storyStock.symbol}</span> ({(data.storyStock.share * 100).toFixed(0)}% ของ |score| ในแกน Story)
            </>
          )}
        </p>
      </Panel>

      {/* Enrichment + Bipartite */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Theme Enrichment Dot Plot"
          subtitle="Hypergeometric over-representation + BH-FDR + Jaccard dedup (สไตล์ GO/REVIGO)"
          right={
            <Tabs value={factorId} onValueChange={setFactorId}>
              <TabsList className="h-7 bg-zinc-900">
                {data.factors.map((f) => (
                  <TabsTrigger key={f.id} value={f.id} className="h-6 px-2 font-mono text-[10px]">
                    {f.id}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        >
          <EnrichmentDotPlot rows={enrichRows} />
        </Panel>

        <Panel
          title="Factor ↔ Stock Bipartite Network"
          subtitle="เชื่อมเฉพาะ |loading| &gt; 0.6 · Hub = หุ้นที่พังแล้วลากทั้งระบบ"
          right={
            <Tabs value={factorIdNet} onValueChange={setFactorIdNet}>
              <TabsList className="h-7 bg-zinc-900">
                {data.factors.map((f) => (
                  <TabsTrigger key={f.id} value={f.id} className="h-6 px-2 font-mono text-[10px]">
                    {f.id}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          }
        >
          <BipartiteNetwork
            factors={data.factors.filter((f) => f.id === factorIdNet).map((f) => ({ id: f.id, name: f.name }))}
            edges={data.bipartite.edges.filter((e) => e.factor === factorIdNet)}
          />
          {data.bipartite.hubs.length > 0 && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Hub Stocks (ทุก factor รวมกัน):{' '}
              <span className="font-mono text-amber-300">{data.bipartite.hubs.slice(0, 5).map((h) => h.symbol).join(', ')}</span>
            </p>
          )}
        </Panel>
      </div>

      {/* Volcano + PCA */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Regime Volcano — Risk-Off vs Risk-On"
          subtitle={`Cohen's d × -log10(q) ต่อ (หุ้น × feature) · ${data.volcano.nSignificant} จุดผ่านเกณฑ์ (up ${data.volcano.upCount} / down ${data.volcano.downCount})`}
        >
          <VolcanoChart points={data.volcano.points} />
        </Panel>
        <Panel title="Market PCA + QC Outlier Flags" subtitle="ฉายภาพ 20 วันล่าสุดของแต่ละหุ้นลงบน PC1×PC2">
          <PcaScatterChart points={data.pcaScatter} />
        </Panel>
      </div>

      {/* Trajectories */}
      <Panel
        title="Factor Trajectories — ฤทธิ์ของแกนรายสัปดาห์"
        subtitle="ผลตอบแทน forward 21 วัน (Top quintile − Bottom quintile, %): บวก = factor แยกกลุ่มได้จริงช่วงนั้น · เทียบเท่าการติดตาม module score D0→D3→D7 ฝั่งชีวสารสนเทศ"
      >
        <FactorTrajectoryChart points={data.trajectories} />
      </Panel>

      {/* Top features mini cards */}
      <Panel title="Top Differential Indicators" subtitle="จุดที่โดดเด่นสุดบน volcano — ใช้เป็น feature selection ป้อน ML (L4)">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.volcano.topFeatures.slice(0, 6).map((t, i) => (
            <div key={`${t.stock}-${t.featureLabel}-${i}`} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-zinc-200">{t.stock}</span>
                <span className={t.d >= 0 ? 'font-mono text-[11px] text-emerald-400' : 'font-mono text-[11px] text-rose-400'}>
                  d = {fmtNum(t.d)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                {t.featureLabel} · q = {t.q < 1e-12 ? '<1e-12' : t.q.toExponential(1)}
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <KpiCard
        label="Convergent Evidence Check"
        value={`${data.factors.length} factors · ${data.volcano.nSignificant} differential · ${data.bipartite.hubs.length} hubs`}
        sub="Regime ที่น่าเทรดต้องถูกยืนยันพร้อมกันโดย variance decomposition + enrichment + association + trajectory"
        tone="default"
        mono={false}
      />
    </div>
  );
}
