"""Event-driven agent communication bus with propagation delay."""
from __future__ import annotations
import heapq
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass(frozen=True)
class AgentEvent:
    event_type: str            # "speech", "action", "emotion_change", ...
    source_agent: str
    content: Any
    timestamp: float
    target_agents: tuple[str, ...] = ()   # empty = broadcast
    priority: int = 0


@dataclass
class _Subscription:
    sub_id: str
    agent_id: str
    event_types: frozenset[str]
    handler: Callable[[AgentEvent], None]


class EventBus:
    """
    Deterministic, time-stepped event bus.

    publish(event, delay) queues delivery at current_time+delay; tick(dt)
    advances time and delivers everything now due. A monotonic sequence
    counter keeps ordering stable (and avoids comparing AgentEvent objects
    when delivery times tie).
    """

    def __init__(self):
        self._subs: list[_Subscription] = []
        self._pending: list[tuple[float, int, AgentEvent]] = []  # heap
        self._delivered: list[AgentEvent] = []
        self._seq = 0
        self.current_time = 0.0

    def subscribe(self, agent_id: str, event_types: list[str],
                  handler: Callable[[AgentEvent], None]) -> str:
        sub_id = f"sub_{agent_id}_{len(self._subs)}"
        self._subs.append(_Subscription(
            sub_id, agent_id, frozenset(event_types), handler))
        return sub_id

    def publish(self, event: AgentEvent, delay: float = 0.0):
        heapq.heappush(self._pending,
                       (self.current_time + max(0.0, delay), self._seq, event))
        self._seq += 1

    def tick(self, dt: float = 0.1) -> list[AgentEvent]:
        """Advance time by dt; deliver all due events. Returns what was delivered."""
        self.current_time += dt
        just_delivered: list[AgentEvent] = []
        while self._pending and self._pending[0][0] <= self.current_time + 1e-12:
            _, _, event = heapq.heappop(self._pending)
            self._deliver(event)
            just_delivered.append(event)
        return just_delivered

    def _deliver(self, event: AgentEvent):
        self._delivered.append(event)
        for sub in self._subs:
            if event.event_type not in sub.event_types:
                continue
            if event.target_agents and sub.agent_id not in event.target_agents:
                continue
            if sub.agent_id == event.source_agent:   # no echo to sender
                continue
            try:
                sub.handler(event)
            except Exception as exc:   # one bad handler must not stall the bus
                self._delivered.append(AgentEvent(
                    "handler_error", "event_bus",
                    {"sub": sub.sub_id, "error": str(exc)}, self.current_time))

    @property
    def delivered(self) -> list[AgentEvent]:
        return list(self._delivered)

    @property
    def pending_count(self) -> int:
        return len(self._pending)
