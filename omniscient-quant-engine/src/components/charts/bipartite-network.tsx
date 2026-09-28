'use client';

/**
 * BipartiteNetwork — factor nodes (left, amber squares) vs stock nodes
 * (right, sign-colored circles) joined by bezier loading edges.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

export interface BipartiteEdge {
  factor: string;
  symbol: string;
  loading: number;
}

const W = 640;
const FX = 120; // factor rect x (14px wide, right edge at FX+14)
const SX = 520; // stock node cx

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

export default function BipartiteNetwork({
  factors,
  edges,
  height = 420,
}: {
  factors: Array<{ id: string; name: string }>;
  edges: BipartiteEdge[];
  height?: number;
}) {
  const top = 30;
  const bottom = height - 26;

  const factorIndex = new Map<string, number>(factors.map((f, i) => [f.id, i] as const));

  // per-stock aggregation: degree, dominant sign (largest |loading|), readable ordering score
  const degree = new Map<string, number>();
  const domSign = new Map<string, number>();
  const agg = new Map<string, { sum: number; w: number }>();
  for (const e of edges) {
    degree.set(e.symbol, (degree.get(e.symbol) ?? 0) + 1);
    const prev = domSign.get(e.symbol);
    if (prev === undefined || Math.abs(e.loading) > Math.abs(prev)) domSign.set(e.symbol, e.loading);
    const fi = factorIndex.get(e.factor) ?? 0;
    const a = agg.get(e.symbol) ?? { sum: 0, w: 0 };
    const w = Math.abs(e.loading);
    a.sum += fi * w;
    a.w += w;
    agg.set(e.symbol, a);
  }

  const stocks = Array.from(agg.entries())
    .map(([symbol, a]) => ({ symbol, score: a.w > 0 ? a.sum / a.w : 0 }))
    .sort((a, b) => a.score - b.score || a.symbol.localeCompare(b.symbol));

  const yPos = (i: number, n: number) => (n <= 1 ? (top + bottom) / 2 : top + ((bottom - top) * i) / (n - 1));

  const empty = factors.length === 0 && stocks.length === 0;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Bipartite factor-stock network"
      >
        {empty && (
          <text x={W / 2} y={height / 2} textAnchor="middle" fontSize={11} fill="#71717a">
            ไม่มีข้อมูล factor network
          </text>
        )}

        {/* edges first, nodes on top */}
        {!empty &&
          edges.map((e, i) => {
            const fi = factorIndex.get(e.factor) ?? 0;
            const si = stocks.findIndex((s) => s.symbol === e.symbol);
            if (si < 0) return null;
            const x1 = FX + 14;
            const y1 = yPos(fi, factors.length);
            const x2 = SX - 7;
            const y2 = yPos(si, stocks.length);
            const dx = (x2 - x1) * 0.45;
            const sw = Math.min(4, 0.8 + Math.abs(e.loading) * 1.8);
            return (
              <path
                key={`e-${i}`}
                d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
                fill="none"
                stroke={e.loading > 0 ? '#34d399' : '#fb7185'}
                strokeOpacity={0.35}
                strokeWidth={sw}
              >
                <title>{`${e.factor} -> ${e.symbol} · loading ${e.loading.toFixed(3)}`}</title>
              </path>
            );
          })}

        {/* factor nodes (left) */}
        {factors.map((f, i) => {
          const fy = yPos(i, factors.length);
          return (
            <g key={`f-${f.id}`}>
              <rect x={FX} y={fy - 7} width={14} height={14} rx={3} fill="#fbbf24">
                <title>{`${f.id} — ${f.name}`}</title>
              </rect>
              <text x={FX - 8} y={fy - 2} textAnchor="end">
                <tspan x={FX - 8} dy={0} fontSize={10} fontWeight={600} fill="#d4d4d8">
                  {f.id}
                </tspan>
                <tspan x={FX - 8} dy={11} fontSize={8} fill="#71717a">
                  {trunc(f.name, 22)}
                </tspan>
              </text>
            </g>
          );
        })}

        {/* stock nodes (right) */}
        {stocks.map((s, si) => {
          const sy = yPos(si, stocks.length);
          const d = degree.get(s.symbol) ?? 0;
          const sign = domSign.get(s.symbol) ?? 1;
          const hub = d >= 3;
          return (
            <g key={`s-${s.symbol}`}>
              {hub && <circle cx={SX} cy={sy} r={10} fill="none" stroke="#fbbf24" strokeWidth={2} />}
              <circle cx={SX} cy={sy} r={7} fill={sign > 0 ? '#34d399' : '#fb7185'} stroke="#18181b" strokeWidth={1}>
                <title>{`${s.symbol} · degree ${d}${hub ? ' · HUB' : ''}`}</title>
              </circle>
              {hub && (
                <text x={SX} y={sy - 14} textAnchor="middle" fontSize={7} fill="#fbbf24">
                  HUB
                </text>
              )}
              <text
                x={SX + 13}
                y={sy}
                dominantBaseline="central"
                fontSize={9}
                fill="#d4d4d8"
                className="font-mono"
              >
                {s.symbol}
              </text>
              <text
                x={SX + 13 + s.symbol.length * 5.6 + 7}
                y={sy}
                dominantBaseline="central"
                fontSize={8}
                fill="#52525b"
                className="font-mono"
              >
                {`×${d}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
