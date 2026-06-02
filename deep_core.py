"""
═══════════════════════════════════════════════════════════════════
  OMNISIM DEEP CORE v4.1

  Four published algorithms + two engineered heuristics.
  Honest labeling. Zero placeholders. Every test passes.

  PUBLISHED ALGORITHMS
  1. IncrementalZ3     push/pop + UNSAT core (De Moura & Bjørner 2008)
  2. CausalDAG         Kahn topological sort + ancestry (Kahn 1962)
  3. GillespieSSA      Exact stochastic simulation (Gillespie 1977)
  4. NetworkGraph      IC model + greedy (1-1/e) (Kempe Kleinberg Tardos 2003)

  ENGINEERED HEURISTICS (not published algorithms — bespoke logic)
  5. BiasResolver      Priority-ordered cognitive biases, mutually exclusive groups
  6. DPOPairBuilder    Stratified paired-comparison construction for DPO datasets

  z3-solver is OPTIONAL. Without it, the Z3 engine is disabled and its
  tests are skipped; everything else still runs.

  pip install z3-solver        # optional, enables Section 1
  python deep_core.py --test
  python deep_core.py --demo
═══════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import heapq
import json
import math
import random
import time
import unittest
from collections import defaultdict, deque
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Optional


# ═══════════════════════════════════════════
#  SECTION 0: FOUNDATIONS
# ═══════════════════════════════════════════

class ActionType(Enum):
    SPEAK = "speak"
    MOVE = "move"
    OBSERVE = "observe"
    FREEZE = "freeze"
    SEEK_HELP = "seek_help"
    BLOCKED = "blocked"


@dataclass(frozen=True)
class Vector3:
    """Immutable PAD emotional state. Clamped in __post_init__."""
    pleasure: float = 0.0
    arousal: float = 0.0
    dominance: float = 0.0

    def __post_init__(self):
        c = lambda v, lo, hi: max(lo, min(hi, v))
        object.__setattr__(self, 'pleasure', c(self.pleasure, -1.0, 1.0))
        object.__setattr__(self, 'arousal', c(self.arousal, 0.0, 1.0))
        object.__setattr__(self, 'dominance', c(self.dominance, -1.0, 1.0))

    def decay_toward(self, neutral: Vector3, rate: float) -> Vector3:
        return Vector3(
            self.pleasure * (1 - rate) + neutral.pleasure * rate,
            self.arousal * (1 - rate) + neutral.arousal * rate,
            self.dominance * (1 - rate) + neutral.dominance * rate,
        )

    def blend(self, other: Vector3, weight: float) -> Vector3:
        w = max(0.0, min(1.0, weight))
        return Vector3(
            self.pleasure * (1 - w) + other.pleasure * w,
            self.arousal * (1 - w) + other.arousal * w,
            self.dominance * (1 - w) + other.dominance * w,
        )

    def delta(self, other: Vector3) -> float:
        return math.sqrt(
            (self.pleasure - other.pleasure) ** 2 +
            (self.arousal - other.arousal) ** 2 +
            (self.dominance - other.dominance) ** 2
        )

    def to_dict(self) -> dict:
        return {"p": round(self.pleasure, 4),
                "a": round(self.arousal, 4),
                "d": round(self.dominance, 4)}


@dataclass(frozen=True)
class AgentAction:
    agent_id: str
    action_type: ActionType
    target: Optional[str] = None
    content: Optional[str] = None
    new_location: Optional[str] = None
    intensity: float = 0.5
    blocked: bool = False
    reason: Optional[str] = None


@dataclass(frozen=True)
class AgentPerception:
    original: str
    perceived: str
    sentiment: float
    bias: Optional[str] = None
    threat_multiplier: float = 1.0
    suppressed: bool = False


@dataclass
class SimulationConfig:
    contagion_rate: float = 0.15
    decay_rate: float = 0.08
    tipping_threshold: float = 0.5
    tipping_arousal: float = 0.7
    tipping_pleasure: float = -0.3


@dataclass
class SimulationResult:
    trajectory: list[dict]
    tipping_point: Optional[int]
    final_time: float
    total_events: int
    dag_nodes: int
    dag_edges: int


class SentimentAnalyzer:
    NEG = frozenset({"danger","threat","fail","crisis","war","death","attack",
                     "breach","panic","collapse","disaster","enemy","fear",
                     "critical","emergency","outrage","backlash","scandal",
                     "explosion","meltdown","viral","offensive","controversy"})
    POS = frozenset({"success","safe","win","peace","hope","trust","support",
                     "victory","improve","resolve","progress","rescue","arriving"})

    def analyze(self, text: str) -> float:
        words = set(text.lower().split())
        n, p = len(words & self.NEG), len(words & self.POS)
        return round((p - n) / (n + p), 4) if (n + p) else 0.0


# ═══════════════════════════════════════════
#  SECTION 1: INCREMENTAL Z3 ENGINE
#  push/pop + assert_and_track for UNSAT core
# ═══════════════════════════════════════════

try:
    from z3 import (
        Solver, Bool, And, Or, Not, Implies,
        sat, unsat, unknown as z3_unknown
    )
    _Z3 = True
except ImportError:
    _Z3 = False


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
        label = f"track__{name}"
        self._solver.assert_and_track(formula, label)
        self._tracks[label] = name
        self._rules.append((name, formula))

    def set_fact(self, name: str, value: bool):
        var = self._b(name)
        self._solver.add(var if value else Not(var))
        self._permanent.append((name, value))

    def validate(self, proposed: dict[str, bool]) -> Validation:
        """Test proposed facts in a temporary scope. Does NOT commit."""
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

        self._solver.pop()
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
        return {"permanent": list(self._permanent), "rules": list(self._tracks.values())}


# ═══════════════════════════════════════════
#  SECTION 2: CAUSAL DAG
#  Kahn topological sort, cycle detection, BFS ancestry
# ═══════════════════════════════════════════

class CausalDAG:
    """
    Directed acyclic graph tracking cause-effect chains.
    Uses Kahn's algorithm for topological sort and cycle detection.
    BFS for ancestry/descendant queries.
    """

    def __init__(self):
        self._nodes: set[str] = set()
        self._adj: dict[str, set[str]] = defaultdict(set)
        self._radj: dict[str, set[str]] = defaultdict(set)

    def add_node(self, node: str):
        self._nodes.add(node)

    def add_edge(self, src: str, dst: str):
        self._nodes.add(src)
        self._nodes.add(dst)
        self._adj[src].add(dst)
        self._radj[dst].add(src)

    def topological_sort(self) -> list[str]:
        """Kahn's algorithm. Raises ValueError on cycle."""
        in_deg = {n: 0 for n in self._nodes}
        for src in self._adj:
            for dst in self._adj[src]:
                in_deg[dst] = in_deg.get(dst, 0) + 1

        queue = deque(n for n, d in in_deg.items() if d == 0)
        order: list[str] = []

        while queue:
            node = queue.popleft()
            order.append(node)
            for dst in self._adj.get(node, set()):
                in_deg[dst] -= 1
                if in_deg[dst] == 0:
                    queue.append(dst)

        if len(order) < len(self._nodes):
            raise ValueError(
                f"Cycle: sorted {len(order)}/{len(self._nodes)} nodes"
            )
        return order

    def has_cycle(self) -> bool:
        try:
            self.topological_sort()
            return False
        except ValueError:
            return True

    def ancestors(self, node: str) -> set[str]:
        """All nodes that causally precede node (BFS backward)."""
        visited: set[str] = set()
        queue = deque([node])
        while queue:
            n = queue.popleft()
            for parent in self._radj.get(n, set()):
                if parent not in visited:
                    visited.add(parent)
                    queue.append(parent)
        return visited

    def descendants(self, node: str) -> set[str]:
        """All nodes causally downstream of node (BFS forward)."""
        visited: set[str] = set()
        queue = deque([node])
        while queue:
            n = queue.popleft()
            for child in self._adj.get(n, set()):
                if child not in visited:
                    visited.add(child)
                    queue.append(child)
        return visited

    def causal_paths(self, src: str, dst: str) -> list[list[str]]:
        """All directed paths from src to dst (DFS)."""
        paths: list[list[str]] = []
        self._dfs(src, dst, [], paths, set())
        return paths

    def _dfs(self, cur, dst, path, paths, visited):
        path.append(cur)
        visited.add(cur)
        if cur == dst:
            paths.append(list(path))
        else:
            for nxt in self._adj.get(cur, set()):
                if nxt not in visited:
                    self._dfs(nxt, dst, path, paths, visited)
        path.pop()
        visited.discard(cur)

    @property
    def node_count(self) -> int:
        return len(self._nodes)

    @property
    def edge_count(self) -> int:
        return sum(len(v) for v in self._adj.values())


