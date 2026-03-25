# Strategy Evaluation Metrics Reference

> Comprehensive metrics reference for quantitative strategy evaluation.
> Self-contained: an agent reading only this file can correctly implement any strategy metric.

---

## 1. When to Load This Reference

**Loaded by:** `nr-verifier`, `nr-executor`, `nr-researcher`, `nr-quant-auditor`

**Trigger conditions:**
- User query or CONTEXT.md mentions: strategy evaluation, performance metrics, Sharpe ratio, drawdown, walk-forward, backtest analysis, risk metrics, transaction costs, capacity estimation
- Project context contains strategy returns data, equity curves, or backtest results
- Verification step involves checking metric implementations for correctness
- Any code computing annualized returns, risk-adjusted returns, or strategy quality scores

**Load priority:** HIGH when 2+ trigger terms detected; MEDIUM for single term with quant project context.

---

## 2. Performance Metrics

### Sharpe Ratio

**Definition:** Risk-adjusted return measured as excess return per unit of volatility.

**Formula:**
```
Sharpe = (R_p - R_f) / sigma_p
```

**Annualization from daily returns:**
- CORRECT: multiply daily Sharpe by `sqrt(252)` (trading days)
- WRONG: multiply by `sqrt(365)` (calendar days) or `sqrt(256)` (old convention)

**Autocorrelation adjustment (Newey-West):**
When daily returns exhibit serial correlation, the naive Sharpe overestimates true risk-adjusted performance. The adjustment deflates the Sharpe by accounting for autocovariance at multiple lags.

```python
import numpy as np

def sharpe_ratio(returns, risk_free_rate=0.0, periods_per_year=252):
    """
    Annualized Sharpe ratio from a series of periodic returns.

    Parameters
    ----------
    returns : array-like
        Period returns (e.g., daily).
    risk_free_rate : float
        Annualized risk-free rate. Converted to per-period internally.
    periods_per_year : int
        252 for daily, 52 for weekly, 12 for monthly.

    Returns
    -------
    float
        Annualized Sharpe ratio.
    """
    returns = np.asarray(returns, dtype=float)
    rf_per_period = (1 + risk_free_rate) ** (1 / periods_per_year) - 1
    excess = returns - rf_per_period
    if excess.std(ddof=1) == 0:
        return 0.0
    daily_sharpe = excess.mean() / excess.std(ddof=1)
    return daily_sharpe * np.sqrt(periods_per_year)


def sharpe_newey_west(returns, risk_free_rate=0.0, periods_per_year=252, max_lag=None):
    """
    Sharpe ratio with Newey-West autocorrelation adjustment.

    The adjusted variance accounts for serial correlation in returns,
    preventing inflated Sharpe estimates.

    Parameters
    ----------
    returns : array-like
        Period returns.
    risk_free_rate : float
        Annualized risk-free rate.
    periods_per_year : int
        Trading periods per year.
    max_lag : int or None
        Maximum lag for Newey-West. Default: floor(4 * (T/100)^(2/9)).

    Returns
    -------
    float
        Autocorrelation-adjusted annualized Sharpe ratio.
    """
    returns = np.asarray(returns, dtype=float)
    T = len(returns)
    rf_per_period = (1 + risk_free_rate) ** (1 / periods_per_year) - 1
    excess = returns - rf_per_period

    if max_lag is None:
        max_lag = int(np.floor(4 * (T / 100) ** (2 / 9)))

    mu = excess.mean()
    # Compute autocovariances
    gamma_0 = np.var(excess, ddof=1)
    nw_var = gamma_0
    for lag in range(1, max_lag + 1):
        weight = 1 - lag / (max_lag + 1)  # Bartlett kernel
        gamma_lag = np.cov(excess[lag:], excess[:-lag], ddof=1)[0, 1]
        nw_var += 2 * weight * gamma_lag

    if nw_var <= 0:
        return 0.0

    adjusted_sharpe = mu / np.sqrt(nw_var)
    return adjusted_sharpe * np.sqrt(periods_per_year)
```

### Rolling Sharpe

**Purpose:** Visualize strategy stability over time; detect regime-dependent performance.

**Window selection guidelines:**
- 63 trading days (~3 months): noisy but responsive to regime changes
- 126 trading days (~6 months): balanced signal-to-noise
- 252 trading days (~1 year): smooth but lags regime shifts

```python
import pandas as pd

def rolling_sharpe(returns, window=126, risk_free_rate=0.0, periods_per_year=252):
    """
    Rolling annualized Sharpe ratio.

    Parameters
    ----------
    returns : pd.Series
        Period returns with datetime index.
    window : int
        Rolling window size in trading periods.
    risk_free_rate : float
        Annualized risk-free rate.
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    pd.Series
        Rolling Sharpe ratio.
    """
    rf_per_period = (1 + risk_free_rate) ** (1 / periods_per_year) - 1
    excess = returns - rf_per_period
    rolling_mean = excess.rolling(window).mean()
    rolling_std = excess.rolling(window).std(ddof=1)
    return (rolling_mean / rolling_std) * np.sqrt(periods_per_year)
```

### Sortino Ratio

**Definition:** Like Sharpe but penalizes only downside deviation. Uses a minimum acceptable return (MAR) threshold instead of the risk-free rate for downside calculation.

**Formula:**
```
Sortino = (R_p - MAR) / DD
where DD = sqrt(mean(min(R_i - MAR, 0)^2))
```

**Key distinction:** Downside deviation uses ALL observations, not just negative ones. Returns above MAR contribute zero to the sum, but the denominator is the full count (not just count of negative returns).

```python
def sortino_ratio(returns, mar=0.0, periods_per_year=252):
    """
    Annualized Sortino ratio.

    Parameters
    ----------
    returns : array-like
        Period returns.
    mar : float
        Minimum acceptable return (per period). Often 0.
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    float
        Annualized Sortino ratio.
    """
    returns = np.asarray(returns, dtype=float)
    excess = returns - mar
    downside = np.minimum(excess, 0)
    downside_dev = np.sqrt(np.mean(downside ** 2))
    if downside_dev == 0:
        return np.inf if excess.mean() > 0 else 0.0
    daily_sortino = excess.mean() / downside_dev
    return daily_sortino * np.sqrt(periods_per_year)
```

### Calmar Ratio

**Definition:** CAGR divided by maximum drawdown. Measures return per unit of worst-case loss.

**Formula:**
```
Calmar = CAGR / |Max Drawdown|
```

**Typical thresholds:** Calmar > 1.0 is good; > 2.0 is excellent; < 0.5 raises concerns.

```python
def calmar_ratio(returns, periods_per_year=252):
    """
    Calmar ratio: CAGR / absolute max drawdown.

    Parameters
    ----------
    returns : array-like
        Period returns.
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    float
        Calmar ratio.
    """
    returns = np.asarray(returns, dtype=float)
    equity = np.cumprod(1 + returns)
    cagr_val = cagr(returns, periods_per_year)
    mdd = max_drawdown(returns)
    if mdd == 0:
        return np.inf if cagr_val > 0 else 0.0
    return cagr_val / abs(mdd)
```

### Information Ratio

**Definition:** Active return relative to benchmark, divided by tracking error.

**Formula:**
```
IR = (R_p - R_b) / TE
where TE = std(R_p - R_b)
```

**Interpretation:** IR > 0.5 is good; > 1.0 is exceptional. Unlike Sharpe, IR is benchmark-relative.

```python
def information_ratio(returns, benchmark_returns, periods_per_year=252):
    """
    Annualized Information Ratio.

    Parameters
    ----------
    returns : array-like
        Strategy period returns.
    benchmark_returns : array-like
        Benchmark period returns (same frequency).
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    float
        Annualized Information Ratio.
    """
    returns = np.asarray(returns, dtype=float)
    benchmark_returns = np.asarray(benchmark_returns, dtype=float)
    active = returns - benchmark_returns
    tracking_error = active.std(ddof=1)
    if tracking_error == 0:
        return 0.0
    return (active.mean() / tracking_error) * np.sqrt(periods_per_year)
```

