# Risk Management Framework for Quantitative Trading

## When to Load This Reference

**Loaded by:** `nr-executor`, `nr-verifier`, `nr-quant-auditor`, `nr-planner`

**Trigger keywords:** risk, position sizing, Kelly, drawdown, VaR, CVaR, expected shortfall, kill switch, stop loss, risk parity, volatility targeting, concentration, tail risk, stress test, max loss, risk budget, position limit, exposure, hedge

**Load condition:** Risk management detected in CONTEXT.md, current task involves portfolio construction, position sizing, or risk controls. Also loaded during `build-strategy.md` Phase 7 and any `RISK_AUDIT` mode execution.

**See also:** `strategy-metrics.md` (performance metrics), `quant-code-patterns.md` (temporal discipline), `quant-finance.md` (expert reasoning triggers)

---

## 1. Position Sizing

### Kelly Criterion and Fractional Kelly

**Full Kelly** maximizes long-run geometric growth but is dangerously volatile in practice.

```
Discrete:    f* = (p * b - q) / b     where p=win prob, b=win/loss ratio, q=1-p
Continuous:  f* = (mu - r) / sigma^2   where mu=expected return, r=risk-free, sigma=volatility
```

**WARNING:** Kelly assumes you KNOW the true edge. Estimation error on p and b makes full Kelly a path to ruin. Half-Kelly is the practical default: reduces variance by ~75% while sacrificing only ~25% of expected log-growth.

```python
import numpy as np

def kelly_fraction(win_prob: float, win_loss_ratio: float) -> float:
    """Full Kelly fraction for discrete outcomes. Can be negative (= don't bet)."""
    q = 1.0 - win_prob
    return (win_prob * win_loss_ratio - q) / win_loss_ratio

def fractional_kelly(win_prob: float, win_loss_ratio: float,
                     fraction: float = 0.5) -> float:
    """Fractional Kelly — half-Kelly (0.5) is the practical default."""
    return max(kelly_fraction(win_prob, win_loss_ratio) * fraction, 0.0)

def kelly_continuous(expected_return: float, volatility: float,
                     risk_free: float = 0.0) -> float:
    """Kelly for continuous distributions. WARNING: fat tails make this
    underestimate risk. Apply fraction < 0.5 for safety."""
    if volatility <= 0:
        return 0.0
    return (expected_return - risk_free) / (volatility ** 2)
```

**When to use what:**
- **Known win/loss outcomes** (e.g., fixed take-profit/stop-loss): discrete Kelly.
- **Continuous P&L stream** (e.g., stat arb, market making): continuous Kelly with fraction=0.3-0.5.
- **Unknown or unstable edge**: skip Kelly entirely, use volatility targeting.

### Volatility-Based Position Sizing

Target a fixed portfolio volatility regardless of individual asset/strategy volatility. This is the most robust general-purpose sizing method.

```python
def vol_target_position_size(target_annual_vol: float,
                             realized_annual_vol: float,
                             capital: float) -> float:
    """Size position so portfolio hits target_annual_vol (e.g., 0.15 = 15%)."""
    if realized_annual_vol <= 0:
        return 0.0
    return capital * (target_annual_vol / realized_annual_vol)

def atr_position_size(capital: float, risk_per_trade: float,
                      atr: float, atr_multiplier: float = 2.0) -> float:
    """Size so hitting stop (atr_multiplier * ATR) loses risk_per_trade of capital."""
    stop_distance = atr * atr_multiplier
    if stop_distance <= 0:
        return 0.0
    return (capital * risk_per_trade) / stop_distance
```

**Volatility estimation methods (ranked by preference):**
1. **EWMA** (`returns.shift(1).ewm(span=60).std() * sqrt(252)`) — responsive, avoids regime stickiness.
2. **Parkinson (high-low range):** `sqrt(1/(4*log(2)) * log(H/L)^2)` — more efficient estimator but needs OHLC.
3. **Realized vol** (`returns.shift(1).rolling(20).std() * sqrt(252)`) — simple, lagged.
4. **GARCH** — theoretically superior, practically fragile. Use only if you have robust fitting infrastructure.

### Risk Parity

