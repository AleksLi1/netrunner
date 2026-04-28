# Live Strategy Drift Detection

## Purpose

This reference provides the complete framework for detecting when a deployed trading strategy diverges from its backtested behavior. It covers what to monitor, how to compute it, when to alert, and when to kill.

The core insight: **Every strategy drifts. The question is not "if" but "how fast" and "which kind."** A strategy without drift monitoring is a strategy with an unknown expiration date. You will discover it has expired when the drawdown becomes unrecoverable.

## 1. What Is Strategy Drift?

Strategy drift is the measurable divergence between a strategy's live behavior and its backtested expectations. It manifests in three distinct types, each requiring different responses.

### Type 1: Alpha Decay

The signal loses predictive power. The market has adapted, the edge has been arbitraged, or the information source has degraded.

**Characteristics:** Gradual, steady performance decline. Rolling Sharpe trends downward. IC decays. Hit rate regresses toward 50%. The model still "works" — it just works less well every month.

**Typical timeline:** Months to years. High-frequency alpha decays faster (days to weeks). Fundamental alpha decays slower (years).

**Response:** Retrain with expanded window, investigate feature decay, develop new signals. This is the expected lifecycle of any alpha source.

### Type 2: Regime Shift

The market structure changes. Volatility regime shifts, correlation structure breaks, or liquidity conditions fundamentally alter. The strategy was designed for a world that no longer exists.

**Characteristics:** Sudden or stepwise performance change. Return distribution shifts. Features that were predictive become uncorrelated or inversely correlated. Often coincides with macro events, regulation changes, or market structure evolution.

**Typical timeline:** Days to weeks for the shift itself. May be permanent.

**Response:** Check if the strategy was designed for this regime. If regime-conditional, wait for reversion. If not, the strategy may be structurally broken.

### Type 3: Execution Drift

The strategy logic is intact but execution quality has degraded. Fills are worse, slippage is higher, latency has increased, or costs have risen.

**Characteristics:** Signal quality metrics (IC, hit rate) remain stable but P&L diverges from expected trajectory. The gap between expected and realized fills widens. Transaction cost basis drifts upward.

**Typical timeline:** Can be gradual (exchange fee changes, growing AUM) or sudden (infrastructure issues, venue changes).

**Response:** Fix execution, not the model. Audit fill quality, check infrastructure, review venue routing. The alpha is still there — you are just failing to capture it.

## 2. Rolling Monitoring Metrics

Each metric includes: formula, window recommendations, alert thresholds, and Python implementation. All implementations are designed for a `DriftMonitor` class (Section 5).

### 2.1 Performance Drift

#### Rolling Sharpe Ratio

```python
def rolling_sharpe(returns: pd.Series, window: int = 60, annualize: int = 252) -> pd.Series:
    """
    Rolling annualized Sharpe ratio.

    Windows: 30d (noisy but fast), 60d (default), 90d (stable but lagged).
    Alert: When 60d Sharpe falls below 50% of backtest Sharpe for 5+ consecutive days.
    """
    rolling_mean = returns.rolling(window).mean()
    rolling_std = returns.rolling(window).std(ddof=1)
    return (rolling_mean / rolling_std) * np.sqrt(annualize)


def sharpe_confidence_band(returns: pd.Series, window: int = 60,
                           confidence: float = 0.95) -> tuple[pd.Series, pd.Series]:
    """
    Confidence band around rolling Sharpe using Lo (2002) standard error.

    SE(Sharpe) = sqrt((1 + 0.5 * SR^2) / T)
    If the backtest Sharpe falls outside this band, drift is statistically significant.
    """
    sr = rolling_sharpe(returns, window)
    z = scipy.stats.norm.ppf((1 + confidence) / 2)
    se = np.sqrt((1 + 0.5 * sr ** 2) / window)
    return sr - z * se, sr + z * se
```

#### Rolling Hit Rate with Binomial Confidence Intervals