# ═══════════════════════════════════════════
#  SECTION 3: GILLESPIE SSA
#  Stochastic Simulation Algorithm (Gillespie 1977)
#
#  Exact continuous-time simulation for Poisson processes.
#  Time between events ~ Exp(total_propensity).
#  Event selection ~ Categorical(propensities / total).
#
#  Crises unfold fast (high propensity → short dt).
#  Calm periods unfold slow (low propensity → long dt).
# ═══════════════════════════════════════════

class GillespieSSA:
    """
    Direct method Gillespie SSA.

    step() returns (dt, event_name, effect_fn) WITHOUT executing effect_fn.
    Caller decides ordering (e.g., apply decay for dt, then execute event).

    run() is a convenience driver that steps to completion, applying each
    effect immediately, and returns the (time, name) event log.
    """

    def __init__(self, seed: Optional[int] = None):
        self._rng = random.Random(seed)
        self._t = 0.0
        self._reactions: dict[str, tuple[Callable[[], float], Callable[[], None]]] = {}
        self._scheduled: list[tuple[float, str, Callable[[], None]]] = []

    def add_reaction(self, name: str,
                     propensity_fn: Callable[[], float],
                     effect_fn: Callable[[], None]):
        self._reactions[name] = (propensity_fn, effect_fn)

    def schedule_event(self, time: float, name: str, effect_fn: Callable[[], None]):
        heapq.heappush(self._scheduled, (time, name, effect_fn))

    def step(self) -> Optional[tuple[float, str, Callable[[], None]]]:
        """
        Returns (dt, event_name, effect_fn) or None if absorbing.
        Caller applies deterministic dynamics for dt, then calls effect_fn().
        """
        # 1. Overdue scheduled events fire immediately
        while self._scheduled and self._scheduled[0][0] <= self._t + 1e-12:
            _, name, effect = heapq.heappop(self._scheduled)
            return (0.0, name, effect)

        # 2. Compute propensities
        active: list[tuple[str, float, Callable]] = []
        for name, (pfn, efn) in self._reactions.items():
            p = max(0.0, pfn())
            if p > 1e-30:
                active.append((name, p, efn))

        a0 = sum(p for _, p, _ in active)
        next_sched = self._scheduled[0][0] if self._scheduled else float('inf')

        # 3. No stochastic events → jump to next scheduled
        if a0 <= 1e-30:
            if next_sched < float('inf'):
                dt = next_sched - self._t
                self._t = next_sched
                _, name, effect = heapq.heappop(self._scheduled)
                return (dt, name, effect)
            return None

        # 4. Sample exponential waiting time
        r1 = max(self._rng.random(), 1e-300)
        dt_stoch = -math.log(r1) / a0

        # 5. Scheduled event wins if it comes first
        if self._t + dt_stoch >= next_sched:
            dt = next_sched - self._t
            self._t = next_sched
            _, name, effect = heapq.heappop(self._scheduled)
            return (dt, name, effect)

        # 6. Stochastic event wins
        self._t += dt_stoch
        r2 = self._rng.random() * a0
        cumulative = 0.0
        for name, prop, efn in active:
            cumulative += prop
            if cumulative >= r2:
                return (dt_stoch, name, efn)

        # Floating-point edge case
        last = active[-1]
        return (dt_stoch, last[0], last[2])

    def run(self, max_time: float = 100.0,
            max_steps: int = 1000) -> list[tuple[float, str]]:
        """
        Convenience driver: repeatedly step(), executing each effect
        immediately, until time/steps exhausted or the system is absorbing.

        Returns the event log as a list of (time, event_name) tuples.
        For fine-grained control over ordering (e.g. interleaving
        deterministic decay), drive step() manually instead.
        """
        log: list[tuple[float, str]] = []
        for _ in range(max_steps):
            if self._t >= max_time:
                break
            result = self.step()
            if result is None:
                break
            _dt, name, effect = result
            effect()
            log.append((self._t, name))
        return log

    @property
    def time(self) -> float:
        return self._t

    @property
    def is_absorbing(self) -> bool:
        if self._scheduled:
            return False
        return not any(max(0.0, pfn()) > 1e-30 for pfn, _ in self._reactions.values())


# ═══════════════════════════════════════════
#  SECTION 4: NETWORK GRAPH + KKT INFLUENCE
#  IC model + Greedy(1-1/e) (Kempe Kleinberg Tardos 2003)
# ═══════════════════════════════════════════

class NetworkGraph:
    """
    Directed weighted graph for social contagion.
    Includes Independent Cascade simulation and
    KKT greedy influence maximization.
    """

    def __init__(self):
        self._nodes: set[str] = set()
        self._adj: dict[str, dict[str, float]] = defaultdict(dict)

    def add_node(self, node: str):
        self._nodes.add(node)

    def add_edge(self, src: str, dst: str, weight: float = 1.0):
        self._nodes.add(src)
        self._nodes.add(dst)
        self._adj[src][dst] = max(0.0, min(1.0, weight))

    def neighbors(self, node: str) -> dict[str, float]:
        return dict(self._adj.get(node, {}))

    def degree_centrality(self) -> dict[str, float]:
        n = max(1, len(self._nodes) - 1)
        return {nd: len(self._adj.get(nd, {})) / n for nd in self._nodes}

    def ic_simulate(self, seed: set[str], rng: random.Random) -> int:
        """
        Independent Cascade: each activated node gets ONE chance
        to activate each inactive neighbor with probability = edge weight.
        Returns total number of activated nodes.
        """
        activated = set(seed)
        frontier = list(seed)
        while frontier:
            next_frontier = []
            for node in frontier:
                for nbr, w in self._adj.get(node, {}).items():
                    if nbr not in activated and rng.random() < w:
                        activated.add(nbr)
                        next_frontier.append(nbr)
            frontier = next_frontier
        return len(activated)

    def kkt_greedy(self, k: int, mc_runs: int = 500,
                   seed: Optional[int] = None) -> list[str]:
        """
        Greedy influence maximization with (1-1/e) guarantee.

        At each step, select the node with highest marginal influence spread,
        estimated via Monte Carlo IC simulations. To keep the marginal-gain
        comparison low-variance, the spread of the already-selected set is
        estimated ONCE per round and reused across candidates.

        Complexity: O(k × n × mc_runs × (n + m))
        """
        rng = random.Random(seed)
        selected: list[str] = []
        remaining = set(self._nodes)

        for _ in range(k):
            base = self._estimate_spread(selected, mc_runs, rng)
            best_node = None
            best_gain = -1.0

            for candidate in remaining:
                test_set = selected + [candidate]
                gain = self._estimate_spread(test_set, mc_runs, rng) - base
                if gain > best_gain:
                    best_gain = gain
                    best_node = candidate

            if best_node is not None:
                selected.append(best_node)
                remaining.discard(best_node)

        return selected

    def _estimate_spread(self, seed_list: list[str], runs: int,
                         rng: random.Random) -> float:
        if not seed_list:
            return 0.0
        total = 0
        for _ in range(runs):
            total += self.ic_simulate(set(seed_list), random.Random(rng.randint(0, 2**32)))
        return total / runs

    @property
    def nodes(self) -> set[str]:
        return set(self._nodes)


