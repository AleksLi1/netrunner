# Mandatory Backtest Audit Pipeline

## Purpose

This is the **single most important reference** in Netrunner's quant stack. Every backtest result — without exception — must pass through this pipeline before any decision is made. No deployment, no excitement, no "promising results" until this audit clears.

**Origin:** Every check in this pipeline exists because a specific, real failure was discovered in production or during post-mortem audit. These are not theoretical concerns — they are patterns that have destroyed strategies and wasted months of development.

## The Meta-Pattern This Pipeline Breaks

Without this pipeline, quant projects follow a destructive cycle:

```
BUILD complex strategy
  → BACKTEST shows great numbers
    → GET EXCITED, invest development effort
      → DEPLOY to production
        → PRODUCTION disappoints
          → AUDIT reveals backtest was flawed
            → DEFLATE, start over
              → REPEAT
```

**This pipeline breaks the cycle by moving the AUDIT step to BEFORE the excitement.** The audit runs immediately after every backtest, automatically, before any human sees the results.

## When This Pipeline Runs

| Trigger | Mandatory? | Notes |
|---------|-----------|-------|
| Any `backtest()` function produces results | YES | Automated gate |
| BUILD_STRATEGY Phase 4+ produces metrics | YES | Workflow gate |
| User reports "promising" backtest results | YES | Skepticism gate |
| Comparing strategy variants | YES | Selection bias gate |
| Before any paper trading deployment | YES | Pre-deployment gate |
| Before any capital deployment | YES | Final gate |

## The 8 Audit Checks

### Check 1: Overlapping Returns Detection

**The failure this prevents:** P&L inflated 60x from overlapping return windows. A strategy appearing to generate +170,000 bps was actually producing +2,800 bps because returns from overlapping time windows were counted multiple times.

**How it happens:**
```python
# WRONG — overlapping return computation
for i in range(len(signals)):
    if signals[i] == 1:  # Long signal
        # This window overlaps with the next signal's window
        pnl = prices[i + horizon] / prices[i] - 1
        total_pnl += pnl
# If signals fire every bar but horizon = 10 bars,
# each price move is counted up to 10 times!
```

**The audit check:**
```python
def check_overlapping_returns(trades_df):
    """
    Detect if trade returns overlap in time, inflating P&L.

    Args:
        trades_df: DataFrame with columns [entry_time, exit_time, return_bps]

    Returns:
        dict with:
          - has_overlap: bool
          - overlap_ratio: float (0 = no overlap, 1 = total overlap)
          - inflation_factor: float (how much P&L is inflated)
          - clean_pnl: float (P&L after removing overlaps)
    """
    trades = trades_df.sort_values('entry_time')

    overlap_count = 0
    overlap_bars = set()
    all_bars = set()

    for i, trade in trades.iterrows():
        trade_bars = set(range(
            int(trade['entry_time'].timestamp()),
            int(trade['exit_time'].timestamp())
        ))
        overlap = trade_bars & all_bars
        if overlap:
            overlap_count += 1
            overlap_bars |= overlap
        all_bars |= trade_bars

    total_bars = len(all_bars)
    overlap_ratio = len(overlap_bars) / total_bars if total_bars > 0 else 0

    # Estimate inflation factor
    if overlap_ratio > 0:
        avg_overlap_depth = len(all_bars) / (total_bars - len(overlap_bars) + 1)
        inflation_factor = avg_overlap_depth
    else:
        inflation_factor = 1.0

    return {
        'has_overlap': overlap_count > 0,
        'overlap_count': overlap_count,
        'overlap_ratio': overlap_ratio,
        'inflation_factor': inflation_factor,
        'total_trades': len(trades),
        'overlapping_trades': overlap_count,
    }
```

**Verdict:**
| Overlap Ratio | Verdict | Action |
|--------------|---------|--------|
| 0.0 | PASS | No overlap |
| 0.01 - 0.05 | WARNING | Minor overlap, check if intentional (portfolio rebalancing) |
| 0.05 - 0.20 | FAIL | Significant overlap inflating P&L — fix return calculation |
| > 0.20 | CRITICAL FAIL | Massive inflation — ALL reported metrics are invalid |

### Check 2: Normalization Integrity

**The failure this prevents:** A normalization bug that destroyed all directional signal during training. When features were z-scored using global mean/std BEFORE splitting, the normalized features summed to zero across the training set — meaning the model learned from pure noise.

**How it happens:**
```python
# WRONG — global z-scoring eliminates signal
mean = train_features.mean()
std = train_features.std()
train_features_z = (train_features - mean) / std
# Mathematical fact: sum((x_i - mean) / std) = 0 for the training set
# If labels correlate with feature magnitude, z-scoring destroys that correlation
```

