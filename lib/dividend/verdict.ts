// ╔══════════════════════════════════════════════════════════════════╗
// ║  VERDICT — the disclosed rule set.                                ║
// ║  Order: hard gates (at-risk) → quality gates (watch) → sustain.   ║
// ║  Every reason names the rule, the tier of knowing, what was       ║
// ║  measured, and whose evidence the rule leans on. Thresholds live  ║
// ║  in the policy object and are echoed in the output — nothing is   ║
// ║  hidden inside the function.                                      ║
// ╚══════════════════════════════════════════════════════════════════╝

import { altmanZDoublePrime, type AltmanZ } from "./altman";
import { beneishMScore, type BeneishM } from "./beneish";
import { computeCells } from "./cells";
import { piotroskiFScore, type FScore } from "./piotroski";
import { DEFAULT_POLICY, type AnnualRecord, type DividendCells, type Reason, type Verdict, type VerdictPolicy } from "./types";

export interface Assessment {
  ticker: string;
  fiscalYear: number;
  sector?: string;
  verdict: Verdict;
  cells: DividendCells;
  fScore: FScore | null;
  altman: AltmanZ;
  beneish: BeneishM | null;
  /** rules that fired, in evaluation order */
  reasons: Reason[];
  /** heuristic flags (saññā) — reported, never decisive */
  flags: Reason[];
  policy: VerdictPolicy;
}

const SRC = {
  dds: "DeAngelo, DeAngelo & Skinner 1992, J. Finance — 50.9% of loss firms cut vs 1.0% of non-loss firms",
  ddn: "Daniel, Denis & Naveen 2008, JAE — earnings shortfall vs expected dividend drives cuts / earnings management",
  cov: "CFA L2 dividend-safety coverage; FCF coverage flags cuts before EPS coverage",
  alt: "Altman 1995 Z'' (non-manufacturer / emerging-market form)",
  pio: "Piotroski 2000, J. Accounting Research (out-of-sample: AU, CN — effect varies by market)",
  ben: "Beneish 1999, Financial Analysts Journal",
  spdji: "S&P DJI 2019 — quality overlay on yield avoids yield traps; yield alone underperforms",
  streak: "SETHD / S&P Dividend Aristocrats eligibility: uninterrupted payment history",
} as const;

const fmt = (x: number | null | undefined, d = 2) =>
  x === null || x === undefined ? "n/a" : x === Infinity ? "∞" : x.toFixed(d);

/**
 * `history` ascending by fiscalYear; the last element is assessed.
 * Two or more years unlock the Piotroski, Beneish, streak and volatility cells.
 */