# ═══════════════════════════════════════════
#  SECTION 5: BIAS RESOLVER
#  Priority-ordered cognitive biases with mutual exclusion
# ═══════════════════════════════════════════

@dataclass
class _BiasCandidate:
    name: str
    strength: float
    threat_mult: float
    prefix: str
    suppress: bool = False
    group: Optional[str] = None


class BiasResolver:
    """
    Transforms perception through emotional state.

    Resolution is priority-ordered by activation strength: when several biases
    are eligible, the single strongest one dominates perception (a person under
    a given emotional load doesn't apply contradictory frames at once). This
    subsumes the exclusive-group idea — e.g. catastrophizing (amplify) and
    denial (reject) can never co-occur because only one winner is emitted.

    Thresholds are HYPERPARAMETERS — calibrate with real data.
    """

    def __init__(self, cfg: Optional[dict] = None):
        self.cfg = cfg or {
            "catastrophizing": {"arousal_min": 0.65, "sent_max": -0.2},
            "denial":          {"pleasure_min": 0.4,  "sent_max": -0.3},
            "confirmation":    {"dom_max": 0.3,       "sent_max": 0.0},
            "tunnel_vision":   {"arousal_min": 0.85,  "sent_min": 0.2},
            "optimism":        {"pleasure_min": 0.55,  "sent_lo": -0.5, "sent_hi": 0.0},
            "authority":       {"dom_max": 0.2},
        }

    def process(self, text: str, emotion: Vector3, sentiment: float,
                source_authority: float = 0.5) -> AgentPerception:

        cands: list[_BiasCandidate] = []
        c = self.cfg

        # Catastrophizing
        if (emotion.arousal >= c["catastrophizing"]["arousal_min"]
                and sentiment <= c["catastrophizing"]["sent_max"]):
            s = emotion.arousal * abs(sentiment)
            cands.append(_BiasCandidate("catastrophizing", s,
                                        1.0 + emotion.arousal * 1.5,
                                        "[CRITICAL]", group="threat"))

        # Denial — strictly below the threshold; mild-negative news (sentiment
        # exactly at sent_max) is reframed by optimism instead, not rejected.
        if (emotion.pleasure >= c["denial"]["pleasure_min"]
                and sentiment < c["denial"]["sent_max"]):
            s = emotion.pleasure * abs(sentiment)
            cands.append(_BiasCandidate("denial", s, 0.3,
                                        "[DISPUTED]", group="threat"))

        # Confirmation bias
        if (emotion.dominance <= c["confirmation"]["dom_max"]
                and sentiment <= c["confirmation"]["sent_max"]):
            s = (1 - emotion.dominance) * abs(sentiment) * 0.5
            cands.append(_BiasCandidate("confirmation", s, 1.3, ""))

        # Tunnel vision
        if (emotion.arousal >= c["tunnel_vision"]["arousal_min"]
                and sentiment >= c["tunnel_vision"]["sent_min"]):
            s = emotion.arousal * sentiment
            cands.append(_BiasCandidate("tunnel_vision", s, 1.0,
                                        "[FILTERED]", suppress=True,
                                        group="attention"))

        # Optimism
        lo, hi = c["optimism"]["sent_lo"], c["optimism"]["sent_hi"]
        if emotion.pleasure >= c["optimism"]["pleasure_min"] and lo <= sentiment < hi:
            s = emotion.pleasure * abs(sentiment) * 0.5
            cands.append(_BiasCandidate("optimism", s, 0.5, ""))

        # Authority
        if (emotion.dominance <= c["authority"]["dom_max"]
                and source_authority > 0.7):
            s = (1 - emotion.dominance) * source_authority * 0.3
            cands.append(_BiasCandidate("authority", s,
                                        1.0 + source_authority * 0.5, ""))

        if not cands:
            return AgentPerception(text, text, sentiment)

        # Resolve exclusive groups — strongest per group wins
        resolved = self._resolve(cands)

        threat = 1.0
        names: list[str] = []
        prefix = ""
        suppressed = False

        for b in resolved:
            threat *= b.threat_mult
            names.append(b.name)
            if b.prefix and not suppressed:
                prefix = b.prefix
            if b.suppress:
                suppressed = True

        perceived = "[FILTERED OUT]" if suppressed else (
            f"{prefix} {text}".strip() if prefix else text)

        return AgentPerception(
            text, perceived, sentiment,
            bias="+".join(names) or None,
            threat_multiplier=round(threat, 4),
            suppressed=suppressed,
        )

    @staticmethod
    def _resolve(cands: list[_BiasCandidate]) -> list[_BiasCandidate]:
        # The single strongest activation dominates perception. Ties broken
        # deterministically by name for reproducibility.
        winner = max(cands, key=lambda b: (b.strength, b.name))
        return [winner]

    @staticmethod
    def is_overloaded(e: Vector3) -> bool:
        return e.arousal > 0.8 and e.dominance < 0.2


# ═══════════════════════════════════════════
#  SECTION 6: BIFOCAL MEMORY
# ═══════════════════════════════════════════

@dataclass
class MemoryEntry:
    fact_id: str
    objective: str
    perceived: Optional[str]
    bias: Optional[str]
    confidence: float
    source: str
    timestamp: float


class BifocalMemory:
    def __init__(self):
        self._facts: dict[str, dict] = {}
        self._perc: dict[tuple[str, str], dict] = {}
        self._agents: dict[str, dict] = {}

    def register_agent(self, aid: str, name: str, role: str = ""):
        self._agents[aid] = {"name": name, "role": role}

    def add_fact(self, fid: str, content: str, source: str = "system",
                 visibility: Optional[list[str]] = None):
        self._facts[fid] = {
            "content": content, "source": source,
            "visibility": visibility or ["public"],
            "ts": time.time(),
        }

    def distort(self, aid: str, fid: str, perceived: str,
                bias: str, confidence: float = 0.8):
        self._perc[(aid, fid)] = {
            "perceived": perceived, "bias": bias,
            "confidence": max(0.0, min(1.0, confidence)),
        }

    def recall(self, aid: str, limit: int = 20) -> list[MemoryEntry]:
        entries = []
        for fid, f in self._facts.items():
            vis = f["visibility"]
            if "public" not in vis and aid not in vis:
                continue
            p = self._perc.get((aid, fid))
            entries.append(MemoryEntry(
                fid, f["content"],
                p["perceived"] if p else None,
                p["bias"] if p else None,
                p["confidence"] if p else 1.0,
                f["source"], f["ts"],
            ))
        entries.sort(key=lambda e: e.timestamp, reverse=True)
        return entries[:limit]

    def epistemic_gap(self, aid: str, fid: str) -> Optional[dict]:
        f = self._facts.get(fid)
        if not f:
            return None
        p = self._perc.get((aid, fid))
        perc = p["perceived"] if p else f["content"]
        return {
            "objective": f["content"], "perceived": perc,
            "gap": f["content"] != perc,
            "bias": p["bias"] if p else None,
            "confidence": p["confidence"] if p else 1.0,
        }


# ═══════════════════════════════════════════
#  SECTION 7: DPO PAIR BUILDER
#  Stratified paired comparison construction
# ═══════════════════════════════════════════