**The audit check:**
```python
def check_normalization_integrity(features_raw, features_normalized, labels):
    """
    Verify that normalization preserves directional signal.

    Tests:
    1. Normalized features still correlate with labels
    2. Normalization was applied with causal (rolling/expanding) windows
    3. No global statistics leaked into train set

    Args:
        features_raw: Original features before normalization (DataFrame)
        features_normalized: After normalization (DataFrame)
        labels: Target labels (Series)

    Returns:
        dict with verdict and diagnostics
    """
    results = {}

    # Test 1: Signal preservation
    raw_corrs = features_raw.corrwith(labels).abs()
    norm_corrs = features_normalized.corrwith(labels).abs()

    signal_preserved = (norm_corrs >= raw_corrs * 0.5).mean()
    results['signal_preservation_ratio'] = signal_preserved

    # Test 2: Check if normalization uses expanding window (not global)
    # If the first N rows have identical stats, global norm was used
    first_100_std = features_normalized.iloc[:100].std()
    last_100_std = features_normalized.iloc[-100:].std()

    std_ratio = (first_100_std / last_100_std).mean()
    # Expanding window: early rows have higher variance (less data to normalize)
    # Global: both sections have std ≈ 1.0
    results['uses_expanding_window'] = std_ratio > 1.2 or std_ratio < 0.8
    results['std_ratio_early_vs_late'] = std_ratio

    # Test 3: Check that normalized train features don't sum to ~0
    train_sum = features_normalized.sum().abs()
    n_rows = len(features_normalized)
    expected_random_sum = np.sqrt(n_rows)  # Central limit theorem
    sum_ratio = train_sum / expected_random_sum

    # If sum ≈ 0 (ratio << 1), normalization zeroed out the signal
    results['sum_ratio'] = sum_ratio.mean()
    results['zero_sum_detected'] = (sum_ratio < 0.1).any()

    # Verdict
    if results['zero_sum_detected']:
        results['verdict'] = 'CRITICAL_FAIL'
        results['message'] = 'Normalization has zeroed out feature signal — all training is on noise'
    elif not results['uses_expanding_window']:
        results['verdict'] = 'FAIL'
        results['message'] = 'Global normalization detected — future information leaked into features'
    elif results['signal_preservation_ratio'] < 0.5:
        results['verdict'] = 'WARNING'
        results['message'] = f'Normalization degraded signal in {1 - signal_preserved:.0%} of features'
    else:
        results['verdict'] = 'PASS'
        results['message'] = 'Normalization preserves signal and uses causal windows'

    return results
```

### Check 3: Lookahead / Future Information Scan

**The failure this prevents:** Multiple instances of look-ahead bias: (a) cluster disagreement with look-ahead in all 3 simulation loops, (b) regime sizing using within-window lookahead for volatility terciles, (c) EMA model selection with look-ahead showing 0.65 vs honest 0.17.

**The audit check:**
```python
def scan_for_lookahead(code_path, data_timestamps=None):
    """
    Static + dynamic analysis for lookahead contamination.

    Static analysis patterns (grep for these):
    """
    STATIC_PATTERNS = [
        # Global statistics on full data
        (r'\.mean\(\)|\.std\(\)|\.median\(\)', 'Global statistic — check if computed before train/test split'),
        (r'fit_transform\(.*(?:X|features|df)', 'fit_transform on potentially full dataset'),
        (r'StandardScaler|MinMaxScaler|RobustScaler', 'Scaler — verify fitted on training only'),

        # Future indexing
        (r'\[i\s*\+\s*\d', 'Forward indexing — potential lookahead'),
        (r'shift\(-', 'Negative shift — pulls future data backward'),
        (r'\.iloc\[.*:', 'Slice indexing — check boundaries'),

        # Sorting/ranking on full data
        (r'\.rank\(\)|\.quantile\(|\.percentile', 'Ranking/quantile — check if cross-sectional only'),
        (r'pd\.qcut|pd\.cut', 'Binning — check if bins computed on train only'),

        # Centered operations
        (r'centered|center=True', 'Centered operation may use future data'),

        # Volatility/regime with full window
        (r'volatility.*tercile|regime.*window', 'Regime computation — check for within-window lookahead'),

        # CV that ignores time
        (r'KFold|StratifiedKFold|cross_val_score', 'Non-temporal CV — INVALID for time series'),
        (r'shuffle\s*=\s*True', 'Shuffled data — destroys temporal structure'),
        (r'train_test_split.*shuffle', 'Random split — not temporal'),
    ]

    # Dynamic analysis: correlation spike detection
    DYNAMIC_CHECKS = """
    For each feature:
    1. Compute IC (information coefficient) on train set
    2. Compute IC on test set
    3. If test_IC > 2 * train_IC → suspicious (test may contain leaked info)
    4. If any feature has IC > 0.10 → flag for manual review (unusually high)
    5. Compute IC with t+1 labels vs t+0 labels — should be similar. If t+0 >> t+1, feature leaks current-bar info.
    """

    return STATIC_PATTERNS, DYNAMIC_CHECKS
```

**Critical patterns from real failures:**

