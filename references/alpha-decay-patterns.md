# Alpha Decay Patterns Reference

## When to Load This Reference

**Loaded by:** nr-executor, nr-researcher, nr-verifier, nr-quant-auditor, nr-planner

**Trigger keywords:** alpha decay, signal decay, factor crowding, strategy capacity, IC decline,
half-life, information diffusion, crowding, publication effect, factor zoo, decay detection,
strategy lifecycle, alpha source, signal degradation, regime shift, structural change

**Load condition:** Strategy evaluation involves published factors, IC time series shows decline,
CONTEXT.md mentions decay concerns, or strategy relies on well-known academic factors.

**See also:** `strategy-metrics.md` (evaluation metrics), `feature-engineering.md` (signal construction),
`quant-finance.md` (reasoning triggers), `quant-code-patterns.md` (temporal discipline)

---

## 1. Alpha Decay Taxonomy

Not all decay is equal. Correct diagnosis determines whether to adapt, abandon, or wait.

### Information Diffusion Decay

Alpha leaks as more participants discover and trade on it. Published academic factors decay
fastest because publication is a broadcast signal to the entire industry.

- **Timeline:** Statistical factors (e.g., momentum, value) decay over months to years post-publication.
  Structural factors (e.g., illiquidity premium) decay over years to decades.
- **Mechanism:** Publication -> replication -> capital allocation -> return compression.
- **Signature:** Gradual IC decline beginning 1-3 years after influential paper. Accelerates when
  factor-tilted ETFs launch (passive capital amplifies the effect).
- **Reversibility:** Low. Once information is public, it cannot be un-published.

### Competition-Driven Decay

More capital chasing the same inefficiency compresses returns toward zero. This is the
arbitrage mechanism working as economic theory predicts.

- **Timeline:** Proportional to capital inflow. Faster in liquid markets, slower in illiquid.
- **Mechanism:** Entry of new participants -> trades move prices closer to fair value -> edge shrinks.
- **Signature:** Returns decline proportionally to estimated AUM in the strategy space.
- **Reversibility:** Partial. If participants exit (drawdown-driven), alpha can partially recover.

### Regime-Driven Decay

The alpha was never universal -- it was conditional on a specific market regime (low vol,
trending, risk-on). When the regime changes, the alpha vanishes.

- **Timeline:** Abrupt. Coincides with regime transition.
- **Mechanism:** Strategy exploited a regime-specific pattern. Pattern doesn't exist in new regime.
- **Signature:** Sharp IC drop coinciding with identifiable regime change (vol spike, rate shift, etc.).
  IC may recover when regime returns.
- **Reversibility:** High. This is not true decay -- the alpha is dormant, not dead. Requires
  regime detection to know when to activate/deactivate.

### Structural Decay

Market microstructure changes eliminate the inefficiency the alpha exploited. New regulations,
exchange technology upgrades, or HFT adoption can permanently destroy alpha sources.

- **Timeline:** Coincides with structural event (regulatory change, exchange upgrade).
- **Mechanism:** The market plumbing changes in a way that removes the exploitable pattern.
- **Signature:** Permanent IC drop to zero with no recovery. Coincides with identifiable structural event.
- **Reversibility:** None. The inefficiency no longer exists.
- **Examples:** Decimalization killed many spread-based strategies. Reg NMS changed order routing alpha.

### Crowding Decay

Strategy becomes overcrowded -- trades move prices against all participants simultaneously.
Related to competition decay but worse: returns go negative, not just to zero.

- **Timeline:** Builds gradually, resolves violently (crowding unwinds are crashes).
- **Mechanism:** Too many participants hold the same positions -> correlated exits -> fire sales.
- **Signature:** Positive returns that suddenly become deeply negative. High correlation among
  strategy returns across managers. Short-term reversal in factor returns.
- **Reversibility:** Yes, after the unwind. But the unwind is catastrophic for participants caught in it.

---

## 2. Decay Detection Methods

### Signal-Level Detection