```python
def rolling_hit_rate(returns: pd.Series, window: int = 60) -> pd.Series:
    """Rolling proportion of positive-return periods."""
    wins = (returns > 0).astype(float)
    return wins.rolling(window).mean()


def hit_rate_confidence_interval(hit_rate: float, n: int,
                                 confidence: float = 0.95) -> tuple[float, float]:
    """
    Wilson score interval for binomial proportion.
    More accurate than normal approximation when hit_rate is near 0 or 1.

    Alert: When observed hit rate falls below the lower bound computed
    from the backtest hit rate at 95% confidence.
    """
    z = scipy.stats.norm.ppf((1 + confidence) / 2)
    denominator = 1 + z ** 2 / n
    center = (hit_rate + z ** 2 / (2 * n)) / denominator
    spread = z * np.sqrt((hit_rate * (1 - hit_rate) + z ** 2 / (4 * n)) / n) / denominator
    return center - spread, center + spread
```

#### Rolling Profit Factor and Win/Loss Ratio

```python
def rolling_profit_factor(returns: pd.Series, window: int = 60) -> pd.Series:
    """
    Sum of wins / abs(sum of losses) over rolling window.

    Healthy: > 1.2. Warning: < 1.0 for 10+ days. Critical: < 0.8.
    """
    wins = returns.clip(lower=0).rolling(window).sum()
    losses = returns.clip(upper=0).abs().rolling(window).sum()
    return wins / losses.replace(0, np.nan)


def rolling_win_loss_ratio(returns: pd.Series, window: int = 60) -> pd.Series:
    """
    Average win size / average loss size over rolling window.

    Tracks whether the strategy's payoff asymmetry is degrading.
    A strategy designed for 2:1 payoff that drifts to 1:1 is failing even
    if the hit rate holds.
    """
    wins = returns[returns > 0]
    losses = returns[returns < 0].abs()
    avg_win = returns.clip(lower=0).replace(0, np.nan).rolling(window).mean()
    avg_loss = returns.clip(upper=0).abs().replace(0, np.nan).rolling(window).mean()
    return avg_win / avg_loss.replace(0, np.nan)
```

#### Cumulative P&L vs Expected Trajectory

```python
def pnl_trajectory_check(live_cumulative: pd.Series, backtest_daily_mean: float,
                          backtest_daily_std: float,
                          tolerance_sigma: float = 2.0) -> pd.DataFrame:
    """
    Compare cumulative live P&L against expected trajectory with tolerance band.

    Expected trajectory: backtest_daily_mean * t
    Tolerance band: +/- tolerance_sigma * backtest_daily_std * sqrt(t)

    Alert: When live cumulative P&L exits the tolerance band for 5+ consecutive days.
    This uses diffusion scaling (sqrt(t)) — wider bands over longer horizons,
    as random variation accumulates.
    """
    t = np.arange(1, len(live_cumulative) + 1)
    expected = backtest_daily_mean * t
    band_width = tolerance_sigma * backtest_daily_std * np.sqrt(t)

    result = pd.DataFrame({
        'live': live_cumulative.values,
        'expected': expected,
        'upper': expected + band_width,
        'lower': expected - band_width,
    }, index=live_cumulative.index)
    result['breach'] = (result['live'] < result['lower']) | (result['live'] > result['upper'])
    return result
```

### 2.2 Statistical Distribution Drift

#### Kolmogorov-Smirnov Test on Return Distributions

```python
def rolling_ks_test(live_returns: pd.Series, backtest_returns: pd.Series,
                    window: int = 60) -> pd.DataFrame:
    """
    Rolling KS test comparing live return distribution to backtest baseline.

    The KS statistic measures the maximum distance between two empirical CDFs.
    Large values indicate the distributions have diverged.

    Alert thresholds:
      WATCH:    p-value < 0.10
      WARNING:  p-value < 0.05
      CRITICAL: p-value < 0.01

    Window: 60d is the minimum for meaningful KS tests. 90d is more stable.
    """
    results = []
    for i in range(window, len(live_returns)):
        live_window = live_returns.iloc[i - window:i].values
        stat, pvalue = scipy.stats.ks_2samp(live_window, backtest_returns.values)
        results.append({'date': live_returns.index[i], 'ks_stat': stat, 'p_value': pvalue})
    return pd.DataFrame(results).set_index('date')
```

