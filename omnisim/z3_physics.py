"""Z3 physics engine: incremental solving + UNSAT-core validation.

z3-solver is optional. Without it, _Z3 is False, the z3 operators are None,
and IncrementalZ3() raises on construction; everything else still imports.
"""
from __future__ import annotations
import time
from dataclasses import dataclass
from typing import Any
from .foundations import AgentAction, ActionType

try:
    from z3 import (
        Solver, Bool, And, Or, Not, Implies,
        sat, unsat, unknown as z3_unknown,
    )
    _Z3 = True
except ImportError:
    _Z3 = False
    Solver = Bool = And = Or = Not = Implies = sat = unsat = z3_unknown = None


@dataclass
class Validation:
    valid: bool
    violated_rules: list[str]
    ms: float


class IncrementalZ3:
    """
    Z3 solver with push/pop for temporary validation and
    assert_and_track for UNSAT core extraction.

    Permanent facts and rules persist through push/pop.
    Temporary proposed facts (inside validate()) are discarded on pop.
    """

    def __init__(self, timeout_ms: int = 200):
        if not _Z3:
            raise RuntimeError("pip install z3-solver")
        self._timeout_ms = timeout_ms
        self._solver = Solver()
        self._solver.set("timeout", timeout_ms)
        self._bools: dict[str, Any] = {}
        self._tracks: dict[str, str] = {}   # track_label -> rule_name
        self._rules: list[tuple[str, Any]] = []  # (name, formula) for rebuild
        self._permanent: list[tuple[str, bool]] = []

    def _b(self, name: str):
        if name not in self._bools:
            self._bools[name] = Bool(name)
        return self._bools[name]

    def _rebuild(self):
        """
        Rebuild the solver from scratch. Z3's base solver is monotonic — once
        an assertion is added it cannot be removed — so non-monotonic updates
        (retracting a fact, e.g. a MOVE that invalidates an old location) are
        implemented by replaying the surviving permanent facts and all rules
        into a fresh solver.
        """
        self._solver = Solver()
        self._solver.set("timeout", self._timeout_ms)
        self._tracks = {}
        for name, formula in self._rules:
            label = f"track__{name}"
            self._solver.assert_and_track(formula, label)
            self._tracks[label] = name
        for name, value in self._permanent:
            var = self._b(name)
            self._solver.add(var if value else Not(var))

    def add_rule(self, name: str, formula):
        """Register a permanent rule via assert_and_track (label -> name) so the
        UNSAT core can report violated rules by name.

        NOTE: a rule is a live Z3 expression, which is NOT JSON-serializable.
        Checkpoints therefore capture facts only (see snapshot/load_facts); to
        restore an engine you must re-run the same add_rule calls (i.e. rebuild
        with the same setup) before loading facts. This is a Z3 constraint, not
        a bug — formulas are code, not data.
        """
        label = f"track__{name}"
        self._solver.assert_and_track(formula, label)
        self._tracks[label] = name
        self._rules.append((name, formula))

    def set_fact(self, name: str, value: bool):
        var = self._b(name)
        self._solver.add(var if value else Not(var))
        self._permanent.append((name, value))

    def retract_fact(self, name: str):
        """Remove every permanent assertion of `name` (rebuild required)."""
        before = len(self._permanent)
        self._permanent = [(n, v) for n, v in self._permanent if n != name]
        if len(self._permanent) != before:
            self._rebuild()

    def update_fact(self, name: str, value: bool):
        """Non-monotonic update: drop any prior `name` fact, assert the new
        value, and rebuild. Use this to flip a fact (e.g. dead False -> True)
        without leaving the contradictory old assertion in the solver."""
        self._permanent = [(n, v) for n, v in self._permanent if n != name]
        self._permanent.append((name, value))
        self._rebuild()

    def load_facts(self, facts: list[tuple[str, bool]]):
        """Replace all permanent facts (e.g. when restoring a checkpoint) and
        rebuild. Rules are NOT touched — they must already be registered."""
        self._permanent = [(n, bool(v)) for n, v in facts]
        self._rebuild()

    def validate(self, proposed: dict[str, bool],
                 fail_closed: bool = True) -> Validation:
        """
        Test proposed facts in a temporary scope. Does NOT commit.

        FAIL-CLOSED by default: if the solver returns `unknown` (e.g. it hits
        the timeout) the check is reported INVALID, not valid. Treating an
        undetermined result as permission to act is unsafe in any gating use
        (an action slips through precisely when the prover ran out of time).
        Pass fail_closed=False only for non-gating, best-effort queries.
        """
        self._solver.push()
        for name, value in proposed.items():
            self._solver.add(self._b(name) if value else Not(self._b(name)))

        start = time.perf_counter()
        result = self._solver.check()
        ms = (time.perf_counter() - start) * 1000

        if result == sat:
            self._solver.pop()
            return Validation(True, [], ms)

        if result == unsat:
            core_labels = {str(c) for c in self._solver.unsat_core()}
            violated = [self._tracks[lbl] for lbl in core_labels if lbl in self._tracks]
            self._solver.pop()
            return Validation(False, violated, ms)

        # result == unknown (solver could not decide within the timeout)
        self._solver.pop()
        if fail_closed:
            return Validation(False, ["__undetermined__"], ms)
        return Validation(True, [], ms)

    def commit(self, name: str, value: bool):
        """Permanently assert a new fact."""
        self._solver.add(self._b(name) if value else Not(self._b(name)))
        self._permanent.append((name, value))

    def validate_action(self, action: AgentAction) -> Validation:
        proposed: dict[str, bool] = {}
        if action.action_type == ActionType.SPEAK:
            proposed[f"{action.agent_id}__can_speak"] = True
        elif action.action_type != ActionType.BLOCKED:
            proposed[f"{action.agent_id}__can_act"] = True
        if action.new_location:
            proposed[f"{action.agent_id}__at__{action.new_location}"] = True
        return self.validate(proposed)

    def commit_action(self, action: AgentAction):
        if action.action_type == ActionType.MOVE and action.new_location:
            # Retract every prior location fact for this agent, then assert the
            # new one. Retraction requires a solver rebuild (see _rebuild).
            to_retract = {n for n, _ in self._permanent
                          if n.startswith(f"{action.agent_id}__at__")}
            self._permanent = [(n, v) for n, v in self._permanent
                               if n not in to_retract]
            self._permanent.append(
                (f"{action.agent_id}__at__{action.new_location}", True))
            self._rebuild()

    def snapshot(self) -> dict:
        """Serializable state. `permanent` is the full fact list and can be
        restored via load_facts(); `rules` lists rule NAMES only — the formulas
        are not serializable, so restoring requires re-running add_rule with the
        identical formulas (see add_rule)."""
        return {"permanent": list(self._permanent), "rules": list(self._tracks.values())}
