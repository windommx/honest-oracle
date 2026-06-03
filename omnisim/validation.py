"""
Validation harness — Stage 1 toward a real method.

THIS IS MACHINERY, NOT EVIDENCE. It builds the apparatus to ask, honestly,
"does a model beat baselines on held-out data?". Stage 1 ships only a SYNTHETIC
integrity check that proves the apparatus can tell a good model from a bad one
(a correct model must score positive skill; a wrong model must score negative).
Real validation needs real data (Stage 2), which we do not have yet — so
nothing here is a claim about the real world.

Protocol (no leakage):
  - dataset = list of independent series (each a list[float] at unit time steps)
  - split series into train / test (out-of-sample by series)
  - a Forecaster is fit ONLY on train series
  - for each TEST series: feed it a prefix, predict the held-out tail
  - score = RMSE on the tail; skill = 1 - rmse_model / rmse_baseline
            (skill > 0  => model beats the baseline; <= 0 => it does not)
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Protocol, Sequence

Series = list[float]


# ── Forecaster protocol ──────────────────────────────────────────────────

class Forecaster(Protocol):
    name: str
    def fit(self, train: Sequence[Series]) -> None: ...
    def predict(self, prefix: Series, horizon: int) -> Series: ...


# ── Baselines (something to beat) ────────────────────────────────────────

class PersistenceForecaster:
    """Predict the last observed value, repeated. The honest default baseline."""
    name = "persistence"
    def fit(self, train: Sequence[Series]) -> None:
        pass
    def predict(self, prefix: Series, horizon: int) -> Series:
        last = prefix[-1] if prefix else 0.0
        return [last] * horizon


class MeanForecaster:
    """Null model: predict the global mean of all training values."""
    name = "null-mean"
    def __init__(self) -> None:
        self._mean = 0.0
    def fit(self, train: Sequence[Series]) -> None:
        vals = [v for s in train for v in s]
        self._mean = sum(vals) / len(vals) if vals else 0.0
    def predict(self, prefix: Series, horizon: int) -> Series:
        return [self._mean] * horizon


class ZeroForecaster:
    """Deliberately wrong (predicts 0). Exists so the harness can be shown to
    PUNISH a bad model — the integrity check, not a real model."""
    name = "zero"
    def fit(self, train: Sequence[Series]) -> None:
        pass
    def predict(self, prefix: Series, horizon: int) -> Series:
        return [0.0] * horizon


# ── Parametric models ────────────────────────────────────────────────────

class LogisticForecaster:
    """Logistic growth  y(t)=L/(1+exp(-k(t-t0)))  fit to the prefix by grid
    search, then extrapolated. Good for monotone cascades."""
    name = "logistic"
    def __init__(self) -> None:
        self._L = 1.0
        self._k = 1.0
        self._t0 = 0.0
    def fit(self, train: Sequence[Series]) -> None:
        pass  # fit per-prefix at predict time (curve fit, no cross-series params)
    def _curve(self, t: float, L: float, k: float, t0: float) -> float:
        return L / (1.0 + math.exp(-k * (t - t0)))
    def _fit_prefix(self, prefix: Series) -> None:
        if not prefix:
            return
        n = len(prefix)
        peak = max(prefix) or 1e-6
        L_grid = [peak, peak * 1.1, max(peak, 1.0)]
        k_grid = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
        t0_grid = [float(i) for i in range(n)]
        best = (self._L, self._k, self._t0)
        best_sse = float("inf")
        for L in L_grid:
            for k in k_grid:
                for t0 in t0_grid:
                    sse = 0.0
                    for t, y in enumerate(prefix):
                        sse += (self._curve(t, L, k, t0) - y) ** 2
                    if sse < best_sse:
                        best_sse, best = sse, (L, k, t0)
        self._L, self._k, self._t0 = best
    def predict(self, prefix: Series, horizon: int) -> Series:
        self._fit_prefix(prefix)
        start = len(prefix)
        return [self._curve(start + h, self._L, self._k, self._t0)
                for h in range(horizon)]


class SIRForecaster:
    """Discrete SIR contagion. Series is read as the CURRENTLY-active fraction
    I(t) (so it can rise then fall). beta/gamma fit to the prefix by grid;
    simulated forward."""
    name = "sir"
    def __init__(self) -> None:
        self._beta = 0.5
        self._gamma = 0.1
    def fit(self, train: Sequence[Series]) -> None:
        pass
    def _simulate(self, i0: float, beta: float, gamma: float, steps: int) -> Series:
        s, i, r = max(0.0, 1.0 - i0), max(0.0, i0), 0.0
        out: Series = []
        for _ in range(steps):
            new_inf = beta * s * i
            new_rec = gamma * i
            s = max(0.0, s - new_inf)
            i = max(0.0, i + new_inf - new_rec)
            r = min(1.0, r + new_rec)
            out.append(i)
        return out
    def _fit_prefix(self, prefix: Series) -> None:
        if len(prefix) < 2:
            return
        i0 = prefix[0]
        best = (self._beta, self._gamma)
        best_sse = float("inf")
        for beta in [0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0, 3.0]:
            for gamma in [0.0, 0.05, 0.1, 0.2, 0.4]:
                sim = self._simulate(i0, beta, gamma, len(prefix) - 1)
                sse = sum((sim[t] - prefix[t + 1]) ** 2 for t in range(len(sim)))
                if sse < best_sse:
                    best_sse, best = sse, (beta, gamma)
        self._beta, self._gamma = best
    def predict(self, prefix: Series, horizon: int) -> Series:
        self._fit_prefix(prefix)
        # continue the simulation from the last observed point
        full = self._simulate(prefix[0] if prefix else 0.0,
                              self._beta, self._gamma,
                              len(prefix) + horizon)
        return full[len(prefix):len(prefix) + horizon]


# ── Scoring ──────────────────────────────────────────────────────────────

@dataclass
class Score:
    forecaster: str
    rmse: float
    baseline: str
    baseline_rmse: float
    skill: float          # 1 - rmse/baseline_rmse ; >0 means it beat the baseline


def rmse(pred: Series, actual: Series) -> float:
    n = min(len(pred), len(actual))
    if n == 0:
        return float("nan")
    return math.sqrt(sum((pred[i] - actual[i]) ** 2 for i in range(n)) / n)


def _skill(model_rmse: float, base_rmse: float) -> float:
    if base_rmse == 0.0:
        return 0.0 if model_rmse == 0.0 else float("-inf")
    return 1.0 - model_rmse / base_rmse


def evaluate(model: Forecaster,
             train_series: Sequence[Series],
             test_series: Sequence[Series],
             split_at: int,
             baseline: Forecaster | None = None) -> Score:
    """Fit `model` on train (out-of-sample), forecast the tail of each test
    series from its first `split_at` points, and score skill vs `baseline`
    (persistence by default)."""
    if baseline is None:
        baseline = PersistenceForecaster()
    model.fit(train_series)
    baseline.fit(train_series)

    m_sq: list[float] = []
    b_sq: list[float] = []
    for s in test_series:
        if split_at >= len(s):
            continue
        prefix, tail = s[:split_at], s[split_at:]
        h = len(tail)
        for p, a in zip(model.predict(prefix, h), tail):
            m_sq.append((p - a) ** 2)
        for p, a in zip(baseline.predict(prefix, h), tail):
            b_sq.append((p - a) ** 2)

    m_rmse = math.sqrt(sum(m_sq) / len(m_sq)) if m_sq else float("nan")
    b_rmse = math.sqrt(sum(b_sq) / len(b_sq)) if b_sq else float("nan")
    return Score(model.name, m_rmse, baseline.name, b_rmse,
                 _skill(m_rmse, b_rmse))


def compare(models: Sequence[Forecaster],
            train_series: Sequence[Series],
            test_series: Sequence[Series],
            split_at: int,
            baseline: Forecaster | None = None) -> list[Score]:
    """Score several models against one baseline, best skill first."""
    scores = [evaluate(m, train_series, test_series, split_at, baseline)
              for m in models]
    scores.sort(key=lambda s: s.skill, reverse=True)
    return scores


# ── Synthetic data (labeled: NOT real-world evidence) ─────────────────────

def make_logistic_dataset(n: int = 20, length: int = 20, seed: int = 0,
                          noise: float = 0.0) -> list[Series]:
    """Synthetic logistic cascades for integrity-testing the harness only."""
    rng = random.Random(seed)
    out: list[Series] = []
    for _ in range(n):
        L, k = 1.0, 1.0
        t0 = length * rng.uniform(0.4, 0.6)
        s = [L / (1.0 + math.exp(-k * (t - t0))) + rng.gauss(0, noise)
             for t in range(length)]
        out.append([max(0.0, v) for v in s])
    return out


def make_sir_dataset(n: int = 20, length: int = 20, seed: int = 1) -> list[Series]:
    """Synthetic rise-and-fall (SIR) traces for integrity-testing only."""
    rng = random.Random(seed)
    f = SIRForecaster()
    out: list[Series] = []
    for _ in range(n):
        i0 = rng.uniform(0.02, 0.08)
        beta = rng.choice([0.8, 1.0, 1.5])
        gamma = rng.choice([0.1, 0.2])
        out.append(f._simulate(i0, beta, gamma, length))
    return out
