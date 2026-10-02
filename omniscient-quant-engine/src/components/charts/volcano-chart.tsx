'use client';

/**
 * VolcanoChart — stock × feature significance scatter.
 * x = Cohen's d (symmetric domain around 0), y = -log10(q) BH-adjusted.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

export interface VolcanoPoint {
  stock: string;
  featureLabel: string;
  d: number;
  negLogQ: number;
  significant: boolean;
  q: number;
}

const W = 640;
const M = { top: 14, right: 18, bottom: 44, left: 48 };
const D_LINE = 0.5; // |d| significance threshold
const Q_LINE = 1.301; // -log10(0.05)

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

export default function VolcanoChart({
  points,
  height = 380,
  labelTop = 10,
}: {
  points: VolcanoPoint[];
  height?: number;
  labelTop?: number;
}) {
  const innerW = W - M.left - M.right;
  const innerH = height - M.top - M.bottom;

  const maxAbsD = points.reduce((m, p) => Math.max(m, Math.abs(p.d)), 0);
  const dMax = maxAbsD + 0.2;
  const yMax = points.reduce((m, p) => Math.max(m, p.negLogQ), 0) + 1;

  const px = (d: number) => M.left + ((d + dMax) / (2 * dMax)) * innerW;
  const py = (v: number) => M.top + innerH - (v / yMax) * innerH;

  const xTicks = niceTicks(-dMax, dMax, 5);
  const yTicks = niceTicks(0, yMax, 5);
  const xDec = decimalsFor(xTicks.length > 1 ? xTicks[1] - xTicks[0] : dMax);
  const yDec = decimalsFor(yTicks.length > 1 ? yTicks[1] - yTicks[0] : yMax);

  const labeled = [...points].sort((a, b) => b.negLogQ - a.negLogQ).slice(0, Math.max(0, labelTop));
  const showDLine = D_LINE < dMax;
  const showQLine = Q_LINE <= yMax;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Volcano plot: Cohen's d vs -log10(q)"
      >
        {/* threshold guides */}
        {showDLine && (
          <g stroke="#52525b" strokeDasharray="4 2" strokeWidth={1}>
            <line x1={px(-D_LINE)} x2={px(-D_LINE)} y1={M.top} y2={M.top + innerH} />
            <line x1={px(D_LINE)} x2={px(D_LINE)} y1={M.top} y2={M.top + innerH} />
          </g>
        )}
        {showQLine && (
          <g>
            <line
              x1={M.left}
              x2={M.left + innerW}
              y1={py(Q_LINE)}
              y2={py(Q_LINE)}
              stroke="#52525b"
              strokeDasharray="4 2"
              strokeWidth={1}
            />
            <text x={M.left + innerW - 4} y={py(Q_LINE) - 4} textAnchor="end" fontSize={9} fill="#71717a">
              q=0.05
            </text>
          </g>
        )}

        {/* points */}
        {points.map((p, i) => {
          const fill = p.significant ? (p.d > 0 ? '#34d399' : '#fb7185') : '#52525b';
          return (
            <circle
              key={`pt-${i}`}
              cx={px(p.d)}
              cy={py(p.negLogQ)}
              r={3.5}
              fill={fill}
              fillOpacity={0.75}
              stroke="#18181b"
              strokeWidth={0.5}
            >
              <title>
                {`${p.stock} · ${p.featureLabel} · d=${p.d.toFixed(3)} · q=${
                  p.q < 0.001 ? p.q.toExponential(1) : p.q.toFixed(4)
                }`}
              </title>
            </circle>
          );
        })}

        {/* top-N labels by negLogQ */}
        {labeled.map((p, i) => (
          <text
            key={`lb-${i}`}
            x={px(p.d) + 4}
            y={py(p.negLogQ) - 4}
            fontSize={9}
            fill="#d4d4d8"
            className="font-mono"
          >
            {p.stock}
          </text>
        ))}

        {/* x ticks */}
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line x1={px(t)} x2={px(t)} y1={M.top + innerH} y2={M.top + innerH + 4} stroke="#52525b" strokeWidth={1} />
            <text
              x={px(t)}
              y={M.top + innerH + 15}
              textAnchor="middle"
              fontSize={9}
              fill="#71717a"
              className="font-mono"
            >
              {t.toFixed(xDec)}
            </text>
          </g>
        ))}

        {/* y ticks */}
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line x1={M.left - 4} x2={M.left} y1={py(t)} y2={py(t)} stroke="#52525b" strokeWidth={1} />
            <text
              x={M.left - 7}
              y={py(t)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={9}
              fill="#71717a"
              className="font-mono"
            >
              {t.toFixed(yDec)}
            </text>
          </g>
        ))}

        {/* frame */}
        <rect x={M.left} y={M.top} width={innerW} height={innerH} fill="none" stroke="#27272a" />

        {/* axis labels */}
        <text x={M.left + innerW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="#a1a1aa">
          {"Cohen's d (Effect Size)"}
        </text>
        <text
          x={14}
          y={M.top + innerH / 2}
          transform={`rotate(-90, 14, ${M.top + innerH / 2})`}
          textAnchor="middle"
          fontSize={10}
          fill="#a1a1aa"
        >
          -log10(q) BH
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#34d399]" />
          {'ผ่านเกณฑ์ (q<0.05, |d|≥0.3)'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#fb7185]" />
          Down
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#52525b]" />
          ไม่ผ่าน
        </span>
      </div>
    </div>
  );
}