| Pattern | How It Looked | Honest Result |
|---------|--------------|---------------|
| Simulation loop lookahead | +2,381 bps backtest | +79 bps (30x inflation) |
| Regime sizing lookahead | "Optimal" tercile boundaries | Terciles used within-window future vol |
| EMA model selection | 0.65 accuracy | 0.17 accuracy (4x inflation) |
| Centered CVD features | 71.4% accuracy | Requires future data — not causal |
| Global normalization | "Clean" features | sum = 0, no signal |

### Check 4: Transaction Cost Verification

**The failure this prevents:** 19 intraday strategies that were all dead at 3.5 bps one-way / 7 bps round-trip cost floor. Strategies showing positive P&L at zero or flat costs became negative when realistic costs were applied.

**The audit check:**
```python
def verify_transaction_costs(backtest_results, asset_class='crypto_perps'):
    """
    Verify that transaction costs in the backtest are realistic.

    Args:
        backtest_results: dict with keys:
            - cost_assumption_bps: float (what the backtest used)
            - avg_trade_pnl_bps: float (average PnL per trade before costs)
            - trades_per_day: float
            - avg_hold_time_hours: float
        asset_class: str for cost benchmark lookup

    Returns:
        dict with verdict and cost analysis
    """
    COST_BENCHMARKS = {
        'crypto_perps': {
            'testnet_rt_bps': 7.0,      # Testnet: maker 2 + taker 5
            'mainnet_vip0_rt_bps': 4.7,  # Mainnet VIP0 + BNB discount
            'mainnet_vip1_rt_bps': 3.6,  # Mainnet VIP1
            'spread_bps': 1.0,           # Typical spread
            'slippage_bps': 1.0,         # Typical slippage
            'realistic_minimum_rt_bps': 5.0,  # Conservative minimum
        },
        'crypto_spot': {
            'realistic_minimum_rt_bps': 8.0,
        },
        'us_equity_large': {
            'realistic_minimum_rt_bps': 4.0,
        },
        'us_equity_small': {
            'realistic_minimum_rt_bps': 20.0,
        },
        'fx_major': {
            'realistic_minimum_rt_bps': 2.0,
        },
        'futures': {
            'realistic_minimum_rt_bps': 3.0,
        },
    }

    benchmark = COST_BENCHMARKS.get(asset_class, COST_BENCHMARKS['crypto_perps'])
    min_realistic_cost = benchmark['realistic_minimum_rt_bps']

    results = {}
    results['assumed_cost_bps'] = backtest_results['cost_assumption_bps']
    results['benchmark_minimum_bps'] = min_realistic_cost

    # Check 1: Is cost assumption realistic?
    cost_ratio = backtest_results['cost_assumption_bps'] / min_realistic_cost
    results['cost_ratio'] = cost_ratio

    if cost_ratio < 0.5:
        results['cost_verdict'] = 'CRITICAL_FAIL'
        results['cost_message'] = f'Cost assumption ({backtest_results["cost_assumption_bps"]:.1f} bps) is less than half the realistic minimum ({min_realistic_cost:.1f} bps)'
    elif cost_ratio < 0.8:
        results['cost_verdict'] = 'WARNING'
        results['cost_message'] = f'Cost assumption is optimistic — consider using {min_realistic_cost:.1f} bps'
    else:
        results['cost_verdict'] = 'PASS'

    # Check 2: Cost/edge ratio (the kill zone check)
    avg_pnl = backtest_results['avg_trade_pnl_bps']
    if avg_pnl > 0:
        cost_edge_ratio = min_realistic_cost / avg_pnl
        results['cost_edge_ratio'] = cost_edge_ratio

        if cost_edge_ratio > 1.0:
            results['edge_verdict'] = 'DEAD'
            results['edge_message'] = f'Edge ({avg_pnl:.1f} bps) < costs ({min_realistic_cost:.1f} bps) — strategy is UNPROFITABLE'
        elif cost_edge_ratio > 0.7:
            results['edge_verdict'] = 'DANGER'
            results['edge_message'] = f'Costs consume {cost_edge_ratio:.0%} of edge — extremely fragile'
        elif cost_edge_ratio > 0.5:
            results['edge_verdict'] = 'TIGHT'
            results['edge_message'] = f'Costs consume {cost_edge_ratio:.0%} of edge — viable but tight'
        else:
            results['edge_verdict'] = 'HEALTHY'
            results['edge_message'] = f'Costs consume {cost_edge_ratio:.0%} of edge — reasonable margin'
    else:
        results['edge_verdict'] = 'NEGATIVE'
        results['edge_message'] = 'Average trade P&L is negative BEFORE costs'

    # Check 3: Frequency vs cost check (the dead zone)
    hold_time = backtest_results.get('avg_hold_time_hours', 24)
    if hold_time < 4 and min_realistic_cost > 5:
        results['frequency_verdict'] = 'DEAD_ZONE'
        results['frequency_message'] = (
            f'Strategy trades intraday (hold {hold_time:.1f}h) with {min_realistic_cost:.1f} bps costs. '
            f'The dead zone between HFT (<1s) and daily+ holds is real. '
            f'Only strategies with >10 bps edge per trade survive here.'
        )

    # Overall verdict
    verdicts = [results.get('cost_verdict', 'PASS'),
                results.get('edge_verdict', 'PASS'),
                results.get('frequency_verdict', 'PASS')]

    if 'DEAD' in verdicts or 'CRITICAL_FAIL' in verdicts or 'DEAD_ZONE' in verdicts:
        results['overall'] = 'FAIL'
    elif 'WARNING' in verdicts or 'DANGER' in verdicts:
        results['overall'] = 'WARNING'
    else:
        results['overall'] = 'PASS'

    return results
```

