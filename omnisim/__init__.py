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
    SimulationConfig, SimulationResult, SentimentAnalyzer, LLMSentimentAnalyzer,
)
from .calibration import fit_parameters, sample_arousal_trace
from .validation import (
    Forecaster, Score, evaluate, compare, rmse,
    PersistenceForecaster, MeanForecaster, ZeroForecaster,
    LogisticForecaster, SIRForecaster, OmnisimForecaster,
    make_logistic_dataset, make_sir_dataset, make_omnisim_dataset,
    load_series_jsonl, load_series_csv, load_series_url,
    parse_series_jsonl, parse_series_csv,
    cumulative_series_from_timestamps,
    prefix_normalize, benchmark, format_scores,
)
from .z3_physics import (
    IncrementalZ3, Validation, Rule, _Z3,
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
    "LLMSentimentAnalyzer", "fit_parameters", "sample_arousal_trace",
    "Forecaster", "Score", "evaluate", "compare", "rmse",
    "PersistenceForecaster", "MeanForecaster", "ZeroForecaster",
    "LogisticForecaster", "SIRForecaster", "OmnisimForecaster",
    "make_logistic_dataset", "make_sir_dataset", "make_omnisim_dataset",
    "load_series_jsonl", "load_series_csv", "load_series_url",
    "parse_series_jsonl", "parse_series_csv",
    "cumulative_series_from_timestamps",
    "prefix_normalize", "benchmark", "format_scores",
    "IncrementalZ3", "Validation", "Rule", "_Z3",
    "And", "Or", "Not", "Implies", "Bool", "Solver", "sat", "unsat",
    "CausalDAG", "GillespieSSA", "NetworkGraph",
    "BiasResolver", "SymbolicPerception",
    "BifocalMemory", "MemoryEntry", "DPOPairBuilder",
    "EventBus", "AgentEvent", "NeuralSymbolicBridge", "LLMActionOutput",
    "SimulationEngine", "run_demo",
]
