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

import csv
import json
import math
import random
from dataclasses import dataclass
from typing import Optional, Protocol, Sequence

from .engine import SimulationEngine
from .foundations import SimulationConfig, Vector3
from .calibration import sample_arousal_trace

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


class OmnisimForecaster:
    """
    Adapter that lets the OMNISIM SimulationEngine compete in the harness as a
    forecaster of mean arousal. This is the missing link: without it the harness
    can score logistic/SIR but never OMNISIM itself.

    It assumes a fixed star topology (one high-arousal seeder -> low-arousal
    followers) and fits only (contagion_rate, decay_rate) to the prefix by grid
    search, then simulates the tail. The topology/initial-condition assumption
    is a modeling choice that, for real data (Stage 2-3), must be replaced by
    the dataset's actual network — documented honestly so it is not mistaken
    for a parameter-free predictor.
    """
    name = "omnisim"

    def __init__(self, n_agents: int = 4, seed: int = 0,
                 grid: dict | None = None):
        self.n_agents = n_agents
        self.seed = seed
        self.grid = grid or {"contagion_rate": [0.3, 0.6, 0.9],
                             "decay_rate": [0.02, 0.04, 0.08]}
        self._params = {"contagion_rate": 0.6, "decay_rate": 0.04}

    def fit(self, train: Sequence[Series]) -> None:
        pass  # parameters are fit per-prefix at predict time

    def _build(self, cr: float, dr: float) -> SimulationEngine:
        cfg = SimulationConfig(contagion_rate=cr, decay_rate=dr,
                               tipping_arousal=0.99)
        e = SimulationEngine(cfg, seed=self.seed)
        e.add_agent("s", "S", "r", Vector3(-0.4, 0.9, 0.0))
        for i in range(self.n_agents - 1):
            x = f"a{i}"
            e.add_agent(x, x, "r", Vector3(0.2, 0.1, 0.0))
            e.add_trust_edge("s", x, 0.8)
        return e

    def _trace(self, cr: float, dr: float, length: int) -> Series:
        res = self._build(cr, dr).run(max_time=float(length), max_steps=500)
        return sample_arousal_trace(res, [float(t) for t in range(length)])

    def _fit_prefix(self, prefix: Series) -> None:
        if not prefix:
            return
        best = self._params
        best_sse = float("inf")
        for cr in self.grid["contagion_rate"]:
            for dr in self.grid["decay_rate"]:
                pred = self._trace(cr, dr, len(prefix))
                sse = sum((pred[t] - prefix[t]) ** 2 for t in range(len(prefix)))
                if sse < best_sse:
                    best_sse = sse
                    best = {"contagion_rate": cr, "decay_rate": dr}
        self._params = best

    def predict(self, prefix: Series, horizon: int) -> Series:
        self._fit_prefix(prefix)
        full = self._trace(self._params["contagion_rate"],
                           self._params["decay_rate"], len(prefix) + horizon)
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


def make_omnisim_dataset(n: int = 12, length: int = 16, seed: int = 0,
                         engine_seed: int = 0) -> list[Series]:
    """Mean-arousal traces generated by OMNISIM's own dynamics (parameters
    drawn from the forecaster's grid). Used only to check that the adapter can
    recover its own process — a self-consistency sanity check, not evidence."""
    rng = random.Random(seed)
    f = OmnisimForecaster(seed=engine_seed)
    out: list[Series] = []
    for _ in range(n):
        cr = rng.choice(f.grid["contagion_rate"])
        dr = rng.choice(f.grid["decay_rate"])
        out.append(f._trace(cr, dr, length))
    return out


# ── Real-data loaders (the Stage-2 plug-in point) ────────────────────────

def parse_series_jsonl(text: str) -> list[Series]:
    """Parse JSONL text: one JSON array of numbers per line -> a series."""
    out: list[Series] = []
    for line in text.splitlines():
        line = line.strip()
        if line:
            out.append([float(x) for x in json.loads(line)])
    return out