**The Dead Zone Rule:**
```
Sub-second (HFT)     → Viable (rebate capture, latency edge)
  |
  |  DEAD ZONE: 1s → 4h hold time at > 5 bps costs
  |  Almost nothing survives here with retail costs
  |
4h+ (swing/position) → Viable (edge has time to compound)
  |
Daily+ (trend)       → Most viable for retail (low frequency = low cost drag)
```

### Check 5: Deflated Sharpe Ratio Calculation

**The failure this prevents:** Testing 88+ hypotheses on the same data, achieving a Sharpe of 2.13, but the Deflated Sharpe Ratio was only 6.8% — meaning there's only a 6.8% chance the result represents genuine skill. The expected maximum Sharpe among 65 zero-alpha strategies was 2.37 — HIGHER than observed.

**The audit check:**
```python
def mandatory_dsr_check(observed_sharpe, n_hypotheses_tested, n_observations,
                        skewness=0, kurtosis=3):
    """
    MANDATORY check after any strategy selection process.

    Args:
        observed_sharpe: Best Sharpe found (annualized)
        n_hypotheses_tested: Total number of configurations/strategies tested
            INCLUDING: threshold variants, parameter sweeps, feature subsets,
            model architectures, ensemble combinations, time-of-day filters,
            regime filters, sizing variants, etc.
            BE HONEST about this number. Undercounting is self-deception.
        n_observations: Number of return observations (daily returns = trading days)
        skewness: Return distribution skewness
        kurtosis: Return distribution kurtosis

    Returns:
        dict with DSR probability and actionable interpretation
    """
    from scipy.stats import norm
    import numpy as np

    # Expected maximum Sharpe under null (all strategies have SR=0)
    euler_mascheroni = 0.5772156649
    sr_std = 1.0  # Assumed cross-strategy SR std

    e_max_sr = sr_std * (
        (1 - euler_mascheroni) * norm.ppf(1 - 1/n_hypotheses_tested) +
        euler_mascheroni * norm.ppf(1 - 1/(n_hypotheses_tested * np.e))
    )

    # SE of Sharpe ratio
    sr_se = np.sqrt(
        (1 + 0.5 * observed_sharpe**2 - skewness * observed_sharpe +
         (kurtosis - 3) / 4 * observed_sharpe**2) / (n_observations - 1)
    )

    # DSR
    z = (observed_sharpe - e_max_sr) / sr_se if sr_se > 0 else 0
    dsr = norm.cdf(z)

    # Minimum backtest length
    if observed_sharpe > e_max_sr:
        correction = 1 + 0.5 * observed_sharpe**2
        z_95 = norm.ppf(0.95)
        min_T = int(np.ceil(correction * (z_95 / (observed_sharpe - e_max_sr))**2))
    else:
        min_T = float('inf')

    results = {
        'observed_sharpe': observed_sharpe,
        'n_hypotheses': n_hypotheses_tested,
        'n_observations': n_observations,
        'expected_max_sharpe_null': e_max_sr,
        'dsr_probability': dsr,
        'minimum_backtest_length': min_T,
        'has_enough_data': n_observations >= min_T if min_T != float('inf') else False,
    }

    # Interpretation
    if dsr < 0.05:
        results['verdict'] = 'ALMOST_CERTAINLY_OVERFIT'
        results['message'] = (
            f'DSR = {dsr:.1%}. Expected max Sharpe from {n_hypotheses_tested} '
            f'zero-alpha trials = {e_max_sr:.2f}, which EXCEEDS your observed '
            f'{observed_sharpe:.2f}. This result is noise.'
        )
    elif dsr < 0.50:
        results['verdict'] = 'LIKELY_OVERFIT'
        results['message'] = (
            f'DSR = {dsr:.1%}. Probably not a real edge. '
            f'Need {min_T} observations for significance, have {n_observations}.'
        )
    elif dsr < 0.80:
        results['verdict'] = 'UNCERTAIN'
        results['message'] = (
            f'DSR = {dsr:.1%}. Cannot confirm or deny edge. '
            f'Need {min_T} observations, have {n_observations}. Extend test period.'
        )
    elif dsr < 0.95:
        results['verdict'] = 'POSSIBLY_REAL'
        results['message'] = (
            f'DSR = {dsr:.1%}. Edge may be real but confidence is moderate. '
            f'Paper trade before deploying capital.'
        )
    else:
        results['verdict'] = 'LIKELY_REAL'
        results['message'] = (
            f'DSR = {dsr:.1%}. Strong evidence of genuine edge. '
            f'Proceed with paper trading validation.'
        )

    return results
```