#### Population Stability Index (PSI)

```python
def compute_psi(expected: np.ndarray, actual: np.ndarray, n_bins: int = 10) -> float:
    """
    Population Stability Index for detecting distribution shift in features.

    PSI = sum((actual_pct - expected_pct) * ln(actual_pct / expected_pct))

    Interpretation:
      PSI < 0.10: No significant shift.
      PSI 0.10-0.25: Moderate shift — investigate.
      PSI > 0.25: Major shift — feature may be broken.

    Apply to each feature independently. Multiple features shifting simultaneously
    is a stronger signal than a single feature.
    """
    # Use quantile-based bins from expected distribution for stability
    breakpoints = np.percentile(expected, np.linspace(0, 100, n_bins + 1))
    breakpoints[0] = -np.inf
    breakpoints[-1] = np.inf

    expected_counts = np.histogram(expected, bins=breakpoints)[0]
    actual_counts = np.histogram(actual, bins=breakpoints)[0]

    # Avoid zero bins
    expected_pct = np.clip(expected_counts / expected_counts.sum(), 1e-6, None)
    actual_pct = np.clip(actual_counts / actual_counts.sum(), 1e-6, None)

    psi = np.sum((actual_pct - expected_pct) * np.log(actual_pct / expected_pct))
    return psi
```

#### Wasserstein Distance and Jensen-Shannon Divergence

```python
def rolling_wasserstein(live_returns: pd.Series, backtest_returns: pd.Series,
                        window: int = 60) -> pd.Series:
    """
    Rolling Wasserstein (Earth Mover's) distance between live and backtest returns.

    Unlike KS, Wasserstein captures the MAGNITUDE of the shift, not just its
    existence. A return distribution that shifted 2 standard deviations scores
    higher than one that shifted 0.5 standard deviations, even if both are
    statistically significant under KS.

    Normalize by backtest std to make the metric scale-invariant:
      Normalized Wasserstein = W / backtest_std
      Alert: Normalized W > 0.3 (distributions differ by ~30% of baseline volatility)
    """
    backtest_std = backtest_returns.std()
    results = []
    for i in range(window, len(live_returns)):
        w = scipy.stats.wasserstein_distance(
            live_returns.iloc[i - window:i].values,
            backtest_returns.values
        )
        results.append(w / backtest_std if backtest_std > 0 else 0.0)
    return pd.Series(results, index=live_returns.index[window:])


def jensen_shannon_divergence(p: np.ndarray, q: np.ndarray, n_bins: int = 50) -> float:
    """
    Jensen-Shannon divergence between two return distributions.

    JSD is the symmetrized, smoothed version of KL divergence. Bounded [0, 1]
    when using base-2 logarithm. Useful for regime detection because it
    captures differences in distribution SHAPE, not just location.

    Thresholds (empirically calibrated on equity/crypto daily returns):
      JSD < 0.05: Same regime.
      JSD 0.05-0.15: Mild regime shift.
      JSD > 0.15: Significant regime change.
    """
    # Build common histogram
    all_data = np.concatenate([p, q])
    bins = np.linspace(all_data.min(), all_data.max(), n_bins + 1)

    p_hist = np.histogram(p, bins=bins, density=True)[0] + 1e-10
    q_hist = np.histogram(q, bins=bins, density=True)[0] + 1e-10

    p_hist /= p_hist.sum()
    q_hist /= q_hist.sum()

    m = 0.5 * (p_hist + q_hist)
    jsd = 0.5 * np.sum(p_hist * np.log2(p_hist / m)) + \
          0.5 * np.sum(q_hist * np.log2(q_hist / m))
    return jsd
```

### 2.3 Signal Quality Drift

#### Rolling Information Coefficient with Decay Detection