```python
import numpy as np
import pandas as pd
from scipy.optimize import curve_fit
from scipy.stats import pearsonr


def estimate_alpha_half_life(ic_series: pd.Series, min_periods: int = 60) -> dict:
    """
    Fit exponential decay to rolling IC series.
    IC(t) = IC_0 * exp(-lambda * t)

    Parameters
    ----------
    ic_series : pd.Series
        Time series of Information Coefficient values (e.g., rolling rank IC).
    min_periods : int
        Minimum observations required for fitting.

    Returns
    -------
    dict with keys: ic_0, decay_rate, half_life_periods, r_squared, diagnosis
    """
    ic = ic_series.dropna()
    if len(ic) < min_periods:
        return {'diagnosis': 'INSUFFICIENT_DATA', 'half_life_periods': np.nan}

    t = np.arange(len(ic), dtype=float)
    ic_vals = ic.values

    # Filter to positive IC values for log-linear fit
    positive_mask = ic_vals > 0
    if positive_mask.sum() < min_periods // 2:
        return {'diagnosis': 'IC_ALREADY_DEAD', 'half_life_periods': 0.0}

    # Log-linear regression: log(IC) = log(IC_0) - lambda * t
    log_ic = np.log(np.clip(ic_vals[positive_mask], 1e-10, None))
    t_pos = t[positive_mask]

    try:
        coeffs = np.polyfit(t_pos, log_ic, 1)
        decay_rate = -coeffs[0]  # lambda
        ic_0 = np.exp(coeffs[1])

        # Goodness of fit
        predicted = coeffs[1] + coeffs[0] * t_pos
        ss_res = np.sum((log_ic - predicted) ** 2)
        ss_tot = np.sum((log_ic - np.mean(log_ic)) ** 2)
        r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0.0

        half_life = np.log(2) / decay_rate if decay_rate > 0 else np.inf

        # Diagnosis
        if decay_rate <= 0:
            diagnosis = 'NO_DECAY'
        elif half_life < 60:
            diagnosis = 'RAPID_DECAY'
        elif half_life < 252:
            diagnosis = 'MODERATE_DECAY'
        else:
            diagnosis = 'SLOW_DECAY'

        return {
            'ic_0': round(ic_0, 4),
            'decay_rate': round(decay_rate, 6),
            'half_life_periods': round(half_life, 1),
            'r_squared': round(r_squared, 3),
            'diagnosis': diagnosis,
        }
    except (np.linalg.LinAlgError, ValueError):
        return {'diagnosis': 'FIT_FAILED', 'half_life_periods': np.nan}


def detect_ic_breakpoint(ic_series: pd.Series, window: int = 63) -> dict:
    """
    CUSUM-based breakpoint detection on IC time series.
    Identifies the point where IC regime shifts (level change).

    Parameters
    ----------
    ic_series : pd.Series
        Rolling IC values.
    window : int
        Baseline window for estimating pre-break IC mean/std.

    Returns
    -------
    dict with keys: breakpoint_idx, pre_mean, post_mean, drop_magnitude, significant
    """
    ic = ic_series.dropna().values
    if len(ic) < 2 * window:
        return {'significant': False, 'breakpoint_idx': None}

    baseline_mean = np.mean(ic[:window])
    baseline_std = np.std(ic[:window])
    if baseline_std < 1e-8:
        return {'significant': False, 'breakpoint_idx': None}

    # CUSUM: cumulative sum of deviations from baseline
    cusum = np.cumsum(ic[window:] - baseline_mean)
    max_deviation_idx = np.argmax(np.abs(cusum)) + window

    pre_mean = np.mean(ic[:max_deviation_idx])
    post_mean = np.mean(ic[max_deviation_idx:])
    drop = pre_mean - post_mean

    # Significance: drop > 2 * baseline_std
    significant = abs(drop) > 2 * baseline_std

    return {
        'breakpoint_idx': int(max_deviation_idx),
        'pre_mean': round(pre_mean, 4),
        'post_mean': round(post_mean, 4),
        'drop_magnitude': round(drop, 4),
        'significant': significant,
    }
```

### Strategy-Level Detection