### CAGR (Compound Annual Growth Rate)

**Formula:**
```
CAGR = (equity_final / equity_initial) ^ (periods_per_year / total_periods) - 1
```

```python
def cagr(returns, periods_per_year=252):
    """
    Compound Annual Growth Rate from period returns.

    Parameters
    ----------
    returns : array-like
        Period returns.
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    float
        CAGR as a decimal.
    """
    returns = np.asarray(returns, dtype=float)
    total_return = np.prod(1 + returns)
    n_periods = len(returns)
    if n_periods == 0 or total_return <= 0:
        return 0.0
    return total_return ** (periods_per_year / n_periods) - 1
```

### Total Return

```python
def total_return(returns):
    """Cumulative total return from period returns."""
    return np.prod(1 + np.asarray(returns, dtype=float)) - 1
```

---

## 3. Risk Metrics

### Max Drawdown

**Definition:** Largest peak-to-trough decline on the equity curve. Always computed on the cumulative equity curve, NEVER on log returns directly.

**Key outputs:**
- Max drawdown magnitude (%)
- Drawdown duration (peak date to trough date)
- Recovery time (trough date to recovery date, or ongoing)

```python
def max_drawdown(returns):
    """
    Maximum drawdown from period returns.

    CORRECT: Compute on equity curve (cumulative product of 1+r).
    WRONG: Compute on log returns or cumulative sum of returns.

    Parameters
    ----------
    returns : array-like
        Period returns.

    Returns
    -------
    float
        Maximum drawdown as a negative decimal (e.g., -0.25 = 25% drawdown).
    """
    returns = np.asarray(returns, dtype=float)
    equity = np.cumprod(1 + returns)
    running_max = np.maximum.accumulate(equity)
    drawdowns = equity / running_max - 1
    return drawdowns.min()


def max_drawdown_details(returns, dates=None):
    """
    Maximum drawdown with duration and recovery details.

    Parameters
    ----------
    returns : array-like
        Period returns.
    dates : array-like or None
        Dates corresponding to returns. If None, uses integer indices.

    Returns
    -------
    dict
        Keys: max_dd, peak_idx, trough_idx, recovery_idx (None if unrecovered),
              duration (peak to trough), recovery_time (trough to recovery).
    """
    returns = np.asarray(returns, dtype=float)
    equity = np.cumprod(1 + returns)
    running_max = np.maximum.accumulate(equity)
    drawdowns = equity / running_max - 1

    trough_idx = np.argmin(drawdowns)
    peak_idx = np.argmax(equity[:trough_idx + 1])
    max_dd = drawdowns[trough_idx]

    # Find recovery point
    recovery_idx = None
    peak_value = equity[peak_idx]
    for i in range(trough_idx + 1, len(equity)):
        if equity[i] >= peak_value:
            recovery_idx = i
            break

    if dates is not None:
        dates = np.asarray(dates)
        return {
            'max_dd': max_dd,
            'peak_date': dates[peak_idx],
            'trough_date': dates[trough_idx],
            'recovery_date': dates[recovery_idx] if recovery_idx else None,
            'duration': trough_idx - peak_idx,
            'recovery_time': (recovery_idx - trough_idx) if recovery_idx else None,
        }

    return {
        'max_dd': max_dd,
        'peak_idx': peak_idx,
        'trough_idx': trough_idx,
        'recovery_idx': recovery_idx,
        'duration': trough_idx - peak_idx,
        'recovery_time': (recovery_idx - trough_idx) if recovery_idx else None,
    }
```

### Value at Risk (VaR) and Conditional VaR (CVaR)

**VaR:** Maximum loss at a given confidence level over a given horizon.
**CVaR (Expected Shortfall):** Average loss in the tail beyond VaR. More coherent risk measure.

**Three approaches:**

1. **Parametric (Gaussian):** Assumes normal returns. Fast but underestimates tail risk due to fat tails in real returns.
2. **Historical simulation:** Uses empirical return distribution. No distributional assumption but limited by sample size.
3. **Monte Carlo:** Simulates correlated return paths. Flexible but computationally expensive.

```python
from scipy import stats

def var_parametric(returns, confidence=0.95, periods_per_year=252, horizon_days=1):
    """
    Parametric (Gaussian) Value at Risk.

    WARNING: Assumes normally distributed returns. Real returns have
    fat tails (excess kurtosis > 0), so this UNDERESTIMATES true VaR.
    Use historical or Monte Carlo for production.

    Parameters
    ----------
    returns : array-like
        Daily returns.
    confidence : float
        Confidence level (e.g., 0.95 for 95% VaR).
    horizon_days : int
        Holding period in trading days.

    Returns
    -------
    float
        VaR as a positive number representing loss.
    """
    returns = np.asarray(returns, dtype=float)
    mu = returns.mean() * horizon_days
    sigma = returns.std(ddof=1) * np.sqrt(horizon_days)
    return -(mu + stats.norm.ppf(1 - confidence) * sigma)


def var_historical(returns, confidence=0.95):
    """
    Historical simulation VaR.

    Parameters
    ----------
    returns : array-like
        Daily returns.
    confidence : float
        Confidence level.

    Returns
    -------
    float
        VaR as a positive number representing loss.
    """
    returns = np.asarray(returns, dtype=float)
    return -np.percentile(returns, (1 - confidence) * 100)


def cvar_historical(returns, confidence=0.95):
    """
    Historical Conditional VaR (Expected Shortfall).
    Average loss beyond the VaR threshold.

    Parameters
    ----------
    returns : array-like
        Daily returns.
    confidence : float
        Confidence level.

    Returns
    -------
    float
        CVaR as a positive number representing expected tail loss.
    """
    returns = np.asarray(returns, dtype=float)
    var = var_historical(returns, confidence)
    tail_losses = returns[returns <= -var]
    if len(tail_losses) == 0:
        return var
    return -tail_losses.mean()


def var_monte_carlo(returns, confidence=0.95, n_simulations=10000, horizon_days=1):
    """
    Monte Carlo VaR using bootstrapped return paths.

    Parameters
    ----------
    returns : array-like
        Daily returns.
    confidence : float
        Confidence level.
    n_simulations : int
        Number of simulated paths.
    horizon_days : int
        Holding period.

    Returns
    -------
    float
        VaR as a positive number representing loss.
    """
    returns = np.asarray(returns, dtype=float)
    simulated_returns = np.random.choice(returns, size=(n_simulations, horizon_days), replace=True)
    simulated_cumulative = np.prod(1 + simulated_returns, axis=1) - 1
    return -np.percentile(simulated_cumulative, (1 - confidence) * 100)
```

### Volatility

**Realized volatility:** Standard deviation of returns, annualized.

**Rolling volatility:** Captures volatility regime changes over time.

**Regime-adjusted volatility:** Uses Hidden Markov Model states to separate high-vol from low-vol regimes.

