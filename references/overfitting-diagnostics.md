# Overfitting Diagnostics for Quantitative Strategy Development

## Purpose

This reference provides concrete, implementable tools for detecting and preventing overfitting in quantitative strategy development. It moves beyond theory ("don't overfit") to actionable diagnostics ("here's how to measure whether you have").

## The Three Types of Overfitting in Quant

### Type 1: Train-Set Overfitting (Model Memorization)
**What**: Model memorizes training data patterns including noise.
**Detection**: Train loss keeps decreasing, validation loss increases.
**Prevention**: Early stopping, regularization, dropout, data augmentation.
**Severity**: Moderate — usually caught by standard ML practices.

### Type 2: Test-Set Overfitting (Data Snooping)
**What**: Researcher tests many configurations on the same test set, selects the best one.
**Detection**: High in-sample performance, mediocre out-of-sample. Multiple testing inflation.
**Prevention**: CSCV, PBO calculation, deflated Sharpe ratio.
**Severity**: HIGH — this is the most common and most dangerous type in quant.

### Type 3: Meta-Overfitting (Methodology Overfitting)
**What**: The entire research process has been optimized on available data, even with proper splits.
**Detection**: Successive "improvements" show diminishing OOS returns. Paper trading fails.
**Prevention**: True holdout set (never touched), paper trading, capital ladder.
**Severity**: CRITICAL — nearly impossible to detect without live validation.

## Diagnostic 1: Probability of Backtest Overfitting (PBO)

### Theory (Bailey, Borwein, Lopez de Prado & Zhu, 2017)

PBO estimates the probability that the in-sample optimal strategy is actually one of the worst out-of-sample. It's model-free, nonparametric, and directly applicable to any backtest.

### Implementation

```python
import numpy as np
from itertools import combinations

def compute_pbo(performance_matrix, n_partitions=16, metric='sharpe'):
    """
    Compute Probability of Backtest Overfitting using CSCV.

    Args:
        performance_matrix: np.array of shape (T, N)
            T = number of time periods (rows)
            N = number of strategy configurations (columns)
        n_partitions: int, must be even. Higher = more combinations but needs more data.
        metric: Performance metric to use ('sharpe', 'sortino', 'calmar')

    Returns:
        pbo: float in [0, 1]. Probability that the best IS strategy is overfit.
        degradation: float. Average rank degradation from IS to OOS.
        logit_distribution: np.array. Distribution of logit(rank) for stochastic dominance.
    """
    assert n_partitions % 2 == 0, "n_partitions must be even"
    T, N = performance_matrix.shape

    # Partition the T periods into S groups
    partitions = np.array_split(np.arange(T), n_partitions)
    half = n_partitions // 2

    # Generate all combinations of S/2 partitions for in-sample
    all_combos = list(combinations(range(n_partitions), half))

    logits = []
    rank_degradations = []

    for is_indices in all_combos:
        oos_indices = [i for i in range(n_partitions) if i not in is_indices]

        # Build IS and OOS period masks
        is_periods = np.concatenate([partitions[i] for i in is_indices])
        oos_periods = np.concatenate([partitions[i] for i in oos_indices])

        # Compute metric for each strategy on IS and OOS
        is_data = performance_matrix[is_periods]
        oos_data = performance_matrix[oos_periods]

        is_metrics = _compute_metrics(is_data, metric)
        oos_metrics = _compute_metrics(oos_data, metric)

        # Find IS-optimal strategy
        is_best = np.argmax(is_metrics)

        # What is its OOS rank? (rank 0 = best, rank N-1 = worst)
        oos_ranks = np.argsort(np.argsort(-oos_metrics))  # Descending rank
        is_best_oos_rank = oos_ranks[is_best]

        # Relative rank in [0, 1]
        relative_rank = is_best_oos_rank / (N - 1) if N > 1 else 0.5

        # Logit transform (avoids 0/1 boundary)
        relative_rank_clipped = np.clip(relative_rank, 0.01, 0.99)
        logit = np.log(relative_rank_clipped / (1 - relative_rank_clipped))
        logits.append(logit)

        # Track rank degradation
        is_rank = 0  # IS-optimal is rank 0 by definition
        rank_degradations.append(is_best_oos_rank / (N - 1))

    logits = np.array(logits)

    # PBO = fraction of combinations where IS-best performs below median OOS
    pbo = np.mean(logits > 0)  # logit > 0 means below median

    # Average degradation
    avg_degradation = np.mean(rank_degradations)

    return pbo, avg_degradation, logits

def _compute_metrics(returns_matrix, metric):
    """Compute performance metric for each column (strategy)."""
    if metric == 'sharpe':
        means = np.mean(returns_matrix, axis=0)
        stds = np.std(returns_matrix, axis=0, ddof=1)
        stds = np.where(stds < 1e-10, 1e-10, stds)
        return means / stds * np.sqrt(252)
    elif metric == 'sortino':
        means = np.mean(returns_matrix, axis=0)
        downside = np.std(np.minimum(returns_matrix, 0), axis=0, ddof=1)
        downside = np.where(downside < 1e-10, 1e-10, downside)
        return means / downside * np.sqrt(252)
    else:
        return np.mean(returns_matrix, axis=0)  # Simple mean
```

