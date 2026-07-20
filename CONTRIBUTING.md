# Contributing — the development loop

This repo is built with a **loop-engineered** workflow: instead of driving each
change by hand, we design a system around the work so it can be planned, built,
and *verified* against one clear success criterion. The loop is inspired by the
[Superpowers](https://github.com/obra/superpowers) discipline (plan → work →
verify → review → finish) and adapted to this codebase.

## The one gate

There is a single success criterion for any change:

```bash
npm run verify   # typecheck · lint · test · build — all four, in order
```

CI runs the *same* command (`.github/workflows/web-tests.yml`), so a green
local run means exactly what a green CI run means. Never declare work "done"
without a passing `verify` — evidence over assertion.

## The loop

1. **Plan** — state the change and its success criterion before editing. For
   anything non-trivial, write down the tasks first.
2. **Work in small steps** — one concern per commit. Match the surrounding
   code's idiom, naming, and comment density.
3. **Test-first for engine logic** — `lib/rush-engine/**` is pure and
   deterministic (no network, no LLM calls, no `Date.now()`/`Math.random()` in
   output paths). Every behavior gets a test; snapshot tests guard the exact
   generated prompts, so a diff there must be intentional.
4. **Verify** — run `npm run verify`. For UI/route changes, also drive the real
   page in a browser (the `/verify` and `/run` skills automate this) — tests
   passing is necessary, not sufficient.
5. **Review** — read your own diff as a skeptic before pushing; for larger
   changes request a code review.
6. **Finish** — commit with a descriptive message, push to the feature branch,
   open or update the PR. Don't stack new work on an already-merged branch.

## The non-negotiable: epistemic honesty

This product's whole thesis is *not faking rigor* (see
`lib/rush-engine/epistemics.ts`). The same rule binds the code:

- **Don't ship fake capability.** If a feature can't be done deterministically,
  we generate honest *prompt scaffolding* for an LLM to fill — we do not pretend
  the engine computed something it didn't.
- **No invented scores.** No `0–100` quality numbers, no fabricated confidence.
  Report what is actually measurable (counts, ratios, structural facts).
- **Flag syntheses.** Where data is a scholarly composite rather than a fixed
  source (e.g. the Thai narrative structures in `thai-structures.ts`), say so in
  the data itself.

If a change would make the tool *look* more capable than it honestly is, that's
a bug, not a feature.

## Layout

| Path | What |
|------|------|
| `lib/rush-engine/` | Pure, deterministic prompt-generation engine + tests |
| `app/rush/` | Rush Studio UI — generator, `/explore` landing, `/start` wizard |
| `scripts/rush.ts` | CLI entry (`npm run rush`) |
| `.github/workflows/` | CI — `web-tests.yml` runs `npm run verify` |
