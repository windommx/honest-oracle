# Narrative Consistency Kernel

A small, **dependency-free, fully deterministic** Python toolkit that does two
things and verifies both against *independent references* — so "the code is
correct" is something you can run, not something you have to trust.

It distils the two highest-confidence, deterministic rules from the NeoTIC design
(Rule 1 + Rule 4) into a clean, typed package. The pieces that need real systems
to validate (a live LLM tokenizer, a real database under true concurrency) are
**deliberately out of scope** — see [What this does NOT claim](#what-this-does-not-claim).

## What's inside

| Component | Module | What it guarantees |
|---|---|---|
| Entity-reachability gate | `reachability.ReachGraph` | exactly the entities a POV can reach over `AWARE_OF` within `max_hops` — no more, no fewer |
| Constrained-decoding trie | `reachability.Trie` | a token gate that is **sound and complete**, including under prefix-containment (`valid_next_with_stop`) |
| Transactional world state | `transaction.WorldState` | validate-then-commit a scene **atomically**; any violation (or a raising rule) rolls back everything (fail-closed) |
| Lock ordering | `transaction.lock_keys` | canonical sorted lock keys → **deadlock-free** concurrency discipline |
| Facade | `kernel.NarrativeKernel` | staged gates: Rule-1 reachability gate, then Rule-4 transactional commit |
| Long-run proof | `longrun` | measures the "no memory decay" claim: graph vs a context-window baseline over 50–1000 chapters |
| Extraction (the hard part) | `extraction.ProseExtractor` | pluggable, fail-closed prose→events; a measurable eval harness + an offline regex floor |

```python
from consistency_kernel import NarrativeKernel

k = NarrativeKernel()
k.add_awareness("Alice", "the_ancient_dagger")   # Alice may now reference it
k.world.commit_scene([("learn", "Alice", "the_code")])

# Rule-1 gate + Rule-4 commit, atomic:
ok, why = k.author_scene([("reference", "Alice", "the_code"),
                          ("place", "dagger", "hall")])

# constrained decoding: only tokens that lead to an allowed entity
k.trie_for("Alice").valid_next(["the"])          # -> {"ancient"}
```

## How "correct" is verified (`tests/test_kernel.py`, 22 tests)

Not happy-path checks — every guarantee is differential, exhaustive, or fuzzed:

- **Reachability** vs a from-scratch **DFS oracle** and a **matrix-power oracle**
  (two independent algorithms), plus a **bounded-exhaustive** sweep over *all*
  4096 directed graphs on a 4-node set × every POV × hops 1–3.
- **Dynamics**: adding an edge only ever *grows* the whitelist; traversal
  terminates and stays correct on dense cyclic graphs.
- **Trie**: the prefix-containment finding (continuation-only decoding is
  incomplete) **and** its fix; decode soundness+completeness over two independent
  tokenizers.
- **Transaction**: the six canonical scenarios; **atomicity fuzz** over 2000
  random event streams (a rejected scene leaves state byte-identical); **fail-closed**
  when a custom rule raises.
- **Deadlock freedom**: over 3000 trials, sorted lock order yields **0** deadlocks
  while an arbitrary order is shown to deadlock — a real differential, not a tautology.

Run it:

```bash
python -m unittest tests.test_kernel      # this package only
python deep_core.py --test                # the whole repo's suite (omnisim + kernel)
mypy                                       # clean
```

No third-party dependencies; pure standard library.

## What this does NOT claim

This kernel proves **logic**, not real-world efficacy. Specifically it does *not*
claim to:

- stop an LLM from hallucinating in production — that needs the trie built over a
  real BPE tokenizer and measured against a live model;
- guarantee serializability on a real database under true concurrency — that needs
  the locking discipline wired into real DB transactions and tested under load;
- judge prose quality or detect AI-written text.

Those live behind adapters and require real systems/data to validate. The honest
boundary is the point: what's inside is checkable to ~100% correctness; what's
outside is not claimed here.

### The extraction layer is the make-or-break — and it's unproven here

The kernel only enforces consistency over events it is *given*. Turning natural
prose into those events (`extraction.ProseExtractor`) needs a real LLM, is
probabilistic, and its accuracy decides whether the product works at all
(garbage-in → garbage-forever). This repo ships:

- a **pluggable, fail-closed** extractor (inject your own `llm_call`; off-grammar
  output is dropped and counted, never invented);
- a **measurable** eval harness (`score` / `evaluate`) over a hand-labelled gold set;
- a deterministic **regex baseline** that scores **F1 ≈ 0.67** on natural prose —
  an honest *floor*, not the product.

**No real-LLM extraction accuracy is claimed**, because this environment has no
model access. Plug your `llm_call` into `ProseExtractor` and run `evaluate(...)`
to get the real number — *that* figure, not the kernel's correctness, gates the
product. Run `python -m consistency_kernel.extraction` for the baseline, and
`python -m consistency_kernel.longrun` for the long-run consistency proof.