```python
def rolling_ic(predictions: pd.Series, realized: pd.Series,
               window: int = 60) -> pd.Series:
    """
    Rolling rank IC (Spearman correlation between predictions and realized returns).

    This is the most direct measure of signal quality. IC decay is the
    earliest warning of alpha erosion — it precedes P&L degradation because
    position sizing and execution can temporarily mask a weakening signal.

    Healthy IC: Depends on strategy. Typical systematic equity = 0.02-0.05.
    Alert: When rolling IC drops below 50% of backtest mean IC for 20+ days.
    Kill signal: When rolling IC is indistinguishable from zero (t-stat < 1.0)
    for 40+ consecutive days.
    """
    return predictions.rolling(window).corr(realized, method='spearman')


def ic_decay_test(rolling_ic_series: pd.Series, lookback: int = 120) -> dict:
    """
    Detect systematic IC decay via linear regression on recent IC values.

    Returns:
      slope: IC change per day (negative = decaying)
      t_stat: Statistical significance of the slope
      half_life: Days until IC reaches zero at current decay rate (if slope < 0)
      alert: Whether decay is statistically significant
    """
    recent = rolling_ic_series.dropna().iloc[-lookback:]
    if len(recent) < 30:
        return {'slope': np.nan, 't_stat': np.nan, 'half_life': np.nan, 'alert': False}

    x = np.arange(len(recent))
    slope, intercept, r_value, p_value, std_err = scipy.stats.linregress(x, recent.values)
    t_stat = slope / std_err if std_err > 0 else 0.0

    half_life = -intercept / slope if slope < 0 else np.inf

    return {
        'slope': slope,
        't_stat': t_stat,
        'half_life': half_life,
        'alert': slope < 0 and abs(t_stat) > 2.0
    }
```

#### Feature Importance Stability

```python
def feature_importance_rank_correlation(importance_current: dict,
                                        importance_baseline: dict) -> float:
    """
    Spearman rank correlation between current and baseline feature importances.

    If the model's feature ranking has shifted dramatically, either the model
    is adapting to noise or the data-generating process has changed.

    Healthy: rho > 0.7
    Warning: rho < 0.5 (feature rankings have substantially reorganized)
    Critical: rho < 0.3 (the model is using completely different features)
    """
    common_features = set(importance_current.keys()) & set(importance_baseline.keys())
    if len(common_features) < 3:
        return np.nan

    current_ranks = pd.Series(importance_current).rank()
    baseline_ranks = pd.Series(importance_baseline).rank()

    return current_ranks[list(common_features)].corr(
        baseline_ranks[list(common_features)], method='spearman'
    )
```

### 2.4 Execution Quality Drift

#### Slippage and Cost Tracking

```python
def slippage_monitor(expected_fills: pd.Series, actual_fills: pd.Series,
                     side: pd.Series) -> pd.DataFrame:
    """
    Track slippage: expected fill price vs actual fill price.

    Slippage = (actual - expected) * side_sign
    Positive slippage = paid more than expected (bad for buys, good for sells).

    Alert: When rolling mean slippage exceeds 2x the backtest assumption for
    10+ consecutive trades.
    """
    side_sign = side.map({'buy': 1, 'sell': -1}).fillna(0)
    slippage = (actual_fills - expected_fills) * side_sign

    return pd.DataFrame({
        'slippage_bps': slippage / expected_fills * 10000,
        'rolling_mean_30': (slippage / expected_fills * 10000).rolling(30).mean(),
        'rolling_mean_100': (slippage / expected_fills * 10000).rolling(100).mean(),
        'cumulative': slippage.cumsum(),
    })


def cost_basis_drift(expected_cost_bps: float, actual_costs: pd.Series,
                     window: int = 60) -> pd.DataFrame:
    """
    Compare realized transaction costs against backtest cost assumption.

    Alert: When rolling actual cost > 1.5x expected cost for 20+ days.
    This often indicates: venue fee changes, increased market impact from
    larger positions, or infrastructure degradation (more taker fills).
    """
    rolling_actual = actual_costs.rolling(window).mean()
    drift_ratio = rolling_actual / expected_cost_bps

    return pd.DataFrame({
        'actual_cost_bps': rolling_actual,
        'expected_cost_bps': expected_cost_bps,
        'drift_ratio': drift_ratio,
        'alert': drift_ratio > 1.5,
    })
```

## 3. Alert System Design

### Multi-Tier Alert Levels

