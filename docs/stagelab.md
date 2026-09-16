# StageLab

StageLab is the Stage Analysis product in this repository: a tenant-isolated
SaaS module for running Stan Weinstein's weekly routine on the Thai market —
score the market, rank the sectors, filter the universe, review the book, write
next week's plan.

It rides the suite's existing SaaS chassis (NextAuth sessions, Stripe billing,
the `UsageDay` meter, the admin surface) rather than shipping a second one.

---

## Layout

| Path | What lives there |
| --- | --- |
| `lib/stagelab/*.ts` | The engines. Pure TypeScript, no React. |
| `lib/stagelab/plans.ts` | The plan matrix — features, row caps, compute budgets. |
| `lib/stagelab/guard.ts` | Server-side enforcement of that matrix. |
| `lib/stagelab/bootstrap.ts` | Lazy provisioning: tenant framework rows, shared universe. |
| `app/api/stagelab/**` | 20 route handlers, every one gated and tenant-scoped. |
| `app/stagelab/` | Landing, pricing, and the app shell. |
| `app/stagelab/_views/` | One file per view, each its own lazily-loaded chunk. |

### Routes

| URL | Access |
| --- | --- |
| `/stagelab` | Public — landing |
| `/stagelab/pricing` | Public — plans and the Stripe checkout button |
| `/stagelab/app` | Signed in (enforced in `middleware.ts`) |
| `/stagelab/app?view=quant` | Deep link to any view; Back walks view history |

---

## Tenancy

Two tiers of data, and they must not be confused:

- **`StageStock` is shared reference data.** The SET universe every customer's
  screener runs over. It carries no `userId` and only an admin writes it
  (`POST /api/stagelab/universe`).
- **Everything else belongs to one customer.** `userId` is non-null on every
  other model, and every query filters on it.

Writes never read-then-compare for ownership. They put `userId` in the `WHERE`
clause of an `updateMany`/`deleteMany` and check the returned count, so "not
found" and "not yours" produce the same 404 and neither can race.

`lib/stagelab/tenancy.test.ts` enforces this statically: it parses every
`prisma.stage*` call in `app/api/stagelab/**` and `lib/stagelab/**` and fails if
one omits `userId` without being a documented exemption. It also fails a route
that does not open with `gate()`.

---

## Plans

`lib/stagelab/plans.ts` is the only place plan rules are written down. Three
kinds of limit:

- **Features** decide whether a surface exists at all. Free gets the complete
  weekly routine — a screener you cannot finish a week with sells nothing. Pro
  adds the research desk: Thesis, Backtest, Risk Radar, Pro Desk, Quant Lab.
- **Row caps** protect the database. Every plan has them, at different heights.
  Closed positions do not count against the position cap; a customer's own
  track record is not something to charge for.
- **Compute budget** (`UsageDay.stageRuns`) protects the CPU. Metered *before*
  the work runs, so an input that fails late still costs — otherwise the
  endpoint is free to hammer with bad payloads.

Refusals carry a machine-readable `code` (`upgrade_required`, `limit_reached`,
`quota_exhausted`) so the client shows an upgrade path instead of a red error.

Billing already flips `user.plan` to `"pro"` via the Stripe webhook, so
StageLab needed no new billing code — only a return path
(`{ returnTo: "stagelab" }`) on the existing checkout route.

---

## Provisioning

Nothing needs an out-of-band seed step:

- The **shared universe** publishes itself on first read (`ensureUniverse()`),
  and `npm run db:seed:stagelab` does it up front if you would rather.
- A **tenant** is created on their first StageLab request (`ensureTenant()`) —
  discipline checklists and the sector board, nothing else. A new account gets
  **no invented trades**; positions and journal entries are the customer's own
  record and start empty.
- **Sample data** is opt-in, behind a button, labelled as samples, and refused
  once real rows exist so it can never mix into a real book.

After changing the schema:

```bash
npm run db:generate && npm run db:push
```

---

## "Not scored yet" is not "bearish"