**Honesty rules for counting N (hypotheses tested):**
```
Count ALL of these toward N:
  - Each parameter combination tested
  - Each model architecture tried
  - Each feature subset evaluated
  - Each threshold variant (e.g., agreement thresholds 70%, 75%, 80%, 85%)
  - Each time-of-day filter tried
  - Each regime filter tried
  - Each position sizing variant
  - Each stop-loss / take-profit variant
  - Each lookback period tried
  - Each ensemble combination tested

Real example:
  8 architectures × 4 resolutions × 3 agreement thresholds ×
  4 session filters × 3 sizing variants = 1,152 implicit hypotheses

  Even if you only "formally" tested 88, the total search space matters.
  Use the LARGER number. Self-deception here is expensive.
```

### Check 6: Temporal Cross-Validation Verification

**The failure this prevents:** XGBoost stacking that showed 0.74 accuracy with shuffled CV but collapsed to random under temporal CV — 100% of the apparent skill was from data leakage through shuffled folds.

**The audit check:**
```python
def verify_temporal_cv(model, X, y, timestamps):
    """
    Compare shuffled CV (wrong) to temporal CV (correct) to detect leakage.

    If shuffled CV >> temporal CV, the model is memorizing temporal patterns
    that cross fold boundaries, not learning generalizable features.

    Args:
        model: Fitted model with .predict() method
        X, y: Features and labels
        timestamps: Datetime index

    Returns:
        dict with leakage detection results
    """
    from sklearn.model_selection import KFold, TimeSeriesSplit

    # Method 1: Shuffled K-Fold (WRONG for time series, but diagnostic)
    kf = KFold(n_splits=5, shuffle=True, random_state=42)
    shuffled_scores = []
    for train_idx, test_idx in kf.split(X):
        model.fit(X[train_idx], y[train_idx])
        score = model.score(X[test_idx], y[test_idx])
        shuffled_scores.append(score)
    shuffled_mean = np.mean(shuffled_scores)

    # Method 2: Temporal split (CORRECT)
    tscv = TimeSeriesSplit(n_splits=5)
    temporal_scores = []
    for train_idx, test_idx in tscv.split(X):
        model.fit(X[train_idx], y[train_idx])
        score = model.score(X[test_idx], y[test_idx])
        temporal_scores.append(score)
    temporal_mean = np.mean(temporal_scores)

    # Method 3: Purged temporal split (MOST CORRECT)
    # Add purge gap between train and test
    purged_scores = []
    purge_gap = max(60, int(len(X) * 0.02))  # 2% or 60 bars minimum
    for train_idx, test_idx in tscv.split(X):
        # Remove last purge_gap bars from training
        train_idx_purged = train_idx[:-purge_gap] if len(train_idx) > purge_gap else train_idx[:1]
        model.fit(X[train_idx_purged], y[train_idx_purged])
        score = model.score(X[test_idx], y[test_idx])
        purged_scores.append(score)
    purged_mean = np.mean(purged_scores)

    results = {
        'shuffled_cv_score': shuffled_mean,
        'temporal_cv_score': temporal_mean,
        'purged_cv_score': purged_mean,
        'leakage_ratio': shuffled_mean / max(temporal_mean, 0.001),
    }

    # Detect leakage
    if results['leakage_ratio'] > 2.0:
        results['verdict'] = 'CRITICAL_LEAKAGE'
        results['message'] = (
            f'Shuffled CV ({shuffled_mean:.3f}) is {results["leakage_ratio"]:.1f}x better '
            f'than temporal CV ({temporal_mean:.3f}). Model skill is 100% leakage.'
        )
    elif results['leakage_ratio'] > 1.3:
        results['verdict'] = 'MODERATE_LEAKAGE'
        results['message'] = (
            f'Shuffled CV ({shuffled_mean:.3f}) is {results["leakage_ratio"]:.1f}x better '
            f'than temporal CV ({temporal_mean:.3f}). Significant temporal leakage present.'
        )
    elif temporal_mean <= 0.52:  # Near-random for binary classification
        results['verdict'] = 'NO_EDGE'
        results['message'] = (
            f'Temporal CV score ({temporal_mean:.3f}) is near-random. '
            f'No genuine predictive signal detected.'
        )
    else:
        results['verdict'] = 'PASS'
        results['message'] = f'Temporal CV ({temporal_mean:.3f}) consistent with shuffled ({shuffled_mean:.3f})'

    return results
```

### Check 7: Complexity-Edge Proportionality

