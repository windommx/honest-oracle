// ╔══════════════════════════════════════════════════════════════════╗
// ║  FABER GTAA — data loading & alignment.                           ║
// ║                                                                    ║
// ║  Parsers for the two free sources the CLI can pull from a user's   ║
// ║  machine (this hosted session's egress policy 403s finance hosts,  ║
// ║  so fetching happens locally):                                     ║
// ║  · Stooq CSV  (Date,Open,High,Low,Close[,Volume]) — NOT dividend-  ║
// ║    adjusted, so momentum computed from it understates high-yield   ║
// ║    assets (bonds, REITs). The CLI warns; Yahoo adjclose is the     ║
// ║    honest default for total-return work.                           ║
// ║  · Yahoo v8 chart JSON — close + adjclose.                         ║
// ║  Daily data is resampled to month-end (last trading day's print).  ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { MonthlySeries, Panel } from "./types";

/** "2026-08-21" → "2026-08". */
function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** Keep the LAST row of each month — the month-end print Faber's rules read. */
export function resampleMonthly(rows: { date: string; close: number; adj: number }[]): {
  months: string[];
  close: number[];
  adj: number[];
} {
  const sorted = [...rows].sort((a, b) => (a.date < b.date ? -1 : 1));
  const months: string[] = [];
  const close: number[] = [];
  const adj: number[] = [];
  for (const r of sorted) {
    if (!Number.isFinite(r.close) || !Number.isFinite(r.adj)) continue;
    const m = monthOf(r.date);
    if (months.length > 0 && months[months.length - 1] === m) {
      close[close.length - 1] = r.close;
      adj[adj.length - 1] = r.adj;
    } else {
      months.push(m);
      close.push(r.close);
      adj.push(r.adj);
    }
  }
  return { months, close, adj };
}

/** Stooq CSV. No adjusted column exists, so adj = close (price return only). */
export function parseStooqCsv(ticker: string, csv: string): MonthlySeries {
  const lines = csv.trim().split(/\r?\n/);
  const rows: { date: string; close: number; adj: number }[] = [];
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    if (parts.length < 5) continue;
    const close = Number(parts[4]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parts[0]) || !Number.isFinite(close)) continue;
    rows.push({ date: parts[0], close, adj: close });
  }
  const m = resampleMonthly(rows);
  return { ticker, ...m };
}

/** Yahoo v8 chart JSON (interval 1d or 1mo), close + adjclose. */
export function parseYahooChart(ticker: string, json: string): MonthlySeries {
  const doc = JSON.parse(json) as {
    chart?: {
      result?: {
        timestamp?: number[];
        indicators?: {
          quote?: { close?: (number | null)[] }[];
          adjclose?: { adjclose?: (number | null)[] }[];
        };
      }[];
    };
  };
  const res = doc.chart?.result?.[0];
  const ts = res?.timestamp ?? [];
  const close = res?.indicators?.quote?.[0]?.close ?? [];
  const adj = res?.indicators?.adjclose?.[0]?.adjclose ?? close;
  const rows: { date: string; close: number; adj: number }[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = close[i];
    const a = adj[i] ?? c;
    if (c == null || a == null) continue;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    rows.push({ date, close: c, adj: a });
  }
  const m = resampleMonthly(rows);
  return { ticker, ...m };
}

/** Align every series onto the union month calendar. Months an asset has not
 *  listed yet (or gaps) become NaN — the engine treats NaN as "not eligible",
 *  never as zero. */
export function buildPanel(series: MonthlySeries[]): Panel {
  const monthSet = new Set<string>();
  for (const s of series) for (const m of s.months) monthSet.add(m);
  const months = Array.from(monthSet).sort();
  const index = new Map(months.map((m, i) => [m, i]));
  const panel: Panel = { months, series: {} };
  for (const s of series) {
    const close = new Array<number>(months.length).fill(NaN);
    const adj = new Array<number>(months.length).fill(NaN);
    s.months.forEach((m, i) => {
      const at = index.get(m);
      if (at !== undefined) {
        close[at] = s.close[i];
        adj[at] = s.adj[i];
      }
    });
    panel.series[s.ticker] = { close, adj };
  }
  return panel;
}
