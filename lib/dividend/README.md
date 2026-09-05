# Dividend — a sustainability screen that refuses to fake a score

Pure, deterministic TypeScript: one annual filing in, a **verdict with its reasons** out.
No prices from the network, no clock, no LLM, no `0–100 safety score`. Same numbers →
same answer, every run. Sibling of `lib/rush-engine` under the same
[epistemology](../../docs/epistemology.md): every signal is a count (ประจักษ์), a disclosed
ratio (อนุมาน), a flag (สัญญา) — or refused (อวิสัย).

Design and sources: [`docs/research/dividend-algorithm.md`](../../docs/research/dividend-algorithm.md).

## Pipeline

```
AnnualRecord[] (ascending, last = year assessed)
   │
   ├─ cells.ts        coverage ratios, streak, EPS volatility, shareholder yield     (Tier 1–2)
   ├─ piotroski.ts    F-score, 9 pass/fail tests, missing tests disclosed            (Tier 1)
   ├─ altman.ts       Z'' distress zone                                              (Tier 2)
   ├─ beneish.ts      M-score earnings-manipulation flag                             (Tier 3)
   │
   ├─ verdict.ts      disclosed rule set → sustain | watch | at-risk + reasons       (policy echoed)
   ├─ stability-gate  perturb the filing k times, re-run the verdict, count agreement;
   │                  below τ → avisaya (refuse), never "restart until stable"
   ├─ portfolio.ts    lexicographic ranking over cells, equal weight, sector cap
   └─ validation.ts   walk-forward + embargo, baselines, skill, permutation test,
                      `adequateModelFound=false` is a legitimate answer
```

```ts
import { stabilityGate, selectPortfolio } from "@/lib/dividend";

const gated = universe.map((history) => stabilityGate(history)); // history: AnnualRecord[] per ticker
gated[0].final;                 // "sustain" | "watch" | "at-risk" | "avisaya"
gated[0].base.reasons;          // [{ rule: "loss", tier: "paccakkha", detail: "...", source: "DeAngelo ... 1992" }]
gated[0].agree, gated[0].k;     // 7, 8 — the count the reader can re-derive

selectPortfolio(gated, { maxPositions: 20, maxPerSector: 4, minYield: null, allowWatch: false });
```

## What the validation harness has and has not shown

`fixtures.ts` generates a **synthetic** universe with a planted mechanism (a loss or
uncovered dividend forces a cut next year, dividend policy lagged one year). On it the
harness proves three things about *itself* (`validation.test.ts`):

- the planted rule scores positive skill and survives a permutation test;
- an inverted rule scores negative skill;
- on coin-flip labels nothing is flagged adequate.

It also shows that the full composite verdict does **not** beat the single-rule
baselines on that toy data — and the harness says "no signal claimed" instead of
ranking it. That is the intended behaviour. **Nothing here is evidence about real
markets.** The rule set's worth is decided only on real filings run through the same
harness, which needs data this repo does not ship.
