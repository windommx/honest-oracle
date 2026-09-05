// ╔══════════════════════════════════════════════════════════════════╗
// ║  PORTFOLIO — selection without a composite score.                 ║
// ║  Ranking is LEXICOGRAPHIC over disclosed cells, so no weight was  ║
// ║  invented and the order can be re-derived by hand. Sizing is      ║
// ║  equal-weight with a sector cap: the one allocation rule that     ║
// ║  needs no forecast to justify it.                                 ║
// ╚══════════════════════════════════════════════════════════════════╝

import type { StabilityResult } from "./stability-gate";

export interface PortfolioPolicy {
  maxPositions: number;
  maxPerSector: number;
  /** dividend yield floor; null = no floor */
  minYield: number | null;
  /** admit "watch" verdicts after all "sustain" ones are used */
  allowWatch: boolean;
}

export const DEFAULT_PORTFOLIO: PortfolioPolicy = {
  maxPositions: 20,
  maxPerSector: 4,
  minYield: null,
  allowWatch: false,
};

export interface Holding {
  ticker: string;
  sector: string;
  weight: number;
  rank: number;
  key: { verdict: number; fScore: number; payoutFcf: number; streak: number; dividendYield: number };
}

export interface Selection {
  holdings: Holding[];
  excluded: { ticker: string; reason: string }[];
  rankingKey: string;
  policy: PortfolioPolicy;
}

export const RANKING_KEY =
  "verdict (sustain before watch) → Piotroski F scaled desc → dividends/FCF asc → DPS streak desc → dividend yield desc → ticker asc";

function key(s: StabilityResult): Holding["key"] {
  const a = s.base;
  return {
    verdict: a.verdict === "sustain" ? 0 : 1,
    fScore: a.fScore ? a.fScore.scaled : 0,
    payoutFcf: a.cells.payoutFcf ?? Number.POSITIVE_INFINITY,
    streak: a.cells.streak,
    dividendYield: a.cells.dividendYield ?? 0,
  };
}

export function compareCandidates(x: StabilityResult, y: StabilityResult): number {
  const a = key(x);
  const b = key(y);
  return (
    a.verdict - b.verdict ||
    b.fScore - a.fScore ||
    a.payoutFcf - b.payoutFcf ||
    b.streak - a.streak ||
    b.dividendYield - a.dividendYield ||
    x.base.ticker.localeCompare(y.base.ticker)
  );
}

export function selectPortfolio(candidates: StabilityResult[], policy: PortfolioPolicy = DEFAULT_PORTFOLIO): Selection {
  const excluded: Selection["excluded"] = [];
  const eligible: StabilityResult[] = [];

  for (const c of candidates) {
    const t = c.base.ticker;
    if (!c.pass) excluded.push({ ticker: t, reason: `unstable: verdict held ${c.agree}/${c.k} (${(c.stability * 100).toFixed(0)}%) below τ` });
    else if (c.base.verdict === "at-risk") excluded.push({ ticker: t, reason: `at-risk: ${c.base.reasons.map((r) => r.rule).join(", ")}` });
    else if (c.base.verdict === "watch" && !policy.allowWatch) excluded.push({ ticker: t, reason: `watch: ${c.base.reasons.map((r) => r.rule).join(", ")}` });
    else if (policy.minYield !== null && (c.base.cells.dividendYield ?? 0) < policy.minYield)
      excluded.push({ ticker: t, reason: `yield ${((c.base.cells.dividendYield ?? 0) * 100).toFixed(2)}% < floor` });
    else eligible.push(c);
  }

  eligible.sort(compareCandidates);

  const perSector = new Map<string, number>();
  const chosen: StabilityResult[] = [];
  for (const c of eligible) {
    if (chosen.length >= policy.maxPositions) {
      excluded.push({ ticker: c.base.ticker, reason: "maxPositions reached" });
      continue;
    }
    const sector = c.base.sector ?? "unclassified";
    const n = perSector.get(sector) ?? 0;
    if (n >= policy.maxPerSector) {
      excluded.push({ ticker: c.base.ticker, reason: `sector cap ${policy.maxPerSector} (${sector})` });
      continue;
    }
    perSector.set(sector, n + 1);
    chosen.push(c);
  }

  const w = chosen.length > 0 ? 1 / chosen.length : 0;
  const holdings: Holding[] = chosen.map((c, i) => ({
    ticker: c.base.ticker,
    sector: c.base.sector ?? "unclassified",
    weight: w,
    rank: i + 1,
    key: key(c),
  }));
  return { holdings, excluded, rankingKey: RANKING_KEY, policy };
}
