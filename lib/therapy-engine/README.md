# MindBridge therapy engine

The deterministic core of the music-therapy platform at `/therapy`. Pure
functions over plain data — no network, no LLM, no clock, no randomness in any
output path — so every number the product prints can be re-derived by hand.

## The rule this engine is built to obey

`CONTRIBUTING.md` states the repo's thesis: **don't ship fake capability, don't
invent scores, flag syntheses.** For a mental-health product that translates into
four concrete refusals, each enforced by a test rather than by good intentions:

| Refusal | Where | Guard |
|---|---|---|
| No invented composite score | `scoring.ts` | Totals are sums of a published instrument; there is no cross-instrument index and no percentage |
| No diagnosis | `scoring.ts` | `Interpretation.isDiagnosis` is `false`, and a positive screen ships its own false-positive rate |
| No unsourced efficacy claim | `evidence.ts` | Every intervention carries ≥1 citation — a test fails the build otherwise |
| No causal claim from before/after | `trend.ts` | Every comparison ships the regression-to-the-mean caveat; the module exports no forecast function |

## Modules

| File | What |
|---|---|
| `instruments.ts` | GAD-7 and PHQ-9 item banks (TH + EN), and the list of instruments deliberately **not** shipped for licensing reasons |
| `scoring.ts` | Totals, published severity bands, cut-point operating characteristics, MCID |
| `sleep.ts` | Sleep-diary arithmetic — TST and sleep efficiency, by the formula the literature uses |
| `evidence.ts` | The graded intervention catalog with citations, doses, harms and stated limitations |
| `safety.ts` | Crisis routing. PHQ-9 item 9 is checked **before** any total; Thai crisis lines |
| `protocol.ts` | Score → care plan, by a rule table that ships alongside the plan |
| `music.ts` | The iso-principle tempo ramp and the breath pacers |
| `trend.ts` | Change over time, in points, with no extrapolation |

## Two decisions worth knowing about

**Why no PSQI or ISI.** Both sleep instruments are under copyright. Rather than
reproduce them without a licence — or invent a home-made "sleep score", which
would trade a licensing problem for an epistemic one — `sleep.ts` measures the
raw diary quantities the sleeper reports and derives sleep efficiency from them
by the published formula. `WITHHELD_INSTRUMENTS` states the absence in the UI.

**Why the Thai wording is flagged.** Validated Thai editions of GAD-7 and PHQ-9
exist. The Thai text in `instruments.ts` is *our own rendering*, and psychometric
validation does not transfer across translations — so a score from this app is a
self-tracking signal, not a substitute for the validated Thai edition. The UI
says so where the score is shown.

## Tests

```bash
npx vitest run lib/therapy-engine
```

Part of the single gate: `npm run verify`.
