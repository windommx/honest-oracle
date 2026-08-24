// ╔══════════════════════════════════════════════════════════════════╗
// ║  FABER GTAA — signal engine.                                      ║
// ║                                                                    ║
// ║  Pure month-end math, no I/O, no dates from the wall clock.        ║
// ║  Everything here is unit-tested against series whose correct       ║
// ║  answers are computable BY CONSTRUCTION (constant-growth series    ║
// ║  have closed-form SMAs and k-month returns), plus a golden test    ║
// ║  pinned to the September signal table the strategy post shows.     ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { AssetSignal, GtaaConfig, Panel, SignalSnapshot } from "./types";

/** Simple moving average of the n values ending at (and including) `end`.
 *  Null when there are not yet n finite values. */
export function sma(xs: number[], n: number, end: number): number | null {
  if (n <= 0 || end < n - 1 || end >= xs.length) return null;
  let sum = 0;
  for (let i = end - n + 1; i <= end; i++) {
    const v = xs[i];
    if (!Number.isFinite(v)) return null;
    sum += v;
  }
  return sum / n;
}

/** k-month simple return ending at `end`: adj[end] / adj[end-k] - 1. */
export function kMonthReturn(adj: number[], k: number, end: number): number | null {
  if (k <= 0 || end - k < 0 || end >= adj.length) return null;
  const a = adj[end - k];
  const b = adj[end];
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
  return b / a - 1;
}

/** Momentum score: arithmetic mean of the lookback returns (Faber's 1/3/6/12).
 *  Null if ANY lookback is unavailable — a partially-warmed score would
 *  silently overweight recent months, so we refuse to produce one. */
export function momentumScore(adj: number[], end: number, lookbacks: number[]): number | null {
  let sum = 0;
  for (const k of lookbacks) {
    const r = kMonthReturn(adj, k, end);
    if (r === null) return null;
    sum += r;
  }
  return sum / lookbacks.length;
}

/** Deterministic ordering: score descending, ties broken alphabetically so
 *  two runs of the same data can never disagree. */
function byScoreDesc(a: { ticker: string; score: number }, b: { ticker: string; score: number }): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.ticker < b.ticker ? -1 : 1;
}

/** Compute the full month-end signal table + next month's target weights.
 *  `end` indexes panel.months. Tickers = investable universe (cash excluded). */
export function computeSignals(
  panel: Panel,
  tickers: string[],
  end: number,
  cfg: GtaaConfig,
): SignalSnapshot {
  const table: AssetSignal[] = tickers.map((ticker) => {
    const s = panel.series[ticker];
    if (!s) {
      return { ticker, score: null, aboveSma: null, eligible: false, rank: null, selected: false, weight: 0 };
    }
    const gateSeries = cfg.smaOn === "price" ? s.close : s.adj;
    const avg = sma(gateSeries, cfg.smaMonths, end);
    const score = momentumScore(s.adj, end, cfg.lookbacks);
    const px = gateSeries[end];
    const aboveSma = avg !== null && Number.isFinite(px) ? px > avg : null;
    const eligible = avg !== null && score !== null;
    return { ticker, score, aboveSma, eligible, rank: null, selected: false, weight: 0 };
  });

  const byTicker = new Map(table.map((r) => [r.ticker, r]));

  // Which assets get ranked depends on the mode; how a slot pays out does too.
  const rankable =
    cfg.mode === "filterThenRank"
      ? table.filter((r) => r.eligible && r.aboveSma === true)
      : table.filter((r) => r.eligible);

  const ranked = rankable
    .map((r) => ({ ticker: r.ticker, score: r.score as number }))
    .sort(byScoreDesc);

  ranked.forEach((r, i) => {
    const row = byTicker.get(r.ticker);
    if (row) row.rank = i + 1;
  });

  const slotWeight = 1 / cfg.topN;
  const weights: Record<string, number> = {};
  let invested = 0;

  for (const r of ranked.slice(0, cfg.topN)) {
    const row = byTicker.get(r.ticker);
    if (!row) continue;
    // filterThenRank: everything ranked already passed the gate.
    // rankThenFilter: a top-N slot whose asset sits below its SMA goes to cash.
    const passes = cfg.mode === "filterThenRank" ? true : row.aboveSma === true;
    if (passes) {
      row.selected = true;
      row.weight = slotWeight;
      weights[r.ticker] = slotWeight;
      invested += slotWeight;
    }
  }

  // Empty slots (gate failures or a thin universe) sit in cash — the paper's
  // point is that this cash IS the risk management, so it is never
  // redistributed into the surviving positions.
  const cashWeight = Math.max(0, Math.min(1, 1 - invested));

  return { month: panel.months[end] ?? "", table, weights, cashWeight };
}

/** Render the snapshot as the post's table: rank / ticker / score / gate / weight. */
export function formatSignalTable(snap: SignalSnapshot, cfg: GtaaConfig): string {
  const rows = [...snap.table].sort((a, b) => {
    const as = a.score ?? -Infinity;
    const bs = b.score ?? -Infinity;
    return bs - as || (a.ticker < b.ticker ? -1 : 1);
  });
  const pct = (x: number | null) => (x === null ? "   n/a " : `${(x * 100).toFixed(2)}%`.padStart(7));
  const lines = [
    `Signal @ ${snap.month}  (SMA ${cfg.smaMonths}M on ${cfg.smaOn}, lookbacks ${cfg.lookbacks.join("/")}M, top ${cfg.topN}, ${cfg.mode})`,
    "rank  ticker  score    gate        weight",
  ];
  for (const r of rows) {
    const gate = r.aboveSma === null ? "warmup" : r.aboveSma ? "PASS" : "FAIL->cash";
    const rank = r.rank === null ? " -" : String(r.rank).padStart(2);
    const w = r.selected ? `${(r.weight * 100).toFixed(2)}%` : "-";
    lines.push(`${rank}    ${r.ticker.padEnd(6)}  ${pct(r.score)}  ${gate.padEnd(10)}  ${w}`);
  }
  lines.push(`cash (${cfg.cashTicker}): ${(snap.cashWeight * 100).toFixed(2)}%`);
  return lines.join("\n");
}