A market review row is created on a customer's first visit so the form has
something to bind to. Until they fill it in, it scores 0/10 — which the scoring
function correctly reads as *Stage 4, hold cash*.

Shipping that as-is would mean every new account opens on a bear-market verdict
the customer never gave, plus a critical Risk Radar alert to match. So the row
carries `scoredAt`, null until a save, and everything downstream distinguishes
*no reading* from *a bad reading*:

- the dashboard shows `—` and a prompt instead of a verdict,
- the Risk Radar receives `null` and raises no market alert,
- the rotation model and the Unified Score fall back to their documented
  neutral, and say so in the UI,
- the nightly audit summary records `marketScore: null` rather than `0`.

## What the data is, and is not

The universe is a fictional-but-plausible SET dataset, tiered so the screener
funnel narrows realistically. The weekly price series behind every chart,
backtest and scan is generated from a seeded PRNG: the same symbol always
produces the same series.

It is **not** market data, and the UI says so — on the landing page, above the
backtest, and in the app footer. The backtest is therefore useful for comparing
rules against each other ("what changes if I require volume confirmation?") and
useless for predicting returns. A product about trading discipline that fudged
this would have nothing left to sell.

Determinism is also load-bearing: the Quant Lab's audit chain links each night
to the previous by SHA-256, so a back-dated edit breaks verification. That only
means something if honest data reproduces exactly — hence the determinism tests.

---

---

## Engineering notes

These are the decisions worth knowing before changing something here.

### Query shape and indexes

Every list endpoint filters on `userId` **and** a second column — `status`,
`weekOf`, `category`, `symbol`. A bare `@@index([userId])` finds the tenant's
rows and then filters the rest in memory, which is invisible at ten rows and
not at two thousand. The composite indexes in the schema exist to match the
predicates the routes actually issue; adding a query shape means adding the
index for it.

Nothing is unbounded. Row caps bound most tables by plan, the journal and the
action list page properly (`?limit=`, `?offset=`, clamped to 500), and `take`
is explicit even where a cap already applies — a query whose cost is set by how
long an account has existed is a query that works for a year and then times out.

### Errors

One envelope, in `lib/stagelab/problem.ts`: a Thai sentence, a machine `code`,
and a request id echoed in the `x-request-id` header. Every handler is wrapped
in `guarded()`, so an unexpected throw becomes a logged 500 rather than a stack
trace in the browser.

A caught exception's own `message` is never returned. `error.message` off a
Prisma failure carries constraint names, column lists, and sometimes the
connection target. The single exception is `StageInputError`, a typed error the
engines raise for input a *user* can fix — and the tenancy test enforces that
distinction by rejecting any `error.message` on a line that is not guarded by
`isStageInputError`.

### Concurrency

Positions, watchlist rows and theses carry `updatedAt` as an optimistic-lock
token. The client echoes what it rendered; the route puts it in the `WHERE`
clause. A stale write updates zero rows, and the route then distinguishes *gone*
(404) from *changed underneath you* (409) so a second tab is told to reload
rather than told the row vanished. Omitting the token is allowed and means
last-write-wins — explicitly, rather than by accident.

---

## Algorithms

### Backtest

The engine walks 312 weekly bars across the universe. Three things were added
because a backtest without them is marketing:

**A benchmark.** Buy the index at the start of the window, hold, pay the same
commission. "Did this make money" is close to meaningless in a rising market;
"did all the screening, sizing and stop discipline beat doing nothing" is the
question, and often enough the answer is no.

**An out-of-sample split.** The window is cut 70/30 by time and each half is
measured separately. The strategy rules are fixed, but the seven knobs above
them are not, and a user who turns dials until the number goes up has fitted
the config to the series whether they meant to or not. The split point is
deliberately not configurable — a movable boundary is one more knob to tune
until the answer flatters. `robustness` reads the gap plainly, including
`insufficient` when neither half has ten trades to judge on.