```python
def realized_volatility(returns, periods_per_year=252):
    """Annualized realized volatility from period returns."""
    returns = np.asarray(returns, dtype=float)
    return returns.std(ddof=1) * np.sqrt(periods_per_year)


def rolling_volatility(returns, window=21, periods_per_year=252):
    """
    Rolling annualized volatility.

    Parameters
    ----------
    returns : pd.Series
        Period returns.
    window : int
        Rolling window (21 = ~1 month for daily).
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    pd.Series
        Rolling annualized volatility.
    """
    return returns.rolling(window).std(ddof=1) * np.sqrt(periods_per_year)


def regime_volatility_hmm(returns, n_regimes=2):
    """
    Regime-adjusted volatility using a Gaussian Hidden Markov Model.

    Requires: hmmlearn package.

    Parameters
    ----------
    returns : array-like
        Daily returns.
    n_regimes : int
        Number of volatility regimes (typically 2: low-vol, high-vol).

    Returns
    -------
    dict
        regime_means, regime_vols, regime_labels (per observation),
        current_regime.
    """
    from hmmlearn.hmm import GaussianHMM

    returns = np.asarray(returns, dtype=float).reshape(-1, 1)
    model = GaussianHMM(n_components=n_regimes, covariance_type='full', n_iter=100)
    model.fit(returns)
    labels = model.predict(returns)

    means = model.means_.flatten()
    vols = np.sqrt(model.covars_.flatten())

    # Sort regimes by volatility (0 = low-vol, 1 = high-vol)
    order = np.argsort(vols)

    return {
        'regime_means': means[order],
        'regime_vols': vols[order],
        'regime_labels': np.array([np.where(order == l)[0][0] for l in labels]),
        'current_regime': np.where(order == labels[-1])[0][0],
    }
```

### Tail Risk Metrics

**Skewness:** Measures asymmetry. Negative skew = left tail risk (more extreme losses than gains). Most equity strategies exhibit negative skew.

**Kurtosis:** Measures tail thickness. Excess kurtosis > 0 = fat tails (more extreme events than Gaussian). Financial returns typically have excess kurtosis of 3-10.

```python
from scipy.stats import skew, kurtosis

def tail_risk_metrics(returns):
    """
    Compute tail risk indicators.

    Parameters
    ----------
    returns : array-like
        Period returns.

    Returns
    -------
    dict
        skewness, excess_kurtosis, jarque_bera_stat, jarque_bera_pvalue,
        left_tail_ratio, right_tail_ratio.
    """
    returns = np.asarray(returns, dtype=float)
    n = len(returns)
    s = skew(returns)
    k = kurtosis(returns)  # scipy returns excess kurtosis by default

    # Jarque-Bera normality test
    jb_stat = (n / 6) * (s ** 2 + (k ** 2) / 4)
    jb_pvalue = 1 - stats.chi2.cdf(jb_stat, df=2)

    # Tail ratios: compare 5th/95th percentile magnitudes
    p5 = np.percentile(returns, 5)
    p95 = np.percentile(returns, 95)
    median = np.median(returns)

    left_tail_ratio = abs(p5 - median) / (abs(p95 - median) + 1e-10)

    return {
        'skewness': s,
        'excess_kurtosis': k,
        'jarque_bera_stat': jb_stat,
        'jarque_bera_pvalue': jb_pvalue,
        'left_tail_ratio': left_tail_ratio,
        'is_normal': jb_pvalue > 0.05,
    }
```

---

## 4. Strategy Quality Metrics

### Hit Rate and Payoff Ratio

**Hit rate** alone is meaningless. A 30% hit rate with 5:1 payoff is vastly superior to 70% hit rate with 0.3:1 payoff.

Always report hit rate WITH payoff ratio and expectancy.

```python
def strategy_quality_metrics(trade_returns):
    """
    Compute trade-level strategy quality metrics.

    Parameters
    ----------
    trade_returns : array-like
        Return per trade (not per period). Each element is one round-trip trade.

    Returns
    -------
    dict
        hit_rate, avg_win, avg_loss, payoff_ratio, profit_factor,
        expectancy, max_consecutive_wins, max_consecutive_losses, n_trades.
    """
    trades = np.asarray(trade_returns, dtype=float)
    winners = trades[trades > 0]
    losers = trades[trades < 0]

    n_trades = len(trades)
    n_winners = len(winners)
    n_losers = len(losers)

    hit_rate = n_winners / n_trades if n_trades > 0 else 0.0
    avg_win = winners.mean() if n_winners > 0 else 0.0
    avg_loss = abs(losers.mean()) if n_losers > 0 else 0.0

    payoff_ratio = avg_win / avg_loss if avg_loss > 0 else np.inf

    gross_profit = winners.sum() if n_winners > 0 else 0.0
    gross_loss = abs(losers.sum()) if n_losers > 0 else 0.0
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else np.inf

    # Expectancy: expected value per trade
    expectancy = hit_rate * avg_win - (1 - hit_rate) * avg_loss

    # Consecutive wins/losses
    max_consec_wins = _max_consecutive(trades > 0)
    max_consec_losses = _max_consecutive(trades < 0)

    return {
        'n_trades': n_trades,
        'hit_rate': hit_rate,
        'avg_win': avg_win,
        'avg_loss': avg_loss,
        'payoff_ratio': payoff_ratio,
        'profit_factor': profit_factor,
        'expectancy': expectancy,
        'max_consecutive_wins': max_consec_wins,
        'max_consecutive_losses': max_consec_losses,
    }


def _max_consecutive(bool_array):
    """Maximum consecutive True values in a boolean array."""
    max_count = 0
    current = 0
    for val in bool_array:
        if val:
            current += 1
            max_count = max(max_count, current)
        else:
            current = 0
    return max_count
```

### Expectancy Interpretation

| Hit Rate | Payoff Ratio | Expectancy | Verdict |
|----------|-------------|------------|---------|
| 30% | 5.0 | +0.15 per unit risk | Trend-following profile, healthy |
| 70% | 0.5 | +0.20 per unit risk | Mean-reversion profile, healthy |
| 50% | 1.0 | 0.00 | Breakeven before costs |
| 60% | 0.8 | +0.12 per unit risk | Moderate edge |
| 40% | 1.0 | -0.20 per unit risk | Negative edge, do not trade |

---

## 5. Execution Metrics

### Slippage

**Definition:** Difference between the model's signal price and the achieved fill price.

```
Slippage = (Fill Price - Signal Price) / Signal Price  [for buys]
Slippage = (Signal Price - Fill Price) / Signal Price  [for sells]
```

### Market Impact

- **Permanent impact:** Price moves that persist after trade completion. Indicates information leakage — the market has absorbed the signal.
- **Temporary impact:** Price displacement during execution that mean-reverts. Caused by consuming liquidity.

### Implementation Shortfall (Perold Decomposition)

**Definition:** Total cost of implementing an investment decision, decomposed into:

```
Implementation Shortfall = Delay Cost + Trading Cost + Opportunity Cost

Delay Cost     = (Decision Price - Arrival Price) * Shares Executed / Total Shares
Trading Cost   = (Execution Price - Arrival Price) * Shares Executed / Total Shares
Opportunity Cost = (Close Price - Decision Price) * Shares NOT Executed / Total Shares
```

```python
def implementation_shortfall(decision_price, arrival_price, exec_price,
                              close_price, shares_executed, total_shares):
    """
    Perold decomposition of implementation shortfall.

    Parameters
    ----------
    decision_price : float
        Price when investment decision was made.
    arrival_price : float
        Price when order entered the market.
    exec_price : float
        Volume-weighted average execution price.
    close_price : float
        Closing price of the day.
    shares_executed : int
        Number of shares actually filled.
    total_shares : int
        Total shares intended.

    Returns
    -------
    dict
        delay_cost, trading_cost, opportunity_cost, total_shortfall (all in bps).
    """
    exec_ratio = shares_executed / total_shares
    unexec_ratio = 1 - exec_ratio

    delay_cost = (arrival_price - decision_price) / decision_price * exec_ratio
    trading_cost = (exec_price - arrival_price) / decision_price * exec_ratio
    opportunity_cost = (close_price - decision_price) / decision_price * unexec_ratio

    total = delay_cost + trading_cost + opportunity_cost

    return {
        'delay_cost_bps': delay_cost * 10000,
        'trading_cost_bps': trading_cost * 10000,
        'opportunity_cost_bps': opportunity_cost * 10000,
        'total_shortfall_bps': total * 10000,
        'fill_rate': exec_ratio,
    }
```