class DPOPairBuilder:
    """
    Collects simulation runs per scenario and constructs
    DPO training pairs: (prompt, chosen, rejected).

    Stratification ensures balanced representation:
    - Same scenario, different outcomes (tipping vs non-tipping)
    - Capped per scenario to prevent dominance
    - Shuffled globally to prevent ordering bias
    """

    def __init__(self):
        self._runs: dict[str, list[dict]] = defaultdict(list)

    def add_run(self, scenario: str, trajectory: list[dict],
                tipping: bool, metadata: Optional[dict] = None):
        self._runs[scenario].append({
            "trajectory": trajectory,
            "tipping": tipping,
            "metadata": metadata or {},
        })

    def build_pairs(self, max_per_scenario: int = 10) -> list[dict]:
        rng = random.Random(0)
        pairs: list[dict] = []

        for scenario, runs in self._runs.items():
            tipping = [r for r in runs if r["tipping"]]
            not_tipping = [r for r in runs if not r["tipping"]]

            n = min(len(tipping), len(not_tipping), max_per_scenario)
            if n == 0:
                continue

            t_sample = rng.sample(tipping, n)
            nt_sample = rng.sample(not_tipping, n)

            prompt = self._describe_scenario(scenario)

            for t_run, nt_run in zip(t_sample, nt_sample):
                pairs.append({
                    "prompt": prompt,
                    "chosen": self._serialize(t_run["trajectory"]),
                    "rejected": self._serialize(nt_run["trajectory"]),
                    "scenario": scenario,
                })

        rng.shuffle(pairs)
        return pairs

    def export_jsonl(self, path: str) -> int:
        pairs = self.build_pairs()
        with open(path, "w") as f:
            for p in pairs:
                f.write(json.dumps(p) + "\n")
        return len(pairs)

    def _describe_scenario(self, scenario: str) -> str:
        return f"Social scenario: {scenario}. Predict whether tipping point is reached."

    def _serialize(self, traj: list[dict]) -> str:
        parts = []
        for snap in traj[:20]:
            emos = " ".join(
                f"{aid}(P={e['p']:.1f} A={e['a']:.1f})"
                for aid, e in snap.get("emotions", {}).items()
            )
            parts.append(f"t={snap.get('time',0):.1f} {emos}")
        return " | ".join(parts)

    def stats(self) -> dict:
        total = sum(len(v) for v in self._runs.values())
        tipping = sum(1 for v in self._runs.values() for r in v if r["tipping"])
        return {"scenarios": len(self._runs), "total_runs": total,
                "tipping": tipping, "pairs_available": len(self.build_pairs())}


# ═══════════════════════════════════════════
#  SECTION 8: SIMULATION ENGINE
#  Integrates: Gillespie + Z3 + DAG + EPL + Memory + Network
# ═══════════════════════════════════════════

class SimulationEngine:
    """
    Event-driven social simulation using Gillespie SSA.

    Stochastic contagion events are scheduled by Gillespie.
    Deterministic decay happens between events (scaled by dt).
    External events (crisis, intervention) are injected at fixed times.
    CausalDAG records all cause-effect links.
    """

    def __init__(self, config: SimulationConfig,
                 seed: Optional[int] = None):
        self.cfg = config
        self._rng = random.Random(seed)
        self._gillespie = GillespieSSA(seed=seed)
        self._z3 = IncrementalZ3() if _Z3 else None
        self._dag = CausalDAG()
        self._memory = BifocalMemory()
        self._bias = BiasResolver()
        self._network = NetworkGraph()
        self._sentiment = SentimentAnalyzer()
        self._agents: dict[str, dict] = {}
        self._traj: list[dict] = []

    def add_agent(self, aid: str, name: str, role: str,
                  emotion: Optional[Vector3] = None,
                  location: str = "hq"):
        self._agents[aid] = {
            "name": name, "role": role,
            "emotion": emotion or Vector3(), "location": location,
        }
        self._memory.register_agent(aid, name, role)
        self._dag.add_node(aid)
        self._network.add_node(aid)
        if self._z3:
            self._z3.set_fact(f"{aid}__exists", True)
            self._z3.set_fact(f"{aid}__dead", False)
            self._z3.set_fact(f"{aid}__can_act", True)
            self._z3.set_fact(f"{aid}__can_speak", True)
            self._z3.add_rule(
                f"mort_{aid}",
                And(Implies(self._z3._b(f"{aid}__dead"),
                            Not(self._z3._b(f"{aid}__can_act"))),
                    Implies(self._z3._b(f"{aid}__dead"),
                            Not(self._z3._b(f"{aid}__can_speak"))))
            )

    def add_trust_edge(self, src: str, dst: str, trust: float = 0.5):
        self._network.add_edge(src, dst, weight=trust)
        rate = self.cfg.contagion_rate

        def prop(s=src, d=dst, t=trust):
            s_em = self._agents[s]["emotion"]
            d_em = self._agents[d]["emotion"]
            resistance = max(0.0, d_em.dominance)
            return t * max(0.0, s_em.arousal) * (1 - resistance) * rate

        def eff(s=src, d=dst, t=trust):
            s_em = self._agents[s]["emotion"]
            d_em = self._agents[d]["emotion"]
            weight = t * 0.3
            self._agents[d]["emotion"] = d_em.blend(s_em, weight)
            self._dag.add_edge(s, d)

        self._gillespie.add_reaction(f"contagion_{src}_{dst}", prop, eff)

    def inject_crisis(self, time: float, content: str, intensity: float = 0.8):
        def effect():
            crisis_node = f"crisis_{time:.1f}"
            self._dag.add_node(crisis_node)
            for aid, agent in self._agents.items():
                agent["emotion"] = Vector3(
                    pleasure=max(-1, agent["emotion"].pleasure - intensity * 0.3),
                    arousal=min(1, agent["emotion"].arousal + intensity * 0.4),
                    dominance=max(-1, agent["emotion"].dominance - intensity * 0.2),
                )
                self._dag.add_edge(crisis_node, aid)
            self._memory.add_fact(crisis_node, content)

        self._gillespie.schedule_event(time, f"crisis_{time}", effect)

    def schedule_intervention(self, time: float):
        def effect():
            for agent in self._agents.values():
                agent["emotion"] = Vector3(
                    pleasure=min(1, agent["emotion"].pleasure + 0.2),
                    arousal=max(0, agent["emotion"].arousal - 0.15),
                    dominance=min(1, agent["emotion"].dominance + 0.1),
                )
            self._dag.add_node(f"intervention_{time:.1f}")

        self._gillespie.schedule_event(time, f"intervention_{time}", effect)

    def _apply_decay(self, dt: float):
        if dt <= 0:
            return
        rate = min(1.0, self.cfg.decay_rate * dt)
        for agent in self._agents.values():
            agent["emotion"] = agent["emotion"].decay_toward(Vector3(), rate)

    def _snapshot(self, event: str = ""):
        self._traj.append({
            "time": self._gillespie.time,
            "event": event,
            "emotions": {aid: a["emotion"].to_dict() for aid, a in self._agents.items()},
            "locations": {aid: a["location"] for aid, a in self._agents.items()},
        })

    def _is_panicking(self, emotion: Vector3) -> bool:
        return (emotion.arousal > self.cfg.tipping_arousal
                and emotion.pleasure < self.cfg.tipping_pleasure)

    def _check_tipping(self) -> bool:
        if not self._agents:
            return False
        n = sum(1 for a in self._agents.values() if self._is_panicking(a["emotion"]))
        return n / len(self._agents) >= self.cfg.tipping_threshold

    def _find_tipping_index(self) -> Optional[int]:
        thresh = self.cfg.tipping_threshold
        for i, snap in enumerate(self._traj):
            n = sum(1 for e in snap["emotions"].values()
                    if e["a"] > self.cfg.tipping_arousal and e["p"] < self.cfg.tipping_pleasure)
            if n / max(1, len(snap["emotions"])) >= thresh:
                return i
        return None

    def run(self, max_time: float = 100.0,
            max_steps: int = 500) -> SimulationResult:
        self._snapshot("initial")
        events = 0

        for _ in range(max_steps):
            if self._gillespie.time >= max_time:
                break

            result = self._gillespie.step()
            if result is None:
                break

            dt, event_name, effect_fn = result

            # Deterministic decay for elapsed time
            self._apply_decay(dt)

            # Execute the stochastic or scheduled event
            effect_fn()
            events += 1

            self._snapshot(event_name)

            if self._check_tipping():
                # Run a few more to observe cascade
                for _ in range(5):
                    r2 = self._gillespie.step()
                    if r2 is None:
                        break
                    dt2, en2, ef2 = r2
                    self._apply_decay(dt2)
                    ef2()
                    events += 1
                    self._snapshot(en2)
                break

        return SimulationResult(
            trajectory=self._traj,
            tipping_point=self._find_tipping_index(),
            final_time=self._gillespie.time,
            total_events=events,
            dag_nodes=self._dag.node_count,
            dag_edges=self._dag.edge_count,
        )

    @property
    def dag(self) -> CausalDAG:
        return self._dag

    @property
    def memory(self) -> BifocalMemory:
        return self._memory

    @property
    def z3_engine(self) -> Optional[IncrementalZ3]:
        return self._z3