### Interpretation

| PBO | Interpretation | Action |
|-----|---------------|--------|
| < 0.05 | Low probability of overfitting | Proceed with caution |
| 0.05 - 0.20 | Moderate — some risk | Additional validation needed |
| 0.20 - 0.50 | High — likely overfit | Do NOT deploy. Reduce variant count. |
| > 0.50 | Almost certainly overfit | Strategy selection process is broken |

### When to Use PBO
- After testing >5 strategy variants on the same data
- Before selecting the "best" configuration for deployment
- As a gate in BUILD_STRATEGY Phase 6 (Strategy Evaluation)

## Diagnostic 2: Deflated Sharpe Ratio (DSR)

### Theory (Bailey & Lopez de Prado, 2014)

The DSR corrects a reported Sharpe ratio for:
1. **Selection bias**: You tested N strategies, so the maximum is inflated
2. **Non-normal returns**: Skewness and kurtosis affect SR reliability
3. **Short track record**: More data = more reliable SR

### Implementation

```python
from scipy.stats import norm
import numpy as np

def deflated_sharpe_ratio(observed_sr, sr_std, n_trials, T,
                          skewness=0, kurtosis=3):
    """
    Compute the Deflated Sharpe Ratio.

    Args:
        observed_sr: Sharpe ratio of the selected strategy (annualized)
        sr_std: Standard deviation of Sharpe ratios across all N trials
        n_trials: Number of independent strategy configurations tested
        T: Number of return observations (not years — actual data points)
        skewness: Skewness of the strategy's returns (0 for normal)
        kurtosis: Kurtosis of the strategy's returns (3 for normal)

    Returns:
        dsr: float in [0, 1]. Probability that the true SR exceeds the
             adjusted threshold (accounting for multiple testing).
    """
    # Expected maximum SR under null hypothesis (all strategies have SR=0)
    euler_mascheroni = 0.5772156649

    # Expected max SR from N independent trials
    e_max_sr = sr_std * (
        (1 - euler_mascheroni) * norm.ppf(1 - 1/n_trials) +
        euler_mascheroni * norm.ppf(1 - 1/(n_trials * np.e))
    )

    # SR standard error (accounting for non-normality)
    sr_se = np.sqrt(
        (1 + 0.5 * observed_sr**2 - skewness * observed_sr +
         (kurtosis - 3) / 4 * observed_sr**2) / (T - 1)
    )

    # DSR = probability that true SR > expected max SR
    if sr_se > 0:
        z = (observed_sr - e_max_sr) / sr_se
        dsr = norm.cdf(z)
    else:
        dsr = 0.0

    return dsr

def minimum_backtest_length(observed_sr, n_trials, skewness=0, kurtosis=3,
                            confidence=0.95):
    """
    Compute the minimum number of observations needed for
    the observed SR to be statistically significant.

    Returns:
        min_T: Minimum number of return observations required.
    """
    z_alpha = norm.ppf(confidence)
    sr_std_est = 1.0  # Assume SR_std ≈ 1 across strategies

    euler_mascheroni = 0.5772156649
    e_max_sr = sr_std_est * (
        (1 - euler_mascheroni) * norm.ppf(1 - 1/n_trials) +
        euler_mascheroni * norm.ppf(1 - 1/(n_trials * np.e))
    )

    # Solve for T: z = (SR - E[max SR]) / SE(SR), where SE depends on T
    # Simplified: T ≈ ((z_alpha + e_max_sr/SR) * correction)^2
    correction = 1 + 0.5 * observed_sr**2 - skewness * observed_sr + \
                 (kurtosis - 3) / 4 * observed_sr**2

    if observed_sr > e_max_sr:
        min_T = int(np.ceil(
            correction * (z_alpha / (observed_sr - e_max_sr))**2
        ))
    else:
        min_T = float('inf')  # SR doesn't exceed expected max — not significant

    return min_T
```