```python
ALERT_LEVELS = {
    'WATCH': {
        'threshold': 1,       # 1 metric breached
        'action': 'Log and increase monitoring frequency',
        'position_adj': 1.0,  # No change
        'confirmation_window': 5,  # Must stay breached for 5 periods
    },
    'WARNING': {
        'threshold': 2,       # 2-3 metrics breached
        'action': 'Reduce position sizing to 50%',
        'position_adj': 0.5,
        'confirmation_window': 3,
    },
    'CRITICAL': {
        'threshold': 4,       # 4+ metrics breached
        'action': 'Halt new entries, flatten over N bars',
        'position_adj': 0.0,  # No new entries
        'flatten_bars': 20,   # Flatten existing over 20 bars to minimize impact
        'confirmation_window': 2,
    },
    'EMERGENCY': {
        'threshold': None,    # Triggered by catastrophic single metric
        'trigger': 'Any single metric > 3 sigma from expected',
        'action': 'Immediate flatten at market',
        'position_adj': 0.0,
        'flatten_bars': 1,
        'confirmation_window': 0,  # No confirmation, act immediately
    },
}
```

### Alert Fatigue Prevention

Raw alert counts without confirmation windows produce noise. A single bad day can trigger WATCH alerts across correlated metrics, creating a false cascade.

**Confirmation window rule:** A metric must stay in breach for N consecutive periods before its alert is counted. This filters transient noise while catching sustained drift.

**Correlation-aware counting:** Metrics that measure similar phenomena (e.g., rolling Sharpe and rolling profit factor) should count as ONE breach, not two. Group metrics into independent clusters:

```python
METRIC_CLUSTERS = {
    'performance': ['rolling_sharpe', 'profit_factor', 'win_loss_ratio', 'pnl_trajectory'],
    'distribution': ['ks_test', 'psi', 'wasserstein', 'jsd'],
    'signal': ['rolling_ic', 'feature_stability', 'snr'],
    'execution': ['slippage', 'fill_rate', 'cost_basis'],
}
# Count breaches per cluster, not per metric.
# 3 breached metrics in the same cluster = 1 cluster breach.
# 1 breached metric in 3 different clusters = 3 cluster breaches (more alarming).
```

### Alert Escalation Logic

```python
def compute_alert_level(breached_metrics: list[str],
                        breach_history: dict[str, int],
                        confirmation_windows: dict[str, int]) -> str:
    """
    Determine current alert level from breached metrics.

    Args:
        breached_metrics: List of metric names currently in breach.
        breach_history: {metric: consecutive_days_in_breach}
        confirmation_windows: {alert_level: required_consecutive_days}
    """
    # Filter to confirmed breaches only
    confirmed = [m for m in breached_metrics
                 if breach_history.get(m, 0) >= confirmation_windows.get('WATCH', 5)]

    # Count by independent clusters
    breached_clusters = set()
    for metric in confirmed:
        for cluster_name, members in METRIC_CLUSTERS.items():
            if metric in members:
                breached_clusters.add(cluster_name)

    n_clusters = len(breached_clusters)

    # Check for emergency (any single metric at catastrophic level)
    for metric in confirmed:
        if breach_history.get(metric + '_sigma', 0) > 3.0:
            return 'EMERGENCY'

    if n_clusters >= 4:
        return 'CRITICAL'
    elif n_clusters >= 2:
        return 'WARNING'
    elif n_clusters >= 1:
        return 'WATCH'
    return 'NORMAL'
```

## 4. Retraining Decision Tree

When drift is detected, the response depends on WHICH type of drift and HOW MANY types simultaneously.

### Single-Type Drift

| Drift Type | Primary Response | Secondary Response |
|---|---|---|
| Performance only (Sharpe declining, IC stable) | Retrain with expanded window. Add recent data to capture market evolution. | Evaluate whether alpha horizon has shortened. |
| Signal quality only (IC decaying, execution fine) | Investigate feature decay individually. Which features lost predictive power? | Replace decayed features. If all features decayed, the signal source may be exhausted. |
| Regime shift (distribution metrics fire, everything else follows) | Check strategy's regime design. If regime-conditional, wait for reversion with reduced sizing. | If structural break, pause strategy and evaluate if the original thesis still holds. |
| Execution only (fills worse, signal metrics stable) | Fix execution. Audit fill quality, latency, venue routing. Check if AUM has grown into capacity limits. | This is an infrastructure problem, not a model problem. Do not retrain. |

