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

## Tests

`npm run verify` runs typecheck, lint, tests and build. The StageLab suites:

| File | Covers |
| --- | --- |
| `lib/stagelab/tenancy.test.ts` | Static: every query scoped, every route gated |
| `lib/stagelab/plans.test.ts` | Plan matrix invariants (free ⊂ pro ⊆ team, limits monotonic) |
| `lib/stagelab/guard.test.ts` | Row caps and compute metering, with Prisma mocked |
| `lib/stagelab/http.test.ts` | Request schemas — the boundary between a POST and the DB |
| `lib/stagelab/engine.test.ts` | Engine determinism, funnel monotonicity, the safety rules |
| `app/stagelab/_contrast.test.ts` | Every text colour clears WCAG AA on both surfaces |
| `app/stagelab/_ui.test.tsx` | Primitives: modal focus trap, field parsing, locked panel |

Two of these found real bugs while being written: the contrast scan caught
`text-zinc-500` failing AA in twelve files, and the modal test caught the focus
trap landing on "dismiss" instead of the first field.