def parse_series_csv(text: str) -> list[Series]:
    """Parse CSV text: one numeric series per row. Non-numeric cells are
    skipped (so a leading date/id column is tolerated)."""
    out: list[Series] = []
    for row in csv.reader(text.splitlines()):
        vals: Series = []
        for cell in row:
            try:
                vals.append(float(cell))
            except (TypeError, ValueError):
                continue
        if vals:
            out.append(vals)
    return out


def load_series_jsonl(path: str) -> list[Series]:
    with open(path) as fh:
        return parse_series_jsonl(fh.read())


def load_series_csv(path: str) -> list[Series]:
    with open(path) as fh:
        return parse_series_csv(fh.read())


def load_series_url(url: str, fmt: str = "csv") -> list[Series]:
    """Fetch real series from a URL (the Stage-2 entry point in this sandbox,
    where GitHub/PyPI are reachable). fmt is 'csv' or 'jsonl'."""
    import urllib.request
    req = urllib.request.Request(
        url, headers={"User-Agent": "omnisim-research/0.1"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode("utf-8", errors="replace")
    return parse_series_csv(text) if fmt == "csv" else parse_series_jsonl(text)


# ── Mapping raw events -> a diffusion series ─────────────────────────────

def cumulative_series_from_timestamps(times: Sequence[float],
                                      n_bins: int = 16) -> Optional[Series]:
    """Turn a bag of event epoch-times (e.g. tweet times in one rumor cascade)
    into a cumulative-count diffusion curve over n_bins equal-width time bins.
    Returns None if there are too few events or zero time span. This is the
    Stage-2 mapping used to benchmark OMNISIM on real social cascades."""
    ts = sorted(times)
    if len(ts) < 2:
        return None
    t0 = ts[0]
    span = ts[-1] - t0
    if span <= 0:
        return None
    return [float(sum(1 for t in ts if t <= t0 + span * (b / n_bins)))
            for b in range(1, n_bins + 1)]


# ── Leak-free benchmark runner ───────────────────────────────────────────

def prefix_normalize(series: Series, split_at: int) -> Series:
    """Scale a series by the max of its PREFIX only (no future leakage), so
    raw-scale real data (e.g. pageview counts) becomes comparable to the [0,1]
    dynamics that logistic/SIR/OMNISIM produce."""
    head = series[:split_at] if split_at > 0 else series
    m = max((abs(x) for x in head), default=0.0) or 1.0
    return [x / m for x in series]


def benchmark(dataset: Sequence[Series], split_at: int,
              train_frac: float = 0.6,
              models: Sequence[Forecaster] | None = None,
              baseline: Forecaster | None = None,
              normalize: bool = True) -> list[Score]:
    """Run the full OMNISIM-vs-baselines comparison on a dataset of series.

    Out-of-sample by series (train_frac for fitting), temporal split within
    each test series at `split_at`, prefix-normalized to avoid leakage.
    """
    data = [prefix_normalize(s, split_at) for s in dataset] if normalize \
        else [list(s) for s in dataset]
    cut = max(1, int(len(data) * train_frac))
    train, test = data[:cut], data[cut:]
    if not test:                       # tiny dataset: reuse train as test
        test = train
    if models is None:
        models = [OmnisimForecaster(), LogisticForecaster(), SIRForecaster()]
    return compare(models, train, test, split_at, baseline)


def benchmark_final_size(dataset: Sequence[Series], split_at: int,
                         train_frac: float = 0.5,
                         models: Sequence[Forecaster] | None = None,
                         normalize: bool = True) -> list[Score]:
    """Alternative target: predict each cascade's FINAL size from its prefix
    (where contagion/saturation structure should matter), not the next bins.

    Baseline = 'mean-final': predict the average final-ratio of the TRAINING
    cascades (a strong climatology baseline). Persistence here would trivially
    predict 'no further growth' (1.0 after prefix-normalization), so beating
    mean-final is the honest bar. skill > 0 means a model beats mean-final.
    """
    data = [prefix_normalize(s, split_at) for s in dataset] if normalize \
        else [list(s) for s in dataset]
    cut = max(1, int(len(data) * train_frac))
    train, test = data[:cut], data[cut:]
    if not test:
        test = train
    if models is None:
        models = [OmnisimForecaster(), LogisticForecaster(), SIRForecaster()]

    train_finals = [s[-1] for s in train if len(s) > split_at] or \
        [s[-1] for s in train]
    mean_final = sum(train_finals) / len(train_finals)
    truth = [s[-1] for s in test if split_at < len(s)]
    base_sq = [(mean_final - a) ** 2 for a in truth]
    base_rmse = math.sqrt(sum(base_sq) / len(base_sq)) if base_sq else float("nan")

    scores: list[Score] = []
    for m in models:
        m.fit(train)
        sq: list[float] = []
        for s in test:
            if split_at >= len(s):
                continue
            pred_final = m.predict(s[:split_at], len(s) - split_at)[-1]
            sq.append((pred_final - s[-1]) ** 2)
        mrmse = math.sqrt(sum(sq) / len(sq)) if sq else float("nan")
        scores.append(Score(m.name, mrmse, "mean-final", base_rmse,
                            _skill(mrmse, base_rmse)))
    scores.sort(key=lambda s: s.skill, reverse=True)
    return scores


def paired_bootstrap_ci(diffs: Sequence[float], n_boot: int = 2000,
                        alpha: float = 0.05, seed: int = 0
                        ) -> tuple[float, float, float]:
    """Bootstrap (mean, lo, hi) of paired differences. Deterministic for a seed."""
    rng = random.Random(seed)
    n = len(diffs)
    if n == 0:
        return (float("nan"), float("nan"), float("nan"))
    means: list[float] = []
    for _ in range(n_boot):
        means.append(sum(diffs[rng.randrange(n)] for _ in range(n)) / n)
    means.sort()
    lo = means[int((alpha / 2) * n_boot)]
    hi = means[int((1 - alpha / 2) * n_boot)]
    return (sum(diffs) / n, lo, hi)


def _per_series_mse(model: Forecaster, baseline: Forecaster,
                    train: Sequence[Series], test: Sequence[Series],
                    split_at: int) -> tuple[list[float], list[float]]:
    model.fit(train)
    baseline.fit(train)
    me: list[float] = []
    be: list[float] = []
    for s in test:
        if split_at >= len(s):
            continue
        prefix, tail = s[:split_at], s[split_at:]
        h = len(tail)
        mp = model.predict(prefix, h)
        bp = baseline.predict(prefix, h)
        me.append(sum((mp[i] - tail[i]) ** 2 for i in range(h)) / h)
        be.append(sum((bp[i] - tail[i]) ** 2 for i in range(h)) / h)
    return me, be


def significant_improvement(model: Forecaster,
                            train_series: Sequence[Series],
                            test_series: Sequence[Series], split_at: int,
                            baseline: Forecaster | None = None,
                            n_boot: int = 2000, seed: int = 0) -> dict:
    """Is `model` SIGNIFICANTLY better than `baseline`? Paired bootstrap over
    per-series MSE; significant iff the 95% CI of the improvement excludes 0
    (and the model is the better one). Ported from the NeoTIC Rule-3
    false-discovery discipline."""
    if baseline is None:
        baseline = PersistenceForecaster()
    me, be = _per_series_mse(model, baseline, train_series, test_series, split_at)
    diffs = [be[i] - me[i] for i in range(len(me))]   # +ve => model beats baseline
    mean, lo, hi = paired_bootstrap_ci(diffs, n_boot=n_boot, seed=seed)
    return {"forecaster": model.name, "baseline": baseline.name,
            "mean_improvement": round(mean, 6), "ci": (round(lo, 6), round(hi, 6)),
            "n": len(diffs), "significant": bool(mean > 0 and lo > 0)}


def benchmark_significance(dataset: Sequence[Series], split_at: int,
                           train_frac: float = 0.5,
                           models: Sequence[Forecaster] | None = None,
                           baseline: Forecaster | None = None,
                           normalize: bool = True, n_boot: int = 2000,
                           seed: int = 0) -> dict:
    """Like benchmark(), but reports whether ANY model SIGNIFICANTLY beats the
    baseline. `adequate_model_found=False` is the honest 'no signal here' verdict
    — the harness says it instead of ranking the least-bad model."""
    data = [prefix_normalize(s, split_at) for s in dataset] if normalize \
        else [list(s) for s in dataset]
    cut = max(1, int(len(data) * train_frac))
    train, test = data[:cut], data[cut:]
    if not test:
        test = train
    if models is None:
        models = [OmnisimForecaster(), LogisticForecaster(), SIRForecaster()]
    if baseline is None:
        baseline = PersistenceForecaster()
    per = [significant_improvement(m, train, test, split_at, baseline, n_boot, seed)
           for m in models]
    winners = [p for p in per if p["significant"]]
    best = max(winners, key=lambda p: p["mean_improvement"]) if winners else None
    return {"adequate_model_found": bool(winners), "best": best,
            "per_model": per, "baseline": baseline.name}


def make_noise_dataset(n: int = 16, length: int = 16, seed: int = 0) -> list[Series]:
    """Pure random-walk series with NO learnable saturation — the integrity
    fixture: a trustworthy harness must NOT flag any model as significantly
    beating the baseline here, because there is no signal to find."""
    out: list[Series] = []
    for k in range(n):
        rng = random.Random(seed * 1000 + k)
        v = 0.0
        s: Series = []
        for _ in range(length):
            v += rng.gauss(0, 1)
            s.append(v)
        out.append(s)
    return out


def loo_linear_augment(base: Sequence[float], target: Sequence[float],
                       feature: Sequence[float]) -> list[float]:
    """Leave-one-out augmentation: predict target[i] as base[i] + beta*feature[i]
    where the single coefficient beta is fit (centered least squares) on ALL
    OTHER points, so no row ever sees its own beta — no in-sample optimism."""
    n = len(base)
    res = [target[i] - base[i] for i in range(n)]
    fmean = sum(feature) / n if n else 0.0
    fc = [f - fmean for f in feature]
    aug: list[float] = []
    for i in range(n):
        sx = sum(fc[j] ** 2 for j in range(n) if j != i)
        sxy = sum(fc[j] * res[j] for j in range(n) if j != i)
        beta = sxy / sx if sx > 1e-12 else 0.0
        aug.append(base[i] + beta * fc[i])
    return aug


def feature_improvement(base: Sequence[float], target: Sequence[float],
                        feature: Sequence[float], n_boot: int = 2000,
                        alpha: float = 0.05, seed: int = 0) -> dict:
    """Does augmenting `base` with `feature` SIGNIFICANTLY cut squared error?
    Leave-one-out + paired bootstrap; significant iff the (1-alpha) CI of the
    improvement excludes 0."""
    aug = loo_linear_augment(base, target, feature)
    n = len(base)
    eb = [(base[i] - target[i]) ** 2 for i in range(n)]
    ea = [(aug[i] - target[i]) ** 2 for i in range(n)]
    diffs = [eb[i] - ea[i] for i in range(n)]      # +ve => augmented is better
    mean, lo, hi = paired_bootstrap_ci(diffs, n_boot=n_boot, alpha=alpha, seed=seed)
    return {"mean_improvement": round(mean, 6), "ci": (round(lo, 6), round(hi, 6)),
            "significant": bool(mean > 0 and lo > 0)}


def multiple_feature_test(base: Sequence[float], target: Sequence[float],
                          features: dict, n_boot: int = 2000,
                          alpha: float = 0.05, seed: int = 0) -> dict:
    """Test several candidate features for added value over `base`, with
    BONFERRONI family-wise correction (each judged at alpha/K). The honest
    answer to 'does ANY of my K features help?' that resists p-hacking:
    `adequate_feature_found=False` means none survive correction."""
    k = max(1, len(features))
    adj = alpha / k
    per = {name: feature_improvement(base, target, f, n_boot, adj, seed)
           for name, f in features.items()}
    return {"adequate_feature_found": any(p["significant"] for p in per.values()),
            "alpha_per_feature": adj, "n_features": len(features),
            "per_feature": per}


def format_scores(scores: Sequence[Score]) -> str:
    lines = [f"{'model':<14}{'rmse':>10}{'baseline_rmse':>16}{'skill':>10}",
             "-" * 50]
    for s in scores:
        lines.append(f"{s.forecaster:<14}{s.rmse:>10.4f}"
                     f"{s.baseline_rmse:>16.4f}{s.skill:>10.3f}")
    return "\n".join(lines)