### Interpretation

| DSR | Interpretation | Action |
|-----|---------------|--------|
| > 0.95 | High probability of genuine skill | Proceed (but still paper trade) |
| 0.80 - 0.95 | Moderate — probably real | Proceed with monitoring |
| 0.50 - 0.80 | Uncertain — could be luck | Reduce capital, extend paper trading |
| < 0.50 | Likely a false discovery | Do NOT deploy |

### Quick Reference: Expected Max Sharpe by Number of Trials

| N Trials | E[max SR] (5yr daily) | Implication |
|----------|----------------------|-------------|
| 1 | 0.00 | No inflation |
| 5 | 0.58 | Modest inflation |
| 10 | 0.82 | Noticeable inflation |
| 20 | 1.02 | Substantial |
| 50 | 1.24 | High inflation |
| 100 | 1.40 | Very high |
| 500 | 1.74 | Extreme |
| 1000 | 1.90 | Nearly 2.0 expected by CHANCE |

**Audit Rule**: If your observed Sharpe is within 1.5x of E[max SR] for your trial count, the edge is not statistically significant.

## Diagnostic 3: Combinatorial Purged Cross-Validation (CPCV)

### Theory (Lopez de Prado, 2018)

CPCV generates the precise number of train/test combinations needed to produce multiple backtest paths, while purging information leakage and adding temporal embargo.

### Key Concepts

**Purging**: Remove training samples whose label window overlaps with the test set.
```python
purge_window = max(feature_lookback, label_horizon)
# Remove training samples within purge_window bars of test set boundary
```

**Embargo**: Additional buffer after test set to prevent information leakage through autocorrelation.
```python
embargo_window = int(0.01 * T)  # 1% of total samples, or:
embargo_window = autocorrelation_decay_time  # Time for ACF to drop below 0.05
```

**Combination counting**:
```
For N groups and k test groups per combination:
  Total combinations = C(N, k)
  Number of backtest paths = phi(N, k)

  Choose N and k to get desired number of paths
  Standard choice: N=10, k=2 → 45 combinations, 10 paths
```

### Implementation Pattern

