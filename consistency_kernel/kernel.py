"""NarrativeKernel — a thin facade chaining the two proven subsystems.

The kernel keeps a single ground truth for what each character is aware of and
runs a scene through *staged gates*:

    1. Rule 1 gate  — every ``("reference", char, entity)`` must target an entity
                      the character can reach over ``AWARE_OF`` (within ``max_hops``).
    2. Rule 4 commit — the surviving scene is committed transactionally
                      (validate-then-commit, atomic rollback).

The facade is deliberately small: the load-bearing correctness lives in
``reachability.ReachGraph``/``Trie`` and ``transaction.WorldState``, each verified
independently. This module only wires them together and is covered by integration
tests, not exhaustive proofs.
"""
from __future__ import annotations

from typing import Sequence

from .reachability import ReachGraph, Trie
from .transaction import Event, RuleViolation, WorldState

__all__ = ["NarrativeKernel"]


class NarrativeKernel:
    def __init__(self) -> None:
        self.reach = ReachGraph()
        self.world = WorldState()

    # ── building the world ──────────────────────────────────────────────
    def add_awareness(self, char: str, entity: str) -> None:
        """Make ``char`` aware of ``entity`` (sets the AWARE_OF gate edge and
        registers the entity as referenceable)."""
        self.reach.register_entity(entity)
        self.reach.add_edge(char, entity, "AWARE_OF")

    def add_rule(self, rule) -> None:
        self.world.add_rule(rule)

    # ── queries (Rule 1) ────────────────────────────────────────────────
    def allowed_references(self, pov: str, max_hops: int = 1) -> set[str]:
        return self.reach.allowed_references(pov, max_hops)

    def trie_for(self, pov: str, max_hops: int = 1) -> Trie:
        return Trie(self.allowed_references(pov, max_hops))

    # ── authoring a scene (Rule 1 gate, then Rule 4 commit) ─────────────
    def gate_violations(self, events: Sequence[Event],
                        max_hops: int = 1) -> list[str]:
        """Rule-1 reasons a scene's references are off-manifold (pre-commit)."""
        reasons: list[str] = []
        for ev in events:
            if ev[0] == "reference":
                char, entity = ev[1], ev[2]
                if entity in self.reach.entities and \
                        entity not in self.allowed_references(char, max_hops):
                    reasons.append(
                        f"(gate) '{char}' cannot reference unreachable "
                        f"entity '{entity}'")
        return reasons

    def author_scene(self, events: Sequence[Event],
                     max_hops: int = 1) -> tuple[bool, list[str]]:
        """Run the staged gates. Returns ``(committed, reasons)``; nothing is
        written unless BOTH the Rule-1 gate and the Rule-4 commit pass."""
        gate = self.gate_violations(events, max_hops)
        if gate:
            return False, gate
        return self.world.commit_scene(events)