### Fill Rate and Timing Cost

```python
def fill_rate(orders_filled, orders_submitted):
    """Percentage of orders that achieved a fill at target price or better."""
    return orders_filled / orders_submitted if orders_submitted > 0 else 0.0

def timing_cost(signal_prices, execution_prices, side='buy'):
    """
    Average timing cost: delay between signal generation and execution.

    Parameters
    ----------
    signal_prices : array-like
        Prices at signal generation time.
    execution_prices : array-like
        Prices at actual execution time.
    side : str
        'buy' or 'sell'.

    Returns
    -------
    float
        Average timing cost in basis points.
    """
    signal_prices = np.asarray(signal_prices, dtype=float)
    execution_prices = np.asarray(execution_prices, dtype=float)

    if side == 'buy':
        costs = (execution_prices - signal_prices) / signal_prices
    else:
        costs = (signal_prices - execution_prices) / signal_prices

    return costs.mean() * 10000  # bps
```

---

## 6. Walk-Forward Metrics

### Out-of-Sample Degradation Ratio

**Formula:**
```
Degradation Ratio = OOS_Sharpe / IS_Sharpe
```

**Interpretation:**
- 0.4 - 0.8: Healthy. Some degradation is expected and normal.
- 0.8 - 0.9: Very good but verify it is not data leakage.
- > 0.9: Suspicious. Check for lookahead bias, data leakage, or overfitting to a stable regime.
- < 0.3: Severe overfitting. Strategy unlikely to be tradeable.

### Walk-Forward Efficiency (WFE)

**Formula:**
```
WFE = Annualized OOS Return / Annualized IS Return
```

**Healthy range:** 0.3 - 0.7. Below 0.3 suggests overfitting; above 0.8 suggests possible data contamination.

```python
def walk_forward_efficiency(is_returns_by_fold, oos_returns_by_fold, periods_per_year=252):
    """
    Walk-Forward Efficiency across multiple folds.

    Parameters
    ----------
    is_returns_by_fold : list of array-like
        In-sample returns for each fold.
    oos_returns_by_fold : list of array-like
        Out-of-sample returns for each fold.
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    dict
        wfe_per_fold, mean_wfe, degradation_ratio_per_fold,
        mean_degradation, is_oos_correlation.
    """
    wfe_list = []
    degradation_list = []
    is_sharpes = []
    oos_sharpes = []

    for is_ret, oos_ret in zip(is_returns_by_fold, oos_returns_by_fold):
        is_ret = np.asarray(is_ret, dtype=float)
        oos_ret = np.asarray(oos_ret, dtype=float)

        is_ann_return = cagr(is_ret, periods_per_year)
        oos_ann_return = cagr(oos_ret, periods_per_year)

        wfe = oos_ann_return / is_ann_return if is_ann_return != 0 else 0.0
        wfe_list.append(wfe)

        is_sr = sharpe_ratio(is_ret, periods_per_year=periods_per_year)
        oos_sr = sharpe_ratio(oos_ret, periods_per_year=periods_per_year)
        is_sharpes.append(is_sr)
        oos_sharpes.append(oos_sr)

        deg = oos_sr / is_sr if is_sr != 0 else 0.0
        degradation_list.append(deg)

    # IS/OOS consistency: correlation of fold Sharpe ratios
    if len(is_sharpes) > 2:
        correlation = np.corrcoef(is_sharpes, oos_sharpes)[0, 1]
    else:
        correlation = None

    return {
        'wfe_per_fold': wfe_list,
        'mean_wfe': np.mean(wfe_list),
        'degradation_ratio_per_fold': degradation_list,
        'mean_degradation': np.mean(degradation_list),
        'is_oos_correlation': correlation,
    }
```

### Regime Stability Decomposition

**Purpose:** Separate strategy performance by detected market regime (trending, mean-reverting, high-vol, low-vol) to identify regime-dependent alpha.

```python
def regime_stability(returns, regime_labels, periods_per_year=252):
    """
    Performance breakdown by regime.

    Parameters
    ----------
    returns : array-like
        Period returns.
    regime_labels : array-like
        Integer regime labels per period (e.g., from HMM).
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    dict
        Per-regime: sharpe, annual_return, volatility, max_drawdown, n_periods.
    """
    returns = np.asarray(returns, dtype=float)
    regime_labels = np.asarray(regime_labels)
    regimes = np.unique(regime_labels)

    results = {}
    for regime in regimes:
        mask = regime_labels == regime
        r = returns[mask]
        results[f'regime_{regime}'] = {
            'sharpe': sharpe_ratio(r, periods_per_year=periods_per_year),
            'annual_return': cagr(r, periods_per_year),
            'volatility': realized_volatility(r, periods_per_year),
            'max_drawdown': max_drawdown(r),
            'n_periods': len(r),
            'pct_time': len(r) / len(returns),
        }

    return results
```

---

## 7. Monte Carlo Analysis

### Bootstrap Confidence Intervals for Sharpe

**Method:** Resample daily returns with replacement N times, compute Sharpe for each sample, report percentile-based confidence interval.

**Why it matters:** A Sharpe of 1.5 computed from 2 years of daily data might have a 95% CI of [0.8, 2.2]. Reporting point estimates without confidence intervals is misleading.

```python
def bootstrap_sharpe_ci(returns, n_bootstrap=10000, confidence=0.95,
                         risk_free_rate=0.0, periods_per_year=252, seed=None):
    """
    Bootstrap confidence interval for the Sharpe ratio.

    Parameters
    ----------
    returns : array-like
        Period returns.
    n_bootstrap : int
        Number of bootstrap samples.
    confidence : float
        Confidence level (e.g., 0.95 for 95% CI).
    risk_free_rate : float
        Annualized risk-free rate.
    periods_per_year : int
        Trading periods per year.
    seed : int or None
        Random seed for reproducibility.

    Returns
    -------
    dict
        point_estimate, ci_lower, ci_upper, std_error, bootstrap_distribution.
    """
    if seed is not None:
        np.random.seed(seed)

    returns = np.asarray(returns, dtype=float)
    n = len(returns)

    # Point estimate
    point_sharpe = sharpe_ratio(returns, risk_free_rate, periods_per_year)

    # Bootstrap
    boot_sharpes = np.empty(n_bootstrap)
    for i in range(n_bootstrap):
        sample = np.random.choice(returns, size=n, replace=True)
        boot_sharpes[i] = sharpe_ratio(sample, risk_free_rate, periods_per_year)

    alpha = 1 - confidence
    ci_lower = np.percentile(boot_sharpes, alpha / 2 * 100)
    ci_upper = np.percentile(boot_sharpes, (1 - alpha / 2) * 100)

    return {
        'point_estimate': point_sharpe,
        'ci_lower': ci_lower,
        'ci_upper': ci_upper,
        'std_error': boot_sharpes.std(),
        'bootstrap_distribution': boot_sharpes,
    }
```

### Ruin Probability

**Definition:** Probability of the equity curve hitting a maximum acceptable drawdown threshold before reaching a profit target or time horizon.