```python
def inverse_vol_weights(volatilities: np.ndarray) -> np.ndarray:
    """Simple inverse-volatility weighting. Effective when correlations are
    moderate and stable. Breaks down when correlations spike to 1 in stress."""
    inv_vol = 1.0 / np.maximum(volatilities, 1e-8)
    return inv_vol / inv_vol.sum()


def risk_parity_weights(cov_matrix: np.ndarray,
                        max_iter: int = 100, tol: float = 1e-8) -> np.ndarray:
    """Equal risk contribution weights (Maillard, Roncalli, Teiletche 2010).
    Prefer over inverse-vol when you have >= 2 years of daily data."""
    n = cov_matrix.shape[0]
    w = np.ones(n) / n
    for _ in range(max_iter):
        risk_contrib = (cov_matrix @ w) * w
        total_risk = np.sqrt(w @ cov_matrix @ w)
        target_rc = total_risk / n
        w_new = w * (target_rc / np.maximum(risk_contrib, 1e-12))
        w_new /= w_new.sum()
        if np.max(np.abs(w_new - w)) < tol:
            break
        w = w_new
    return w
```

**Decision table: which sizing method?**

| Situation | Method | Rationale |
|-----------|--------|-----------|
| Single strategy, known hit rate | Fractional Kelly (0.5) | Maximizes growth given edge estimate |
| Single strategy, unknown hit rate | Vol targeting (10-15% annual) | Robust without edge assumptions |
| Multi-strategy portfolio | Risk parity | Prevents one strategy dominating risk |
| High-frequency, many trades/day | Fixed fractional (tiny per trade) | Kelly unstable at high frequency |

---

## 2. Value at Risk and Expected Shortfall

### VaR Implementations

```python
from scipy import stats

def var_historical(returns: np.ndarray, confidence: float = 0.95) -> float:
    """Non-parametric VaR. Simple, assumption-free. Needs >= 500 observations."""
    return -np.percentile(returns, (1 - confidence) * 100)

def var_parametric(returns: np.ndarray, confidence: float = 0.95) -> float:
    """Gaussian VaR. BAD for fat tails — use Cornish-Fisher instead."""
    mu, sigma = returns.mean(), returns.std(ddof=1)
    return -(mu + stats.norm.ppf(1 - confidence) * sigma)

def var_cornish_fisher(returns: np.ndarray, confidence: float = 0.95) -> float:
    """Cornish-Fisher VaR: corrects for skewness and kurtosis. RECOMMENDED."""
    mu, sigma = returns.mean(), returns.std(ddof=1)
    s, k = stats.skew(returns), stats.kurtosis(returns)
    z = stats.norm.ppf(1 - confidence)
    z_cf = (z + (z**2 - 1)*s/6 + (z**3 - 3*z)*k/24 - (2*z**3 - 5*z)*s**2/36)
    return -(mu + z_cf * sigma)

def var_monte_carlo(returns: np.ndarray, confidence: float = 0.95,
                    n_sims: int = 10_000, horizon: int = 1, seed: int = 42) -> float:
    """Bootstrap Monte Carlo VaR. Handles non-linear portfolios and multi-day horizons."""
    rng = np.random.RandomState(seed)
    simulated = np.array([
        rng.choice(returns, size=horizon, replace=True).sum() for _ in range(n_sims)
    ])
    return -np.percentile(simulated, (1 - confidence) * 100)
```

### Expected Shortfall (CVaR)

CVaR = E[Loss | Loss > VaR]. Unlike VaR, CVaR is a **coherent risk measure** (subadditive) and captures tail SHAPE, not just a single quantile. Prefer CVaR over VaR for risk limits and portfolio optimization.

```python
def cvar_historical(returns: np.ndarray, confidence: float = 0.95) -> float:
    """Average of losses beyond VaR threshold. Preferred for risk limits."""
    threshold = np.percentile(returns, (1 - confidence) * 100)
    tail = returns[returns <= threshold]
    return -tail.mean() if len(tail) > 0 else var_historical(returns, confidence)

def cvar_parametric(returns: np.ndarray, confidence: float = 0.95) -> float:
    """Gaussian CVaR. Same normality caveat as parametric VaR."""
    mu, sigma = returns.mean(), returns.std(ddof=1)
    z = stats.norm.ppf(1 - confidence)
    return -(mu - sigma * stats.norm.pdf(z) / (1 - confidence))
```