### Multi-Type Drift

| Combination | Interpretation | Response |
|---|---|---|
| Performance + Signal | Alpha is genuinely decaying. The model's predictions are less accurate, and P&L reflects it. | Retrain with feature refresh. If IC decay persists after retrain, consider new signal sources. |
| Performance + Execution | Could be execution masking intact signal, or both degrading. | Fix execution first. Re-evaluate performance after execution is restored. |
| Signal + Distribution | Market regime has shifted AND signal has decayed within the new regime. | Retrain is unlikely to help — the signal may not exist in this regime. Reduce to minimum sizing. |
| All three simultaneously | Structural break. The strategy's fundamental thesis may be invalidated. | Halt the strategy. This is not a retraining problem — it is a "does this strategy still make sense" question. Conduct full post-mortem before re-engaging. |

### Kill Criteria

A strategy should be killed (permanently decommissioned, not just paused) when:

1. **IC indistinguishable from zero for 60+ days** after retraining with fresh data.
2. **Three successive retrains** each show declining OOS performance.
3. **Capacity exhaustion**: The strategy's AUM has grown past its capacity limit and cannot be scaled down due to fund constraints.
4. **Thesis invalidation**: The market microstructure or regulation changed in a way that removes the edge (e.g., exchange eliminated maker rebates that the strategy exploited).

## 5. Implementation: DriftMonitor Class