```python
def ruin_probability(returns, max_acceptable_dd=-0.20, n_simulations=10000,
                      horizon_periods=252, seed=None):
    """
    Monte Carlo estimate of ruin probability.

    Parameters
    ----------
    returns : array-like
        Historical period returns (used to generate paths).
    max_acceptable_dd : float
        Drawdown threshold that constitutes "ruin" (e.g., -0.20 = 20% loss).
    n_simulations : int
        Number of simulated paths.
    horizon_periods : int
        Number of periods to simulate forward.
    seed : int or None
        Random seed.

    Returns
    -------
    dict
        ruin_probability, median_max_drawdown, dd_distribution.
    """
    if seed is not None:
        np.random.seed(seed)

    returns = np.asarray(returns, dtype=float)
    ruin_count = 0
    max_dds = np.empty(n_simulations)

    for i in range(n_simulations):
        path = np.random.choice(returns, size=horizon_periods, replace=True)
        equity = np.cumprod(1 + path)
        running_max = np.maximum.accumulate(equity)
        dd = (equity / running_max - 1).min()
        max_dds[i] = dd
        if dd <= max_acceptable_dd:
            ruin_count += 1

    return {
        'ruin_probability': ruin_count / n_simulations,
        'median_max_drawdown': np.median(max_dds),
        'dd_5th_percentile': np.percentile(max_dds, 5),
        'dd_95th_percentile': np.percentile(max_dds, 95),
    }
```

### Drawdown Distribution

```python
def drawdown_distribution(returns, n_simulations=10000, horizon_periods=252, seed=None):
    """
    Monte Carlo distribution of maximum drawdowns.

    Returns percentiles of the max drawdown distribution across simulated paths.
    """
    if seed is not None:
        np.random.seed(seed)

    returns = np.asarray(returns, dtype=float)
    max_dds = np.empty(n_simulations)

    for i in range(n_simulations):
        path = np.random.choice(returns, size=horizon_periods, replace=True)
        equity = np.cumprod(1 + path)
        running_max = np.maximum.accumulate(equity)
        max_dds[i] = (equity / running_max - 1).min()

    return {
        'mean': max_dds.mean(),
        'median': np.median(max_dds),
        'p5': np.percentile(max_dds, 5),
        'p25': np.percentile(max_dds, 25),
        'p75': np.percentile(max_dds, 75),
        'p95': np.percentile(max_dds, 95),
        'worst': max_dds.min(),
    }
```

### Path Dependency Analysis

**Purpose:** Determine whether strategy performance is sensitive to the ordering of returns (path dependent) vs. only the distribution.

```python
def path_dependency_test(returns, n_shuffles=1000, seed=None):
    """
    Test if strategy metrics are path-dependent by comparing actual sequence
    to shuffled return sequences.

    A large divergence between actual and shuffled metrics indicates
    the strategy's performance is sensitive to return ordering
    (e.g., momentum or serial correlation effects).

    Parameters
    ----------
    returns : array-like
        Actual period returns in chronological order.
    n_shuffles : int
        Number of random shuffles.
    seed : int or None
        Random seed.

    Returns
    -------
    dict
        actual_max_dd, shuffled_median_max_dd, path_dependency_ratio.
    """
    if seed is not None:
        np.random.seed(seed)

    returns = np.asarray(returns, dtype=float)
    actual_dd = max_drawdown(returns)

    shuffled_dds = np.empty(n_shuffles)
    for i in range(n_shuffles):
        shuffled = np.random.permutation(returns)
        shuffled_dds[i] = max_drawdown(shuffled)

    return {
        'actual_max_dd': actual_dd,
        'shuffled_median_max_dd': np.median(shuffled_dds),
        'shuffled_mean_max_dd': shuffled_dds.mean(),
        'path_dependency_ratio': actual_dd / np.median(shuffled_dds) if np.median(shuffled_dds) != 0 else 1.0,
        'actual_worse_than_pct': (actual_dd < shuffled_dds).mean(),
    }
```

---

## 8. Capacity and Decay

### Capacity Estimation

**Rule of thumb:** Strategy capacity is limited by the least liquid instrument traded.

| Market Type | Max ADV Participation | Rationale |
|-------------|----------------------|-----------|
| Large-cap equities | < 1% of ADV | Minimal impact in deep order books |
| Mid-cap equities | < 0.5% of ADV | Thinner books, more impact |
| Small-cap equities | < 0.1% of ADV | Serious impact risk |
| Futures (liquid) | < 2% of ADV | Deep markets, but concentrated |
| Options | < 0.5% of ADV | Wide spreads, gamma risk |
| Crypto (major) | < 0.5% of ADV | Fragmented liquidity |
| Crypto (altcoins) | < 0.05% of ADV | Extreme impact risk |

```python
def estimate_capacity(daily_volume, avg_trade_size, max_participation_rate=0.01):
    """
    Estimate strategy capacity based on daily volume constraints.

    Parameters
    ----------
    daily_volume : float or array-like
        Average daily volume (in shares or dollars) of traded instruments.
    avg_trade_size : float
        Average trade size per signal.
    max_participation_rate : float
        Maximum fraction of daily volume per trade (default: 1%).

    Returns
    -------
    dict
        max_trade_size, max_daily_trades, implied_max_aum (if avg_trade_size is in dollars).
    """
    daily_volume = np.asarray(daily_volume, dtype=float)
    min_volume = daily_volume.min()

    max_trade_size = min_volume * max_participation_rate
    max_daily_trades = max_trade_size / avg_trade_size if avg_trade_size > 0 else 0

    return {
        'max_trade_size': max_trade_size,
        'max_daily_trades': max_daily_trades,
        'bottleneck_volume': min_volume,
        'participation_rate': max_participation_rate,
    }
```

### Alpha Decay Curve

**Purpose:** Measure how quickly a signal's predictive power decays at increasing horizons. Essential for determining optimal holding period and rebalance frequency.

```python
def alpha_decay_curve(signals, forward_returns_dict):
    """
    Measure signal decay across multiple horizons.

    Parameters
    ----------
    signals : array-like
        Signal values at each point in time.
    forward_returns_dict : dict
        Keys are horizon labels (e.g., '1d', '5d', '20d'),
        values are arrays of forward returns at that horizon.

    Returns
    -------
    dict
        Per horizon: IC (information coefficient = rank correlation),
        IC t-stat, decay ratio relative to shortest horizon.
    """
    from scipy.stats import spearmanr

    signals = np.asarray(signals, dtype=float)
    results = {}
    baseline_ic = None

    for horizon, fwd_returns in sorted(forward_returns_dict.items(),
                                         key=lambda x: int(x[0].replace('d', ''))):
        fwd_returns = np.asarray(fwd_returns, dtype=float)

        # Remove NaN pairs
        valid = ~(np.isnan(signals) | np.isnan(fwd_returns))
        if valid.sum() < 30:
            continue

        ic, pvalue = spearmanr(signals[valid], fwd_returns[valid])
        n = valid.sum()
        t_stat = ic * np.sqrt((n - 2) / (1 - ic ** 2 + 1e-10))

        if baseline_ic is None:
            baseline_ic = abs(ic)

        results[horizon] = {
            'ic': ic,
            'ic_abs': abs(ic),
            't_stat': t_stat,
            'pvalue': pvalue,
            'decay_ratio': abs(ic) / baseline_ic if baseline_ic > 0 else 0.0,
            'n_observations': n,
        }

    return results
```

### Crowding Risk

**Definition:** Correlation of strategy returns with known factor returns (momentum, value, quality, low-vol). High correlation indicates the strategy may be crowded and vulnerable to factor unwinds.

```python
def crowding_risk(strategy_returns, factor_returns_dict):
    """
    Assess crowding risk via correlation with known factors.

    Parameters
    ----------
    strategy_returns : array-like
        Strategy period returns.
    factor_returns_dict : dict
        Keys are factor names (e.g., 'momentum', 'value'),
        values are arrays of factor returns.

    Returns
    -------
    dict
        Per factor: correlation, r_squared, beta, residual_alpha.
    """
    strategy_returns = np.asarray(strategy_returns, dtype=float)
    results = {}

    for factor_name, factor_ret in factor_returns_dict.items():
        factor_ret = np.asarray(factor_ret, dtype=float)
        min_len = min(len(strategy_returns), len(factor_ret))
        s = strategy_returns[:min_len]
        f = factor_ret[:min_len]

        corr = np.corrcoef(s, f)[0, 1]

        # Simple regression: strategy = alpha + beta * factor + epsilon
        beta = np.cov(s, f)[0, 1] / (np.var(f, ddof=1) + 1e-10)
        alpha = s.mean() - beta * f.mean()
        r_squared = corr ** 2

        results[factor_name] = {
            'correlation': corr,
            'r_squared': r_squared,
            'beta': beta,
            'residual_alpha_daily': alpha,
        }

    return results
```

