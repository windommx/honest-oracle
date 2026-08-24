// ╔══════════════════════════════════════════════════════════════════╗
// ║  FABER GTAA — CLI.                                                ║
// ║                                                                    ║
// ║    npm run gtaa -- demo                 seeded synthetic market    ║
// ║    npm run gtaa -- fetch --dir data     pull real data (local box) ║
// ║    npm run gtaa -- run   --dir data     backtest on fetched data   ║
// ║    npm run gtaa -- sensitivity [--dir]  SMA × topN × mode grid     ║
// ║                                                                    ║
// ║  Flags: --seed 42 · --sma 10 · --top 6 · --cost 10 (bps, one-way)  ║
// ║         --mode filterThenRank|rankThenFilter · --sma-on price|tr   ║
// ║                                                                    ║
// ║  `fetch` needs a network that allows finance hosts (a laptop —     ║
// ║  the hosted session's egress policy 403s them). Yahoo adjclose is  ║
// ║  preferred; Stooq is the fallback and is NOT dividend-adjusted.    ║
// ╚══════════════════════════════════════════════════════════════════╝

import fs from "node:fs";
import path from "node:path";
import { buildPanel, parseStooqCsv, parseYahooChart } from "../lib/faber-gtaa/data";
import { computeSignals, formatSignalTable } from "../lib/faber-gtaa/engine";
import { runBacktest, buyAndHold, type BacktestResult } from "../lib/faber-gtaa/backtest";
import { generateSynthetic } from "../lib/faber-gtaa/synthetic";
import {
  CASH_TICKER, GTAA_AGG_TOP6, UNIVERSE_13,
  type GtaaConfig, type MonthlySeries, type Panel, type SelectionMode,
} from "../lib/faber-gtaa/types";