### VaR Breach Protocol

| Breach Count (rolling 5 days) | Action |
|-------------------------------|--------|
| 1 | Log + alert. No position change. |
| 2 | Reduce exposure to 50% of current. Review assumptions. |
| 3+ | Halt strategy. Full investigation required before restart. |

**Back-testing VaR models:** Use Kupiec's POF test (proportion of failures) at 95% confidence. If your 99% VaR is breached more than ~2.5% of days, your model underestimates risk.

---

## 3. Drawdown Management

### DrawdownManager Implementation

```python
from dataclasses import dataclass, field
from typing import Tuple

@dataclass
class DrawdownManager:
    """Monitors drawdown, returns position scale factor [0,1].
    Usage: scale = dm.update(daily_return); position_size *= scale"""
    max_drawdown: float = 0.15        # Hard stop: flatten at this drawdown
    time_limit_days: int = 60         # Max consecutive days in drawdown
    scale_start: float = 0.05         # Start scaling down at this drawdown
    peak_equity: float = 1.0
    current_equity: float = 1.0
    days_in_drawdown: int = 0
    halted: bool = False
    _history: list = field(default_factory=list)

    def update(self, daily_return: float) -> float:
        """Process one day's return. Returns position scale factor [0, 1]."""
        self.current_equity *= (1.0 + daily_return)
        self._history.append(self.current_equity)

        if self.current_equity >= self.peak_equity:
            self.peak_equity = self.current_equity
            self.days_in_drawdown = 0
            self.halted = False
            return 1.0

        self.days_in_drawdown += 1
        drawdown = 1.0 - (self.current_equity / self.peak_equity)

        # Hard stop
        if drawdown >= self.max_drawdown or self.days_in_drawdown >= self.time_limit_days:
            self.halted = True
            return 0.0

        # Linear scale-down between scale_start and max_drawdown
        if drawdown >= self.scale_start:
            progress = (drawdown - self.scale_start) / (self.max_drawdown - self.scale_start)
            return max(1.0 - progress, 0.0)

        return 1.0

    @property
    def current_drawdown(self) -> float:
        if self.peak_equity <= 0:
            return 0.0
        return 1.0 - (self.current_equity / self.peak_equity)
```

### Drawdown-Based Scaling Strategies

**Step function** (simpler, avoids parameter sensitivity):

| Drawdown Depth | Position Scale |
|----------------|---------------|
| 0% to -5%     | 100%          |
| -5% to -10%   | 50%           |
| -10% to -15%  | 25%           |
| Beyond -15%   | 0% (halted)   |

**Recovery scaling:** After drawdown recovery, don't snap back to full size. Ramp up over 5-10 trading days to avoid whipsawing.

**Anti-martingale (for trending strategies ONLY):** Increase sizing during winning streaks, reduce during losing. Cap at 1.5x base size. Never use anti-martingale for mean-reversion strategies — it amplifies the wrong tail.

---

## 4. Correlation and Diversification Risk

### Strategy Correlation Monitoring

```python
def rolling_correlation_matrix(returns_df, window: int = 60):
    """Rolling pairwise correlation between strategy returns.
    Watch for correlations that spike above 0.7 — diversification is illusory."""
    return returns_df.shift(1).rolling(window).corr()


def diversification_ratio(weights: np.ndarray, cov_matrix: np.ndarray) -> float:
    """Ratio of weighted-average vol to portfolio vol.
    Values close to 1.0 mean no diversification benefit.
    Good diversification: ratio > 1.5."""
    vols = np.sqrt(np.diag(cov_matrix))
    weighted_avg_vol = weights @ vols
    port_vol = np.sqrt(weights @ cov_matrix @ weights)
    if port_vol <= 0:
        return 1.0
    return weighted_avg_vol / port_vol
```

### Stress Testing

