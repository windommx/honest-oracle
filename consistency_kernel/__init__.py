"""Narrative Consistency Kernel.

A small, dependency-free, fully deterministic toolkit that does two things and
verifies both to the level of "the code is provably correct against an
independent reference", not "it seemed to work":

* **Reachability gate** (``ReachGraph`` + ``Trie``) — given an AWARE_OF graph and a
  point of view, compute exactly which entities may be referenced, and a
  constrained-decoding trie that is sound *and* complete (prefix-containment safe).
* **Transactional world state** (``WorldState``) — validate a scene jointly against
  the committed state and commit atomically (or roll back entirely), with a
  canonical lock-ordering discipline that is deadlock-free.

These are the two highest-confidence, deterministic rules distilled from the
NeoTIC design. The parts that need real systems to validate (a live LLM
tokenizer, a real database under true concurrency) are intentionally *out of
scope* here — adapters bridge to them, but the kernel's guarantees are about
logic, not real-world efficacy.
"""
from .reachability import ReachGraph, Trie, DEFAULT_EDGE
from .transaction import (
    Event, WorldRule, RuleViolation, WorldState, Scene, lock_keys,
    grammar_violations,
)
from .kernel import NarrativeKernel
from .extraction import (
    ExtractionResult, ProseExtractor, RegexBaselineExtractor,
    GoldExample, score, evaluate,
)

__all__ = [
    "ReachGraph", "Trie", "DEFAULT_EDGE",
    "Event", "WorldRule", "RuleViolation", "WorldState", "Scene", "lock_keys",
    "grammar_violations",
    "NarrativeKernel",
    "ExtractionResult", "ProseExtractor", "RegexBaselineExtractor",
    "GoldExample", "score", "evaluate",
]