### Market Impact Scaling (Square Root Law)

**Formula:**
```
Impact ~ sigma * sqrt(Q / V)
```
where sigma = daily volatility, Q = order quantity, V = daily volume.

```python
def estimated_market_impact(daily_volatility, order_size, daily_volume,
                             impact_coefficient=0.1):
    """
    Estimated market impact using the square root law.

    Parameters
    ----------
    daily_volatility : float
        Daily return volatility (e.g., 0.02 for 2%).
    order_size : float
        Number of shares (or dollar value) in the order.
    daily_volume : float
        Average daily volume.
    impact_coefficient : float
        Empirical calibration constant (typically 0.05-0.20).

    Returns
    -------
    float
        Estimated market impact as a fraction of price.
    """
    participation = order_size / daily_volume
    return impact_coefficient * daily_volatility * np.sqrt(participation)
```

---

## 9. Transaction Cost Analysis

### Cost Components

```
Net Return = Gross Return - Commissions - Spread Cost - Market Impact - Borrowing Cost - Funding Cost
```

| Cost Component | Typical Range | Notes |
|---------------|---------------|-------|
| Commission | 0.1 - 1.0 bps | Per-share or per-trade; tiered for volume |
| Half-spread | 0.5 - 50 bps | Minimum cost floor; wider for illiquid names |
| Market impact | 1 - 100 bps | Scales with sqrt(participation rate) |
| Borrowing (shorts) | 0.25 - 10% ann. | Hard-to-borrow can be 20%+ annualized |
| Funding (margin) | 3 - 8% ann. | Broker-dependent; leverage multiplier |

### Transaction Cost Model

```python
def net_returns(gross_returns, trades_per_period, avg_trade_value,
                commission_per_trade=1.0, half_spread_bps=1.0,
                impact_bps=2.0, short_ratio=0.0, borrow_rate_annual=0.005,
                leverage=1.0, funding_rate_annual=0.05, periods_per_year=252):
    """
    Compute net returns after all transaction costs.

    Parameters
    ----------
    gross_returns : array-like
        Gross period returns before costs.
    trades_per_period : float
        Average number of round-trip trades per period.
    avg_trade_value : float
        Average dollar value per trade.
    commission_per_trade : float
        Dollar commission per trade.
    half_spread_bps : float
        Half bid-ask spread in basis points (entry + exit = full spread).
    impact_bps : float
        Estimated market impact in basis points per trade.
    short_ratio : float
        Fraction of portfolio that is short (0-1).
    borrow_rate_annual : float
        Annual stock borrow rate for shorts.
    leverage : float
        Gross leverage (1.0 = unleveraged).
    funding_rate_annual : float
        Annual margin funding rate.
    periods_per_year : int
        Trading periods per year.

    Returns
    -------
    array
        Net returns after all costs.
    """
    gross_returns = np.asarray(gross_returns, dtype=float)

    # Commission cost per period
    commission_cost = (trades_per_period * commission_per_trade) / avg_trade_value

    # Spread cost per period (entry + exit for each trade)
    spread_cost = trades_per_period * 2 * (half_spread_bps / 10000)

    # Impact cost per period
    impact_cost = trades_per_period * (impact_bps / 10000)

    # Borrowing cost per period (for short positions)
    borrow_cost_per_period = short_ratio * borrow_rate_annual / periods_per_year

    # Funding cost per period (for leveraged positions)
    excess_leverage = max(leverage - 1, 0)
    funding_cost_per_period = excess_leverage * funding_rate_annual / periods_per_year

    total_cost_per_period = (commission_cost + spread_cost + impact_cost +
                              borrow_cost_per_period + funding_cost_per_period)

    return gross_returns - total_cost_per_period


def turnover_adjusted_returns(gross_returns, daily_turnover, cost_per_unit_turnover_bps=5.0):
    """
    Simplified cost model based on portfolio turnover.

    Parameters
    ----------
    gross_returns : array-like
        Gross daily returns.
    daily_turnover : float or array-like
        Daily portfolio turnover (e.g., 0.05 = 5% of portfolio traded daily).
    cost_per_unit_turnover_bps : float
        Cost in bps per unit of turnover (includes spread + impact + commission).

    Returns
    -------
    array
        Net returns.
    """
    gross_returns = np.asarray(gross_returns, dtype=float)
    daily_turnover = np.asarray(daily_turnover, dtype=float)
    cost = daily_turnover * cost_per_unit_turnover_bps / 10000
    return gross_returns - cost
```

### Tax Considerations

- **Wash sale rule (US):** Cannot claim a tax loss if substantially identical security is repurchased within 30 days before or after the sale. This affects tax-loss harvesting strategies.
- **Short-term vs long-term capital gains:** Positions held < 1 year taxed at ordinary income rates (up to 37%); held > 1 year taxed at long-term rates (up to 20%). High-frequency strategies are entirely short-term.
- **Tax drag estimation:** For active strategies, assume all gains are short-term. Tax drag = turnover * gain_rate * tax_rate.

---

## 10. Metric Anti-Patterns (CRITICAL)

These are the most common mistakes in strategy evaluation. Agents MUST flag these when detected.

### Anti-Pattern 1: Wrong Annualization Factor

```python
# WRONG: Using calendar days
sharpe_annual = daily_sharpe * np.sqrt(365)

# CORRECT: Using trading days
sharpe_annual = daily_sharpe * np.sqrt(252)
```

**Why it matters:** sqrt(365) / sqrt(252) = 1.20. This inflates the Sharpe by 20%.

### Anti-Pattern 2: Ignoring Autocorrelation

**Problem:** Serial correlation in daily returns inflates the naive Sharpe estimate. Positive autocorrelation (common in momentum strategies) makes the strategy appear less risky than it is.

**Solution:** Use the Newey-West adjusted Sharpe (see Section 2) or the Lo (2002) adjustment:
```python
# Lo (2002) adjustment for AR(1) returns
rho = np.corrcoef(returns[1:], returns[:-1])[0, 1]
adjustment = np.sqrt((1 + 2 * rho * (1 - rho**252) / (252 * (1 - rho))) )
# WARNING: simplified; use Newey-West for production
```

### Anti-Pattern 3: Survivorship Bias in Benchmarks

**Problem:** Comparing strategy returns against an index that only contains currently listed stocks. Delisted losers are excluded, inflating the benchmark.

**Solution:** Use point-in-time constituent data. Or compare against a total-market index that accounts for delistings.

### Anti-Pattern 4: Reporting Gross Returns

**Problem:** Gross returns ignore transaction costs, slippage, and market impact. A strategy with 15% gross return and 20% annual turnover might have 12% net; one with 200% turnover might have 2% net.

**Solution:** Always compute and report net returns. See Section 9 for cost models.

### Anti-Pattern 5: Drawdown on Log Returns

```python
# WRONG: Computing drawdown from cumulative log returns
log_cumsum = np.cumsum(np.log(1 + returns))
# ... then computing drawdown on log_cumsum

# CORRECT: Computing drawdown from equity curve
equity = np.cumprod(1 + returns)
running_max = np.maximum.accumulate(equity)
drawdown = equity / running_max - 1
```

**Why it matters:** Log returns are additive but do not accurately represent the actual capital loss experienced by the investor. A 50% drawdown in equity terms is not the same as -0.693 in log terms for risk management purposes.

