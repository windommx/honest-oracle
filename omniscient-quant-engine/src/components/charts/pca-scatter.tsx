'use client';

/**
 * PcaScatterChart — PCA (PC1, PC2) scatter with symmetric domains, QC outlier
 * marks (rose fill + X cross + dashed amber ring) and per-point symbol labels.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

export interface PcaPoint {
  symbol: string;
  pc1: number;
  pc2: number;
  outlier: boolean;
  sector: string;
}

const W = 640;
const M = { top: 16, right: 22, bottom: 42, left: 46 };

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

export default function PcaScatterChart({
  points,
  height = 380,
}: {
  points: PcaPoint[];
  height?: number;
}) {
  const innerW = W - M.left - M.right;
  const innerH = height - M.top - M.bottom;

  const m1 = points.reduce((m, p) => Math.max(m, Math.abs(p.pc1)), 0);
  const m2 = points.reduce((m, p) => Math.max(m, Math.abs(p.pc2)), 0);
  const xMax = (m1 > 0 ? m1 : 1) * 1.1;
  const yMax = (m2 > 0 ? m2 : 1) * 1.1;

  const px = (v: number) => M.left + ((v + xMax) / (2 * xMax)) * innerW;
  const py = (v: number) => M.top + innerH - ((v + yMax) / (2 * yMax)) * innerH;

  const xTicks = niceTicks(-xMax, xMax, 5);
  const yTicks = niceTicks(-yMax, yMax, 5);
  const xDec = decimalsFor(xTicks.length > 1 ? xTicks[1] - xTicks[0] : xMax);
  const yDec = decimalsFor(yTicks.length > 1 ? yTicks[1] - yTicks[0] : yMax);

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="PCA scatter: PC1 vs PC2"
      >
        {/* grid; zero lines slightly stronger */}
        {xTicks.map((t) => (
          <line
            key={`gx-${t}`}
            x1={px(t)}
            x2={px(t)}
            y1={M.top}
            y2={M.top + innerH}
            stroke={Math.abs(t) < 1e-9 ? '#3f3f46' : '#27272a'}
            strokeWidth={1}
          />
        ))}
        {yTicks.map((t) => (
          <line
            key={`gy-${t}`}
            x1={M.left}
            x2={M.left + innerW}
            y1={py(t)}
            y2={py(t)}
            stroke={Math.abs(t) < 1e-9 ? '#3f3f46' : '#27272a'}
            strokeWidth={1}
          />
        ))}

        {/* points + labels */}
        {points.map((p, i) => {
          const cx = px(p.pc1);
          const cy = py(p.pc2);
          const lx = cx + (p.outlier ? 12 : 6);
          const ly = cy + (p.outlier ? -12 : i % 2 === 0 ? -6 : 10);
          return (
            <g key={`${p.symbol}-${i}`}>
              <circle
                cx={cx}
                cy={cy}
                r={6}
                fill={p.outlier ? '#fb7185' : '#34d399'}
                fillOpacity={p.outlier ? 1 : 0.8}
                stroke="#18181b"
                strokeWidth={0.5}
              >
                <title>
                  {`${p.symbol} (${p.sector}) · PC1 ${p.pc1.toFixed(3)} · PC2 ${p.pc2.toFixed(3)}${
                    p.outlier ? ' · OUTLIER' : ''
                  }`}
                </title>
              </circle>
              {p.outlier && (
                <>
                  <circle cx={cx} cy={cy} r={10} fill="none" stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 2" />
                  <line x1={cx - 3.5} y1={cy - 3.5} x2={cx + 3.5} y2={cy + 3.5} stroke="#18181b" strokeWidth={1.5} />
                  <line x1={cx + 3.5} y1={cy - 3.5} x2={cx - 3.5} y2={cy + 3.5} stroke="#18181b" strokeWidth={1.5} />
                </>
              )}
              <text x={lx} y={ly} fontSize={8.5} fill="#d4d4d8" className="font-mono">
                {p.symbol}
              </text>
            </g>
          );
        })}

        {/* frame */}
        <rect x={M.left} y={M.top} width={innerW} height={innerH} fill="none" stroke="#27272a" />

        {/* ticks */}
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

        {/* axis labels */}
        <text x={M.left + innerW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="#a1a1aa">
          PC1
        </text>
        <text
          x={14}
          y={M.top + innerH / 2}
          transform={`rotate(-90, 14, ${M.top + innerH / 2})`}
          textAnchor="middle"
          fontSize={10}
          fill="#a1a1aa"
        >
          PC2
        </text>
      </svg>

      <div className="mt-2 text-[11px] text-zinc-500">
        จุดแดง = QC outlier (Mahalanobis χ² 99.7%) — ตรวจก่อนใช้ downstream
      </div>
    </div>
  );
}