```python
def rolling_sharpe_with_bands(
    returns: pd.Series,
    window: int = 252,
    confidence: float = 0.95,
) -> pd.DataFrame:
    """
    Rolling Sharpe with confidence bands. Narrowing Sharpe with widening bands
    indicates decay under increasing uncertainty.

    Returns DataFrame with columns: sharpe, upper_band, lower_band
    """
    from scipy.stats import norm

    rolling_mean = returns.rolling(window).mean()
    rolling_std = returns.rolling(window).std()
    sharpe = (rolling_mean / rolling_std) * np.sqrt(252)

    # Standard error of Sharpe: SE = sqrt((1 + 0.5 * sharpe^2) / window)
    se = np.sqrt((1 + 0.5 * sharpe ** 2) / window)
    z = norm.ppf(0.5 + confidence / 2)

    return pd.DataFrame({
        'sharpe': sharpe,
        'upper_band': sharpe + z * se,
        'lower_band': sharpe - z * se,
    })


def turnover_adjusted_alpha(
    returns: pd.Series,
    turnover: pd.Series,
    cost_per_turn: float = 0.001,
    window: int = 63,
) -> pd.DataFrame:
    """
    Are you trading more to maintain the same alpha? Rising turnover with
    flat/declining gross returns = decaying signal forcing the optimizer
    to churn harder.

    Parameters
    ----------
    returns : pd.Series
        Gross strategy returns (before transaction costs).
    turnover : pd.Series
        Daily portfolio turnover (fraction of portfolio traded).
    cost_per_turn : float
        Estimated round-trip cost per unit turnover.
    window : int
        Rolling window for smoothing.

    Returns
    -------
    DataFrame with: gross_sharpe, net_sharpe, alpha_per_turnover
    """
    net_returns = returns - turnover * cost_per_turn
    gross_sharpe = (returns.rolling(window).mean() / returns.rolling(window).std()) * np.sqrt(252)
    net_sharpe = (net_returns.rolling(window).mean() / net_returns.rolling(window).std()) * np.sqrt(252)

    # Alpha efficiency: return per unit of turnover (declining = decay)
    alpha_per_turn = returns.rolling(window).mean() / turnover.rolling(window).mean().clip(lower=1e-8)

    return pd.DataFrame({
        'gross_sharpe': gross_sharpe,
        'net_sharpe': net_sharpe,
        'alpha_per_turnover': alpha_per_turn,
    })
```

### Market-Level Crowding Indicators

```python
def crowding_score(strategy_returns: pd.DataFrame, window: int = 63) -> pd.Series:
    """
    Estimate crowding from correlation among strategy returns.
    High average pairwise correlation among managers trading similar strategies
    indicates crowding. Uses eigenvalue concentration as proxy.

    Parameters
    ----------
    strategy_returns : pd.DataFrame
        Returns of multiple strategies/funds in the same factor space.
    window : int
        Rolling window for correlation estimation.

    Returns
    -------
    pd.Series of crowding scores (0 = uncrowded, 1 = maximally crowded).
    """
    scores = []
    for end in range(window, len(strategy_returns)):
        chunk = strategy_returns.iloc[end - window:end]
        corr = chunk.corr().values
        eigenvalues = np.linalg.eigvalsh(corr)
        # Fraction of variance explained by first eigenvalue
        concentration = eigenvalues[-1] / eigenvalues.sum()
        scores.append(concentration)

    return pd.Series(
        scores,
        index=strategy_returns.index[window:],
        name='crowding_score',
    )
```

---

## 3. Factor Decay Case Studies

### Documented Decay Table

| Factor | Peak IC | Pub. Year | Current IC (est.) | Decay Mechanism | Half-Life (est.) |
|--------|---------|-----------|-------------------|-----------------|------------------|
| Momentum (12-1) | ~0.05 | 1993 | ~0.02 | Information diffusion + crowding | ~15 years |
| Value (B/M) | ~0.04 | 1992 | ~0.01 | Structural + information diffusion | ~12 years |
| Low Volatility | ~0.03 | 2006 | ~0.015 | Crowding (pension/insurance) | ~20 years |
| PEAD | ~0.06 | 1989 | ~0.015 | Competition (algo adoption) | ~10 years |
| Short-term Reversal (large cap) | ~0.04 | 1990 | ~0.005 | Structural (HFT) | ~8 years |
| Short-term Reversal (small cap) | ~0.04 | 1990 | ~0.025 | Partially protected by illiquidity | ~25 years |
| Quality (profitability) | ~0.03 | 2013 | ~0.025 | Structural (slow fundamentals) | >30 years |
| NLP Sentiment (news) | ~0.04 | 2018 | ~0.015 | Information diffusion (rapid adoption) | ~4 years |
| Crypto Momentum | ~0.08 | 2019 | ~0.02 | Competition (bot density) | ~1.5 years |