### Anti-Pattern 6: Sharpe Without Confidence Intervals

**Problem:** Reporting "Sharpe = 1.8" without acknowledging uncertainty. With 2 years of daily data (504 observations), the standard error of the Sharpe ratio is approximately `sqrt((1 + 0.5 * SR^2) / T) * sqrt(252)` which for SR=1.8 gives SE ~0.35, meaning the 95% CI is roughly [1.1, 2.5].

**Solution:** Always report bootstrap confidence intervals (see Section 7).

### Anti-Pattern 7: Frequency-Blind Sharpe Thresholds

**Problem:** Using Sharpe < 0.5 as a universal rejection threshold. A high-frequency strategy trading 100 times/day with Sharpe = 0.3 may be extremely profitable due to high turnover and compounding. A monthly rebalance strategy needs Sharpe > 1.0 to overcome transaction costs.

**Context-dependent thresholds:**
| Frequency | Minimum Sharpe | Good Sharpe | Excellent Sharpe |
|-----------|---------------|-------------|------------------|
| HFT (intraday) | 0.2 | 0.5 | > 1.0 |
| Daily | 0.5 | 1.0 | > 2.0 |
| Weekly | 0.7 | 1.5 | > 2.5 |
| Monthly | 1.0 | 2.0 | > 3.0 |

### Anti-Pattern 8: Ignoring Multiple Testing (Deflated Sharpe Ratio)

**Problem:** Testing 1000 strategy variants and reporting the best one as "Sharpe = 2.5." With enough trials, random chance will produce high Sharpe ratios.

**Solution:** Use the Deflated Sharpe Ratio (Bailey and Lopez de Prado, 2014):
```python
def deflated_sharpe_ratio(observed_sharpe, n_trials, variance_of_sharpes,
                           skewness_of_returns, kurtosis_of_returns, T):
    """
    Deflated Sharpe Ratio accounting for multiple testing.

    Parameters
    ----------
    observed_sharpe : float
        Best observed Sharpe ratio (annualized).
    n_trials : int
        Number of strategy variants tested.
    variance_of_sharpes : float
        Variance of Sharpe ratios across all trials.
    skewness_of_returns : float
        Skewness of the best strategy's returns.
    kurtosis_of_returns : float
        Excess kurtosis of the best strategy's returns.
    T : int
        Number of return observations.

    Returns
    -------
    float
        Probability that the observed Sharpe is genuine (not due to chance).
    """
    # Expected maximum Sharpe under null (Euler-Mascheroni approximation)
    euler_mascheroni = 0.5772
    expected_max_sharpe = (np.sqrt(variance_of_sharpes) *
                           ((1 - euler_mascheroni) * stats.norm.ppf(1 - 1 / n_trials) +
                            euler_mascheroni * stats.norm.ppf(1 - 1 / (n_trials * np.e))))

    # Standard error of Sharpe estimate
    se_sharpe = np.sqrt((1 - skewness_of_returns * observed_sharpe +
                          (kurtosis_of_returns - 1) / 4 * observed_sharpe ** 2) / (T - 1))

    # DSR: probability observed SR exceeds expected maximum by chance
    dsr = stats.norm.cdf((observed_sharpe - expected_max_sharpe) / (se_sharpe + 1e-10))

    return dsr
```

### Anti-Pattern 9: Not Adjusting for Regime Changes

**Problem:** A 10-year backtest that includes 2008 and 2020 crises blends fundamentally different market regimes. Aggregate Sharpe can be misleading.

**Solution:** Report regime-decomposed metrics (see Section 6). At minimum, separate pre-crisis, crisis, and recovery periods.

### Anti-Pattern 10: Ignoring Capacity Constraints

**Problem:** Reporting 50% annual returns on a strategy that can only absorb $1M before market impact destroys the edge.

**Solution:** Always estimate capacity (see Section 8) and report returns alongside maximum deployable capital. A strategy's real value is risk-adjusted return times capacity.

---

## 11. Correct Implementation Examples

### Comprehensive StrategyMetrics Class