```python
def purged_kfold_cv(X, y, timestamps, n_splits=5, purge_window=60, embargo_pct=0.01):
    """
    Purged K-Fold Cross-Validation for time series.

    Args:
        X: Features array (T, F)
        y: Labels array (T,)
        timestamps: Datetime index
        n_splits: Number of folds
        purge_window: Number of bars to purge around test boundaries
        embargo_pct: Fraction of total samples to embargo after test set

    Yields:
        train_indices, test_indices for each fold
    """
    T = len(X)
    embargo_size = int(T * embargo_pct)
    fold_size = T // n_splits

    for i in range(n_splits):
        test_start = i * fold_size
        test_end = min((i + 1) * fold_size, T)

        test_indices = np.arange(test_start, test_end)

        # Build train indices: everything NOT in test + purge + embargo
        purge_start = max(0, test_start - purge_window)
        embargo_end = min(T, test_end + embargo_size)

        excluded = set(range(purge_start, embargo_end))
        train_indices = np.array([j for j in range(T) if j not in excluded])

        yield train_indices, test_indices
```

## Diagnostic 4: Parameter Sensitivity Analysis

### The Profit Plateau Test

A robust strategy should have a "profit plateau" — a range of parameters that all produce positive performance. An overfit strategy has a single sharp peak.

```python
def parameter_sensitivity_analysis(param_name, param_values, backtest_func):
    """
    Test parameter sensitivity by varying one parameter across a range.

    A robust strategy should have:
    - >50% of tested values profitable
    - Smooth performance curve (no single sharp peak)
    - Optimal region is wide, not a point

    Returns:
        plateau_width: Fraction of parameter range that is profitable
        peak_sharpness: Ratio of best to median performance (lower is better)
        is_robust: Boolean
    """
    results = []
    for val in param_values:
        sharpe = backtest_func(**{param_name: val})
        results.append(sharpe)

    results = np.array(results)

    profitable = results > 0
    plateau_width = np.mean(profitable)

    if np.median(results[profitable]) > 0:
        peak_sharpness = np.max(results) / np.median(results[profitable])
    else:
        peak_sharpness = float('inf')

    is_robust = plateau_width > 0.5 and peak_sharpness < 3.0

    return {
        'plateau_width': plateau_width,
        'peak_sharpness': peak_sharpness,
        'is_robust': is_robust,
        'best_value': param_values[np.argmax(results)],
        'results': results
    }
```

### Interpretation

| Plateau Width | Peak Sharpness | Verdict |
|--------------|---------------|---------|
| > 0.7 | < 2.0 | ROBUST — parameter choice isn't critical |
| 0.5 - 0.7 | 2.0 - 3.0 | MODERATE — some sensitivity |
| 0.3 - 0.5 | 3.0 - 5.0 | FRAGILE — performance depends on exact parameter |
| < 0.3 | > 5.0 | OVERFIT — a single lucky parameter value |

## Diagnostic 5: Monte Carlo Permutation Test

### Purpose

Tests whether the observed performance could be explained by random chance, by shuffling the timing of trades (preserving trade characteristics but destroying temporal signal).

```python
def permutation_test(returns, n_permutations=5000, metric='sharpe'):
    """
    Test if observed performance is significantly different from random.

    Args:
        returns: np.array of strategy returns (T,)
        n_permutations: Number of random shuffles
        metric: Performance metric

    Returns:
        p_value: Probability of observing this performance by chance
        observed: Observed metric value
        null_distribution: Array of metric values under null hypothesis
    """
    observed = _compute_metric(returns, metric)

    null_dist = np.zeros(n_permutations)
    for i in range(n_permutations):
        shuffled = np.random.permutation(returns)
        null_dist[i] = _compute_metric(shuffled, metric)

    # One-sided test: proportion of null >= observed
    p_value = np.mean(null_dist >= observed)

    return p_value, observed, null_dist
```

### Interpretation

| p-value | Interpretation |
|---------|---------------|
| < 0.01 | Strong evidence of genuine signal |
| 0.01 - 0.05 | Moderate evidence |
| 0.05 - 0.10 | Weak evidence — more data needed |
| > 0.10 | Not significant — likely noise |

## Diagnostic 6: Walk-Forward Efficiency (WFE)

