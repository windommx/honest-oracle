"""Shared value types: PAD emotion vector, actions, configs, sentiment."""
from __future__ import annotations
import math
from dataclasses import dataclass
from enum import Enum
from typing import Optional


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
