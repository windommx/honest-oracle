"""Cognitive bias resolver (single-winner) + symbolic perception output."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Optional
from .foundations import Vector3, AgentPerception


@dataclass(frozen=True)
class SymbolicPerception:
    """
    Machine-readable perception. Unlike a distorted string, every consumer
    (prompt builder, generation controller, Z3 physics) can act on the fields
    directly instead of re-parsing English.

    perceived_threat_level: 0..2  (1.0 = neutral, >1 amplified, <1 downplayed)
    salience:               0..1  (attention weight)
    confidence:             0..1  (how trustworthy this perception is)
    """
    original_content: str
    perceived_threat_level: float
    salience: float
    confidence: float
    suppressed: bool
    biases_applied: tuple[str, ...] = ()

    def to_prompt_context(self) -> str:
        """Render as a compact tag prefix for an LLM prompt."""
        if self.suppressed:
            return f"[IGNORED] {self.original_content}"
        threat = ("CRITICAL" if self.perceived_threat_level > 1.5
                  else "ELEVATED" if self.perceived_threat_level > 1.0
                  else "DOWNPLAYED" if self.perceived_threat_level < 1.0
                  else "NORMAL")
        att = ("HIGH" if self.salience > 0.7
               else "LOW" if self.salience < 0.3 else "NORMAL")
        return f"[THREAT={threat} ATTENTION={att}] {self.original_content}"

    def to_generation_directives(self) -> dict:
        """
        Model-agnostic generation intent. Deliberately NOT raw token-id
        logit_bias: those ids are tokenizer-specific, so emitting them here
        (encoded with the wrong tokenizer) silently biases the wrong tokens.
        A serving layer maps these directives to its own tokenizer.
        """
        if self.suppressed:
            return {"suppress": True, "emphasis": 0.0}
        return {
            "suppress": False,
            "emphasis": round(max(0.0, self.perceived_threat_level - 1.0), 4),
            "attention": round(self.salience, 4),
        }

    def to_z3_constraints(self, entity_id: str) -> dict[str, bool]:
        """Project the perception onto boolean facts a physics engine can check."""
        constraints = {f"{entity_id}__aware": not self.suppressed}
        if self.perceived_threat_level > 1.5 and not self.suppressed:
            constraints[f"{entity_id}__must_react"] = True
        return constraints


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

    def process_symbolic(self, text: str, emotion: Vector3, sentiment: float,
                         source_authority: float = 0.5) -> "SymbolicPerception":
        """
        Structured counterpart to process(). Reuses the single-winner string
        path (so the same, non-contradictory bias wins) and projects it into a
        machine-readable SymbolicPerception for LLM / Z3 / generation control.
        """
        ap = self.process(text, emotion, sentiment, source_authority)
        threat = ap.threat_multiplier
        # Salience tracks how far the threat appraisal departs from neutral.
        salience = max(0.0, min(1.0, 0.5 + (threat - 1.0) * 0.5))
        if ap.bias is None:
            confidence = 1.0
        elif ap.suppressed:
            confidence = 0.5
        else:
            confidence = 0.7
        return SymbolicPerception(
            original_content=text,
            perceived_threat_level=threat,
            salience=salience,
            confidence=confidence,
            suppressed=ap.suppressed,
            biases_applied=tuple(ap.bias.split("+")) if ap.bias else (),
        )

    @staticmethod
    def is_overloaded(e: Vector3) -> bool:
        return e.arousal > 0.8 and e.dominance < 0.2
