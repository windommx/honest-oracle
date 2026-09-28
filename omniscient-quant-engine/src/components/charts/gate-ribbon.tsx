'use client';

/**
 * GateRibbon — 5 horizontal lanes (G1..G5) of per-day pass/fail cells with
 * ENTRY signal triangle markers on the top edge.
 * days <= 120: responsive svg scaled to container width.
 * days > 120 : fixed 2px cells inside a horizontally scrollable wrapper.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

export interface GateRibbonRow {
  date: string;
  g1: boolean;
  g2: boolean;
  g3: boolean;
  g4: boolean;
  g5: boolean;
  signal: string;
}

const W = 640;
const LABEL_W = 80;

const LANES: Array<{ key: 'g1' | 'g2' | 'g3' | 'g4' | 'g5'; label: string }> = [
  { key: 'g1', label: 'G1 Regime' },
  { key: 'g2', label: 'G2 Dependence' },
  { key: 'g3', label: 'G3 Technical' },
  { key: 'g4', label: 'G4 Risk' },
  { key: 'g5', label: 'G5 Execution' },
];

function dayOfMonth(date: string): number | null {
  const n = Number(date.slice(8, 10));
  return Number.isFinite(n) ? n : null;
}

export default function GateRibbon({ rows, height = 150 }: { rows: GateRibbonRow[]; height?: number }) {
  if (rows.length === 0) {
    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
          <text x={W / 2} y={height / 2} textAnchor="middle" fontSize={11} fill="#71717a">
            ไม่มีข้อมูล gate
          </text>
        </svg>
      </div>
    );
  }

  const days = rows.length;
  const dense = days > 120;
  const cellW = dense ? 2 : (W - LABEL_W - 10) / days;
  const svgW = dense ? LABEL_W + days * cellW + 10 : W;
  const lanesTop = 24;
  const lanesBottom = height - 6;
  const laneH = (lanesBottom - lanesTop) / LANES.length;
  const cellH = Math.max(2, laneH - 2);
  const tickStep = dense ? 25 : 10;

  const renderCells = () => (
    <g>
      {/* sparse day-of-month ticks */}
      {rows.map((r, j) => {
        if (j % tickStep !== 0) return null;
        const dom = dayOfMonth(r.date);
        if (dom === null) return null;
        return (
          <text
            key={`t-${j}`}
            x={LABEL_W + j * cellW}
            y={14}
            fontSize={8}
            fill="#52525b"
            className="font-mono"
          >
            {dom}
          </text>
        );
      })}

      {/* lanes */}
      {LANES.map((lane, li) => {
        const y = lanesTop + li * laneH + 1;
        return (
          <g key={lane.key}>
            <text
              x={LABEL_W - 8}
              y={lanesTop + (li + 0.5) * laneH}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={9}
              fill="#a1a1aa"
            >
              {lane.label}
            </text>
            {rows.map((r, j) => {
              const pass = r[lane.key];
              return (
                <rect
                  key={`c-${li}-${j}`}
                  x={LABEL_W + j * cellW}
                  y={y}
                  width={Math.max(0.75, cellW - 1)}
                  height={cellH}
                  fill={pass ? '#10b981' : '#3f3f46'}
                  fillOpacity={pass ? 0.8 : 1}
                >
                  <title>{`${r.date} — ${lane.label}: ${pass ? 'ผ่าน' : 'ตก'}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}

      {/* entry signal markers on top edge */}
      {rows.map((r, j) => {
        const pull = r.signal === 'ENTRY_PULLBACK';
        const mom = r.signal === 'ENTRY_MOMENTUM';
        if (!pull && !mom) return null;
        const cx = LABEL_W + (j + 0.5) * cellW;
        return (
          <polygon
            key={`s-${j}`}
            points={`${cx},${lanesTop - 7} ${cx - 3},${lanesTop - 2} ${cx + 3},${lanesTop - 2}`}
            fill={pull ? '#fbbf24' : '#34d399'}
          >
            <title>{`${r.date} · ${r.signal}`}</title>
          </polygon>
        );
      })}
    </g>
  );

  return (
    <div className="w-full">
      {dense ? (
        <div className="overflow-x-auto">
          <svg
            width={svgW}
            height={height}
            viewBox={`0 0 ${svgW} ${height}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="5-gate ribbon (scrollable)"
          >
            {renderCells()}
          </svg>
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${height}`}
          width="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="5-gate ribbon"
        >
          {renderCells()}
        </svg>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 bg-[#10b981]" />
          ผ่าน
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 bg-[#3f3f46]" />
          ตก
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 bg-[#fbbf24]" />
          Pullback
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 bg-[#34d399]" />
          Momentum
        </span>
      </div>
    </div>
  );
}