**The failure this prevents:** Building a Rube Goldberg machine (42 models, 8 architectures, 4 resolutions, rolling conviction, conformal inference, SPRT validation, session sizing, drawdown limits, circuit breakers, dual allocator, regime detection) around models that predict at 50.9%. The complexity creates more parameters to overfit, more things to break, and a false sense of sophistication.

**The audit check:**
```python
def check_complexity_proportionality(strategy_description):
    """
    Score strategy complexity relative to demonstrated edge.

    Principle: Complexity must be JUSTIFIED by proportional improvement.
    Adding a layer that doesn't measurably improve OOS performance
    is adding fragility without benefit.

    Returns:
        dict with complexity analysis
    """
    COMPLEXITY_COMPONENTS = {
        # Component: (complexity_cost, minimum_edge_to_justify_bps)
        'single_model': (1, 0),        # Baseline, free
        'ensemble_2_3': (2, 5),         # Marginal: ensemble must add 5 bps
        'ensemble_10plus': (5, 15),     # Large ensemble: must add 15 bps
        'ensemble_40plus': (10, 30),    # Massive: must add 30 bps
        'feature_engineering': (2, 5),  # Custom features must add 5 bps
        'regime_detection': (3, 10),    # Regime overlay must add 10 bps
        'adaptive_sizing': (2, 5),      # Dynamic sizing must add 5 bps
        'multi_timeframe': (3, 10),     # MTF must add 10 bps
        'conformal_inference': (3, 10), # Statistical layer must add 10 bps
        'meta_learning': (5, 20),       # Meta-learner must add 20 bps
        'rl_component': (5, 20),        # RL must add 20 bps
    }

    # For each component, ask:
    # 1. What is the OOS improvement from adding this component?
    # 2. Is the improvement > the justification threshold?
    # 3. Was the improvement tested with the component ON vs OFF?

    # The key question:
    QUESTIONS = [
        "What is the simplest version of this strategy that works?",
        "What does each additional component contribute in OOS bps?",
        "Has each component been tested via ablation (with vs without)?",
        "If a component improves IS but not OOS, it's overfitting — remove it.",
        "Would a simple trend-following strategy outperform this after costs?",
    ]

    return {
        'components': COMPLEXITY_COMPONENTS,
        'questions': QUESTIONS,
        'rule': 'If the simplest version (trend MA) has similar OOS performance '
                'to the complex version, USE THE SIMPLE VERSION.'
    }
```

**The Simplicity Test:**
```
For any strategy S with complexity C:

1. Define S_simple = simplest possible version (single indicator, fixed sizing)
2. Backtest S_simple with same data, same costs, same OOS period
3. Compare: OOS_Sharpe(S) vs OOS_Sharpe(S_simple)

If OOS_Sharpe(S) < 1.5 * OOS_Sharpe(S_simple):
  → The complexity is NOT justified
  → Use S_simple
  → Every additional component must pass an ablation test

Real example:
  Complex (42 models + conviction + conformal + regime): OOS Sharpe ≈ 0.4
  Simple (MA 80/200 crossover + entropy sizing): OOS Sharpe ≈ 1.2
  → Simple wins. The complexity actively HURT performance.
```

### Check 8: Sample Size and Statistical Power

**The failure this prevents:** Agreement filtering that showed 63-73% accuracy at high agreement thresholds, but was based on only 66-131 trades per evaluation window — far too few for statistical significance. The result was temporally unstable (T2 collapsed to 53%).

