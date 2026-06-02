"""Simulation engine integrating all components via Gillespie SSA."""
from __future__ import annotations
import random
from typing import Callable, Optional
from .foundations import (
    Vector3, SimulationConfig, SimulationResult, SentimentAnalyzer,
    AgentAction, ActionType,
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

    def _snapshot(self, event: str = "", phase: str = "pre"):
        self._traj.append({
            "time": self._gillespie.time,
            "event": event,
            "phase": phase,   # "pre" | "tipping" | "aftermath"
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

    @staticmethod
    def _avg_arousal(snap: dict) -> float:
        es = snap["emotions"].values()
        return sum(e["a"] for e in es) / len(es) if es else 0.0

    def _panic_fraction(self, snap: dict) -> float:
        es = snap["emotions"].values()
        if not es:
            return 0.0
        n = sum(1 for e in es
                if e["a"] > self.cfg.tipping_arousal and e["p"] < self.cfg.tipping_pleasure)
        return n / len(es)

    def _aftermath_metrics(self, tipping_time: float) -> dict:
        """
        Honest aftermath metrics, derived only from snapshots actually
        recorded (tipping + aftermath phases) — nothing fabricated.

        - cascade_count: secondary spikes (max arousal jumps >0.2 vs prev snap)
        - peak_arousal:  highest individual arousal observed post-tipping
        - affected_agents: agents that crossed the panic arousal threshold
        - total_damage:  discrete integral of avg-arousal above the pre-crisis
                         baseline (how far, and how long, above normal)
        - recovery_time: sim-time from tipping to first snapshot back below the
                         tipping threshold; None if it never recovered
        """
        baseline = self._avg_arousal(self._traj[0]) if self._traj else 0.0
        post = [s for s in self._traj if s["phase"] in ("tipping", "aftermath")]

        cascade = 0
        affected: set[str] = set()
        damage = 0.0
        peak = 0.0
        recovery_time: Optional[float] = None
        prev_max: Optional[float] = None

        for s in post:
            arousals = [e["a"] for e in s["emotions"].values()]
            mx = max(arousals, default=0.0)
            peak = max(peak, mx)
            if prev_max is not None and mx > prev_max + 0.2:
                cascade += 1
            prev_max = mx
            for aid, e in s["emotions"].items():
                if e["a"] > self.cfg.tipping_arousal:
                    affected.add(aid)
            damage += max(0.0, self._avg_arousal(s) - baseline)
            if recovery_time is None and self._panic_fraction(s) < self.cfg.tipping_threshold:
                recovery_time = round(s["time"] - tipping_time, 4)

        return {
            "cascade_count": cascade,
            "peak_arousal": round(peak, 4),
            "affected_agents": sorted(affected),
            "total_damage": round(damage, 4),
            "recovery_time": recovery_time,
        }

    def run(self, max_time: float = 100.0, max_steps: int = 500,
            action_policy: Optional[Callable[[str, dict],
                                              Optional[AgentAction]]] = None
            ) -> SimulationResult:
        """
        Drive the simulation.

        action_policy (optional): called as policy(agent_id, agent_state) after
        each event. If it returns an AgentAction, that action is gated through
        Z3 (fail-closed) via attempt_action() — this is where the solver
        actually participates in the loop. Default None preserves the pure
        contagion/decay behavior.

        After a tipping point is first reached, the run continues for
        cfg.tipping_observation_time of sim-time (the AFTERMATH window) so the
        cascade and any recovery are recorded, then stops.
        """
        self._snapshot("initial", phase="pre")
        events = 0
        tipping_time: Optional[float] = None

        def _maybe_act():
            if action_policy is None:
                return
            for aid in list(self._agents):
                proposed = action_policy(aid, self._agents[aid])
                if proposed is not None:
                    self.attempt_action(proposed)

        for _ in range(max_steps):
            if self._gillespie.time >= max_time:
                break

            result = self._gillespie.step()
            if result is None:
                break

            dt, event_name, effect_fn = result
            self._apply_decay(dt)        # deterministic decay for elapsed time
            effect_fn()                  # execute stochastic/scheduled event
            events += 1
            _maybe_act()

            if self._check_tipping():
                tipping_time = self._gillespie.time
                self._snapshot(event_name, phase="tipping")

                # AFTERMATH: keep observing until the time window elapses.
                window_end = tipping_time + self.cfg.tipping_observation_time
                while (self._gillespie.time < window_end
                       and events < max_steps):
                    r2 = self._gillespie.step()
                    if r2 is None:
                        break
                    dt2, en2, ef2 = r2
                    self._apply_decay(dt2)
                    ef2()
                    events += 1
                    _maybe_act()
                    self._snapshot(en2, phase="aftermath")
                break

            self._snapshot(event_name, phase="pre")

        recovered = (not self._check_tipping()) if tipping_time is not None else None
        aftermath = self._aftermath_metrics(tipping_time) if tipping_time is not None else None

        return SimulationResult(
            trajectory=self._traj,
            tipping_point=self._find_tipping_index(),
            final_time=self._gillespie.time,
            total_events=events,
            dag_nodes=self._dag.node_count,
            dag_edges=self._dag.edge_count,
            tipping_time=tipping_time,
            recovered=recovered,
            aftermath=aftermath,
        )

    # ── Z3-gated action layer ────────────────────────────────────────────
    # This is the layer where the solver belongs: discrete agent ACTIONS with
    # logical preconditions (speak/move/act), NOT the continuous PAD/contagion
    # updates. Gating is fail-closed; on success the action is committed to the
    # solver AND written to memory + the causal DAG (the Bifocal write path).

    def incapacitate(self, aid: str):
        """Mark an agent dead. Retracts its capability facts so the mortality
        rule (not a pinned fact) derives that it can no longer act/speak —
        which keeps the UNSAT core naming the rule when a dead agent tries."""
        if self._z3 is None:
            return
        self._z3.retract_fact(f"{aid}__can_act")
        self._z3.retract_fact(f"{aid}__can_speak")
        self._z3.update_fact(f"{aid}__dead", True)

    def attempt_action(self, action: AgentAction) -> AgentAction:
        """
        Gate a discrete action through Z3 (fail-closed). On success: commit the
        logical effect and record it to memory + the causal DAG, then return
        the action. On failure: return a BLOCKED action whose reason names the
        violated rule(s). Without a solver, the action is recorded but ungated.
        """
        aid = action.agent_id
        if self._z3 is not None:
            v = self._z3.validate_action(action)
            if not v.valid:
                return AgentAction(
                    aid, ActionType.BLOCKED, blocked=True,
                    reason="; ".join(v.violated_rules) or "__undetermined__",
                )
            self._z3.commit_action(action)

        # Write path: the simulation records what just happened.
        t = self._gillespie.time
        fact_id = f"{aid}__{action.action_type.value}__{t:.4f}"
        detail = action.action_type.value
        if action.new_location:
            self._agents[aid]["location"] = action.new_location
            detail += f"->{action.new_location}"
        self._memory.add_fact(fact_id, f"{aid} performed {detail} at t={t:.2f}")
        self._dag.add_node(fact_id)
        self._dag.add_edge(aid, fact_id)
        return action

    @property
    def dag(self) -> CausalDAG:
        return self._dag

    @property
    def memory(self) -> BifocalMemory:
        return self._memory

    @property
    def z3_engine(self) -> Optional[IncrementalZ3]:
        return self._z3
