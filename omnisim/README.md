# OMNISIM Deep Core

A small, dependency-light **social-dynamics simulator**: emotional contagion
on a trust network, driven by an exact stochastic event engine, with a
symbolic (Z3) rule layer gating discrete agent actions.

> **Honest scope.** This is a *research / scenario-exploration* tool. The
> parameters (`contagion_rate`, `decay_rate`, PAD thresholds, bias cut-offs)
> are **not calibrated against real data**. It is useful for generating
> synthetic trajectories, stress-testing agent logic, and teaching — **not**
> for predicting real-world crises. A calibration harness is included as the
> first step toward grounding it, but calibration ≠ validation.

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

Four published algorithms + engineered glue. Labeled honestly: the bias
resolver and DPO builder are bespoke logic, not published algorithms.

## Install & run

```bash
pip install z3-solver        # optional — without it the Z3 layer is disabled
python deep_core.py --test   # run the full suite
python deep_core.py --demo   # end-to-end crisis demo
```

`z3-solver` is optional. Without it, `_Z3` is `False`, the Z3 engine is
disabled, and the Z3-specific tests **skip** (they do not fail).

## Status

- **131** tests pass with z3; **106** pass / **25** skipped without z3.
- `mypy` clean (`check_untyped_defs` on).
- CI (`.github/workflows/python-tests.yml`) gates every push/PR in three jobs:
  `tests (with-z3)`, `tests (without-z3)`, `mypy`.

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
