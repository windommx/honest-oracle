'use client';

/**
 * EnrichmentDotPlot — horizontal dot plot of factor/theme enrichment.
 * x = geneRatio, dot size = hits, dot color = BH q-value band.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

export interface EnrichRow {
  theme: string;
  hits: number;
  count: number;
  geneRatio: number;
  bgRatio: number;
  q: number;
  hitsSymbols: string[];
}

const W = 640;
const M = { top: 18, right: 70, bottom: 42, left: 190 };

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

function niceTicks(min: number, max: number, target: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min === max ? [min] : [];
  const rawStep = (max - min) / Math.max(1, target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) {
    out.push(Number((Math.round(v / step) * step).toFixed(10)));
  }
  return out;
}

function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  if (step >= 0.1) return 1;
  if (step >= 0.01) return 2;
  return 3;
}

function dotFill(q: number): string {
  if (q < 0.05) return '#34d399';
  if (q < 0.2) return '#fbbf24';
  return '#52525b';
}

const LEGEND_TEXT = 'ขนาดจุด ∝ จำนวน hits · สีเขียว q<0.05 · เหลือง q<0.2 · เทา ไม่ผ่าน';

export default function EnrichmentDotPlot({ rows, height }: { rows: EnrichRow[]; height?: number }) {
  if (rows.length === 0) {
    const H = height ?? 160;
    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={11} fill="#71717a">
            ไม่มีธีมที่ enrich ได้
          </text>
        </svg>
        <div className="mt-2 text-[11px] text-zinc-500">{LEGEND_TEXT}</div>
      </div>
    );
  }

  const H = height ?? M.top + M.bottom + rows.length * 26;
  const innerW = W - M.left - M.right;
  const rowH = (H - M.top - M.bottom) / rows.length;

  const maxRatio = rows.reduce((m, r) => Math.max(m, r.geneRatio), 0);
  const xMax = (maxRatio > 0 ? maxRatio : 0.1) * 1.1;
  const px = (v: number) => M.left + (v / xMax) * innerW;
  const cy = (i: number) => M.top + rowH * (i + 0.5);

  const xTicks = niceTicks(0, xMax, 4);
  const xDec = decimalsFor(xTicks.length > 1 ? xTicks[1] - xTicks[0] : xMax);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Theme enrichment dot plot"
      >
        {/* x axis */}
        <line x1={M.left} x2={M.left + innerW} y1={H - M.bottom} y2={H - M.bottom} stroke="#27272a" />
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line x1={px(t)} x2={px(t)} y1={H - M.bottom} y2={H - M.bottom + 4} stroke="#52525b" strokeWidth={1} />
            <text
              x={px(t)}
              y={H - M.bottom + 15}
              textAnchor="middle"
              fontSize={9}
              fill="#71717a"
              className="font-mono"
            >
              {t.toFixed(xDec)}
            </text>
          </g>
        ))}
        <text x={M.left + innerW / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#a1a1aa">
          Ratio (hits / top-loadings)
        </text>

        {/* rows */}
        {rows.map((r, i) => {
          const rDot = Math.min(12, 4 + r.hits * 1.6);
          const cx = px(r.geneRatio);
          return (
            <g key={`${r.theme}-${i}`}>
              <circle cx={cx} cy={cy(i)} r={rDot} fill={dotFill(r.q)} stroke="#18181b" strokeWidth={1}>
                <title>
                  {`${trunc(r.theme, 44)} · hits ${r.hits}/${r.count} · ratio ${r.geneRatio.toFixed(
                    3,
                  )} (bg ${r.bgRatio.toFixed(3)}) · q=${
                    r.q < 0.001 ? r.q.toExponential(1) : r.q.toFixed(3)
                  }${r.hitsSymbols.length > 0 ? ` · ${r.hitsSymbols.join(', ')}` : ''}`}
                </title>
              </circle>
              <text
                x={cx + rDot + 5}
                y={cy(i)}
                dominantBaseline="central"
                fontSize={9}
                fill="#71717a"
                className="font-mono"
              >
                {`${r.hits}/${r.count}`}
              </text>
              <text
                x={M.left - 10}
                y={cy(i)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize={10}
                fill="#d4d4d8"
              >
                {trunc(r.theme, 26)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 text-[11px] text-zinc-500">{LEGEND_TEXT}</div>
    </div>
  );
}
