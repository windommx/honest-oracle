"""Transactional world-state consistency (the deterministic core of NeoTIC Rule 4).

A scene is a batch of events validated *jointly* against the pre-scene committed
state. If every world rule passes, the whole batch commits; if any rule is
violated — or any rule callback raises — nothing is written (atomic rollback).
This is the "write-back mandate": the knowledge graph never enters an
inconsistent state, even partway through a rejected scene.

Two operational guarantees, both verified in ``tests/test_kernel.py``:

* **Atomicity.** A rejected scene leaves the state byte-identical to before
  (fuzzed over thousands of random event streams), and an exception inside a
  custom rule rolls back too (fail-closed).
* **Deadlock freedom (concurrency discipline).** ``lock_keys`` derives the set of
  entities a scene touches and returns them in canonical (sorted) order. Acquiring
  locks in a globally-consistent order cannot form a wait-for cycle — proven by an
  all-interleavings search that also confirms *arbitrary* order would deadlock.

The state lives in plain dicts/sets with snapshot-restore; a real database (e.g.
Neo4j) is an adapter that swaps the storage while reusing this exact rule logic.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Callable, Iterator, Sequence

__all__ = [
    "Event", "WorldRule", "RuleViolation", "WorldState", "Scene", "lock_keys",
]

# Event grammar (positional tuples, matching the original design):
#   ("die", char) | ("act", char) | ("place", obj, loc)
#   ("learn", char, fact) | ("reference", char, fact)
Event = tuple

# A custom world rule: given the state and the proposed scene, return a list of
# violation reasons (empty == the rule is satisfied).
WorldRule = Callable[["WorldState", "Sequence[Event]"], "list[str]"]


class RuleViolation(Exception):
    """Raised by the ``transaction`` context manager when a scene is rejected."""

    def __init__(self, reasons: list[str]) -> None:
        super().__init__("; ".join(reasons))
        self.reasons = list(reasons)


# Verb -> total tuple arity (verb slot included). This is the SAME grammar the
# extractor validates against; enforcing it here too means an off-grammar event can
# never reach the rule engine, where it would previously either crash on an index or
# — worse — be silently accepted as a successful no-op.
_ARITY: dict[str, int] = {"die": 2, "act": 2, "place": 3, "learn": 3, "reference": 3}


def grammar_violations(events: Sequence[Event]) -> list[str]:
    """Reasons ``events`` is not well-formed under the event grammar.

    FAIL-CLOSED at the boundary: an unknown verb used to commit cleanly while
    changing nothing (reported as success), and a short tuple such as ``("die",)``
    raised ``IndexError`` out of the rule engine instead of being rejected.
    """
    reasons: list[str] = []
    for i, ev in enumerate(events):
        if not isinstance(ev, (tuple, list)) or not ev:
            reasons.append(f"(g) event {i} is not a non-empty tuple: {ev!r}")
            continue
        verb = ev[0]
        if verb not in _ARITY:
            reasons.append(
                f"(g) event {i} has unknown verb {verb!r}; "
                f"known verbs: {sorted(_ARITY)}")
        elif len(ev) != _ARITY[verb]:
            reasons.append(
                f"(g) event {i} verb {verb!r} takes {_ARITY[verb] - 1} argument(s), "
                f"got {len(ev) - 1}")
    return reasons


def lock_keys(events: Sequence[Event]) -> list[str]:
    """Canonical, sorted lock keys covering every entity a scene reads/writes.

    Acquiring these in sorted order across all transactions is what makes the
    locking discipline deadlock-free (see the V2 proof in the tests).
    """
    keys: set[str] = set()
    for ev in events:
        verb = ev[0]
        if verb in ("die", "act"):
            keys.add(f"char:{ev[1]}")
        elif verb in ("learn", "reference"):
            keys.add(f"char:{ev[1]}")
            keys.add(f"fact:{ev[2]}")
        elif verb == "place":
            keys.add(f"obj:{ev[1]}")
            keys.add(f"loc:{ev[2]}")
    return sorted(keys)


class Scene:
    """A small builder so callers can write a scene as method calls instead of
    raw tuples. Used by ``WorldState.transaction``."""

    def __init__(self) -> None:
        self.events: list[Event] = []

    def die(self, char: str) -> "Scene":
        self.events.append(("die", char)); return self

    def act(self, char: str) -> "Scene":
        self.events.append(("act", char)); return self

    def place(self, obj: str, loc: str) -> "Scene":
        self.events.append(("place", obj, loc)); return self

    def learn(self, char: str, fact: str) -> "Scene":
        self.events.append(("learn", char, fact)); return self

    def reference(self, char: str, fact: str) -> "Scene":
        self.events.append(("reference", char, fact)); return self


class WorldState:
    """A transactional narrative knowledge graph.

    Holds three relations — who is dead, who knows which facts, and where each
    object is — plus a registry of pluggable world rules. ``commit_scene`` is the
    one mutation entry point and is atomic.
    """

    def __init__(self) -> None:
        self.dead: set[str] = set()
        self.knows_map: dict[str, set[str]] = {}
        self.obj_loc: dict[str, str] = {}
        self.extra_rules: list[WorldRule] = []
        # A STACK, not a single slot. With one slot, a rule (or any caller) that
        # re-entered commit_scene made the inner _commit() clear the outer
        # transaction's snapshot, turning the outer _rollback() into a silent
        # no-op — so a rejected scene could leave the world mutated, breaking the
        # headline atomicity guarantee. A stack makes nesting safe: rolling back
        # an outer scene also undoes everything an inner commit wrote.
        self._snapshots: list[tuple] = []

    # ── rule registry ───────────────────────────────────────────────────
    def add_rule(self, rule: WorldRule) -> None:
        """Register a custom constraint. The registry is *monotone*: adding a
        rule can only ever reject more scenes, never accept a previously-rejected
        one."""
        self.extra_rules.append(rule)

    # ── reads ───────────────────────────────────────────────────────────
    def is_dead(self, name: str) -> bool:
        return name in self.dead

    def knows(self, char: str, fact: str) -> bool:
        return fact in self.knows_map.get(char, set())

    def object_location(self, obj: str) -> str | None:
        return self.obj_loc.get(obj)

    def public_state(self) -> tuple:
        """A deep, comparable copy of the observable state (for assertions)."""
        return (set(self.dead),
                {k: set(v) for k, v in self.knows_map.items()},
                dict(self.obj_loc))

    # ── snapshot / restore (the rollback mechanism) ─────────────────────
    def _take_snapshot(self) -> tuple:
        return (set(self.dead),
                {k: set(v) for k, v in self.knows_map.items()},
                dict(self.obj_loc))

    def _begin(self) -> None:
        self._snapshots.append(self._take_snapshot())

    def _commit(self) -> None:
        if self._snapshots:
            self._snapshots.pop()

    def _rollback(self) -> None:
        if self._snapshots:
            dead, knows, locs = self._snapshots.pop()
            self.dead = set(dead)
            self.knows_map = {k: set(v) for k, v in knows.items()}
            self.obj_loc = dict(locs)

    @property
    def in_transaction(self) -> bool:
        """True while at least one commit_scene is in flight (nesting depth > 0)."""
        return bool(self._snapshots)

    # ── validate / apply ────────────────────────────────────────────────
    def _validate(self, events: Sequence[Event]) -> list[str]:
        """Evaluate all rules against the committed state, ADVANCING through the
        scene in order. Returns reasons.

        Order matters inside a scene. Validating every event against the frozen
        pre-scene state made the flagship rule depend on where the extractor
        happened to put a chapter break: ``[("die","Bob"), ("act","Bob")]`` — a
        dead character acting — committed cleanly in one scene while the same two
        events split across two scenes were correctly rejected. The blindness cut
        both ways, also REJECTING the legal scene
        ``[("learn","A","f"), ("reference","A","f")]`` (a character learns a fact
        and then mentions it). Events arrive as an ordered Sequence and the
        extractor emits them in prose order, so the ordering information was there
        all along; this walks it.

        Rule (b) stays a JOINT check on purpose: it is about simultaneity — one
        object cannot occupy two places in the same moment — not about sequence.
        """
        reasons = list(grammar_violations(events))
        if reasons:
            # Do not index into malformed tuples below.
            return reasons

        # (a) and (c) are causal: check each event against the state as it stands
        # at that point in the scene, then fold the event in.
        dead = set(self.dead)
        knows = {k: set(v) for k, v in self.knows_map.items()}
        for ev in events:
            verb = ev[0]
            if verb == "act" and ev[1] in dead:
                reasons.append(f"(a) dead character '{ev[1]}' cannot act")
            elif verb == "reference" and ev[2] not in knows.get(ev[1], ()):
                reasons.append(f"(c) '{ev[1]}' references unknown fact '{ev[2]}'")
            # advance the shadow state
            if verb == "die":
                dead.add(ev[1])
            elif verb == "learn":
                knows.setdefault(ev[1], set()).add(ev[2])

        # (b) an object cannot be placed in two locations within one scene
        placed: dict[str, str] = {}
        for ev in events:
            if ev[0] == "place":
                _, obj, loc = ev
                if obj in placed and placed[obj] != loc:
                    reasons.append(
                        f"(b) object '{obj}' placed in two locations at once: "
                        f"'{placed[obj]}' and '{loc}'")
                placed[obj] = loc

        # pluggable custom rules
        for rule in self.extra_rules:
            reasons.extend(rule(self, events))
        return reasons

    def _apply(self, events: Sequence[Event]) -> None:
        for ev in events:
            verb = ev[0]
            if verb == "die":
                self.dead.add(ev[1])
            elif verb == "learn":
                self.knows_map.setdefault(ev[1], set()).add(ev[2])
            elif verb == "place":
                self.obj_loc[ev[1]] = ev[2]
            # "act" / "reference" mutate nothing on success

    # ── the atomic mutation entry point ─────────────────────────────────
    def commit_scene(self, events: Sequence[Event], *,
                     lock_acquire: Callable[[list[str]], None] | None = None
                     ) -> tuple[bool, list[str]]:
        """Validate ``events`` jointly; commit all iff clean, else change nothing.

        Returns ``(committed, reasons)``. FAIL-CLOSED: if a custom rule callback
        raises, the scene is rolled back and the exception propagates — an
        undetermined check is never treated as a pass.

        ``lock_acquire`` (optional) is called with the canonical sorted lock keys
        before validation, modelling lock-on-read for a concurrent backend.
        """
        # Reject off-grammar input before anything else: lock_keys and the rule
        # engine both index into the tuples, so a malformed event must never get
        # that far. Nothing has begun yet, so there is nothing to roll back.
        malformed = grammar_violations(events)
        if malformed:
            return False, malformed
        self._begin()
        try:
            if lock_acquire is not None:
                lock_acquire(lock_keys(events))
            reasons = self._validate(events)
            if reasons:
                self._rollback()
                return False, reasons
            self._apply(events)
            self._commit()
            return True, []
        except Exception:
            self._rollback()
            raise

    @contextmanager
    def transaction(self) -> Iterator[Scene]:
        """Ergonomic scene builder: collect events, then commit on a clean exit.

        Raises :class:`RuleViolation` (after rolling back) if the scene is
        rejected, so the ``with`` block fails loudly rather than silently.
        """
        scene = Scene()
        yield scene
        committed, reasons = self.commit_scene(scene.events)
        if not committed:
            raise RuleViolation(reasons)
