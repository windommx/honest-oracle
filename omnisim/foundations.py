"""Shared value types: PAD emotion vector, actions, configs, sentiment."""
from __future__ import annotations
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional


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
    # How long (in sim-time, not steps) to keep observing AFTER a tipping
    # point is first reached, so the cascade — and any recovery — is captured.
    tipping_observation_time: float = 5.0
    # Graceful degradation: how many per-event failures to absorb before the
    # run stops early with partial results. Normal runs never raise, so this
    # only matters when an injected effect/policy throws.
    error_tolerance: int = 3


@dataclass
class SimulationResult:
    trajectory: list[dict]
    tipping_point: Optional[int]
    final_time: float
    total_events: int
    dag_nodes: int
    dag_edges: int
    # Set when a tipping point was reached:
    tipping_time: Optional[float] = None
    # True if, by the end of the post-tipping observation window, the system
    # had fallen back below the tipping threshold (it recovered); False if it
    # stayed tipped; None if it never tipped.
    recovered: Optional[bool] = None
    # Metrics computed over the post-tipping window (None if never tipped):
    # cascade_count, peak_arousal, affected_agents, total_damage, recovery_time.
    aftermath: Optional[dict] = None
    # Per-event failures captured instead of crashing the whole run.
    errors: list[dict] = field(default_factory=list)
    # "completed" or "error_tolerance_exceeded".
    exit_reason: str = "completed"


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


class LLMSentimentAnalyzer:
    """
    Pluggable sentiment analyzer. Same .analyze(text)->float interface as the
    keyword analyzer, so it drops into SimulationEngine(sentiment=...).

    Wraps an arbitrary `llm_call(text) -> float in [-1, 1]`, with:
      - an in-memory cache (identical texts cost nothing twice), and
      - a fail-safe fallback to the keyword analyzer if no llm_call is wired
        or the call raises (so production never hard-crashes on a flaky API).

    No network/SDK dependency is taken here — the caller injects llm_call.
    """

    def __init__(self, llm_call: Optional[Callable[[str], float]] = None,
                 fallback: Optional["SentimentAnalyzer"] = None):
        self._llm = llm_call
        self._fallback = fallback or SentimentAnalyzer()
        self._cache: dict[str, float] = {}
        self.cache_hits = 0
        self.fallback_uses = 0

    def analyze(self, text: str) -> float:
        if text in self._cache:
            self.cache_hits += 1
            return self._cache[text]
        if self._llm is None:
            self.fallback_uses += 1
            value = self._fallback.analyze(text)
        else:
            try:
                value = max(-1.0, min(1.0, float(self._llm(text))))
            except Exception:
                self.fallback_uses += 1
                value = self._fallback.analyze(text)
        self._cache[text] = value
        return value
