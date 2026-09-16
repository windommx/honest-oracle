# Running this in production

Operational notes for deploying and running the app, with StageLab in it.
Written to be followed at 2am by someone who did not write it.

---

## Prerequisites

- **PostgreSQL 14+.** The schema uses `SERIAL`, composite indexes and cascading
  foreign keys; nothing exotic.
- **Node 20.**
- Environment variables per `.env.example`. Run `npm run check:env` first — it
  names every variable that is missing or malformed and exits non-zero, so a
  pipeline stops there rather than at the first 500.

---

## Deploying

### The order matters

```bash
npm ci
npm run check:env          # fails fast, names what is wrong
npm run db:migrate:deploy  # apply migrations — never `db:push` in production
npm run build
# start the server, then:
BASE_URL=https://your-host SMOKE_EMAIL=… SMOKE_PASSWORD=… npm run smoke
```

`db:push` diffs the schema against the database and applies whatever it takes
to converge — including dropping a column it thinks is gone. It is a
development convenience. **Migrations are the production path**, because they
are reviewed, ordered, and recorded in `_prisma_migrations`.

### A database that already has tables

The migration history starts with a baseline of the schema as it stood before
StageLab. If your database already contains those tables, applying that
migration would fail on `CREATE TABLE ... already exists`. Mark it as already
applied, once:

```bash
npx prisma migrate resolve --applied 20260916000000_baseline_pre_stagelab
npm run db:migrate:deploy   # now applies only 20260916010000_stagelab
```

The StageLab migration itself is **additive only** — `CREATE TABLE`,
`CREATE INDEX`, one `ADD COLUMN` with a default, and foreign keys. It drops
nothing and rewrites nothing, so it is safe to apply to a live database with
traffic on it.

Verify before and after:

```bash
npm run db:migrate:status
```

### The shared universe

StageLab publishes its reference universe on first read, so a fresh deployment
works with no extra step. To do it up front — or to refresh prices after
editing `lib/stagelab/seed-data.ts`:

```bash
npm run db:seed:stagelab    # idempotent: upserts by symbol, safe to re-run
```

---

## Rolling back

**Code** rolls back freely: redeploy the previous build.

**Migrations do not.** Prisma has no down-migrations, and the StageLab
migration is additive, so the previous build runs fine against the newer
schema — the new tables are simply unused. That is the intended rollback path:
**roll the code back and leave the schema alone.** Only drop tables once you
are certain you are not going forward again, and take a backup first.

---

## Connection pooling

Every serverless instance opens its own pool. Postgres has a fixed
`max_connections`, and enough cold starts will exhaust it — the symptom is
`too many clients already` under load, not under test.

Put a pooler in front (PgBouncer in transaction mode, Neon's pooled endpoint,
Supabase's pooler, Prisma Accelerate) and point `DATABASE_URL` at it. With
PgBouncer in transaction mode Prisma also needs:

```
?pgbouncer=true&connection_limit=1
```

On a single long-lived server this does not apply; the client is a module
singleton and one pool is correct.

---

## What to watch

| Signal | Where | Means |
| --- | --- | --- |
| `GET /api/health` ≠ 200 | uptime monitor | the instance cannot reach the database — pull it from rotation |
| `"level":"error"` in logs | log search | a handler threw; the line carries `where` and `requestId` |
| 429 responses | access log | a client is looping, or a plan quota is genuinely spent |
| 402 responses | access log | plan gates firing — expected traffic, useful as an upgrade funnel |
| 409 responses | access log | write conflicts; a spike means people editing from two tabs |
| `_prisma_migrations` failed row | database | a migration half-applied; resolve before deploying again |

Every 500 returns a `requestId`, echoed in the `x-request-id` header and
written to the log line for the same request. A customer quoting that id is
enough to find the exact failure — ask for it.

---

## Known limits, stated plainly

**The rate limiter is per process.** `lib/stagelab/rate-limit.ts` keeps counters
in memory, so N warm instances allow roughly N × the limit. It reliably stops
one runaway client hitting one instance, which is the realistic failure. It is
not a distributed guarantee and must not be treated as one; if you need that,
put it at the edge or in Redis. Heavy compute is metered in the database
instead, and *that* meter is authoritative.

**The market data is synthetic.** The universe and every price series are
generated from a seeded PRNG. This is stated on the landing page, above the
backtest and in the app footer, and it must stay stated. The backtester is
therefore a tool for comparing rules against each other, not for forecasting
returns. Wiring a real market feed means replacing `StageStock` and
`genSeries()`; nothing above them assumes the data is fake.

**Sessions carry the plan.** `user.plan` is copied into the JWT at sign-in, so
a plan change — a Stripe webhook, an admin edit — does not take effect until
the session is refreshed. Users who upgrade should sign out and back in, or
wait out the session. If that becomes a support burden, move the plan lookup
out of the token.

---

## Backups

Nothing here is reconstructible. `StageStock` can be re-seeded, but a
customer's watchlist, positions, theses and journal are their own record and
exist nowhere else.

- Automated daily snapshots, retained 30 days, is the minimum.
- **Test the restore.** A backup that has never been restored is a hypothesis.
- The Quant Lab audit chain is hash-linked: a restore to an earlier point is
  detected as a broken chain by design. That is correct behaviour and worth
  knowing before it surprises someone.