```python
def stress_test_portfolio(weights: np.ndarray, returns_df, scenarios: dict) -> dict:
    """Apply stress scenarios. scenarios: name -> date tuple OR shock dict.
    Example: {'GFC': ('2008-09-01','2008-11-30'), 'gap': {'SPY':-0.30}}"""
    results = {}
    for name, spec in scenarios.items():
        if isinstance(spec, tuple) and len(spec) == 2:
            period = returns_df.loc[spec[0]:spec[1]]
            cumulative = (1 + period).prod() - 1
            portfolio_return = weights @ cumulative.values
        elif isinstance(spec, dict):
            shocks = np.array([spec.get(col, 0.0) for col in returns_df.columns])
            portfolio_return = weights @ shocks
        else:
            continue
        results[name] = float(portfolio_return)
    return results
```

### Concentration Limits

These are hard limits — enforce programmatically, not by policy.

| Limit Type | Threshold | Rationale |
|-----------|-----------|-----------|
| Single asset | 20% of NAV | No single-name blowup takes you out |
| Sector/factor | 40% of NAV | Sector correlation is higher than asset |
| Single strategy | 40% of risk budget | Strategy failure is not catastrophic |
| Correlated pair (rho > 0.7) | Combined 30% of NAV | Two 20% positions at rho=0.9 is one 40% position |

**Correlation-adjusted concentration:**
```python
def effective_concentration(w1: float, w2: float, correlation: float) -> float:
    """Effective portfolio concentration of two positions accounting for correlation.
    If rho=1, this equals (w1+w2)^2. Use this to check correlated pair limits."""
    return np.sqrt(w1**2 + w2**2 + 2 * w1 * w2 * correlation)
```

---

## 5. Tail Risk and Black Swan Protection

### Tail Risk Metrics

```python
def tail_metrics(returns: np.ndarray) -> dict:
    """Comprehensive tail risk metrics for a return series."""
    return {
        'kurtosis': float(stats.kurtosis(returns)),     # >3 = fat tails
        'skewness': float(stats.skew(returns)),          # <0 = left tail heavier
        'max_1d_loss': float(returns.min()),
        'max_5d_loss': float(
            np.convolve(returns, np.ones(5), mode='valid').min()
        ),
        'var_99': float(-np.percentile(returns, 1)),
        'cvar_99': float(-returns[returns <= np.percentile(returns, 1)].mean()),
        'tail_ratio': float(
            np.percentile(returns, 95) / abs(np.percentile(returns, 5))
        ),  # >1 = right tail fatter (good)
    }
```

### Hedging Approaches (Ranked by Practicality)

1. **Cash buffer:** 10-20% in cash/T-bills. Simplest, most reliable. Provides dry powder during stress.
2. **Trend-following overlay:** 10-15% of risk budget. Positive convexity — profits from large moves in either direction. Most consistent crisis alpha across historical events.
3. **Volatility products:** VIX call spreads when realized vol is low (cheap insurance). Scale inversely with VIX.
4. **Put spreads:** 5-10% OTM, rolling monthly. Only cost-effective when implied vol < 50th percentile.

**Anti-pattern:** Do NOT rely on portfolio insurance (constant delta hedging). Failed in 1987, creates liquidity cascades.

---

## 6. Kill Switch Design

The kill switch is the last line of defense. It must be automated, have no human override during market hours, and operate at multiple time horizons.