export function assess(history: AnnualRecord[], policy: VerdictPolicy = DEFAULT_POLICY): Assessment {
  if (history.length === 0) throw new Error("assess: empty history");
  const r = history[history.length - 1];
  const prev = history.length > 1 ? history[history.length - 2] : undefined;
  const cells = computeCells(history);
  const fScore = prev ? piotroskiFScore(r, prev) : null;
  const altman = altmanZDoublePrime(r);
  const beneish = prev ? beneishMScore(r, prev) : null;

  const reasons: Reason[] = [];
  const flags: Reason[] = [];
  let verdict: Verdict = "sustain";
  const atRisk = (rule: string, detail: string, source: string) => {
    reasons.push({ rule, tier: "paccakkha", detail, source });
    verdict = "at-risk";
  };
  const watch = (rule: string, detail: string, source: string) => {
    reasons.push({ rule, tier: "anumana", detail, source });
    if (verdict === "sustain") verdict = "watch";
  };

  // ── Hard gates ──────────────────────────────────────────────────────
  if (cells.loss) atRisk("loss", `net income ${fmt(r.netIncome, 0)} < 0`, SRC.dds);

  const prevPayoutEps = prev && prev.eps > 0 ? prev.dps / prev.eps : null;
  if (cells.payoutEps !== null && prevPayoutEps !== null && cells.payoutEps > policy.payoutEpsMax && prevPayoutEps > policy.payoutEpsMax) {
    atRisk("payout_eps_2y", `DPS/EPS ${fmt(cells.payoutEps)} and ${fmt(prevPayoutEps)} last year, both > ${policy.payoutEpsMax}`, SRC.ddn);
  }

  const fcfFails = cells.payoutFcf === null || cells.payoutFcf > policy.payoutFcfMax;
  const runwayFails = cells.cashRunway === null || cells.cashRunway < policy.cashRunwayMin;
  if (fcfFails && runwayFails) {
    atRisk(
      "fcf_uncovered",
      `dividends/FCF ${fmt(cells.payoutFcf)} (FCF ${fmt(cells.fcf, 0)}) and cash runway ${fmt(cells.cashRunway)}× < ${policy.cashRunwayMin}`,
      SRC.cov,
    );
  }

  if (altman.z !== null && altman.z < policy.altmanDistress) {
    atRisk("altman_distress", `Z'' ${fmt(altman.z)} < ${policy.altmanDistress}`, SRC.alt);
  }

  const levHigh = cells.netDebtEbitda !== null && cells.netDebtEbitda > policy.netDebtEbitdaMax;
  const covLow = cells.interestCoverage !== null && cells.interestCoverage < policy.interestCoverageMin;
  if (levHigh && covLow) {
    atRisk("leverage", `net debt/EBITDA ${fmt(cells.netDebtEbitda)} > ${policy.netDebtEbitdaMax} and EBIT/interest ${fmt(cells.interestCoverage)} < ${policy.interestCoverageMin}`, SRC.cov);
  }

  // ── Quality gates (watch) ───────────────────────────────────────────
  if (cells.earningsShortfall && !cells.loss) {
    watch("earnings_shortfall", `net income ${fmt(r.netIncome, 0)} < dividends paid ${fmt(r.dividendsPaid, 0)}`, SRC.ddn);
  }
  if (cells.payoutEps !== null && cells.payoutEps > policy.payoutEpsMax && !(prevPayoutEps !== null && prevPayoutEps > policy.payoutEpsMax)) {
    watch("payout_eps_1y", `DPS/EPS ${fmt(cells.payoutEps)} > ${policy.payoutEpsMax} this year`, SRC.cov);
  }
  if (fcfFails && !runwayFails) {
    watch("fcf_uncovered_runway_ok", `dividends/FCF ${fmt(cells.payoutFcf)} but cash runway ${fmt(cells.cashRunway)}×`, SRC.cov);
  }
  if (fScore && fScore.computable > 0 && fScore.scaled < policy.fScoreMin) {
    watch("f_score", `Piotroski F ${fScore.score}/${fScore.computable} (scaled ${fmt(fScore.scaled, 1)}/9) < ${policy.fScoreMin}`, SRC.pio);
  }
  if (cells.streak < policy.streakMin) {
    watch("streak", `DPS not-cut streak ${cells.streak}y < ${policy.streakMin}`, SRC.streak);
  }
  if (altman.zone === "grey") {
    watch("altman_grey", `Z'' ${fmt(altman.z)} in grey zone [${policy.altmanDistress}, 2.6]`, SRC.alt);
  }

  // ── Flags (saññā) ───────────────────────────────────────────────────
  if (beneish && beneish.m !== null && beneish.m > policy.beneishFlag) {
    flags.push({ rule: "beneish", tier: "sanna", detail: `M ${fmt(beneish.m)} > ${policy.beneishFlag}: EPS coverage may be managed`, source: SRC.ben });
  }
  if (cells.priceReturn !== null && cells.priceReturn < policy.trapDrawdown && cells.payoutEps !== null && cells.payoutEps > policy.payoutEpsMax) {
    flags.push({
      rule: "yield_trap",
      tier: "sanna",
      detail: `price ${fmt(cells.priceReturn * 100, 0)}% y/y with DPS/EPS ${fmt(cells.payoutEps)}: yield is high because price fell`,
      source: SRC.spdji,
    });
  }
  if (beneish && beneish.m === null && beneish.missing.length > 0) {
    flags.push({ rule: "beneish_not_computable", tier: "avisaya", detail: `missing: ${beneish.missing.join(", ")}`, source: SRC.ben });
  }

  return { ticker: r.ticker, fiscalYear: r.fiscalYear, sector: r.sector, verdict, cells, fScore, altman, beneish, reasons, flags, policy };
}
