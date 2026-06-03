"""
Calibration harness: fit simulator parameters to an observed metric trace.

This is the first honest step from "engineering is solid" toward "the numbers
mean something". It does NOT validate the model against reality — it only finds
the parameter set whose simulated trajectory best matches a target trace you
supply (e.g. an observed diffusion/arousal curve). Garbage target in, garbage
parameters out: calibration is necessary, not sufficient, for real-world claims.
"""
from __future__ import annotations

import itertools
from typing import Callable

from .engine import SimulationEngine
from .foundations import SimulationResult


def _avg_arousal(snap: dict) -> float:
    es = snap["emotions"].values()
    return sum(e["a"] for e in es) / len(es) if es else 0.0


def sample_arousal_trace(result: SimulationResult,
                         times: list[float]) -> list[float]:
    """Sample mean arousal at each query time, using the most recent snapshot
    at or before that time (zero-order hold). Times must be ascending."""
    traj = result.trajectory
    out: list[float] = []
    i = 0
    current = 0.0
    for t in times:
        while i < len(traj) and traj[i]["time"] <= t:
            current = _avg_arousal(traj[i])
            i += 1
        out.append(round(current, 6))
    return out


def _grid_points(grid: dict[str, list]) -> list[dict]:
    keys = list(grid)
    return [dict(zip(keys, combo))
            for combo in itertools.product(*(grid[k] for k in keys))]


def fit_parameters(factory: Callable[[dict], SimulationEngine],
                   target_times: list[float],
                   target_values: list[float],
                   grid: dict[str, list],
                   max_time: float = 30.0,
                   max_steps: int = 500) -> dict:
    """
    Grid-search the parameter set that minimizes squared error between the
    simulated arousal trace and `target_values` sampled at `target_times`.

    factory(params) must return a fully-configured (un-run) SimulationEngine
    for the given parameter dict — this is where the caller wires the same
    agents/edges/events while varying only the parameters being fitted.

    Returns {"params", "sse", "predicted", "evaluations"}.
    """
    if len(target_times) != len(target_values):
        raise ValueError("target_times and target_values must be same length")

    best_params: dict | None = None
    best_sse = float("inf")
    best_pred: list[float] = []
    evaluations = 0

    for params in _grid_points(grid):
        engine = factory(params)
        result = engine.run(max_time=max_time, max_steps=max_steps)
        pred = sample_arousal_trace(result, target_times)
        sse = sum((a - b) ** 2 for a, b in zip(pred, target_values))
        evaluations += 1
        if sse < best_sse:
            best_sse, best_params, best_pred = sse, params, pred

    return {
        "params": best_params,
        "sse": round(best_sse, 8),
        "predicted": best_pred,
        "evaluations": evaluations,
    }