**The audit check:**
```python
def check_sample_size(n_trades, claimed_accuracy, base_rate=0.50):
    """
    Check if the sample size is sufficient for the claimed accuracy.

    For binary prediction (direction), the minimum sample size to detect
    a given accuracy improvement depends on effect size and desired power.

    Args:
        n_trades: Number of trades in evaluation
        claimed_accuracy: The reported accuracy (e.g., 0.63)
        base_rate: Expected accuracy under null (0.50 for coin flip)

    Returns:
        dict with power analysis and sample adequacy
    """
    from scipy.stats import norm

    effect_size = claimed_accuracy - base_rate

    # Required sample size for 80% power at alpha=0.05
    z_alpha = norm.ppf(0.975)  # Two-tailed
    z_beta = norm.ppf(0.80)    # 80% power

    p_bar = (claimed_accuracy + base_rate) / 2
    required_n = int(np.ceil(
        ((z_alpha * np.sqrt(2 * p_bar * (1 - p_bar)) +
          z_beta * np.sqrt(claimed_accuracy * (1 - claimed_accuracy) +
                           base_rate * (1 - base_rate))) /
         effect_size) ** 2
    ))

    # Actual achieved power
    se = np.sqrt(base_rate * (1 - base_rate) / n_trades)
    z_achieved = (effect_size - z_alpha * se) / se
    achieved_power = norm.cdf(z_achieved)

    # Confidence interval on the accuracy
    se_acc = np.sqrt(claimed_accuracy * (1 - claimed_accuracy) / n_trades)
    ci_lower = claimed_accuracy - 1.96 * se_acc
    ci_upper = claimed_accuracy + 1.96 * se_acc

    results = {
        'n_trades': n_trades,
        'claimed_accuracy': claimed_accuracy,
        'required_n_80pct_power': required_n,
        'achieved_power': achieved_power,
        'confidence_interval': (ci_lower, ci_upper),
        'ci_includes_random': ci_lower <= base_rate,
    }

    if n_trades < required_n * 0.3:
        results['verdict'] = 'CRITICALLY_UNDERPOWERED'
        results['message'] = (
            f'Need {required_n} trades for 80% power, have only {n_trades} '
            f'({n_trades/required_n:.0%}). Result is NOT statistically meaningful.'
        )
    elif n_trades < required_n:
        results['verdict'] = 'UNDERPOWERED'
        results['message'] = (
            f'Need {required_n} trades, have {n_trades}. Power = {achieved_power:.0%}. '
            f'Result may be noise.'
        )
    elif results['ci_includes_random']:
        results['verdict'] = 'CI_INCLUDES_RANDOM'
        results['message'] = (
            f'95% CI [{ci_lower:.1%}, {ci_upper:.1%}] includes random ({base_rate:.0%}). '
            f'Cannot reject null hypothesis.'
        )
    else:
        results['verdict'] = 'ADEQUATE'
        results['message'] = (
            f'Power = {achieved_power:.0%}, CI [{ci_lower:.1%}, {ci_upper:.1%}]. '
            f'Result is statistically meaningful.'
        )

    return results
```

**Minimum trade counts for common accuracy claims:**

| Claimed Accuracy | Effect vs 50% | Min Trades (80% power) | Min Trades (95% power) |
|-----------------|---------------|----------------------|----------------------|
| 52% | 2% | 4,900 | 6,700 |
| 55% | 5% | 784 | 1,070 |
| 58% | 8% | 306 | 418 |
| 60% | 10% | 196 | 268 |
| 63% | 13% | 116 | 158 |
| 65% | 15% | 87 | 119 |
| 70% | 20% | 49 | 67 |

**If you have < 100 trades, you CANNOT reliably distinguish 55% accuracy from 50%.** Period.

## The Full Pipeline Runner

```python
def run_backtest_audit_pipeline(backtest_results, code_path=None, asset_class='crypto_perps'):
    """
    Run the full 8-check audit pipeline on a backtest result.

    This is the MANDATORY gate before any human sees the results.

    Args:
        backtest_results: dict with standardized backtest output
        code_path: Optional path to strategy code for static analysis
        asset_class: For cost benchmarks

    Returns:
        AuditReport with overall verdict and per-check details
    """
    checks = {}

    # Check 1: Overlapping returns
    if 'trades' in backtest_results:
        checks['overlap'] = check_overlapping_returns(backtest_results['trades'])

    # Check 2: Normalization (if raw + normalized features available)
    if 'features_raw' in backtest_results and 'features_normalized' in backtest_results:
        checks['normalization'] = check_normalization_integrity(
            backtest_results['features_raw'],
            backtest_results['features_normalized'],
            backtest_results['labels']
        )

    # Check 3: Lookahead scan (static analysis on code)
    if code_path:
        checks['lookahead'] = scan_for_lookahead(code_path)

    # Check 4: Transaction costs
    checks['costs'] = verify_transaction_costs(backtest_results, asset_class)

    # Check 5: DSR
    if 'n_hypotheses' in backtest_results:
        checks['dsr'] = mandatory_dsr_check(
            backtest_results['sharpe'],
            backtest_results['n_hypotheses'],
            backtest_results['n_observations'],
            backtest_results.get('skewness', 0),
            backtest_results.get('kurtosis', 3),
        )

    # Check 6: Temporal CV verification
    if 'model' in backtest_results and 'features' in backtest_results:
        checks['temporal_cv'] = verify_temporal_cv(
            backtest_results['model'],
            backtest_results['features'],
            backtest_results['labels'],
            backtest_results['timestamps']
        )

    # Check 7: Complexity proportionality
    if 'complexity_description' in backtest_results:
        checks['complexity'] = check_complexity_proportionality(
            backtest_results['complexity_description']
        )

    # Check 8: Sample size
    if 'n_trades' in backtest_results and 'accuracy' in backtest_results:
        checks['sample_size'] = check_sample_size(
            backtest_results['n_trades'],
            backtest_results['accuracy']
        )

    # Overall verdict
    verdicts = [c.get('verdict', 'PASS') for c in checks.values() if isinstance(c, dict)]

    critical_fails = [v for v in verdicts if 'CRITICAL' in v or v == 'DEAD' or v == 'ALMOST_CERTAINLY_OVERFIT']
    fails = [v for v in verdicts if 'FAIL' in v or v == 'LIKELY_OVERFIT' or v == 'CRITICAL_LEAKAGE']
    warnings = [v for v in verdicts if 'WARNING' in v or v == 'DANGER' or v == 'UNCERTAIN']

    if critical_fails:
        overall = 'REJECT'
        message = f'{len(critical_fails)} critical failure(s). DO NOT proceed. Fix issues first.'
    elif fails:
        overall = 'FAIL'
        message = f'{len(fails)} failure(s). Address before considering deployment.'
    elif warnings:
        overall = 'CONDITIONAL_PASS'
        message = f'{len(warnings)} warning(s). Proceed with extra caution.'
    else:
        overall = 'PASS'
        message = 'All checks passed. Proceed to paper trading validation.'

    return {
        'overall_verdict': overall,
        'overall_message': message,
        'checks': checks,
        'critical_count': len(critical_fails),
        'fail_count': len(fails),
        'warning_count': len(warnings),
    }
```

