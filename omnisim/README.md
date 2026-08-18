# OMNISIM Deep Core

A small, dependency-light toolkit that is **two honest things**:

1. a **generative / explanatory social-dynamics sandbox** — emotional contagion
   on a trust network, driven by an exact stochastic event engine, with a
   symbolic (Z3) rule layer gating discrete agent actions; and
2. an **honest forecasting-validation harness** — baselines, a fair scoring
   protocol, and integrity checks that can tell you when a model has **no** real
   skill.

> **What it is NOT.** It is **not a validated predictive method.** Its
> parameters (`contagion_rate`, `decay_rate`, PAD thresholds, bias cut-offs) are
> not fitted to reality, and when actually benchmarked on real social-cascade
> data its forecaster did **not** beat textbook baselines — it lost (see
> [Validation](#validation-stage-2--what-the-evidence-says) and `RESULTS.md`).
> Use it to generate scenarios, stress-test agent logic, teach, and to *judge*
> models fairly — not to predict real-world crises.


## What's inside

| Component | Module | Basis |
|---|---|---|
| Incremental Z3 (push/pop + UNSAT core, fail-closed, full rule CRUD) | `z3_physics` | De Moura & Bjørner 2008 |
| Causal DAG (Kahn topo-sort, ancestry, bounded path search) | `causal_dag` | Kahn 1962 |
| Gillespie SSA (exact direct method) | `gillespie` | Gillespie 1977 |
| Independent Cascade + greedy (1−1/e) influence max | `social_contagion` | Kempe-Kleinberg-Tardos 2003 |
| Cognitive bias resolver (single dominant bias) | `cognitive_bias` | engineered heuristic |
| DPO pair builder (direction-explicit) | `dpo_builder` | engineered |
| Bifocal memory, event bus, neural-symbolic bridge | `bifocal_memory`, `event_bus`, `neural_symbolic_bridge` | engineered |
| Simulation engine (phases, aftermath metrics, checkpoint, action gate) | `engine` | integration |
| Calibration harness (grid/random fit to a target trace) | `calibration` | — |
| Validation harness (baselines, skill, significance gate, real-data loaders) | `validation` | — |

Four published algorithms + engineered glue. Labeled honestly: the bias
resolver and DPO builder are bespoke logic, not published algorithms.

The **validation harness** (`validation`) is arguably the most useful piece: it
scores any forecaster out-of-sample against persistence / logistic / SIR
baselines, with two integrity guarantees you can run as tests —
`test_harness_detects_failure` (a deliberately-wrong model must score negative
skill) and `test_no_false_discovery_on_noise` (no model may be flagged
significant on pure noise). `benchmark_significance(...)` reports
`adequate_model_found=False` — an explicit "no signal here" verdict — instead of
ranking the least-bad model.

## Install & run

```bash
pip install z3-solver        # optional — without it the Z3 layer is disabled
python deep_core.py --test   # run the full suite
python deep_core.py --demo   # end-to-end crisis demo
```

`z3-solver` is optional. Without it, `_Z3` is `False`, the Z3 engine is
disabled, and the Z3-specific tests **skip** (they do not fail).

## Status

- **232** tests pass with z3; **203** pass / **29** skipped without z3.
- `mypy` clean (`check_untyped_defs` on).
- CI (`.github/workflows/python-tests.yml`) gates every push/PR in three jobs:
  `tests (with-z3)`, `tests (without-z3)`, `mypy`.
- Engine/DAG correctness is checked against **independent specs**: CausalDAG vs
  a Warshall transitive-closure reference over **all** 4-node graphs, and
  `IncrementalZ3.validate` vs brute-force boolean SAT.

## Validation (Stage 2) — what the evidence says

The honest headline, in full (details in `RESULTS.md`):

- On real Twitter **rumor-cascade** diffusion (47 cascades), OMNISIM's
  forecaster was the **worst** model on next-bin prediction — it lost to a
  naive *persistence* baseline (skill −0.025).
- On the fairer **final-size** target, the contagion *family* (logistic/SIR/
  OMNISIM) beat a climatology baseline by ~45%, **but OMNISIM was significantly
  worse than a one-line logistic curve** (paired bootstrap CI excludes 0).
- A pre-registered attempt to put OMNISIM's *epistemic* signal into the
  predictive path added nothing (correlation ≈ 0).

**Conclusion:** OMNISIM's distinctive parts (cognitive bias, the Z3 gate,
bifocal memory) are not in the predictive path, so its forecasting content
reduces to a worse-fit logistic/SIR. It is solid engineering and a good
generative/explanatory sandbox — **on current evidence, not a predictive
method.** The validation harness reaching that conclusion (rather than papering
over it) is the project's real success.

## Design notes (the load-bearing decisions)

- **Fail-closed validation.** A Z3 `unknown`/timeout is reported *invalid*, not
  valid — an undetermined check is never treated as permission to act.
- **Z3 lives at the action boundary**, not the contagion loop: it gates
  discrete agent actions (speak/move) with logical preconditions; continuous
  PAD/contagion updates are not its job.
- **Single source of truth.** Agent emotion lives only in the engine; other
  modules read it or return new values.
- **Checkpoints capture state, not closures.** Reactions/crises are Python
  closures and aren't serializable, so resume = rebuild with the same setup
  then `restore_state()`. The RNG stream is restored, so a resumed run is
  bit-identical to an uninterrupted one.
- **Aftermath is time-bounded**, not step-counted; snapshots are tagged
  `pre`/`tipping`/`aftermath` and a `recovered` flag + metrics are reported.

## Known limitations

- Parameters are uncalibrated (see scope note above).
- `kkt_greedy` is `O(k·n·mc·(n+m))` — warns past a budget; use CELF/CELF++ for
  large graphs.
- `causal_paths` is exponential — guarded by `max_paths`.
- Rules are live Z3 formulas and are not serializable.

This package is independent of the rest of the repository (a Next.js app);
it shares no runtime code with it.
