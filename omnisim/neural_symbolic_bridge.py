"""Neural-symbolic bridge: LLM JSON -> Z3 facts -> fail-closed validation."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from typing import Optional
from .z3_physics import IncrementalZ3


@dataclass
class LLMActionOutput:
    action: str
    confidence: float
    reasoning: str = ""
    preconditions: dict[str, bool] = field(default_factory=dict)
    effects: dict[str, bool] = field(default_factory=dict)


class NeuralSymbolicBridge:
    """
    Bridges an LLM's structured output to the Z3 physics engine.

    Flow: prompt(schema) → LLM JSON → parse → to_z3_constraints →
    IncrementalZ3.validate → (valid? execute : retry_prompt(violations)).

    Validation is FAIL-CLOSED: a malformed/unparseable response or a solver
    that cannot prove satisfiability is treated as INVALID, never as a pass.
    """

    ACTION_SCHEMA = {
        "type": "object",
        "properties": {
            "action": {"type": "string"},
            "confidence": {"type": "number", "minimum": 0, "maximum": 1},
            "reasoning": {"type": "string"},
            "preconditions": {"type": "object",
                              "additionalProperties": {"type": "boolean"}},
            "effects": {"type": "object",
                        "additionalProperties": {"type": "boolean"}},
        },
        "required": ["action", "confidence", "preconditions"],
    }

    def parse(self, json_str: str) -> Optional[LLMActionOutput]:
        """Parse + minimally validate. Returns None (not garbage) on failure."""
        try:
            data = json.loads(json_str)
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(data, dict):
            return None
        if "action" not in data or "confidence" not in data:
            return None
        try:
            conf = float(data["confidence"])
        except (TypeError, ValueError):
            return None
        pre = data.get("preconditions", {}) or {}
        eff = data.get("effects", {}) or {}
        if not isinstance(pre, dict) or not isinstance(eff, dict):
            return None
        return LLMActionOutput(
            action=str(data["action"]),
            confidence=max(0.0, min(1.0, conf)),
            reasoning=str(data.get("reasoning", "")),
            preconditions={str(k): bool(v) for k, v in pre.items()},
            effects={str(k): bool(v) for k, v in eff.items()},
        )

    def to_z3_constraints(self, output: LLMActionOutput) -> dict[str, bool]:
        return dict(output.preconditions)

    def validate(self, engine: "IncrementalZ3",
                 output: Optional[LLMActionOutput]) -> tuple[bool, list[str]]:
        """
        FAIL-CLOSED validation against the (correct) IncrementalZ3 engine.
        None output → invalid. No preconditions to check → trivially valid.
        """
        if output is None:
            return False, ["unparseable_or_missing_fields"]
        constraints = self.to_z3_constraints(output)
        if not constraints:
            return True, []
        v = engine.validate(constraints)
        return v.valid, list(v.violated_rules)

    def build_prompt(self, context: dict) -> str:
        return (
            "You are an agent acting in a simulated world.\n\n"
            f"CONTEXT:\n{json.dumps(context, ensure_ascii=False, indent=2)}\n\n"
            "Respond ONLY with JSON matching this schema:\n"
            f"{json.dumps(self.ACTION_SCHEMA, indent=2)}\n"
        )

    def build_retry_prompt(self, prior_json: str, violations: list[str]) -> str:
        bullets = "\n".join(f"- {v}" for v in violations) or "- (unspecified)"
        return (
            "Your previous response violated these constraints:\n"
            f"{bullets}\n\nPREVIOUS:\n{prior_json}\n\n"
            "Respond again with JSON that satisfies every constraint."
        )