```python
def walk_forward_efficiency(is_sharpe, oos_sharpe):
    """
    Ratio of OOS to IS performance.

    WFE = OOS_Sharpe / IS_Sharpe

    Healthy range: 0.3 - 0.8
    < 0.3 = overfit (IS much better than OOS)
    > 0.9 = suspicious (OOS should be worse, check for leakage)
    """
    if abs(is_sharpe) < 1e-6:
        return 0.0
    wfe = oos_sharpe / is_sharpe
    return wfe
```

| WFE | Interpretation |
|-----|---------------|
| > 0.9 | SUSPICIOUS — check for data leakage |
| 0.5 - 0.9 | HEALTHY — normal IS/OOS degradation |
| 0.3 - 0.5 | MODERATE — some overfitting present |
| 0.1 - 0.3 | POOR — significant overfitting |
| < 0.1 | FAIL — strategy is overfit to IS data |

## Diagnostic 7: Regime Robustness Test

```python
def regime_robustness(returns, regime_labels):
    """
    Check if strategy performs consistently across market regimes.

    A regime-robust strategy should be profitable in ≥ 60% of regimes.
    A strategy profitable in only 1 regime is a regime-dependent bet.
    """
    regimes = np.unique(regime_labels)
    regime_sharpes = {}

    for regime in regimes:
        mask = regime_labels == regime
        regime_returns = returns[mask]
        if len(regime_returns) > 20:  # Minimum sample
            sharpe = np.mean(regime_returns) / np.std(regime_returns) * np.sqrt(252)
            regime_sharpes[regime] = sharpe

    n_profitable = sum(1 for s in regime_sharpes.values() if s > 0)
    n_total = len(regime_sharpes)

    return {
        'regime_sharpes': regime_sharpes,
        'profitable_fraction': n_profitable / n_total if n_total > 0 else 0,
        'worst_regime': min(regime_sharpes, key=regime_sharpes.get),
        'best_regime': max(regime_sharpes, key=regime_sharpes.get),
        'is_robust': n_profitable / n_total >= 0.6 if n_total > 0 else False
    }
```

## Integration with Netrunner Gates

### Pre-Generation Gate Addition

When any avenue involves strategy selection or optimization, apply:

```
OVERFITTING GATE:
1. How many variants were tested? (N)
2. What is the expected max Sharpe by chance? (E[max SR])
3. Is observed SR > 1.5 × E[max SR]? If no → REJECT
4. Is PBO < 0.20? If no → REJECT
5. Is DSR > 0.80? If no → REJECT
6. Is WFE in [0.3, 0.9]? If no → INVESTIGATE
7. Is parameter plateau width > 0.5? If no → REJECT
8. Is permutation test p < 0.05? If no → REJECT
```

### In BUILD_STRATEGY Phase 6 (Strategy Evaluation)

MANDATORY diagnostics before declaring a strategy validated:

```
Phase 6 MUST compute and document:
1. PBO (< 0.20 to pass)
2. DSR (> 0.80 to pass)
3. WFE (0.3-0.9 to pass)
4. Parameter sensitivity (plateau > 0.5 to pass)
5. Permutation test (p < 0.05 to pass)
6. Regime robustness (≥ 60% profitable to pass)

If ANY fails: strategy does NOT proceed to Phase 7.
Document failures in CONTEXT.md as "tried approach" with failure mode.
```

### In nr-quant-auditor

When performing VALIDATION_AUDIT or FULL_AUDIT:
```
Scan for:
- Number of parameter combinations tested (files, configs, scripts)
- Whether PBO/DSR was computed (search for function calls)
- Walk-forward vs expanding window usage
- Permutation test presence
- Parameter sensitivity analysis presence

Flag as WARNING if:
- >20 variants tested without PBO computation
- Reported Sharpe > E[max SR] for trial count
- No out-of-sample period documented
- WFE > 0.9 (leakage risk)
```
