"""Simulation engine integrating all components via Gillespie SSA."""
from __future__ import annotations
import random
from typing import Optional
from .foundations import (
    Vector3, SimulationConfig, SimulationResult, SentimentAnalyzer,
)
from .gillespie import GillespieSSA
from .z3_physics import IncrementalZ3, _Z3, And, Or, Not, Implies
from .causal_dag import CausalDAG
from .bifocal_memory import BifocalMemory
from .cognitive_bias import BiasResolver
from .social_contagion import NetworkGraph


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
