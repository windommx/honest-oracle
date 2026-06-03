# Stage-2 result: OMNISIM vs baselines on real rumor cascades

**Honest negative result.** On real data, OMNISIM's contagion forecaster did
**not** beat trivial baselines — it was the worst of the models tested.

## Setup
- **Data:** `MickeysClubhouse/COVID-19-rumor-dataset` — Twitter rumor cascades.
  Each `Data/twitter/<id>.csv` is the tweet stream for one rumor; we parsed the
  `time` column and mapped it to a cumulative-count diffusion curve over 16
  equal-width time bins (`cumulative_series_from_timestamps`).
- **Sample:** 47 cascades with ≥ 25 tweets (scanned 220 files).
- **Task:** out-of-sample forecasting — fit on a prefix of 8/16 bins, predict
  the remaining 8; out-of-sample by series (50/50 train/test); prefix-max
  normalized to avoid leakage.
- **Baseline:** persistence (repeat last observed value).
  **Skill** = 1 − rmse_model / rmse_persistence (> 0 means it beat persistence).

## Result
| model      | skill |
|------------|-------|
| null-mean  | +0.036 |
| logistic   | +0.004 |
| sir        | −0.001 |
| **omnisim**| **−0.025** |

OMNISIM lost to persistence (and to every baseline). logistic/SIR only tied
persistence. No model meaningfully beat the naive baseline.

## Honest interpretation
1. **OMNISIM is not validated as a forecasting method by this evidence.** On
   real rumor diffusion it predicts worse than repeating the last value.
2. **Why this was almost inevitable:** OMNISIM's *distinctive* parts (cognitive
   bias, the Z3 action gate, bifocal memory) are **not in the predictive path**
   — the forecaster only exercises the contagion core, which is essentially
   SIR. And SIR itself merely tied persistence here.
3. **Persistence is a strong baseline** on short, monotone cumulative curves
   over a near-term horizon; beating it needs either longer/finer cascades or a
   different prediction target (peak time, final size), not next-bin counts.

## What would make the question fair (not yet done)
- Larger sample, finer time resolution, multiple horizons, significance tests.
- A prediction target where contagion structure matters (final size / peak).
- Putting OMNISIM's novel components into a predictable observable — otherwise
  it is only a worse-parameterised SIR and cannot, even in principle, win.

## Reproduce
Fetch cascades from the public repo via `raw.githubusercontent.com`, map with
`cumulative_series_from_timestamps`, then `benchmark(...)`. No data is committed
here (third-party provenance); only the numeric result above and the mapping
code are.