const TICKERS = UNIVERSE_13.map((a) => a.ticker);
const ALL_TICKERS = [...TICKERS, CASH_TICKER, "SPY"];

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function cfgFromFlags(): GtaaConfig {
  return {
    ...GTAA_AGG_TOP6,
    smaMonths: Number(flag("sma", "10")),
    topN: Number(flag("top", "6")),
    costBps: Number(flag("cost", "0")),
    mode: flag("mode", "filterThenRank") as SelectionMode,
    smaOn: flag("sma-on", "price") === "tr" ? "totalReturn" : "price",
  };
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

function report(name: string, res: BacktestResult): string {
  const s = res.stats;
  return [
    `── ${name} ──`,
    `period          ${res.months[0]} → ${res.months[res.months.length - 1]}  (${s.months} months, warm-up ${res.warmupMonths})`,
    `CAGR            ${pct(s.cagr)}`,
    `volatility      ${pct(s.vol)} (annualised)`,
    `sharpe          ${s.sharpe.toFixed(2)}   sortino ${s.sortino.toFixed(2)}`,
    `max drawdown    ${pct(s.maxDrawdown)}   longest underwater ${s.longestUnderwaterMonths} mo`,
    `win rate        ${pct(s.winRate)}   best ${pct(s.bestMonth)} / worst ${pct(s.worstMonth)}`,
    `avg exposure    ${pct(s.avgExposure)}   avg turnover ${pct(s.avgMonthlyTurnover)}/mo   cost drag ${pct(s.totalCostDrag)}`,
  ].join("\n");
}

function yearlyTable(strat: BacktestResult, bench: BacktestResult): string {
  const b = new Map(bench.yearly.map((y) => [y.year, y.ret]));
  const lines = ["year   GTAA      SPY B&H"];
  for (const y of strat.yearly) {
    const bh = b.get(y.year);
    lines.push(`${y.year}   ${pct(y.ret).padStart(8)}  ${bh === undefined ? "-" : pct(bh).padStart(8)}`);
  }
  return lines.join("\n");
}

function runAndPrint(panel: Panel, cfg: GtaaConfig, label: string): void {
  const strat = runBacktest(panel, TICKERS, cfg);
  const spy = panel.series["SPY"] ? buyAndHold(panel, "SPY", cfg) : null;
  console.log(report(`GTAA Agg Top ${cfg.topN} — ${label}`, strat));
  if (spy) {
    console.log("");
    console.log(report("SPY buy & hold (same months)", spy));
    console.log("");
    console.log(yearlyTable(strat, spy));
  }
  console.log("");
  const last = strat.snapshots[strat.snapshots.length - 1];
  const lastIdx = panel.months.length - 1;
  const current = computeSignals(panel, TICKERS, lastIdx, cfg);
  console.log("Latest signal (positions to hold NEXT month):");
  console.log(formatSignalTable(current, cfg));
  void last;
}

function loadDir(dir: string): MonthlySeries[] {
  const out: MonthlySeries[] = [];
  for (const t of ALL_TICKERS) {
    const json = path.join(dir, `${t}.json`);
    const csv = path.join(dir, `${t}.csv`);
    if (fs.existsSync(json)) out.push(parseYahooChart(t, fs.readFileSync(json, "utf8")));
    else if (fs.existsSync(csv)) out.push(parseStooqCsv(t, fs.readFileSync(csv, "utf8")));
    else console.warn(`missing ${t} (${t}.json / ${t}.csv) — skipped`);
  }
  return out;
}

async function fetchAll(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  for (const t of ALL_TICKERS) {
    const yahoo = `https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1mo&range=30y&events=div%2Csplit`;
    const stooq = `https://stooq.com/q/d/l/?s=${t.toLowerCase()}.us&i=m`;
    try {
      const r = await fetch(yahoo);
      if (!r.ok) throw new Error(`yahoo ${r.status}`);
      fs.writeFileSync(path.join(dir, `${t}.json`), await r.text());
      console.log(`${t}: yahoo ok (close + adjclose)`);
    } catch (e) {
      try {
        const r = await fetch(stooq);
        if (!r.ok) throw new Error(`stooq ${r.status}`);
        fs.writeFileSync(path.join(dir, `${t}.csv`), await r.text());
        console.log(`${t}: stooq ok — WARNING: price-only, momentum on yield assets will read low`);
      } catch (e2) {
        console.error(`${t}: FAILED (${String(e)} / ${String(e2)})`);
      }
    }
  }
}

function sensitivity(panel: Panel): void {
  console.log("SMA × topN × mode grid (CAGR / MaxDD / Sharpe):\n");
  console.log("sma  top  mode             CAGR      MaxDD     Sharpe  Turnover/mo");
  for (const smaMonths of [8, 10, 12]) {
    for (const topN of [3, 6, 9]) {
      for (const mode of ["filterThenRank", "rankThenFilter"] as const) {
        const cfg: GtaaConfig = { ...cfgFromFlags(), smaMonths, topN, mode };
        const r = runBacktest(panel, TICKERS, cfg);
        console.log(
          `${String(smaMonths).padEnd(4)} ${String(topN).padEnd(4)} ${mode.padEnd(15)} ${pct(r.stats.cagr).padStart(8)} ${pct(r.stats.maxDrawdown).padStart(9)} ${r.stats.sharpe.toFixed(2).padStart(8)} ${pct(r.stats.avgMonthlyTurnover).padStart(10)}`,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "demo";
  const dir = flag("dir", "data/gtaa");
  const cfg = cfgFromFlags();

  if (cmd === "fetch") {
    await fetchAll(dir);
    return;
  }

  let panel: Panel;
  let label: string;
  if (cmd === "demo" || !fs.existsSync(dir)) {
    const seed = Number(flag("seed", "42"));
    panel = buildPanel(generateSynthetic(seed));
    label = `SYNTHETIC market, seed ${seed} — regime-scripted demo, NOT real returns`;
    if (cmd !== "demo") console.warn(`no data dir '${dir}' — falling back to the synthetic demo\n`);
  } else {
    panel = buildPanel(loadDir(dir));
    label = `data dir ${dir}`;
  }

  if (cmd === "sensitivity") {
    sensitivity(panel);
    return;
  }
  runAndPrint(panel, cfg, label);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