```python
import numpy as np
import pandas as pd
from scipy import stats
from scipy.stats import skew, kurtosis, spearmanr


class StrategyMetrics:
    """
    Comprehensive strategy evaluation metrics calculator.

    Computes all key metrics from a returns series. Handles edge cases,
    uses correct annualization, and provides confidence intervals.

    Usage
    -----
    >>> returns = pd.Series([0.001, -0.002, 0.003, ...])  # daily returns
    >>> sm = StrategyMetrics(returns, periods_per_year=252)
    >>> report = sm.full_report()
    >>> print(report)
    """

    def __init__(self, returns, benchmark_returns=None, risk_free_rate=0.0,
                 periods_per_year=252):
        """
        Parameters
        ----------
        returns : array-like or pd.Series
            Strategy period returns.
        benchmark_returns : array-like or pd.Series or None
            Benchmark returns for relative metrics.
        risk_free_rate : float
            Annualized risk-free rate.
        periods_per_year : int
            Trading periods per year (252 for daily, 52 for weekly, 12 for monthly).
        """
        self.returns = np.asarray(returns, dtype=float)
        self.benchmark = (np.asarray(benchmark_returns, dtype=float)
                          if benchmark_returns is not None else None)
        self.rf = risk_free_rate
        self.ppy = periods_per_year
        self._rf_per_period = (1 + risk_free_rate) ** (1 / periods_per_year) - 1
        self._equity = np.cumprod(1 + self.returns)
        self._excess = self.returns - self._rf_per_period

    # --- Performance ---

    def total_return(self):
        """Cumulative total return."""
        return self._equity[-1] - 1 if len(self._equity) > 0 else 0.0

    def cagr(self):
        """Compound Annual Growth Rate."""
        n = len(self.returns)
        if n == 0 or self._equity[-1] <= 0:
            return 0.0
        return self._equity[-1] ** (self.ppy / n) - 1

    def sharpe(self):
        """Annualized Sharpe ratio (naive, no autocorrelation adjustment)."""
        if self._excess.std(ddof=1) == 0:
            return 0.0
        return (self._excess.mean() / self._excess.std(ddof=1)) * np.sqrt(self.ppy)

    def sharpe_newey_west(self, max_lag=None):
        """Sharpe ratio with Newey-West autocorrelation adjustment."""
        T = len(self._excess)
        if max_lag is None:
            max_lag = int(np.floor(4 * (T / 100) ** (2 / 9)))

        mu = self._excess.mean()
        gamma_0 = np.var(self._excess, ddof=1)
        nw_var = gamma_0

        for lag in range(1, max_lag + 1):
            weight = 1 - lag / (max_lag + 1)
            gamma_lag = np.cov(self._excess[lag:], self._excess[:-lag], ddof=1)[0, 1]
            nw_var += 2 * weight * gamma_lag

        if nw_var <= 0:
            return 0.0
        return (mu / np.sqrt(nw_var)) * np.sqrt(self.ppy)

    def sortino(self, mar=0.0):
        """Annualized Sortino ratio."""
        excess = self.returns - mar
        downside = np.minimum(excess, 0)
        dd = np.sqrt(np.mean(downside ** 2))
        if dd == 0:
            return np.inf if excess.mean() > 0 else 0.0
        return (excess.mean() / dd) * np.sqrt(self.ppy)

    def calmar(self):
        """Calmar ratio: CAGR / |max drawdown|."""
        mdd = self.max_drawdown()
        c = self.cagr()
        if mdd == 0:
            return np.inf if c > 0 else 0.0
        return c / abs(mdd)

    def information_ratio(self):
        """Annualized Information Ratio vs benchmark."""
        if self.benchmark is None:
            return None
        active = self.returns[:len(self.benchmark)] - self.benchmark[:len(self.returns)]
        te = active.std(ddof=1)
        if te == 0:
            return 0.0
        return (active.mean() / te) * np.sqrt(self.ppy)

    # --- Risk ---

    def max_drawdown(self):
        """Maximum drawdown (negative decimal)."""
        running_max = np.maximum.accumulate(self._equity)
        drawdowns = self._equity / running_max - 1
        return drawdowns.min()

    def max_drawdown_details(self):
        """Max drawdown with peak/trough indices and duration."""
        running_max = np.maximum.accumulate(self._equity)
        drawdowns = self._equity / running_max - 1

        trough_idx = np.argmin(drawdowns)
        peak_idx = np.argmax(self._equity[:trough_idx + 1])

        recovery_idx = None
        peak_value = self._equity[peak_idx]
        for i in range(trough_idx + 1, len(self._equity)):
            if self._equity[i] >= peak_value:
                recovery_idx = i
                break

        return {
            'max_dd': drawdowns[trough_idx],
            'peak_idx': peak_idx,
            'trough_idx': trough_idx,
            'recovery_idx': recovery_idx,
            'duration': trough_idx - peak_idx,
            'recovery_time': (recovery_idx - trough_idx) if recovery_idx else None,
        }

    def volatility(self):
        """Annualized realized volatility."""
        return self.returns.std(ddof=1) * np.sqrt(self.ppy)

    def var_historical(self, confidence=0.95):
        """Historical Value at Risk (positive loss number)."""
        return -np.percentile(self.returns, (1 - confidence) * 100)

    def cvar_historical(self, confidence=0.95):
        """Historical Conditional VaR / Expected Shortfall."""
        var = self.var_historical(confidence)
        tail = self.returns[self.returns <= -var]
        return -tail.mean() if len(tail) > 0 else var

    def tail_metrics(self):
        """Skewness, kurtosis, and normality test."""
        s = skew(self.returns)
        k = kurtosis(self.returns)
        n = len(self.returns)
        jb = (n / 6) * (s ** 2 + k ** 2 / 4)
        jb_p = 1 - stats.chi2.cdf(jb, df=2)
        return {
            'skewness': s,
            'excess_kurtosis': k,
            'jarque_bera_stat': jb,
            'jarque_bera_pvalue': jb_p,
            'is_normal': jb_p > 0.05,
        }

    # --- Confidence ---

    def bootstrap_sharpe_ci(self, n_bootstrap=10000, confidence=0.95, seed=42):
        """Bootstrap confidence interval for Sharpe ratio."""
        np.random.seed(seed)
        n = len(self.returns)
        boot_sharpes = np.empty(n_bootstrap)

        for i in range(n_bootstrap):
            sample = np.random.choice(self.returns, size=n, replace=True)
            excess = sample - self._rf_per_period
            std = excess.std(ddof=1)
            boot_sharpes[i] = (excess.mean() / std * np.sqrt(self.ppy)) if std > 0 else 0.0

        alpha = 1 - confidence
        return {
            'point_estimate': self.sharpe(),
            'ci_lower': np.percentile(boot_sharpes, alpha / 2 * 100),
            'ci_upper': np.percentile(boot_sharpes, (1 - alpha / 2) * 100),
            'std_error': boot_sharpes.std(),
        }

    # --- Full Report ---

    def full_report(self):
        """
        Generate a comprehensive metrics report.

        Returns
        -------
        dict
            All key metrics organized by category.
        """
        report = {
            'performance': {
                'total_return': self.total_return(),
                'cagr': self.cagr(),
                'sharpe': self.sharpe(),
                'sharpe_newey_west': self.sharpe_newey_west(),
                'sortino': self.sortino(),
                'calmar': self.calmar(),
                'information_ratio': self.information_ratio(),
            },
            'risk': {
                'volatility': self.volatility(),
                'max_drawdown': self.max_drawdown(),
                'max_drawdown_details': self.max_drawdown_details(),
                'var_95': self.var_historical(0.95),
                'cvar_95': self.cvar_historical(0.95),
                'tail_metrics': self.tail_metrics(),
            },
            'confidence': self.bootstrap_sharpe_ci(),
            'meta': {
                'n_observations': len(self.returns),
                'periods_per_year': self.ppy,
                'risk_free_rate': self.rf,
                'has_benchmark': self.benchmark is not None,
            },
        }

        return report

    def summary_string(self):
        """Human-readable summary."""
        r = self.full_report()
        p = r['performance']
        risk = r['risk']
        ci = r['confidence']

        lines = [
            "=== Strategy Evaluation Report ===",
            f"Observations: {r['meta']['n_observations']} "
            f"({r['meta']['n_observations'] / self.ppy:.1f} years)",
            "",
            "--- Performance ---",
            f"Total Return:       {p['total_return']:.2%}",
            f"CAGR:               {p['cagr']:.2%}",
            f"Sharpe (naive):     {p['sharpe']:.3f}",
            f"Sharpe (NW adj):    {p['sharpe_newey_west']:.3f}",
            f"Sharpe 95% CI:      [{ci['ci_lower']:.3f}, {ci['ci_upper']:.3f}]",
            f"Sortino:            {p['sortino']:.3f}",
            f"Calmar:             {p['calmar']:.3f}",
            f"Information Ratio:  {p['information_ratio']}",
            "",
            "--- Risk ---",
            f"Volatility (ann):   {risk['volatility']:.2%}",
            f"Max Drawdown:       {risk['max_drawdown']:.2%}",
            f"  Duration:         {risk['max_drawdown_details']['duration']} periods",
            f"  Recovery:         {risk['max_drawdown_details']['recovery_time']} periods",
            f"VaR (95%):          {risk['var_95']:.4f}",
            f"CVaR (95%):         {risk['cvar_95']:.4f}",
            f"Skewness:           {risk['tail_metrics']['skewness']:.3f}",
            f"Excess Kurtosis:    {risk['tail_metrics']['excess_kurtosis']:.3f}",
            f"Normal (JB test):   {risk['tail_metrics']['is_normal']}",
        ]

        return "\n".join(lines)
```

### Usage Example

```python
import numpy as np

# Simulate a strategy with realistic properties
np.random.seed(42)
n_days = 252 * 3  # 3 years
daily_returns = np.random.normal(0.0003, 0.01, n_days)  # slight positive drift

# Add some autocorrelation (realistic)
for i in range(1, len(daily_returns)):
    daily_returns[i] += 0.05 * daily_returns[i - 1]

# Add a drawdown event
daily_returns[400:420] -= 0.02  # 20-day sell-off

# Compute all metrics
sm = StrategyMetrics(daily_returns, periods_per_year=252)
print(sm.summary_string())

# Get full report as dict
report = sm.full_report()

# Check for anti-patterns
naive_sharpe = report['performance']['sharpe']
nw_sharpe = report['performance']['sharpe_newey_west']
if abs(naive_sharpe - nw_sharpe) / (abs(naive_sharpe) + 1e-10) > 0.15:
    print(f"\nWARNING: Autocorrelation detected. Naive Sharpe ({naive_sharpe:.3f}) "
          f"differs from NW-adjusted ({nw_sharpe:.3f}) by "
          f"{abs(naive_sharpe - nw_sharpe) / abs(naive_sharpe) * 100:.1f}%")

if not report['risk']['tail_metrics']['is_normal']:
    print("\nWARNING: Returns are non-normal. Parametric VaR will underestimate risk.")

ci = report['confidence']
if ci['ci_upper'] - ci['ci_lower'] > 1.0:
    print(f"\nWARNING: Wide Sharpe CI [{ci['ci_lower']:.2f}, {ci['ci_upper']:.2f}]. "
          f"Insufficient data for reliable estimate.")
```

---

**End of Strategy Evaluation Metrics Reference.**
