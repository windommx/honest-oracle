"""
OMNISIM DEEP CORE — SDK package.

Four published algorithms (Z3 incremental solving, Kahn topological sort,
Gillespie SSA, Kempe-Kleinberg-Tardos influence maximization) plus engineered
heuristics (single-winner cognitive bias, DPO pair builder), an event bus, and
a fail-closed neural-symbolic bridge.

z3-solver is optional; without it the Z3 engine is disabled (_Z3 is False).
"""
from .foundations import (
    ActionType, Vector3, AgentAction, AgentPerception,
    SimulationConfig, SimulationResult, SentimentAnalyzer,
)
from .z3_physics import (
    IncrementalZ3, Validation, _Z3,
    And, Or, Not, Implies, Bool, Solver, sat, unsat,
)
from .causal_dag import CausalDAG
from .gillespie import GillespieSSA
from .social_contagion import NetworkGraph
from .cognitive_bias import BiasResolver, SymbolicPerception
from .bifocal_memory import BifocalMemory, MemoryEntry
from .dpo_builder import DPOPairBuilder
from .event_bus import EventBus, AgentEvent
from .neural_symbolic_bridge import NeuralSymbolicBridge, LLMActionOutput
from .engine import SimulationEngine
from .demo import run_demo

__all__ = [
    "ActionType", "Vector3", "AgentAction", "AgentPerception",
    "SimulationConfig", "SimulationResult", "SentimentAnalyzer",
    "IncrementalZ3", "Validation", "_Z3",
    "And", "Or", "Not", "Implies", "Bool", "Solver", "sat", "unsat",
    "CausalDAG", "GillespieSSA", "NetworkGraph",
    "BiasResolver", "SymbolicPerception",
    "BifocalMemory", "MemoryEntry", "DPOPairBuilder",
    "EventBus", "AgentEvent", "NeuralSymbolicBridge", "LLMActionOutput",
    "SimulationEngine", "run_demo",
]