**Risk that survives contact with reality.** Sortino instead of Sharpe alone
(nobody complains about upside volatility), Calmar, exposure — the share of
weeks actually holding anything — expectancy per trade, longest stretch under
water, and time to recover from the deepest hole. A 30% drawdown that heals in
eight weeks and one that takes three years are the same number on a stats card
and completely different to live through.

The hot loop also stopped doing a linear scan of the universe by symbol four
times per open position per week; the position carries its own series now.

### Monte Carlo

**Block bootstrap is the default.** The old resampler drew trades independently,
which assumes a loss tells you nothing about the next trade. For a trend
strategy that is false, and the falsehood flatters: shuffling losing runs apart
is exactly what removes the deep drawdowns. The stationary bootstrap (Politis &
Romano) draws runs of consecutive trades with geometric lengths, so streaks
survive resampling. On a deliberately streaky record it reports a median
drawdown around five points deeper than iid — and that gap is the measure of
what the old default was hiding. `iid` is still available, and the result says
which method produced it.

**CAGR states its assumption.** Annualising a trade list needs a holding period;
the engine used to assume "about two weeks" silently, which set every CAGR it
ever reported. The client now derives it from the customer's own closed trades
and the figure is shown next to the result.

**Percentiles by selection, not sorting.** The fan chart needs three percentiles
at each of up to 400 steps. Building a fresh column array and sorting it per
step was O(steps · sims · log sims) plus 400 throwaway allocations; `stats.ts`
does Hoare selection over a column-major buffer, with a median-of-three pivot
because equity curves rise together and near-sorted input is what degrades naive
quickselect to O(n²). It is tested against a brute-force sort on adversarial
inputs.

---

## Design

Charts have axes, gridlines and a hover readout, and each renders its numbers as
a real table behind the picture — a chart is a summary of data, never the only
copy of it. The container is measured and the SVG drawn at real pixel size, so
type is not stretched and pointer-to-data mapping is exact.

`⌘K` opens a command palette over all thirteen views, with subsequence matching.
Locked views stay listed and greyed: hiding them means the only people who learn
the paid tier exists are the ones who go looking.

Tables scroll horizontally rather than reflowing into cards — ten columns of
prices read worse as cards, and traders scan down columns — but the scroll
container is a focusable labelled region so it is reachable by keyboard.
`prefers-reduced-motion` is honoured globally.

---

## Tests

`npm run verify` runs typecheck, lint, tests and build. The StageLab suites:

| File | Covers |
| --- | --- |
| `lib/stagelab/tenancy.test.ts` | Static: every query scoped, every route gated |
| `lib/stagelab/plans.test.ts` | Plan matrix invariants (free ⊂ pro ⊆ team, limits monotonic) |
| `lib/stagelab/guard.test.ts` | Row caps and compute metering, with Prisma mocked |
| `lib/stagelab/http.test.ts` | Request schemas — the boundary between a POST and the DB |
| `lib/stagelab/engine.test.ts` | Engine determinism, funnel monotonicity, the safety rules |
| `lib/stagelab/stats.test.ts` | Selection vs brute-force sort on adversarial inputs |
| `lib/stagelab/problem.test.ts` | Error envelope, status mapping, and that causes never leak |
| `app/stagelab/_contrast.test.ts` | Every text colour clears WCAG AA on both surfaces |
| `app/stagelab/_ui.test.tsx` | Primitives: modal focus trap, field parsing, locked panel |
| `app/stagelab/_command-palette.test.tsx` | Matching, keyboard model, and locked-view handling |
| `app/stagelab/_chart.test.tsx` | Chart structure, the data-table fallback, hover readout |

These keep finding real bugs, which is the point of writing them first:

- the contrast scan caught `text-zinc-500` failing AA in twelve files;
- the modal test caught the focus trap landing on "dismiss" rather than the
  first field;
- the palette test caught `scrollIntoView` — optional in the DOM spec — taking
  the whole component down where it is absent;
- and the tenancy check caught *itself*: wrapping the handlers in `guarded()`
  stopped its `export async function` pattern matching anything, so it went
  green by examining zero files. It now asserts its own match count, because a
  safety net that can silently unhook is worse than none.