```python
import numpy as np
import pandas as pd
import scipy.stats
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class BaselineStats:
    """Backtest baseline statistics for drift comparison."""
    daily_mean_return: float
    daily_std_return: float
    annualized_sharpe: float
    hit_rate: float
    profit_factor: float
    win_loss_ratio: float
    mean_ic: float
    return_distribution: np.ndarray  # Array of daily returns from backtest
    feature_importances: dict = field(default_factory=dict)
    expected_cost_bps: float = 10.0


@dataclass
class DriftReport:
    """Structured drift monitoring report."""
    timestamp: str
    alert_level: str
    breached_metrics: list
    metrics: dict
    recommendation: str


class DriftMonitor:
    """
    Production drift monitor for live trading strategies.

    Usage:
        baseline = BaselineStats(
            daily_mean_return=0.0008,
            daily_std_return=0.015,
            annualized_sharpe=1.8,
            hit_rate=0.54,
            profit_factor=1.35,
            win_loss_ratio=1.15,
            mean_ic=0.035,
            return_distribution=backtest_returns.values,
            expected_cost_bps=12.0,
        )
        monitor = DriftMonitor(baseline)

        # Feed live data daily
        report = monitor.update(live_returns, predictions, realized, costs)
        if report.alert_level in ('CRITICAL', 'EMERGENCY'):
            execution_engine.halt_new_entries()
    """

    def __init__(self, baseline: BaselineStats, window: int = 60):
        self.baseline = baseline
        self.window = window
        self.breach_history: dict[str, int] = {}

    def update(self, live_returns: pd.Series,
               predictions: Optional[pd.Series] = None,
               realized: Optional[pd.Series] = None,
               costs: Optional[pd.Series] = None) -> DriftReport:
        """
        Run all drift checks on current live data. Returns structured report.

        Call this daily (or at the strategy's natural frequency) with all
        available live data from inception to now.
        """
        metrics = {}
        breaches = []

        if len(live_returns) < self.window:
            return DriftReport(
                timestamp=str(live_returns.index[-1]) if len(live_returns) > 0 else '',
                alert_level='NORMAL',
                breached_metrics=[],
                metrics={},
                recommendation='Insufficient data for drift detection.'
            )

        # --- Performance metrics ---
        current_sharpe = self._rolling_sharpe_latest(live_returns)
        metrics['rolling_sharpe_60d'] = current_sharpe
        if current_sharpe < 0.5 * self.baseline.annualized_sharpe:
            breaches.append('rolling_sharpe')

        current_hit_rate = (live_returns.iloc[-self.window:] > 0).mean()
        metrics['rolling_hit_rate'] = current_hit_rate
        lower, _ = hit_rate_confidence_interval(self.baseline.hit_rate, self.window)
        if current_hit_rate < lower:
            breaches.append('hit_rate')

        current_pf = self._profit_factor_latest(live_returns)
        metrics['profit_factor'] = current_pf
        if current_pf < 1.0:
            breaches.append('profit_factor')

        # --- Distribution metrics ---
        recent_returns = live_returns.iloc[-self.window:].values
        ks_stat, ks_pvalue = scipy.stats.ks_2samp(
            recent_returns, self.baseline.return_distribution
        )
        metrics['ks_stat'] = ks_stat
        metrics['ks_pvalue'] = ks_pvalue
        if ks_pvalue < 0.05:
            breaches.append('ks_test')

        psi = compute_psi(self.baseline.return_distribution, recent_returns)
        metrics['psi'] = psi
        if psi > 0.25:
            breaches.append('psi')

        w_dist = scipy.stats.wasserstein_distance(
            recent_returns, self.baseline.return_distribution
        )
        w_normalized = w_dist / self.baseline.daily_std_return
        metrics['wasserstein_normalized'] = w_normalized
        if w_normalized > 0.3:
            breaches.append('wasserstein')

        jsd = jensen_shannon_divergence(
            recent_returns, self.baseline.return_distribution
        )
        metrics['jsd'] = jsd
        if jsd > 0.15:
            breaches.append('jsd')

        # --- Signal quality metrics ---
        if predictions is not None and realized is not None:
            recent_ic = predictions.iloc[-self.window:].corr(
                realized.iloc[-self.window:], method='spearman'
            )
            metrics['rolling_ic'] = recent_ic
            if recent_ic < 0.5 * self.baseline.mean_ic:
                breaches.append('rolling_ic')

        # --- Execution metrics ---
        if costs is not None and len(costs) >= self.window:
            avg_cost = costs.iloc[-self.window:].mean()
            metrics['avg_cost_bps'] = avg_cost
            if avg_cost > 1.5 * self.baseline.expected_cost_bps:
                breaches.append('cost_basis')

        # --- Update breach history ---
        for metric in list(self.breach_history.keys()):
            if metric not in breaches:
                self.breach_history[metric] = 0
        for metric in breaches:
            self.breach_history[metric] = self.breach_history.get(metric, 0) + 1

        # --- Compute alert level ---
        alert_level = self._compute_alert_level(breaches)
        recommendation = self._generate_recommendation(alert_level, breaches, metrics)

        return DriftReport(
            timestamp=str(live_returns.index[-1]),
            alert_level=alert_level,
            breached_metrics=breaches,
            metrics=metrics,
            recommendation=recommendation,
        )

    def _rolling_sharpe_latest(self, returns: pd.Series) -> float:
        recent = returns.iloc[-self.window:]
        if recent.std() == 0:
            return 0.0
        return (recent.mean() / recent.std(ddof=1)) * np.sqrt(252)

    def _profit_factor_latest(self, returns: pd.Series) -> float:
        recent = returns.iloc[-self.window:]
        wins = recent[recent > 0].sum()
        losses = abs(recent[recent < 0].sum())
        return wins / losses if losses > 0 else np.inf

    def _compute_alert_level(self, breaches: list[str]) -> str:
        confirmed = [m for m in breaches
                     if self.breach_history.get(m, 0) >= 5]

        breached_clusters = set()
        for metric in confirmed:
            for cluster_name, members in METRIC_CLUSTERS.items():
                if metric in members:
                    breached_clusters.add(cluster_name)

        # Emergency check: any metric at extreme deviation
        for metric in confirmed:
            if self.breach_history.get(metric, 0) >= 20:
                return 'EMERGENCY'

        n = len(breached_clusters)
        if n >= 4:
            return 'CRITICAL'
        elif n >= 2:
            return 'WARNING'
        elif n >= 1:
            return 'WATCH'
        return 'NORMAL'

    def _generate_recommendation(self, level: str, breaches: list[str],
                                 metrics: dict) -> str:
        if level == 'NORMAL':
            return 'All metrics within expected bounds. No action required.'

        drift_types = set()
        for m in breaches:
            for cluster, members in METRIC_CLUSTERS.items():
                if m in members:
                    drift_types.add(cluster)

        if drift_types == {'execution'}:
            return 'Execution drift only. Fix infrastructure/venue routing. Do not retrain model.'
        elif drift_types == {'signal'}:
            return 'Signal quality degradation. Investigate feature decay. Consider retraining.'
        elif 'distribution' in drift_types and len(drift_types) > 1:
            return 'Possible regime shift with multi-type drift. Reduce sizing. Evaluate thesis.'
        elif drift_types == {'performance'}:
            return 'Performance drift only. Monitor signal metrics for confirmation before acting.'
        else:
            return (f'Multi-type drift detected: {drift_types}. '
                    f'Reduce position sizing. Full strategy review recommended.')
```