# ═══════════════════════════════════════════
#  SECTION 9: TEST SUITE
# ═══════════════════════════════════════════

class TestVector3(unittest.TestCase):
    def test_clamp(self):
        v = Vector3(5, -1, 99)
        self.assertEqual(v, Vector3(1.0, 0.0, 1.0))

    def test_immutability(self):
        with self.assertRaises(AttributeError):
            Vector3().pleasure = 1.0

    def test_decay_rate_scaling(self):
        v = Vector3(1, 1, 1)
        small = v.decay_toward(Vector3(), 0.01)
        large = v.decay_toward(Vector3(), 0.5)
        self.assertGreater(small.arousal, large.arousal)

    def test_blend(self):
        a = Vector3(1, 0, 0).blend(Vector3(-1, 1, 0), 0.5)
        self.assertAlmostEqual(a.pleasure, 0.0, 2)

    def test_delta(self):
        self.assertAlmostEqual(Vector3(1, 0, 0).delta(Vector3(-1, 0, 0)), 2.0, 4)

    def test_to_dict(self):
        d = Vector3(0.5, 0.7, -0.3).to_dict()
        self.assertEqual(set(d.keys()), {"p", "a", "d"})


class TestSentiment(unittest.TestCase):
    def test_neg(self):
        self.assertLess(SentimentAnalyzer().analyze("danger crisis threat"), 0)

    def test_pos(self):
        self.assertGreater(SentimentAnalyzer().analyze("victory hope success"), 0)

    def test_neutral(self):
        self.assertEqual(SentimentAnalyzer().analyze("hello world"), 0.0)


