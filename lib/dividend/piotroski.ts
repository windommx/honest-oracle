// Piotroski (2000) F-score: nine binary tests on two consecutive filings.
// Each test is a direct comparison of two counts → paccakkha. The total is a
// count of passes, so it admits ordinal use only (rank, threshold) — never
// averaging across firms as if it were a measurement.

import type { AnnualRecord } from "./types";

export interface FTest {
  id: string;
  pass: boolean;
  detail: string;
}

export interface FScore {
  /** passes among computable tests */
  score: number;
  /** how many of the nine could be computed from the two filings */
  computable: number;
  /** score rescaled to /9 when some tests are missing; equals `score` otherwise */
  scaled: number;
  tests: FTest[];
  notComputable: string[];
}

function roa(r: AnnualRecord): number | null {
  return r.totalAssets > 0 ? r.netIncome / r.totalAssets : null;
}
function grossMargin(r: AnnualRecord): number | null {
  return r.grossProfit !== undefined && r.revenue > 0 ? r.grossProfit / r.revenue : null;
}
function turnover(r: AnnualRecord): number | null {
  return r.totalAssets > 0 ? r.revenue / r.totalAssets : null;
}
function leverage(r: AnnualRecord): number | null {
  return r.totalAssets > 0 ? r.longTermDebt / r.totalAssets : null;
}
function currentRatio(r: AnnualRecord): number | null {
  return r.currentLiabilities > 0 ? r.currentAssets / r.currentLiabilities : null;
}

export function piotroskiFScore(cur: AnnualRecord, prev: AnnualRecord): FScore {
  const tests: FTest[] = [];
  const notComputable: string[] = [];

  const cmp = (id: string, a: number | null, b: number | null, op: ">" | "<" | "<=", detail: string) => {
    if (a === null || b === null) {
      notComputable.push(id);
      return;
    }
    const pass = op === ">" ? a > b : op === "<" ? a < b : a <= b;
    tests.push({ id, pass, detail });
  };

  const roaC = roa(cur);
  const roaP = roa(prev);
  cmp("roa_positive", roaC, 0, ">", "net income / total assets > 0");
  cmp("cfo_positive", cur.cfo, 0, ">", "operating cash flow > 0");
  cmp("roa_improving", roaC, roaP, ">", "ROA this year > ROA last year");
  cmp("accrual", cur.cfo, cur.netIncome, ">", "operating cash flow > net income");
  cmp("leverage_falling", leverage(cur), leverage(prev), "<", "long-term debt / assets fell");
  cmp("liquidity_rising", currentRatio(cur), currentRatio(prev), ">", "current ratio rose");
  cmp("no_dilution", cur.sharesOutstanding, prev.sharesOutstanding, "<=", "shares outstanding did not rise");
  cmp("margin_rising", grossMargin(cur), grossMargin(prev), ">", "gross margin rose");
  cmp("turnover_rising", turnover(cur), turnover(prev), ">", "asset turnover rose");

  const score = tests.filter((t) => t.pass).length;
  const computable = tests.length;
  const scaled = computable === 0 ? 0 : (score * 9) / computable;
  return { score, computable, scaled, tests, notComputable };
}