## 6. Integration with Netrunner

### In nr-quant-auditor: DRIFT_AUDIT Mode

The quant auditor should support a `DRIFT_AUDIT` mode that scans production code for:

1. **Monitoring presence:** Does the deployed strategy compute ANY drift metrics? If no monitoring code exists, flag as CRITICAL — the strategy is flying blind.
2. **Metric coverage:** Which of the four metric clusters (performance, distribution, signal, execution) have monitoring? Flag any missing cluster.
3. **Alert thresholds:** Are alert thresholds defined and connected to position sizing? Alerts without automated response are just logs.
4. **Baseline storage:** Is the backtest baseline stored and versioned? Without a baseline, there is nothing to drift FROM.
5. **Kill switch existence:** Is there an automated kill switch (drawdown limit, consecutive loss limit) independent of the drift monitor? The drift monitor might have bugs. The kill switch must not.

### In build-strategy Phase 7: Mandatory Production Checklist

Before any strategy goes live, the following drift monitoring items must be verified:

```
[ ] DriftMonitor class instantiated with backtest baseline statistics
[ ] Rolling Sharpe, hit rate, and profit factor computed on live data
[ ] At least one distribution test (KS or PSI) implemented
[ ] Signal quality metric (IC) tracked if predictions are available
[ ] Execution cost tracking implemented and compared to backtest assumptions
[ ] Multi-tier alert levels defined with confirmation windows
[ ] Automated position sizing reduction wired to WARNING level
[ ] Automated halt wired to CRITICAL level
[ ] Emergency flatten wired to EMERGENCY level or independent kill switch
[ ] Baseline statistics versioned and stored alongside model artifacts
[ ] Drift report persisted (database or file) for post-mortem analysis
```

### In quant-finance.md: New Reasoning Trigger

```
### Trigger: Production Strategy Underperforming

When a deployed strategy shows declining performance:

**Reasoning chain:**
1. Which TYPE of drift is occurring? Check all four clusters independently.
2. Is this statistically significant or just variance? Check confirmation windows.
3. What is the timeline of degradation? Sudden = regime shift. Gradual = alpha decay.
4. Has execution quality changed? Always check this FIRST — it is the most
   fixable cause and the most commonly overlooked.
5. Have the strategy's features drifted? Compare current feature distributions
   to training distributions via PSI.
6. When was the model last retrained? If > 6 months ago, alpha decay is expected.
7. What is the strategy's designed regime? Is the current market in that regime?

**Expert intuition:** When a live strategy underperforms, junior quants
immediately retrain the model. Senior quants first check execution, then
check if the market regime matches the strategy's design, then check feature
stability. Retraining is the LAST resort, not the first. If the signal is
dead, retraining on dead signal produces a new model that will also fail.
```

### In nr-verifier: Deployment Readiness Check

When verifying a strategy for deployment, the verifier should confirm:

1. Drift monitoring code exists and covers all four metric clusters.
2. Alert escalation logic is present with position sizing integration.
3. Kill switch is independent of the drift monitor (defense in depth).
4. Baseline statistics are serialized and match the backtest being deployed.
5. The monitoring code itself has tests — a broken monitor is worse than no monitor, because it provides false confidence.