**Key observations:**
- Quality and illiquidity-protected factors decay slowest. They have structural economic rationale.
- Crypto factors decay 5-10x faster than equity factors. Lower barriers to entry, faster information diffusion.
- NLP/alternative data factors are decaying faster than traditional factors. Vendor distribution accelerates information diffusion -- when everyone buys the same sentiment feed, it stops being alpha.
- Publication year is the strongest single predictor of remaining alpha. Post-2015 publications have shorter half-lives because the quant industry is larger and faster at replication.

---

## 4. Decay-Resistant Strategy Design

### Principle 1: Structural Alpha Over Statistical Alpha

Prefer factors with identified economic mechanisms (risk premium, persistent behavioral bias,
institutional constraint) over pure statistical patterns found by data mining.

**Why it works:** Statistical patterns can be noise. Structural alpha has a reason to persist
because the mechanism persists (e.g., insurance companies must sell volatility -- institutional
constraint that won't change).

**Test:** Can you explain WHY this alpha exists in one sentence that references a market
participant's incentive or constraint? If not, it may be statistical noise.

### Principle 2: Capacity-Constrained Alpha

Small-cap, illiquid, or operationally complex markets naturally limit competition.
If your strategy can only deploy $10M, most institutional capital cannot compete with you.

**Trade-off:** Lower capacity = slower decay but limited scale. This is the correct trade-off
for most non-institutional participants.

### Principle 3: Combination Alpha

Combine multiple weak signals rather than relying on one strong signal. Individual components
may decay but the combination is more robust because:
- Diversification across decay timelines
- Interaction effects may create emergent alpha not present in components
- Harder for competitors to reverse-engineer a multi-signal combination

### Principle 4: Adaptive Signals

Signals that condition on market regime automatically adjust as conditions change. A momentum
signal that scales exposure by regime (e.g., reduce in high-vol) survives regime-driven decay.

### Principle 5: Speed Advantage

If alpha is commoditized, faster execution preserves edge. This is a moat through infrastructure
rather than insight. Limited applicability for most participants -- realistic only with
co-location or low-latency infrastructure.

### Principle 6: Novel Data Advantage

Alternative data sources decay more slowly until adoption catches up. The window is typically
3-5 years from first mover to commoditization. Satellite imagery, credit card data, and web
scraping all followed this trajectory.

---

## 5. Response Playbook

### Decision Tree

```python
def decay_response(
    current_ic: float,
    peak_ic: float,
    ic_is_positive: bool,
    multiple_signals_decaying: bool,
    strategy_sharpe: float,
    cost_of_capital_sharpe: float = 0.5,
) -> dict:
    """
    Decision tree for responding to detected alpha decay.

    Returns dict with: action, severity, rationale, next_steps
    """
    ic_drop_pct = (peak_ic - current_ic) / peak_ic if peak_ic > 0 else 1.0

    # Multiple signals decaying = likely regime shift, not individual signal decay
    if multiple_signals_decaying:
        return {
            'action': 'REGIME_SHIFT_PROTOCOL',
            'severity': 'HIGH',
            'rationale': 'Multiple signals decaying simultaneously suggests regime change, not individual signal decay.',
            'next_steps': [
                'Activate regime detection model.',
                'Reduce gross exposure by 50% immediately.',
                'Identify which regime the strategy was calibrated to.',
                'Evaluate if signals recover under alternative regime labels.',
            ],
        }

    # Strategy-level kill switch
    if strategy_sharpe < cost_of_capital_sharpe:
        return {
            'action': 'KILL',
            'severity': 'CRITICAL',
            'rationale': f'Strategy Sharpe ({strategy_sharpe:.2f}) below cost of capital ({cost_of_capital_sharpe:.2f}). Negative expected value to continue.',
            'next_steps': [
                'Halt all trading on this strategy.',
                'Archive signal research and performance data.',
                'Conduct post-mortem: was this decay, regime, or never-real alpha?',
                'Reallocate capital to surviving strategies.',
            ],
        }

    # IC crossed zero -- signal is dead
    if not ic_is_positive:
        return {
            'action': 'HALT_SIGNAL',
            'severity': 'HIGH',
            'rationale': 'IC has crossed zero. Signal no longer predicts in the correct direction.',
            'next_steps': [
                'Remove signal from active ensemble immediately.',
                'Investigate: did IC flip sign (contrarian opportunity) or go to noise?',
                'Check for structural market change that invalidated the signal.',
                'Do NOT re-add until IC recovers for >60 consecutive days.',
            ],
        }

    # Moderate decay -- investigate
    if ic_drop_pct >= 0.5:
        return {
            'action': 'INVESTIGATE',
            'severity': 'MEDIUM',
            'rationale': f'IC dropped {ic_drop_pct:.0%} from peak. Root cause determines response.',
            'next_steps': [
                'Run breakpoint detection to identify when decay began.',
                'Check for regime change coinciding with decay start.',
                'Check for crowding indicators (factor correlation, AUM growth).',
                'Check for structural changes (regulation, market structure).',
                'Reduce signal weight by 50% while investigating.',
            ],
        }

    # Early decay -- monitor
    if ic_drop_pct >= 0.25:
        return {
            'action': 'MONITOR',
            'severity': 'LOW',
            'rationale': f'IC dropped {ic_drop_pct:.0%} from peak. May be noise or early decay.',
            'next_steps': [
                'Set up automated IC monitoring with weekly alerts.',
                'Reduce position size by 25% as precaution.',
                'Begin researching replacement/complement signals.',
                'Re-evaluate in 3 months with updated half-life estimate.',
            ],
        }

    # No significant decay
    return {
        'action': 'NO_ACTION',
        'severity': 'NONE',
        'rationale': f'IC drop of {ic_drop_pct:.0%} is within normal variation.',
        'next_steps': ['Continue monitoring. No intervention needed.'],
    }
```

### Response Summary Table

| IC Drop from Peak | IC Sign | Action | Position Sizing |
|--------------------|---------|--------|-----------------|
| < 25% | Positive | NO_ACTION | Maintain |
| 25-50% | Positive | MONITOR | Reduce 25% |
| > 50% | Positive | INVESTIGATE | Reduce 50% |
| Any | Negative | HALT_SIGNAL | Remove signal |
| Multiple signals | Any | REGIME_SHIFT | Reduce gross 50% |
| N/A | N/A | KILL (Sharpe < cost) | Liquidate |

---

## 6. Integration with Netrunner

### In build-strategy.md Phase 1 (Research)

Any strategy based on published academic factors MUST include decay analysis:
- Look up publication year and estimate remaining half-life from the case study table.
- If factor was published >10 years ago and no structural moat exists, assume >50% decay.
- Novel combinations of decayed factors can still work -- but individual IC expectations
  must be adjusted downward from published values.

### In nr-quant-auditor: DECAY_AUDIT Mode

When auditing a strategy, check:
1. Does the strategy rely on factors with known decay? Cross-reference factor names against
   the case study table above.
2. Is there IC monitoring infrastructure? If not, flag as critical gap.
3. Are position sizes adjusted for signal strength? Static sizing on a decaying signal
   means risk-per-unit-of-alpha is increasing over time.
4. Is there a kill switch? Every strategy needs an automated or semi-automated halt
   trigger when performance degrades below thresholds.

### In quant-finance.md: New Reasoning Trigger

**Trigger: Alpha Source Selection**

When evaluating which signals or factors to include in a strategy:
1. What is the information source? Published academic, proprietary research, alternative data?
2. When was this source first exploited? Estimate decay timeline.
3. What is the structural moat? Capacity constraint, data advantage, speed advantage, or none?
4. What is the expected IC in 2 years, not today? Discount current IC by estimated decay rate.
5. Is the combination of signals more robust than individual components?

### In strategy-metrics.md: Decay-Aware Evaluation

When computing strategy metrics, always report:
- Rolling IC with half-life estimate (not just point-in-time IC).
- Sharpe ratio trend (is it declining over the evaluation window?).
- Turnover trend (is turnover rising to maintain performance?).
- Alpha efficiency (return per unit of turnover) trend.

These trend metrics matter more than point-in-time values for live strategy monitoring.

### Production Monitoring Integration

Every deployed strategy should have automated decay monitoring:
- Weekly: rolling IC check against 25% / 50% / zero thresholds.
- Monthly: half-life re-estimation with expanding window.
- Quarterly: full decay audit comparing current performance to initial deployment baseline.
- Alert escalation: MONITOR -> INVESTIGATE -> HALT follows the response playbook automatically.
