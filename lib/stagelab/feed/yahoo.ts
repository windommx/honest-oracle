import { type DailyBar, type PriceFeed, type SymbolBars, FeedError } from './types'

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Yahoo Finance chart API.                                                ║
// ║                                                                          ║
// ║  SET names carry the .BK suffix: PTT.BK, AOT.BK, KBANK.BK. The index is  ║
// ║  ^SETI. The endpoint needs no key, which is why it is first — but it is  ║
// ║  an undocumented endpoint with no availability promise, so a production  ║
// ║  deployment should move to a paid vendor and keep this for development.  ║
// ║                                                                          ║
// ║  parseChart is exported and tested against a recorded payload, so the    ║
// ║  parsing is proven without the network. Only `fetch` needs egress.       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

export const YAHOO_HOST = 'query1.finance.yahoo.com'

/** "PTT" -> "PTT.BK". Anything already suffixed, or an index, is left alone. */
export function toYahooSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase()
  if (s.startsWith('^') || s.includes('.')) return s
  return `${s}.BK`
}

interface ChartJson {
  chart?: {
    error?: { code?: string; description?: string } | null
    result?: Array<{
      meta?: { currency?: string; symbol?: string }
      timestamp?: number[]
      indicators?: {
        quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }>
        adjclose?: Array<{ adjclose?: (number | null)[] }>
      }
    }>
  }
}

export function parseChart(json: unknown, symbol: string, source = 'yahoo'): SymbolBars {
  const j = json as ChartJson
  const err = j.chart?.error
  if (err) throw new FeedError(`Yahoo returned an error: ${err.description ?? err.code}`, symbol)

  const res = j.chart?.result?.[0]
  if (!res) throw new FeedError('Yahoo returned no result for this symbol', symbol)

  const ts = res.timestamp ?? []
  const q = res.indicators?.quote?.[0]
  const adj = res.indicators?.adjclose?.[0]?.adjclose
  if (!q || ts.length === 0) throw new FeedError('Yahoo returned no price series', symbol)

  const bars: DailyBar[] = []
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i]
    // A null close is a non-trading day in Yahoo's grid, not a zero price.
    // Carrying it through as 0 would read as a total loss.
    if (c === null || c === undefined || !Number.isFinite(c)) continue
    const at = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? c : v)
    bars.push({
      t: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      o: at(q.open?.[i]),
      h: at(q.high?.[i]),
      l: at(q.low?.[i]),
      c,
      v: Math.max(0, at(q.volume?.[i]) === c ? 0 : (q.volume?.[i] ?? 0)),
      ...(adj && Number.isFinite(adj[i] as number) ? { adjClose: adj[i] as number } : {}),
    })
  }
  if (bars.length === 0) throw new FeedError('Yahoo returned only empty bars', symbol)
  bars.sort((a, b) => (a.t < b.t ? -1 : 1))

  return {
    symbol,
    source,
    fetchedAt: new Date().toISOString(),
    currency: res.meta?.currency ?? 'THB',
    bars,
  }
}

export class YahooFeed implements PriceFeed {
  readonly name = 'yahoo'
  constructor(private readonly years = 12) {}

  async fetch(symbol: string): Promise<SymbolBars> {
    const y = toYahooSymbol(symbol)
    const url =
      `https://${YAHOO_HOST}/v8/finance/chart/${encodeURIComponent(y)}` +
      `?interval=1d&range=${this.years}y&events=split%7Cdiv`
    let res: Response
    try {
      res = await globalThis.fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StageLab/1.0)' },
      })
    } catch (e) {
      // An egress policy denial arrives here as a transport failure. Say so,
      // rather than reporting it as "no data for this symbol".
      throw new FeedError(
        `Could not reach ${YAHOO_HOST}. If this is a 403 at CONNECT, the host is ` +
          `blocked by the network's egress policy and must be allowed before ` +
          `this provider can be used; the CSV importer needs no network.`,
        symbol,
        e,
      )
    }
    if (!res.ok) throw new FeedError(`Yahoo replied ${res.status} ${res.statusText}`, symbol)
    return parseChart(await res.json(), symbol, this.name)
  }
}
