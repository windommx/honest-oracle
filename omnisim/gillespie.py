"""Gillespie SSA: exact stochastic simulation (direct method)."""
from __future__ import annotations
import heapq
import math
import random
from typing import Callable, Optional


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