## Integration with Netrunner

### In BUILD_STRATEGY Workflow

The backtest audit pipeline runs automatically at these gates:

| Phase | When Pipeline Runs | What It Checks |
|-------|-------------------|----------------|
| Phase 3 (Feature Engineering) | After feature computation | Checks 2, 3 (normalization, lookahead) |
| Phase 4 (Validation Framework) | After validation setup | Checks 5, 6 (DSR, temporal CV) |
| Phase 5 (Model Development) | After model training | All 8 checks |
| Phase 6 (Strategy Evaluation) | After full backtest | All 8 checks (strictest thresholds) |
| Phase 7 (Production Readiness) | Final gate | All 8 checks + production checklist |

### In nr-quant-auditor BACKTEST_AUDIT Mode

New audit mode that runs the full pipeline on any backtest code:
```
BACKTEST_AUDIT:
  1. Locate backtest code and results
  2. Run all 8 checks from this pipeline
  3. Score: 0-100 based on check verdicts
  4. Output: Detailed report with specific fix recommendations
  5. Gate: Score < 60 → BLOCK deployment
```

### In nr-verifier (Quant Projects)

The verifier MUST run checks 1, 3, 4, 5 on any phase that produces backtest metrics. A phase cannot pass verification if the backtest audit fails.

### In Brain Assessment (Pre-Action Gate)

When the brain assesses a quant action that involves backtest interpretation:
```
BRAIN PRE-GENERATION GATE (Quant):
  Before accepting any "promising" backtest result:
  1. Has the backtest audit pipeline been run? If not → RUN IT FIRST
  2. Did all 8 checks pass? If not → the result is INVALID until fixed
  3. Was the result honest about N (hypotheses tested)? If not → INFLATE N and recheck DSR
```

## The 52% Ceiling Rule

**For BTC intraday prediction using OHLCV features:**

This has been established through 26+ experiments across 8 architectures:
- Glosten-Milgrom competitive equilibrium → market makers price in public OHLCV information
- Permutation entropy > 0.90 for 96% of hours → near-Brownian
- Features that achieve > 52% accuracy are ALMOST CERTAINLY leaking future information

**Hard constraint:** Do NOT build strategies that depend on beating 52% with OHLCV features at intraday frequencies. This is a physics ceiling, not a bug. Leaked features (centered CVD, global normalization) reached 71.4% — but they required future data.

**What works instead:**
- Trend-following on daily+ timeframes (momentum IS a real, structural factor)
- Alternative data (order flow, sentiment, on-chain) may provide edge OHLCV cannot
- Cross-asset signals (correlation, relative value)
- Execution quality optimization (reducing costs, not predicting direction)

## Report Template

When the pipeline runs, output in this format:

```markdown
## Backtest Audit Report

### Summary
- **Overall Verdict**: [PASS / CONDITIONAL_PASS / FAIL / REJECT]
- **Checks Run**: [N]/8
- **Critical Failures**: [count]
- **Warnings**: [count]

### Check Results

| # | Check | Verdict | Key Finding |
|---|-------|---------|-------------|
| 1 | Overlapping Returns | [verdict] | [one-line finding] |
| 2 | Normalization | [verdict] | [one-line finding] |
| 3 | Lookahead Scan | [verdict] | [one-line finding] |
| 4 | Transaction Costs | [verdict] | [one-line finding] |
| 5 | Deflated Sharpe | [verdict] | DSR = [X]%, E[max SR] = [Y] |
| 6 | Temporal CV | [verdict] | Shuffled: [X], Temporal: [Y] |
| 7 | Complexity Check | [verdict] | [one-line finding] |
| 8 | Sample Size | [verdict] | Power = [X]%, Need [N] trades |

### Action Items
1. [Required fix for each non-PASS check]

### Honest Numbers
- Claimed Sharpe: [X] → After DSR correction: [Y]
- Claimed accuracy: [X]% → 95% CI: [[lower]%, [upper]%]
- Claimed P&L: [X] bps → After cost correction: [Y] bps
- Complexity: [N] components → Simplest viable: [description]
```
