'use client';

/**
 * HeatmapGrid — symmetric-around-zero diverging heatmap (emerald/rose on zinc).
 * cols <= 60: responsive svg scaled to container width.
 * cols > 60 : fixed 14px cells inside a horizontally scrollable wrapper.
 * Pure presentational; parent supplies the dark zinc-950 surface.
 */

const W = 640;

function heatColor(v: number, maxAbs: number): string {
  if (!Number.isFinite(maxAbs) || maxAbs <= 0) return '#27272a';
  const t = Math.min(1, Math.abs(v) / maxAbs);
  if (t < 0.04) return '#27272a'; // v ~ 0
  const a = 0.15 + 0.85 * t; // alpha ramp: 0.15 (dim) -> 1 (full)
  return v > 0 ? `rgba(52,211,153,${a.toFixed(3)})` : `rgba(251,113,133,${a.toFixed(3)})`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

export default function HeatmapGrid({
  matrix,
  rowLabels,
  colLabels,
  colGroupColors,
  height = 340,
  showRowLabels = true,
}: {
  matrix: number[][];
  rowLabels: string[];
  colLabels: string[];
  colGroupColors?: string[];
  height?: number;
  showRowLabels?: boolean;
}) {
  const rows = matrix.length;
  const cols = rows > 0 ? matrix[0].length : 0;

  if (rows === 0 || cols === 0) {
    return (
      <div className="w-full">
        <svg viewBox={`0 0 ${W} ${height}`} width="100%" preserveAspectRatio="xMidYMid meet">
          <text x={W / 2} y={height / 2} textAnchor="middle" fontSize={11} fill="#71717a">
            ไม่มีข้อมูล matrix
          </text>
        </svg>
      </div>
    );
  }

  let maxAbs = 0;
  for (const row of matrix) {
    for (const v of row) {
      const a = Math.abs(v);
      if (a > maxAbs) maxAbs = a;
    }
  }

  const groupColors = colGroupColors ?? [];
  const hasBand = groupColors.length > 0;
  const bandY = 4;
  const labelY = bandY + (hasBand ? 4 : 0) + 11; // column label baseline
  const topPad = labelY + 4;
  const bottomPad = 6;
  const rowLabelW = showRowLabels ? 72 : 10;
  const dense = cols > 60;
  const cell = 14;

  const labelOf = (i: number, j: number) =>
    `${rowLabels[i] ?? `R${i}`} × ${colLabels[j] ?? `C${j}`}: ${matrix[i][j].toFixed(3)}`;

  const renderInner = (x0: number, y0: number, cw: number, ch: number) => (
    <g>
      {hasBand &&
        groupColors.map((c, j) =>
          c ? (
            <rect
              key={`b-${j}`}
              x={x0 + j * cw}
              y={bandY}
              width={Math.max(1, cw - 1)}
              height={4}
              fill={c}
            />
          ) : null,
        )}
      {colLabels.map((cl, j) =>
        j % 5 === 0 ? (
          <text
            key={`c-${j}`}
            x={x0 + (j + 0.5) * cw}
            y={labelY}
            textAnchor="middle"
            fontSize={8}
            fill="#52525b"
            className="font-mono"
          >
            {cl}
          </text>
        ) : null,
      )}
      {matrix.map((row, i) =>
        row.map((v, j) => (
          <rect
            key={`cell-${i}-${j}`}
            x={x0 + j * cw + 0.5}
            y={y0 + i * ch + 0.5}
            width={Math.max(1, cw - 1)}
            height={Math.max(1, ch - 1)}
            fill={heatColor(v, maxAbs)}
          >
            <title>{labelOf(i, j)}</title>
          </rect>
        )),
      )}
      {showRowLabels &&
        rowLabels.map((rl, i) => (
          <text
            key={`r-${i}`}
            x={x0 - 6}
            y={y0 + (i + 0.5) * ch}
            textAnchor="end"
            dominantBaseline="central"
            fontSize={8.5}
            fill="#a1a1aa"
          >
            {trunc(rl, 13)}
          </text>
        ))}
    </g>
  );

  if (dense) {
    const svgW = rowLabelW + cols * cell + 10;
    const svgH = topPad + rows * cell + bottomPad;
    return (
      <div className="w-full">
        <div className="overflow-x-auto">
          <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Heatmap (scrollable)"
          >
            {renderInner(rowLabelW, topPad, cell, cell)}
          </svg>
        </div>
      </div>
    );
  }

  const rightPad = 10;
  const innerW = W - rowLabelW - rightPad;
  const innerH = height - topPad - bottomPad;
  const cellW = innerW / cols;
  const cellH = innerH / rows;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Heatmap"
      >
        {renderInner(rowLabelW, topPad, cellW, cellH)}
      </svg>
    </div>
  );
}