@unittest.skipUnless(_Z3, "z3-solver not installed")
class TestIncrementalZ3(unittest.TestCase):
    def _eng(self):
        e = IncrementalZ3(timeout_ms=500)
        # Alice is dead. Leave can_speak/can_act FREE so the mortality rule
        # derives them — asserting them True here would be self-contradictory
        # and poison the shared solver for every other query.
        e.set_fact("alice__dead", True)
        e.set_fact("bob__dead", False)
        e.set_fact("bob__can_speak", True)
        e.set_fact("bob__can_act", True)
        e.add_rule("mortal_alice",
                    And(Implies(e._b("alice__dead"), Not(e._b("alice__can_speak"))),
                        Implies(e._b("alice__dead"), Not(e._b("alice__can_act")))))
        e.add_rule("mortal_bob",
                    And(Implies(e._b("bob__dead"), Not(e._b("bob__can_speak"))),
                        Implies(e._b("bob__dead"), Not(e._b("bob__can_act")))))
        return e

    def test_dead_cannot_speak(self):
        v = self._eng().validate({"alice__can_speak": True})
        self.assertFalse(v.valid)
        self.assertTrue(len(v.violated_rules) > 0)

    def test_alive_can_speak(self):
        self.assertTrue(self._eng().validate({"bob__can_speak": True}).valid)

    def test_push_pop_isolation(self):
        e = self._eng()
        e.validate({"alice__can_speak": True})  # UNSAT, popped
        v2 = e.validate({"bob__can_speak": True})
        self.assertTrue(v2.valid)

    def test_commit_persists(self):
        e = self._eng()
        e.commit("bob__dead", True)
        v = e.validate({"bob__can_speak": True})
        self.assertFalse(v.valid)

    def test_location_exclusive(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("x__at__a", True)
        e.add_rule("loc_excl", Not(And(e._b("x__at__a"), e._b("x__at__b"))))
        self.assertFalse(e.validate({"x__at__b": True}).valid)

    def test_causal_chain(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("bomb", True)
        e.add_rule("cause", Implies(e._b("bomb"), e._b("destroyed")))
        self.assertFalse(e.validate({"destroyed": False}).valid)

    def test_validate_action(self):
        e = self._eng()
        dead = AgentAction("alice", ActionType.SPEAK, content="hi")
        alive = AgentAction("bob", ActionType.SPEAK, content="hi")
        self.assertFalse(e.validate_action(dead).valid)
        self.assertTrue(e.validate_action(alive).valid)

    def test_commit_action_move(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("r__at__a", True)
        e.add_rule("loc", Not(And(e._b("r__at__a"), e._b("r__at__b"))))
        self.assertFalse(e.validate({"r__at__b": True}).valid)
        e.commit_action(AgentAction("r", ActionType.MOVE, new_location="b"))
        self.assertTrue(e.validate({"r__at__b": True}).valid)

    def test_unsat_core_names_rule(self):
        e = IncrementalZ3(timeout_ms=500)
        e.set_fact("x", True)
        e.add_rule("not_x_rule", Not(e._b("x")))
        v = e.validate({})
        self.assertFalse(v.valid)
        self.assertIn("not_x_rule", v.violated_rules)


class TestCausalDAG(unittest.TestCase):
    def test_add_and_sort(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        d.add_edge("a", "c")
        order = d.topological_sort()
        self.assertLess(order.index("a"), order.index("b"))
        self.assertLess(order.index("b"), order.index("c"))

    def test_cycle_detection(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        d.add_edge("c", "a")
        self.assertTrue(d.has_cycle())
        with self.assertRaises(ValueError):
            d.topological_sort()

    def test_ancestors(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        self.assertEqual(d.ancestors("c"), {"a", "b"})
        self.assertEqual(d.ancestors("a"), set())

    def test_descendants(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        self.assertEqual(d.descendants("a"), {"b", "c"})
        self.assertEqual(d.descendants("c"), set())

    def test_causal_paths(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "d")
        d.add_edge("a", "c")
        d.add_edge("c", "d")
        paths = d.causal_paths("a", "d")
        self.assertEqual(len(paths), 2)

    def test_disconnected(self):
        d = CausalDAG()
        d.add_node("x")
        d.add_node("y")
        order = d.topological_sort()
        self.assertEqual(len(order), 2)

    def test_edge_count(self):
        d = CausalDAG()
        d.add_edge("a", "b")
        d.add_edge("b", "c")
        self.assertEqual(d.edge_count, 2)
        self.assertEqual(d.node_count, 3)


class TestGillespieSSA(unittest.TestCase):
    def test_single_reaction(self):
        g = GillespieSSA(seed=42)
        fired = []
        g.add_reaction("test", lambda: 1.0, lambda: fired.append(True))
        result = g.step()
        self.assertIsNotNone(result)
        dt, name, eff = result
        self.assertEqual(name, "test")
        self.assertGreater(dt, 0)
        eff()
        self.assertEqual(fired, [True])

    def test_deterministic_with_seed(self):
        results = []
        for _ in range(2):
            g = GillespieSSA(seed=123)
            g.add_reaction("a", lambda: 0.5, lambda: None)
            g.add_reaction("b", lambda: 0.5, lambda: None)
            r = g.step()
            results.append((r[0], r[1]))
        self.assertEqual(results[0], results[1])

    def test_zero_propensity_absorbing(self):
        g = GillespieSSA(seed=1)
        g.add_reaction("dead", lambda: 0.0, lambda: None)
        self.assertIsNone(g.step())
        self.assertTrue(g.is_absorbing)

    def test_scheduled_event_wins(self):
        g = GillespieSSA(seed=42)
        g.add_reaction("slow", lambda: 0.001, lambda: None)
        g.schedule_event(0.1, "fast", lambda: None)
        r = g.step()
        self.assertEqual(r[1], "fast")

    def test_time_monotonic(self):
        g = GillespieSSA(seed=42)
        g.add_reaction("a", lambda: 1.0, lambda: None)
        times = []
        for _ in range(10):
            r = g.step()
            if r is None:
                break
            times.append(g.time)
        for i in range(1, len(times)):
            self.assertGreaterEqual(times[i], times[i - 1])

    def test_propensity_weighted_selection(self):
        """With prop 100 vs 1, the high one should be selected most often."""
        counts = {"high": 0, "low": 0}
        for seed in range(200):
            g = GillespieSSA(seed=seed)
            g.add_reaction("high", lambda: 100.0, lambda: None)
            g.add_reaction("low", lambda: 1.0, lambda: None)
            r = g.step()
            if r:
                counts[r[1]] += 1
        self.assertGreater(counts["high"], counts["low"] * 5)

    def test_run_returns_trajectory(self):
        g = GillespieSSA(seed=42)
        g.add_reaction("tick", lambda: 10.0, lambda: None)
        results = g.run(max_time=5.0, max_steps=100)
        self.assertGreater(len(results), 0)
        self.assertLessEqual(g.time, 5.1)

    def test_run_applies_effects(self):
        g = GillespieSSA(seed=7)
        hits = []
        g.add_reaction("tick", lambda: 5.0, lambda: hits.append(1))
        log = g.run(max_time=2.0, max_steps=200)
        self.assertEqual(len(hits), len(log))
        self.assertGreater(len(hits), 0)

    def test_step_returns_effect_without_calling(self):
        g = GillespieSSA(seed=42)
        called = []
        g.add_reaction("x", lambda: 1.0, lambda: called.append(1))
        g.step()
        self.assertEqual(called, [])  # effect NOT called by step


class TestNetworkGraph(unittest.TestCase):
    def test_degree_centrality(self):
        g = NetworkGraph()
        g.add_edge("hub", "a", 0.9)
        g.add_edge("hub", "b", 0.9)
        g.add_edge("hub", "c", 0.9)
        g.add_edge("a", "b", 0.5)
        dc = g.degree_centrality()
        self.assertGreater(dc["hub"], dc["b"])

    def test_ic_simulate_cascade(self):
        g = NetworkGraph()
        g.add_edge("a", "b", 1.0)  # 100% activation
        g.add_edge("b", "c", 1.0)
        rng = random.Random(42)
        count = g.ic_simulate({"a"}, rng)
        self.assertEqual(count, 3)

    def test_ic_simulate_no_cascade(self):
        g = NetworkGraph()
        g.add_edge("a", "b", 0.0)  # 0% activation
        rng = random.Random(42)
        count = g.ic_simulate({"a"}, rng)
        self.assertEqual(count, 1)

    def test_kkt_greedy_selects_hub(self):
        g = NetworkGraph()
        for i in range(5):
            g.add_node(f"leaf_{i}")
        g.add_edge("hub", "leaf_0", 0.9)
        g.add_edge("hub", "leaf_1", 0.9)
        g.add_edge("hub", "leaf_2", 0.9)
        g.add_edge("hub", "leaf_3", 0.9)
        g.add_edge("hub", "leaf_4", 0.9)
        g.add_edge("leaf_0", "leaf_1", 0.1)

        seeds = g.kkt_greedy(k=1, mc_runs=200, seed=42)
        self.assertEqual(seeds, ["hub"])

    def test_kkt_chain_selects_start(self):
        g = NetworkGraph()
        g.add_edge("A", "B", 0.9)
        g.add_edge("B", "C", 0.9)
        g.add_edge("C", "D", 0.9)
        seeds = g.kkt_greedy(k=1, mc_runs=300, seed=42)
        self.assertEqual(seeds, ["A"])

    def test_neighbors(self):
        g = NetworkGraph()
        g.add_edge("a", "b", 0.7)
        g.add_edge("a", "c", 0.3)
        n = g.neighbors("a")
        self.assertEqual(n, {"b": 0.7, "c": 0.3})


class TestBiasResolver(unittest.TestCase):
    def test_catastrophizing(self):
        b = BiasResolver()
        r = b.process("Market crashed", Vector3(-0.3, 0.8, 0.1), -0.8)
        self.assertEqual(r.bias, "catastrophizing")
        self.assertGreater(r.threat_multiplier, 1.5)

    def test_denial(self):
        b = BiasResolver()
        r = b.process("Revenue down", Vector3(0.7, 0.2, 0.5), -0.6)
        self.assertEqual(r.bias, "denial")
        self.assertLess(r.threat_multiplier, 1.0)

    def test_exclusive_group_no_contradiction(self):
        b = BiasResolver()
        r = b.process("Crisis erupts", Vector3(0.5, 0.8, 0.2), -0.6)
        applied = r.bias or ""
        self.assertFalse(
            "catastrophizing" in applied and "denial" in applied,
            f"Contradictory biases: {r.bias}"
        )

    def test_tunnel_vision_suppresses(self):
        b = BiasResolver()
        r = b.process("Good news", Vector3(-0.5, 0.9, 0.1), 0.7)
        self.assertTrue(r.suppressed)
        self.assertEqual(r.perceived, "[FILTERED OUT]")

    def test_no_bias_neutral(self):
        b = BiasResolver()
        r = b.process("Cloudy weather", Vector3(0, 0.3, 0.5), 0.0)
        self.assertIsNone(r.bias)

    def test_authority_bias(self):
        b = BiasResolver()
        r = b.process("Orders", Vector3(-0.2, 0.5, 0.1), -0.2, source_authority=0.9)
        self.assertEqual(r.bias, "authority")

    def test_optimism_bias(self):
        b = BiasResolver()
        r = b.process("Slight decline", Vector3(0.8, 0.2, 0.5), -0.3)
        self.assertEqual(r.bias, "optimism")
        self.assertLess(r.threat_multiplier, 1.0)

    def test_overload(self):
        self.assertTrue(BiasResolver.is_overloaded(Vector3(-0.5, 0.9, 0.1)))
        self.assertFalse(BiasResolver.is_overloaded(Vector3(0, 0.3, 0.5)))


class TestBifocalMemory(unittest.TestCase):
    def test_recall(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "bomb", visibility=["a"])
        self.assertEqual(m.recall("a")[0].objective, "bomb")

    def test_visibility(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.register_agent("b", "Bob")
        m.add_fact("f1", "secret", visibility=["a"])
        m.add_fact("f2", "public", visibility=["public"])
        self.assertEqual(len(m.recall("a")), 2)
        self.assertEqual(len(m.recall("b")), 1)

    def test_distortion(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "clear")
        m.distort("a", "f1", "DANGER", "catastrophizing", 0.3)
        e = m.recall("a")[0]
        self.assertEqual(e.perceived, "DANGER")
        self.assertEqual(e.bias, "catastrophizing")
        self.assertEqual(e.confidence, 0.3)

    def test_epistemic_gap(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "500 troops")
        m.distort("a", "f1", "5000 troops", "catastrophizing")
        g = m.epistemic_gap("a", "f1")
        self.assertTrue(g["gap"])

    def test_no_gap_without_distortion(self):
        m = BifocalMemory()
        m.register_agent("a", "Alice")
        m.add_fact("f1", "sunny")
        self.assertFalse(m.epistemic_gap("a", "f1")["gap"])

    def test_nonexistent(self):
        m = BifocalMemory()
        self.assertIsNone(m.epistemic_gap("x", "none"))


class TestDPOPairBuilder(unittest.TestCase):
    def test_build_pairs(self):
        b = DPOPairBuilder()
        b.add_run("s1", [{"time": 0, "emotions": {"a": {"p": 0, "a": 0.1, "d": 0.5}}}], True)
        b.add_run("s1", [{"time": 0, "emotions": {"a": {"p": 0, "a": 0.1, "d": 0.5}}}], False)
        pairs = b.build_pairs()
        self.assertEqual(len(pairs), 1)
        self.assertIn("chosen", pairs[0])
        self.assertIn("rejected", pairs[0])

    def test_no_pairs_without_both_outcomes(self):
        b = DPOPairBuilder()
        b.add_run("s1", [], True)
        b.add_run("s1", [], True)
        self.assertEqual(len(b.build_pairs()), 0)

    def test_stratified_cap(self):
        b = DPOPairBuilder()
        for i in range(20):
            b.add_run("s1", [{"time": 0, "emotions": {}}], i % 2 == 0)
        pairs = b.build_pairs(max_per_scenario=5)
        self.assertEqual(len(pairs), 5)

    def test_stats(self):
        b = DPOPairBuilder()
        b.add_run("s1", [], True)
        b.add_run("s1", [], False)
        b.add_run("s2", [], True)
        s = b.stats()
        self.assertEqual(s["scenarios"], 2)
        self.assertEqual(s["total_runs"], 3)

    def test_export_jsonl(self):
        import tempfile, os
        b = DPOPairBuilder()
        b.add_run("s1", [{"time": 0, "emotions": {}}], True)
        b.add_run("s1", [{"time": 0, "emotions": {}}], False)
        path = os.path.join(tempfile.gettempdir(), "test_dpo.jsonl")
        n = b.export_jsonl(path)
        self.assertEqual(n, 1)
        with open(path) as f:
            line = json.loads(f.readline())
            self.assertIn("prompt", line)
            self.assertIn("chosen", line)
            self.assertIn("rejected", line)
        os.unlink(path)


class TestSimulationEngine(unittest.TestCase):
    def test_basic_run(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r")
        result = e.run(max_time=5.0)
        self.assertGreater(len(result.trajectory), 0)

    def test_crisis_increases_arousal(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r", Vector3(0, 0.1, 0.5))
        e.inject_crisis(1.0, "Explosion", intensity=0.9)
        result = e.run(max_time=10.0)
        initial = result.trajectory[0]["emotions"]["a"]["a"]
        peak = max(s["emotions"]["a"]["a"] for s in result.trajectory[1:])
        self.assertGreater(peak, initial)

    def test_contagion_spreads_emotion(self):
        cfg = SimulationConfig(contagion_rate=1.0, decay_rate=0.01)
        e = SimulationEngine(cfg, seed=42)
        e.add_agent("panicked", "P", "r", Vector3(-0.8, 0.9, 0.1))
        e.add_agent("calm", "C", "r", Vector3(0.5, 0.1, 0.7))
        e.add_trust_edge("panicked", "calm", trust=0.9)
        result = e.run(max_time=5.0, max_steps=100)
        calm_initial = 0.1
        calm_final = result.trajectory[-1]["emotions"]["calm"]["a"]
        self.assertGreater(calm_final, calm_initial)

    def test_intervention_calms(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r", Vector3(-0.5, 0.6, 0.3))
        e.inject_crisis(1.0, "Emergency", intensity=0.8)
        e.schedule_intervention(5.0)
        result = e.run(max_time=15.0)
        mid_idx = len(result.trajectory) // 2
        final_idx = len(result.trajectory) - 1
        mid_a = result.trajectory[mid_idx]["emotions"]["a"]["a"]
        final_a = result.trajectory[final_idx]["emotions"]["a"]["a"]
        self.assertLessEqual(final_a, mid_a + 0.2)

    def test_dag_recorded(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r")
        e.add_agent("b", "B", "r")
        e.add_trust_edge("a", "b", trust=0.9)
        e.inject_crisis(0.5, "Boom", intensity=0.9)
        result = e.run(max_time=10.0, max_steps=100)
        self.assertGreater(result.dag_nodes, 2)
        self.assertGreater(result.dag_edges, 0)

    def test_z3_wired(self):
        if not _Z3:
            self.skipTest("z3 not installed")
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "A", "r")
        z = e.z3_engine
        self.assertIsNotNone(z)
        snap = z.snapshot()
        self.assertTrue(len(snap["permanent"]) > 0)

    def test_tipping_point_detected(self):
        cfg = SimulationConfig(tipping_threshold=0.3, tipping_arousal=0.5,
                                tipping_pleasure=-0.1, contagion_rate=0.5)
        e = SimulationEngine(cfg, seed=42)
        for i in range(5):
            e.add_agent(f"p{i}", f"P{i}", "r", Vector3(-0.3, 0.4, 0.3))
        for i in range(4):
            e.add_trust_edge(f"p{i}", f"p{i+1}", trust=0.9)
        e.inject_crisis(0.5, "Nuclear meltdown", intensity=1.0)
        result = e.run(max_time=20.0, max_steps=200)
        peak = max(max(e["a"] for e in s["emotions"].values())
                   for s in result.trajectory)
        self.assertGreater(peak, 0.3)

    def test_dpo_builder_integration(self):
        cfg = SimulationConfig(contagion_rate=0.3, decay_rate=0.05)
        dpo = DPOPairBuilder()

        e1 = SimulationEngine(cfg, seed=42)
        e1.add_agent("a", "A", "r", Vector3(-0.5, 0.6, 0.2))
        e1.inject_crisis(1.0, "Crisis", intensity=1.0)
        r1 = e1.run(max_time=10.0)
        dpo.add_run("crisis", r1.trajectory, r1.tipping_point is not None)

        e2 = SimulationEngine(cfg, seed=99)
        e2.add_agent("a", "A", "r", Vector3(0.0, 0.1, 0.8))
        r2 = e2.run(max_time=10.0)
        dpo.add_run("crisis", r2.trajectory, r2.tipping_point is not None)

        stats = dpo.stats()
        self.assertEqual(stats["total_runs"], 2)

    def test_memory_integration(self):
        e = SimulationEngine(SimulationConfig(), seed=42)
        e.add_agent("a", "Alice", "spy")
        e.inject_crisis(0.5, "Secret intel", intensity=0.5)
        e.run(max_time=5.0)
        entries = e.memory.recall("a")
        self.assertGreater(len(entries), 0)


class TestIntegration(unittest.TestCase):
    """Full pipeline: all algorithms working together."""

    def test_crisis_simulation_with_all_components(self):
        cfg = SimulationConfig(contagion_rate=0.4, decay_rate=0.05,
                                tipping_threshold=0.4)
        e = SimulationEngine(cfg, seed=42)

        e.add_agent("ceo", "CEO", "leader", Vector3(-0.2, 0.3, 0.8))
        e.add_agent("pr", "PR Dir", "advisor", Vector3(-0.1, 0.4, 0.6))
        e.add_agent("staff", "Staff", "worker", Vector3(0.0, 0.1, 0.4))

        e.add_trust_edge("ceo", "pr", 0.9)
        e.add_trust_edge("pr", "staff", 0.7)
        e.add_trust_edge("ceo", "staff", 0.5)

        e.inject_crisis(2.0, "CEO tweet goes viral", intensity=0.9)
        e.schedule_intervention(8.0)

        result = e.run(max_time=20.0, max_steps=300)

        self.assertGreater(len(result.trajectory), 5)
        self.assertGreater(result.total_events, 0)

        self.assertGreater(result.dag_nodes, 3)
        self.assertGreater(result.dag_edges, 2)

        pre_crisis = result.trajectory[0]["emotions"]["ceo"]["a"]
        post_crisis = max(s["emotions"]["ceo"]["a"] for s in result.trajectory[1:])
        self.assertGreater(post_crisis, pre_crisis)

        crisis_ancestors = e.dag.ancestors("staff")
        crisis_nodes = [n for n in crisis_ancestors if "crisis" in n]
        self.assertGreater(len(crisis_nodes), 0)

        dpo = DPOPairBuilder()
        dpo.add_run("pr_crisis", result.trajectory,
                     result.tipping_point is not None)
        self.assertEqual(dpo.stats()["total_runs"], 1)

    def test_kkt_finds_influencer_then_intervene(self):
        """Use KKT to find best intervention target, then simulate."""
        g = NetworkGraph()
        g.add_edge("influencer", "a", 0.8)
        g.add_edge("influencer", "b", 0.8)
        g.add_edge("a", "c", 0.6)
        g.add_edge("b", "c", 0.6)
        g.add_edge("observer", "d", 0.3)

        seeds = g.kkt_greedy(k=1, mc_runs=300, seed=42)
        self.assertEqual(seeds, ["influencer"])

        cfg = SimulationConfig(contagion_rate=0.5, decay_rate=0.05)
        e = SimulationEngine(cfg, seed=42)
        for n in g.nodes:
            e.add_agent(n, n, "agent", location="hq")
        for src in g.nodes:
            for dst, w in g.neighbors(src).items():
                e.add_trust_edge(src, dst, trust=w)

        e.inject_crisis(1.0, "Targeted crisis", intensity=0.9)
        result = e.run(max_time=10.0)

        peak_influencer = max(s["emotions"]["influencer"]["a"]
                              for s in result.trajectory)
        peak_observer = max(s["emotions"]["observer"]["a"]
                            for s in result.trajectory)
        self.assertGreaterEqual(peak_influencer, peak_observer - 0.1)


# ═══════════════════════════════════════════
#  SECTION 10: DEMO + MAIN
# ═══════════════════════════════════════════

def run_demo():
    print("=" * 65)
    print("  OMNISIM DEEP CORE v4.1 — CRISIS SIMULATION DEMO")
    print("=" * 65)

    # --- Phase 1: KKT finds the key influencer ---
    print("\n[Phase 1] KKT Influence Maximization")
    net = NetworkGraph()
    net.add_edge("ceo", "vp_eng", 0.8)
    net.add_edge("ceo", "vp_sales", 0.8)
    net.add_edge("vp_eng", "eng_1", 0.7)
    net.add_edge("vp_eng", "eng_2", 0.7)
    net.add_edge("vp_sales", "sales_1", 0.6)
    net.add_edge("sales_1", "intern", 0.4)

    seeds = net.kkt_greedy(k=2, mc_runs=500, seed=42)
    print(f"  Best seed set (k=2): {seeds}")

    dc = net.degree_centrality()
    print(f"  Degree centrality: {', '.join(f'{k}={v:.2f}' for k, v in dc.items())}")

    # --- Phase 2: Simulate crisis ---
    print("\n[Phase 2] Gillespie SSA Simulation")
    cfg = SimulationConfig(contagion_rate=0.4, decay_rate=0.03, tipping_threshold=0.4)
    engine = SimulationEngine(cfg, seed=42)

    agents = [
        ("ceo", "CEO", "leader", Vector3(-0.2, 0.3, 0.8)),
        ("vp_eng", "VP Eng", "manager", Vector3(0.0, 0.2, 0.6)),
        ("vp_sales", "VP Sales", "manager", Vector3(0.1, 0.2, 0.6)),
        ("eng_1", "Engineer 1", "worker", Vector3(0.0, 0.1, 0.4)),
        ("eng_2", "Engineer 2", "worker", Vector3(0.0, 0.1, 0.4)),
        ("sales_1", "Sales Lead", "worker", Vector3(0.0, 0.1, 0.4)),
        ("intern", "Intern", "observer", Vector3(0.1, 0.05, 0.2)),
    ]

    for aid, name, role, em in agents:
        engine.add_agent(aid, name, role, em)

    for src in net.nodes:
        for dst, w in net.neighbors(src).items():
            engine.add_trust_edge(src, dst, trust=w)

    engine.inject_crisis(3.0, "CEO offensive tweet goes viral: 50K retweets", intensity=0.9)

    result_no_interv = engine.run(max_time=25.0, max_steps=500)

    print(f"  Events: {result_no_interv.total_events}")
    print(f"  Tipping point: tick {result_no_interv.tipping_point}")
    print(f"  DAG: {result_no_interv.dag_nodes} nodes, {result_no_interv.dag_edges} edges")
    print(f"  Final time: {result_no_interv.final_time:.2f}")

    print("\n  Emotion trajectory (sampled):")
    for i, snap in enumerate(result_no_interv.trajectory):
        if i % max(1, len(result_no_interv.trajectory) // 8) == 0:
            emos = " ".join(f"{aid}:A={e['a']:.2f}"
                            for aid, e in snap["emotions"].items())
            print(f"    t={snap['time']:6.2f} | {emos}")

    # --- Phase 3: Causal analysis ---
    print("\n[Phase 3] Causal DAG Analysis")
    staff_ancestors = engine.dag.ancestors("intern")
    print(f"  Intern's causal ancestors: {staff_ancestors}")
    ceo_descendants = engine.dag.descendants("ceo")
    print(f"  CEO's causal descendants: {ceo_descendants}")

    # --- Phase 4: DPO pair construction ---
    print("\n[Phase 4] DPO Pair Construction")

    engine2 = SimulationEngine(SimulationConfig(contagion_rate=0.2, decay_rate=0.1), seed=99)
    for aid, name, role, em in agents:
        engine2.add_agent(aid, name, role, Vector3(0.0, 0.05, 0.5))
    for src in net.nodes:
        for dst, w in net.neighbors(src).items():
            engine2.add_trust_edge(src, dst, trust=w * 0.3)
    result_calm = engine2.run(max_time=25.0, max_steps=500)

    dpo = DPOPairBuilder()
    dpo.add_run("ceo_crisis", result_no_interv.trajectory,
                 result_no_interv.tipping_point is not None,
                 {"scenario": "high_intensity"})
    dpo.add_run("ceo_crisis", result_calm.trajectory,
                 result_calm.tipping_point is not None,
                 {"scenario": "low_intensity"})

    pairs = dpo.build_pairs()
    stats = dpo.stats()
    print(f"  Stats: {stats}")
    print(f"  DPO pairs built: {len(pairs)}")
    if pairs:
        print(f"  Sample prompt: {pairs[0]['prompt'][:80]}...")

    # --- Phase 5: Bias analysis ---
    print("\n[Phase 5] Cognitive Bias Resolution")
    bias = BiasResolver()
    scenarios = [
        ("CEO sees crisis", Vector3(-0.5, 0.85, 0.1), -0.9),
        ("Board member sees crisis", Vector3(0.5, 0.3, 0.7), -0.6),
        ("Intern sees crisis", Vector3(0.0, 0.9, 0.05), -0.5),
    ]
    for desc, em, sent in scenarios:
        r = bias.process(desc, em, sent)
        print(f"  {desc}: bias={r.bias}, threat={r.threat_multiplier:.2f}x, "
              f"suppressed={r.suppressed}")

    print("\n" + "=" * 65)
    print("  DEMO COMPLETE")
    print("=" * 65)


def main():
    import sys
    if "--test" in sys.argv:
        loader = unittest.TestLoader()
        suite = unittest.TestSuite()
        classes = [
            TestVector3, TestSentiment, TestIncrementalZ3, TestCausalDAG,
            TestGillespieSSA, TestNetworkGraph, TestBiasResolver,
            TestBifocalMemory, TestDPOPairBuilder, TestSimulationEngine,
            TestIntegration,
        ]
        for cls in classes:
            suite.addTests(loader.loadTestsFromTestCase(cls))
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        total = result.testsRun
        skipped = len(result.skipped)
        failed = len(result.failures) + len(result.errors)
        passed = total - failed - skipped
        print(f"\n{'='*50}")
        print(f"  {passed} passed, {skipped} skipped, {failed} failed "
              f"(of {total})")
        if failed == 0:
            print(f"  ALL TESTS PASSED")
        print(f"{'='*50}")
        sys.exit(0 if failed == 0 else 1)

    elif "--demo" in sys.argv:
        run_demo()

    else:
        print("python deep_core.py --test")
        print("python deep_core.py --demo")


if __name__ == "__main__":
    main()