```python
from dataclasses import dataclass
from typing import Tuple, List

@dataclass
class KillSwitch:
    """Automated circuit breaker. No human override during market hours.
    YELLOW=log, ORANGE=reduce to 50%, RED=flatten all + halt."""
    max_daily_loss: float = -0.02       # -2% daily P&L
    max_weekly_loss: float = -0.05      # -5% weekly P&L
    max_drawdown: float = -0.15         # -15% from peak
    max_position_pct: float = 0.20      # 20% of NAV in single name
    max_daily_trades: int = 500         # Runaway algo protection
    cooldown_hours: int = 4             # Minimum pause after RED breach

    def check(self, portfolio_state: dict) -> Tuple[str, str]:
        """Returns (level, reason). Level: GREEN/YELLOW/ORANGE/RED.
        portfolio_state keys: daily_pnl_pct, weekly_pnl_pct, drawdown_pct,
        max_single_position_pct, trades_today."""
        checks: List[Tuple[str, str]] = []

        def _check_limit(value, limit, name, invert=False):
            """Tiered check: breach=RED, 70%=ORANGE, 50%=YELLOW."""
            if invert:  # For upper limits (position size, trade count)
                if value >= limit: checks.append(('RED', f'{name} {value} >= {limit}'))
                elif value >= limit * 0.8: checks.append(('YELLOW', f'{name} at 80%'))
            else:  # For loss limits (negative values)
                if value <= limit: checks.append(('RED', f'{name} {value:.2%} breached {limit:.2%}'))
                elif value <= limit * 0.7: checks.append(('ORANGE', f'{name} at 70% of limit'))
                elif value <= limit * 0.5: checks.append(('YELLOW', f'{name} at 50% of limit'))

        _check_limit(portfolio_state.get('daily_pnl_pct', 0.0), self.max_daily_loss, 'Daily loss')
        _check_limit(portfolio_state.get('weekly_pnl_pct', 0.0), self.max_weekly_loss, 'Weekly loss')
        _check_limit(portfolio_state.get('drawdown_pct', 0.0), self.max_drawdown, 'Drawdown')
        _check_limit(portfolio_state.get('trades_today', 0), self.max_daily_trades, 'Trades', invert=True)
        max_pos = portfolio_state.get('max_single_position_pct', 0.0)
        if max_pos >= self.max_position_pct:
            checks.append(('ORANGE', f'Position {max_pos:.2%} exceeds {self.max_position_pct:.2%}'))

        if not checks:
            return ('GREEN', 'All limits within bounds')

        # Return highest severity
        severity_order = {'RED': 3, 'ORANGE': 2, 'YELLOW': 1}
        worst = max(checks, key=lambda x: severity_order.get(x[0], 0))
        return worst
```

**Cooldown protocol:** After a RED breach, the system must wait `cooldown_hours` before any trading resumes. The cooldown cannot be shortened by code — it requires a manual config change deployed outside market hours.

**Notification chain:** YELLOW -> log only. ORANGE -> log + message to risk channel. RED -> log + message + page on-call + auto-flatten.

---

## 7. Integration with Netrunner

### build-strategy.md Integration

Phase 7 (Risk Management) should use this reference as its primary source. Minimum viable risk management for any strategy going live:

- [ ] Position sizing method selected and implemented (Section 1)
- [ ] VaR/CVaR computed daily with breach protocol (Section 2)
- [ ] DrawdownManager active with hard stop configured (Section 3)
- [ ] KillSwitch deployed with all five limit types (Section 6)

### nr-quant-auditor RISK_AUDIT Mode

When performing risk audit, check for:
1. **Kill switch exists** — strategy has automated circuit breaker, not just manual monitoring.
2. **Position limits enforced in code** — not just documented as policy.
3. **Drawdown management active** — equity curve monitoring with automated scale-down.
4. **Stress test results documented** — portfolio tested against at least 3 historical crises.
5. **Correlation monitoring** — rolling correlation tracked, concentration limits enforced.

### nr-verifier Risk Checks

During verification of strategy code, confirm:
- Risk parameters are configurable (not hardcoded magic numbers).
- Kill switch runs BEFORE order submission, not as post-trade reconciliation.
- Drawdown calculation uses mark-to-market, not realized P&L only.
- VaR model has been back-tested (Kupiec test or equivalent).

### quant-finance.md Trigger Enhancement

The "Drawdown Analysis or Risk Assessment" trigger should load this reference and activate reasoning about:
- Whether the current drawdown is within expected bounds (compare to backtest worst case).
- Whether position sizing was appropriate given the realized volatility.
- Whether correlation assumptions still hold (did diversification fail?).
- Whether the kill switch would have fired (and if it didn't, why not).

### strategy-metrics.md Cross-Reference

CVaR, max drawdown, and Calmar ratio implementations in `strategy-metrics.md` are the MEASUREMENT side. This reference is the MANAGEMENT side — what to DO about the measurements. Both must be loaded together for complete risk infrastructure.
