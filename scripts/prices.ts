#!/usr/bin/env tsx
/**
 * Bring real prices in, and run the backtest on them.
 *
 *   npm run prices -- import ./data/csv        # a directory of SYMBOL.csv
 *   npm run prices -- fetch PTT AOT KBANK      # needs egress to the provider
 *   npm run prices -- backtest                 # run on whatever was imported
 *
 * The cache is a single JSON file so a result is reproducible: the same file
 * gives the same numbers, and the file records where each series came from.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { parseCsv } from '../lib/stagelab/feed/parse'
import { validate } from '../lib/stagelab/feed/validate'
import { alignUniverse } from '../lib/stagelab/feed/align'
import { YahooFeed } from '../lib/stagelab/feed/yahoo'
import type { SymbolBars } from '../lib/stagelab/feed/types'
import { runBacktest, DEFAULT_BACKTEST_CONFIG } from '../lib/stagelab/backtest'
import { STAGE_UNIVERSE } from '../lib/stagelab/seed-data'

const CACHE_DIR = join(process.cwd(), 'data')
const CACHE = join(CACHE_DIR, 'prices.json')
const BENCH = process.env.BENCHMARK_SYMBOL ?? 'SETI'

const f = (x: number | null, d = 2) => (x === null ? '—' : x.toFixed(d))
const baht = (x: number) => '฿' + Math.round(x).toLocaleString()

function save(series: SymbolBars[]) {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })
  writeFileSync(CACHE, JSON.stringify(series, null, 0))
  console.log(`\nSaved ${series.length} series to ${CACHE}`)
}

function load(): SymbolBars[] {
  if (!existsSync(CACHE)) {
    console.error(`No price cache at ${CACHE}. Run "import" or "fetch" first.`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(CACHE, 'utf8')) as SymbolBars[]
}

function report(series: SymbolBars[]): SymbolBars[] {
  const ok: SymbolBars[] = []
  let errors = 0
  for (const s of series) {
    const r = validate(s)
    const errs = r.issues.filter((i) => i.severity === 'error')
    const warns = r.issues.filter((i) => i.severity === 'warning')
    const mark = r.usable ? 'ok  ' : 'FAIL'
    console.log(`  ${mark} ${s.symbol.padEnd(10)} ${String(r.bars).padStart(5)} bars  ${r.from} .. ${r.to}` +
      (warns.length ? `  (${warns.length} warning${warns.length > 1 ? 's' : ''})` : ''))
    for (const e of errs.slice(0, 3)) console.log(`        ${e.code}${e.at ? ' @ ' + e.at : ''}: ${e.message}`)
    for (const w of warns.slice(0, 2)) console.log(`        note ${w.code}${w.at ? ' @ ' + w.at : ''}: ${w.message}`)
    if (r.usable) ok.push(s)
    else errors++
  }
  if (errors) console.log(`\n${errors} series rejected. They are NOT included — a backtest on bad prices is worse than none.`)
  return ok
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2)

  if (cmd === 'import') {
    const dir = args[0]
    if (!dir || !existsSync(dir)) { console.error('Usage: prices import <directory of SYMBOL.csv>'); process.exit(1) }
    const files = readdirSync(dir).filter((x) => ['.csv', '.txt', '.tsv'].includes(extname(x).toLowerCase()))
    if (!files.length) { console.error(`No CSV files in ${dir}`); process.exit(1) }
    console.log(`Reading ${files.length} files from ${dir}\n`)
    const series: SymbolBars[] = []
    for (const file of files) {
      const symbol = basename(file, extname(file)).toUpperCase()
      try {
        series.push(parseCsv(readFileSync(join(dir, file), 'utf8'), symbol, `file:${file}`))
      } catch (e) {
        console.log(`  FAIL ${symbol.padEnd(10)} ${(e as Error).message}`)
      }
    }
    save(report(series))
    return
  }

  if (cmd === 'fetch') {
    const symbols = args.length ? args : STAGE_UNIVERSE.map((s) => s.symbol)
    const feed = new YahooFeed()
    console.log(`Fetching ${symbols.length + 1} series from ${feed.name}\n`)
    const series: SymbolBars[] = []
    for (const symbol of [BENCH, ...symbols]) {
      try {
        series.push(await feed.fetch(symbol === 'SETI' ? '^SETI' : symbol))
        process.stdout.write('.')
      } catch (e) {
        console.log(`\n  FAIL ${symbol}: ${(e as Error).message}`)
      }
    }
    console.log()
    save(report(series))
    return
  }

  if (cmd === 'backtest') {
    const series = load()
    const bench = series.find((s) => s.symbol.toUpperCase().replace('^', '') === BENCH.replace('^', ''))
    if (!bench) { console.error(`No benchmark series "${BENCH}" in the cache. Import it too.`); process.exit(1) }
    const stocks = series.filter((s) => s !== bench)
    const sectorOf = new Map(STAGE_UNIVERSE.map((s) => [s.symbol, s.sector]))
    // The label has to describe what is known, and an importer cannot know
    // whether a file holds real prices. It knows how they arrived. Writing
    // "real prices" here would put a claim on the result card that nothing in
    // the pipeline can support — the first run of this script did exactly
    // that over a directory of synthetic fixtures.
    const providers = Array.from(new Set(stocks.map((s) => s.source.split(':')[0])))
    const { market, included, excluded } = alignUniverse(stocks, bench, {
      source: `imported via ${providers.join(', ')} — ${stocks.length} symbols, benchmark ${bench.symbol}`,
    })
    if (excluded.length) {
      console.log(`Excluded for too little history: ${excluded.map((e) => `${e.symbol}(${e.weeks}w)`).join(', ')}`)
    }
    const universe = included.map((symbol) => ({ symbol, sector: sectorOf.get(symbol) ?? 'OTHER' }))
    const weeks = market.bars.get(included[0])?.length ?? 0
    console.log(`\nRunning on ${universe.length} symbols x ${weeks} weeks (${(weeks / 52).toFixed(1)} years)`)
    console.log(`Source: ${market.source}\n`)

    const r = runBacktest(universe, DEFAULT_BACKTEST_CONFIG, market)
    const s = r.stats
    console.log(`  data source     ${r.dataSource}`)
    console.log(`  final value     ${baht(s.finalValue)}  from ${baht(DEFAULT_BACKTEST_CONFIG.capital)}`)
    console.log(`  total return    ${f(s.totalReturnPct)}%      CAGR ${f(s.cagrPct)}%`)
    console.log(`  max drawdown    ${f(s.maxDdPct)}%      longest underwater ${s.longestDdWeeks}w`)
    console.log(`  trades          ${s.totalTrades}       win ${f(s.winRatePct, 1)}%      PF ${f(s.profitFactor)}`)
    console.log(`  capital used    ${f(s.capitalDeployedPct, 1)}% on average`)
    console.log(`\n  benchmark       ${f(r.benchmark.totalReturnPct)}%   CAGR ${f(r.benchmark.cagrPct)}%   maxDD ${f(r.benchmark.maxDdPct)}%`)
    console.log(`  EXCESS          ${f(r.benchmark.excessReturnPct)} points`)
    console.log(`\n  robustness      ${r.robustness.verdict} (gap ${f(r.robustness.cagrGapPct)} points)`)
    for (const e of r.exitBreakdown) console.log(`  ${String(e.reason).padEnd(15)} ${String(e.count).padStart(3)}  avg ${f(e.avgPct)}%`)
    return
  }

  console.log(`Usage:
  npm run prices -- import <dir>     read SYMBOL.csv files (no network needed)
  npm run prices -- fetch [SYMBOLS]  pull from the provider (needs egress)
  npm run prices -- backtest         run the strategy on the imported prices

Benchmark symbol defaults to ${BENCH}; override with BENCHMARK_SYMBOL.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
