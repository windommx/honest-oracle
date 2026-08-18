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
        self._snapshot: tuple | None = None

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
        self._snapshot = self._take_snapshot()

    def _commit(self) -> None:
        self._snapshot = None

    def _rollback(self) -> None:
        if self._snapshot is not None:
            dead, knows, locs = self._snapshot
            self.dead = set(dead)
            self.knows_map = {k: set(v) for k, v in knows.items()}
            self.obj_loc = dict(locs)
            self._snapshot = None

    # ── validate / apply ────────────────────────────────────────────────
    def _validate(self, events: Sequence[Event]) -> list[str]:
        """Evaluate all rules against the PRE-scene state. Returns reasons."""
        reasons: list[str] = []
        # (a) the dead cannot act
        for ev in events:
            if ev[0] == "act" and self.is_dead(ev[1]):
                reasons.append(f"(a) dead character '{ev[1]}' cannot act")
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
        # (c) a character cannot reference a fact they don't already know
        for ev in events:
            if ev[0] == "reference" and not self.knows(ev[1], ev[2]):
                reasons.append(f"(c) '{ev[1]}' references unknown fact '{ev[2]}'")
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
