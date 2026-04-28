# Quantitative Finance Code Patterns

## Purpose

This reference provides concrete correct vs. incorrect code patterns for common temporal contamination bugs in quantitative finance. These are not checklists — they are examples that activate expert reasoning about what temporal discipline looks like in code.

When this reference is active, the agent should use these patterns as diagnostic templates: "Does the code I'm reading/writing match the CORRECT pattern, or does it resemble the WRONG pattern?"

---

## Pattern 1: Rolling Feature Computation

The most common source of lookahead bias. A rolling window that includes the current bar leaks the current price into the feature.

**WRONG — includes current bar:**
```python
# The current bar's close is IN the rolling window
df['sma_20'] = df['close'].rolling(20).mean()
df['volatility'] = df['close'].rolling(60).std()
df['momentum'] = df['close'].pct_change(10)
```

**CORRECT — strictly lagged:**
```python
# shift(1) ensures we only use data available BEFORE the current bar
df['sma_20'] = df['close'].shift(1).rolling(20).mean()
df['volatility'] = df['close'].shift(1).rolling(60).std()
df['momentum'] = df['close'].shift(1).pct_change(10)
```

**Why this matters:** Without `shift(1)`, the feature at time T includes the close at time T. If you're predicting T+1 direction using features at T, and the feature includes T's close, you're giving the model partial information about the current bar — which it wouldn't have at prediction time (you'd be computing features before the bar closes).

**Exception:** If you explicitly predict AFTER bar close (i.e., features computed at bar close, prediction for next bar), then including the current bar is correct. But this must be intentional and documented, not accidental.

**Diagnostic question:** "At what point in the bar does prediction happen? Before close or after close?"

---

## Pattern 2: Normalization / Z-Scoring

Normalization computed over the full dataset leaks future distribution information.

**WRONG — global normalization:**
```python
# mean and std computed over ALL data including future
mean = df['feature'].mean()
std = df['feature'].std()
df['feature_z'] = (df['feature'] - mean) / std
```

**WRONG — sklearn StandardScaler on full data before split:**
```python
# Scaler learns from future data
scaler = StandardScaler()
df[features] = scaler.fit_transform(df[features])
train, test = temporal_split(df)
```

**CORRECT — expanding window normalization:**
```python
# At each point, normalize using only past data
df['feature_z'] = (
    (df['feature'] - df['feature'].expanding().mean().shift(1))
    / df['feature'].expanding().std().shift(1)
)
```

**CORRECT — fit scaler on training data only:**
```python
train, test = temporal_split(df)
scaler = StandardScaler()
train[features] = scaler.fit_transform(train[features])
test[features] = scaler.transform(test[features])  # transform only, no fit
```

**Why this matters:** Global normalization means the model knows the future mean and standard deviation of each feature. This is subtle information leakage — the model can use the deviation from the "normal" level as a signal, but in production it won't know what "normal" is because the future hasn't happened yet.

---

## Pattern 3: Train/Test Split

Random splits on time series data are meaningless. Temporal ordering must be preserved.

**WRONG — random split:**
```python
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
```

**WRONG — random K-fold:**
```python
from sklearn.model_selection import KFold
kf = KFold(n_splits=5, shuffle=True)  # shuffle=True is catastrophic
```

**CORRECT — temporal split:**
```python
split_idx = int(len(df) * 0.8)
train = df.iloc[:split_idx]
test = df.iloc[split_idx:]
```

**CORRECT — walk-forward with purging:**
```python
def walk_forward_splits(df, n_splits=5, purge_bars=60, embargo_bars=10):
    """Walk-forward CV with purge gap and embargo."""
    total = len(df)
    test_size = total // (n_splits + 1)

    for i in range(n_splits):
        train_end = total - (n_splits - i) * test_size
        # Purge: remove last purge_bars from training to prevent overlap
        train = df.iloc[:train_end - purge_bars]
        # Embargo: skip embargo_bars after purge before test starts
        test_start = train_end + embargo_bars
        test_end = test_start + test_size
        test = df.iloc[test_start:test_end]

        yield train, test
```

**Why purging matters:** If the model uses 60 bars of history as input, then the last 60 training samples overlap with the first test sample's context. The purge gap removes these overlapping samples.

**Why embargo matters:** Financial returns are autocorrelated. Even after purging, samples near the boundary may carry information about each other. The embargo adds an extra buffer.

---

## Pattern 4: EMA / Exponential Moving Average

EMA is particularly dangerous because its recursive nature means future data contamination is invisible.

**WRONG — pandas ewm on full series:**
```python
# EMA at time T uses the close at time T
df['ema_20'] = df['close'].ewm(span=20).mean()
```

**CORRECT — lagged EMA:**
```python
# Compute EMA on shifted series
df['ema_20'] = df['close'].shift(1).ewm(span=20).mean()
```

**CORRECT — explicit recursive implementation with strict lagging:**
```python
def compute_ema(series, span, lag=1):
    """EMA using only data available at prediction time."""
    lagged = series.shift(lag)
    return lagged.ewm(span=span).mean()
```

**Subtle danger with EMA:** Even `shift(1)` may not be enough if the EMA is used as input to another computation that doesn't lag properly. Trace the full computation chain from raw data to model input.

---

## Pattern 5: Target Variable Construction

The label itself can contain lookahead if not constructed carefully.

**WRONG — future return as label (off by one):**
```python
# At time T, the label uses close[T+1] / close[T] - 1
# But if features at T include close[T], the label and features share information
df['target'] = df['close'].pct_change(1).shift(-1)
# This is: (close[T+1] - close[T]) / close[T]
# The denominator close[T] is in both feature and label
```

**CORRECT — clear temporal separation:**
```python
# Label: direction of NEXT bar's return
# Features: computed from data[T-1] and earlier
# No shared data points between features and labels
df['target'] = (df['close'].shift(-1) > df['close']).astype(int)

# Verify: features use shift(1), label uses shift(-1)
# Gap between feature data and label data is 2 bars minimum
```

**Diagnostic question:** "Draw the timeline. At time T, what data do the features use? What data does the label use? Is there ANY overlap?"

---

## Pattern 6: Feature Selection / Importance

Feature selection on the full dataset is data snooping.

**WRONG — select features using all data:**
```python
# Feature importance computed on full dataset including test period
model.fit(X, y)
importances = model.feature_importances_
selected = importances > threshold
```

**WRONG — correlation-based selection on full data:**
```python
# Correlation with target computed over ALL samples
correlations = df[features].corrwith(df['target'])
best_features = correlations.abs().nlargest(10).index
```

**CORRECT — feature selection inside cross-validation:**
```python
for train, test in walk_forward_splits(df):
    # Select features using ONLY training data
    model.fit(train[features], train['target'])
    importances = model.feature_importances_
    selected = [f for f, imp in zip(features, importances) if imp > threshold]

    # Evaluate on test using only selected features
    preds = model.predict(test[selected])
```

**Why this matters:** If you select the 10 best features out of 100 using the full dataset, you've implicitly used the test set to choose what information the model gets. The selected features are partially "tuned" to the test set.

---

## Pattern 7: Hyperparameter Tuning

Tuning on the test set is the most common form of backtest overfitting.

**WRONG — tune on test set:**
```python
best_sharpe = 0
for lr in [0.001, 0.01, 0.1]:
    for depth in [3, 5, 7]:
        model = train(X_train, y_train, lr=lr, depth=depth)
        sharpe = evaluate(model, X_test, y_test)  # WRONG: test set used for selection
        if sharpe > best_sharpe:
            best_params = (lr, depth)
```

**CORRECT — nested cross-validation:**
```python
# Outer loop: walk-forward for final evaluation
# Inner loop: walk-forward for hyperparameter selection
for train_outer, test_outer in walk_forward_splits(df):
    best_sharpe = 0
    for lr in [0.001, 0.01, 0.1]:
        # Inner CV on training data only
        inner_sharpes = []
        for train_inner, val_inner in walk_forward_splits(train_outer):
            model = train(train_inner, lr=lr)
            inner_sharpes.append(evaluate(model, val_inner))

        if np.mean(inner_sharpes) > best_sharpe:
            best_lr = lr

    # Final model with best params, evaluated on outer test
    model = train(train_outer, lr=best_lr)
    final_sharpe = evaluate(model, test_outer)  # This is the real performance
```

**Rule of thumb:** The test set should be touched ONCE. If you've evaluated more than one configuration on it, you've contaminated it.

---

## Pattern 8: Data Joining / Merging

Joining datasets by timestamp can introduce lookahead if timestamps don't align.

**WRONG — forward-fill after join (leaks future data):**
```python
# If df2 has data at irregular intervals, forward-fill pulls future values backward
merged = df1.merge(df2, on='timestamp', how='left')
merged['external_feature'] = merged['external_feature'].fillna(method='ffill')
# But if df2's data arrives with a delay, the "filled" value at time T
# might be from a data point that wasn't available yet at time T
```

**CORRECT — as-of join with known publication delay:**
```python
# Account for publication lag
PUBLICATION_DELAY = pd.Timedelta(hours=1)  # data arrives 1 hour late
df2['available_at'] = df2['timestamp'] + PUBLICATION_DELAY

# Only join data that was actually available at prediction time
merged = pd.merge_asof(
    df1.sort_values('timestamp'),
    df2.sort_values('available_at'),
    left_on='timestamp',
    right_on='available_at',
    direction='backward'  # only use past data
)
```

**Why this matters:** Economic data (GDP, employment), corporate data (earnings, filings), and even exchange data (settlements, adjustments) all have publication delays. Using the "as-reported" timestamp instead of the "as-published" timestamp is lookahead bias.

---

## Pattern 9: Transaction Cost Modeling

Backtests without transaction costs are fantasies.

**WRONG — mid-price execution:**
```python
# Assumes perfect execution at the mid price
entry_price = df['close']
exit_price = df['close'].shift(-holding_period)
pnl = exit_price - entry_price
```

**CORRECT — realistic execution model:**
```python
def realistic_pnl(df, holding_period, spread_bps=5, slippage_bps=2, commission_bps=1):
    """P&L with realistic execution costs."""
    total_cost_bps = spread_bps / 2 + slippage_bps + commission_bps  # per side

    entry_price = df['close'] * (1 + total_cost_bps / 10000)  # buy at ask + slippage
    exit_price = df['close'].shift(-holding_period) * (1 - total_cost_bps / 10000)  # sell at bid - slippage

    pnl = exit_price - entry_price
    return pnl

# Better: use actual bid/ask if available
def pnl_with_orderbook(df, holding_period):
    entry_price = df['ask'] + estimate_slippage(df['ask_size'], order_size)
    exit_price = df['bid'].shift(-holding_period) - estimate_slippage(df['bid_size'], order_size)
    return exit_price - entry_price
```

**Rule of thumb for crypto (BTC/USDT):**
- Maker: 1-2 bps
- Taker: 3-5 bps
- Slippage at $100K order: 1-5 bps depending on liquidity
- Total round-trip cost: 5-15 bps minimum

**A strategy that generates 10 bps per trade with 10 bps of costs is a break-even strategy, not a profitable one.**

---

## Pattern 10: Reproducibility

Reproducibility is a requirement, not a nice-to-have. If you can't reproduce a result, it's not a result.

**Minimum reproducibility checklist:**
```python
# 1. Fix all random seeds
import random
import numpy as np
import torch

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

# 2. Log everything
experiment = {
    'seed': 42,
    'data_version': 'v3.2',  # or git hash of data
    'data_hash': hashlib.md5(df.to_csv().encode()).hexdigest(),
    'features': feature_list,
    'hyperparams': hyperparams,
    'train_period': (train_start, train_end),
    'test_period': (test_start, test_end),
    'git_hash': subprocess.check_output(['git', 'rev-parse', 'HEAD']).strip(),
    'timestamp': datetime.now().isoformat(),
}

# 3. Pin ALL dependencies
# requirements.txt with EXACT versions:
# numpy==1.24.3
# pandas==2.0.2
# torch==2.0.1

# 4. Version your data
# DVC, git-lfs, or at minimum: save data hashes
```

**Expert note:** "I got Sharpe 2.5" without a reproducibility package is the same as "I got Sharpe 2.5 in my dreams." If someone else can't reproduce it, it doesn't exist.

---

## Anti-Pattern Summary

| Anti-Pattern | What Goes Wrong | Quick Check |
|---|---|---|
| Rolling window includes current bar | Feature leaks current price | Look for `.rolling()` without `.shift(1)` |
| Global normalization | Future distribution leaked | Look for `StandardScaler` before `train_test_split` |
| Random train/test split | Temporal leakage, inflated metrics | Look for `shuffle=True` on time series |
| EMA on unshifted data | Current bar in feature | Look for `.ewm()` without `.shift(1)` |
| Feature selection on full data | Data snooping, selection bias | Look for `feature_importances_` computed once on all data |
| Hyperparameter tuning on test set | Backtest overfitting | Count how many configs were evaluated on test |
| Forward-fill without publication delay | Future data via merge | Look for `.fillna(method='ffill')` after joins |
| Mid-price execution assumption | Costs ignored, fantasy P&L | Look for P&L computed from `close` price only |
| Missing random seeds | Non-reproducible results | Look for `random.seed` / `np.random.seed` / `torch.manual_seed` |

---

## Pattern 11: Feature Rolling Statistics with Temporal Guard

Rolling statistics are the most common feature type — and the most common source of lookahead.

**WRONG — current bar included in rolling window:**
```python
df['ma_20'] = df['close'].rolling(20).mean()
df['vol_20'] = df['close'].rolling(20).std()
df['skew_20'] = df['close'].rolling(20).skew()
```

**CORRECT — shift before roll:**
```python
df['ma_20'] = df['close'].shift(1).rolling(20).mean()
df['vol_20'] = df['close'].shift(1).rolling(20).std()
df['skew_20'] = df['close'].shift(1).rolling(20).skew()

# Also exclude warm-up period from training/evaluation
df = df.iloc[21:]  # 1 shift + 20 rolling = 21 bars warm-up
```

**Why warm-up matters:** The first 20 rows of a rolling(20) computation use fewer than 20 bars (partial windows). These are unreliable features and should be excluded. NaN-dropping is not enough — even rows 2-19 have noisy estimates.

---

## Pattern 12: Cross-Sectional Normalization

When ranking or normalizing across multiple assets, survivorship and timing matter.

**WRONG — normalize across all assets including future:**
```python
# At each timestamp, normalize across all assets — but which assets?
# If you use the current universe, you include assets that may not have existed then
def cross_sectional_zscore(df_wide):
    return (df_wide - df_wide.mean(axis=1).values.reshape(-1,1)) / df_wide.std(axis=1).values.reshape(-1,1)
```

**CORRECT — normalize only on assets available at that timestamp:**
```python
def safe_cross_sectional_zscore(df_wide, listing_dates):
    """Only include assets that were listed/trading at each timestamp."""
    result = df_wide.copy()
    for idx in df_wide.index:
        # Only include assets that were available at this point in time
        available = [col for col in df_wide.columns
                     if listing_dates.get(col, pd.Timestamp.max) <= idx]
        row = df_wide.loc[idx, available]
        if len(row.dropna()) >= 5:  # minimum assets for meaningful z-score
            mean, std = row.mean(), row.std()
            if std > 0:
                result.loc[idx, available] = (row - mean) / std
            else:
                result.loc[idx, available] = 0
        else:
            result.loc[idx] = np.nan
    return result
```

**Why this matters:** If your cross-sectional normalization includes Tesla in 2005 (it wasn't public until 2010), you're creating a fantasy universe. Similarly, including delisted companies in "current" rankings introduces survivorship bias.

---

## Pattern 13: Sharpe Ratio Calculation

The most reported metric in quant finance — and the most commonly miscalculated.

**WRONG — ignoring autocorrelation and using wrong annualization:**
```python
# Common but flawed
sharpe = returns.mean() / returns.std() * np.sqrt(252)
```

**WRONG — annualizing daily Sharpe with 365 instead of 252:**
```python
sharpe = returns.mean() / returns.std() * np.sqrt(365)  # WRONG: 252 trading days, not 365
```

**CORRECT — with Newey-West adjustment for autocorrelation:**
```python
import statsmodels.api as sm

def sharpe_ratio_adjusted(returns, risk_free_rate=0.0, freq=252):
    """Sharpe ratio with Newey-West correction for autocorrelated returns.

    Autocorrelated returns inflate the naive Sharpe estimate.
    The correction adjusts the standard deviation estimate.
    """
    excess = returns - risk_free_rate / freq
    n = len(excess)
    mean_r = excess.mean()

    # Newey-West bandwidth selection (common rule of thumb)
    max_lag = int(np.ceil(4 * (n / 100) ** (2/9)))

    # Newey-West adjusted variance
    nw = sm.OLS(excess, np.ones(n)).fit(cov_type='HAC',
        cov_kwds={'maxlags': max_lag})
    adjusted_se = nw.bse[0]
    adjusted_std = adjusted_se * np.sqrt(n)

    sharpe = mean_r / adjusted_std * np.sqrt(freq)
    return sharpe

# Also: bootstrap confidence interval
def sharpe_ci(returns, n_bootstrap=10000, ci=0.95, freq=252):
    """Bootstrap confidence interval for Sharpe ratio."""
    sharpes = []
    n = len(returns)
    for _ in range(n_bootstrap):
        sample = np.random.choice(returns, size=n, replace=True)
        s = sample.mean() / sample.std() * np.sqrt(freq)
        sharpes.append(s)
    lower = np.percentile(sharpes, (1 - ci) / 2 * 100)
    upper = np.percentile(sharpes, (1 + ci) / 2 * 100)
    return lower, upper
```

**Key insight:** A Sharpe of 1.5 with a confidence interval of [0.3, 2.7] is NOT a reliable strategy — the true Sharpe could easily be below 1.0. Always report CIs.

---

## Pattern 14: Transaction Cost Modeling

A strategy's profitability is entirely dependent on cost assumptions.

**WRONG — fixed percentage cost:**
```python
cost_per_trade = 0.001  # 10 bps flat — grossly oversimplified
net_return = gross_return - cost_per_trade * abs(position_change)
```

**CORRECT — component-based cost model:**
```python
def estimate_transaction_cost(
    price, quantity, spread_bps, adv,
    volatility, commission_per_share=0.005
):
    """Realistic transaction cost with spread + impact + commission.

    Args:
        price: Execution price
        quantity: Number of shares/units
        spread_bps: Bid-ask spread in basis points
        adv: Average daily volume (shares/units)
        volatility: Daily return volatility
        commission_per_share: Broker commission
    """
    notional = price * abs(quantity)
    participation_rate = abs(quantity) / adv

    # 1. Half-spread cost (crossing the bid-ask)
    spread_cost = notional * (spread_bps / 2) / 10000

    # 2. Market impact (square root model: Almgren-Chriss)
    impact_cost = notional * volatility * np.sqrt(participation_rate)

    # 3. Commission
    commission = abs(quantity) * commission_per_share

    total = spread_cost + impact_cost + commission
    return total, {
        'spread': spread_cost, 'impact': impact_cost,
        'commission': commission, 'participation_rate': participation_rate
    }
```

**Rule:** If your strategy trades frequently and `participation_rate > 0.01` (1% of daily volume), market impact dominates. At `> 0.05`, the strategy is likely capacity-constrained.

---

## Pattern 15: Position Sizing

Equal-weight portfolios ignore risk — volatility-adjusted sizing is the minimum bar.

**WRONG — equal weight:**
```python
# Every position gets equal capital regardless of risk
position_size = total_capital / n_positions
```

**CORRECT — volatility-adjusted (inverse volatility weighting):**
```python
def volatility_adjusted_size(
    signals, returns_history, target_vol=0.10, lookback=60
):
    """Size positions inversely proportional to their volatility.

    Args:
        signals: dict of {asset: signal_strength}
        returns_history: DataFrame of asset returns (shifted — no current bar!)
        target_vol: Target portfolio annualized volatility
        lookback: Volatility estimation window
    """
    # Estimate volatility using only PAST data
    vols = returns_history.iloc[-lookback:].std() * np.sqrt(252)

    # Inverse volatility weights
    raw_weights = {}
    for asset, signal in signals.items():
        if asset in vols.index and vols[asset] > 0:
            raw_weights[asset] = signal / vols[asset]

    # Normalize to target volatility
    total = sum(abs(w) for w in raw_weights.values())
    if total > 0:
        scale = target_vol / (total * np.mean(list(vols[list(signals.keys())])))
        weights = {a: w * scale for a, w in raw_weights.items()}
    else:
        weights = {a: 0 for a in signals}

    return weights
```

**Advanced:** Kelly criterion (theoretical optimum) is aggressive. Use half-Kelly or fractional Kelly (0.25-0.5) in practice. Full Kelly has too much variance.

---

## Pattern 16: Walk-Forward with Purging and Embargo

The gold standard for time series cross-validation. Pattern 3 showed basic walk-forward — this adds proper purging and embargo.

**WRONG — adjacent train/test windows:**
```python
# No gap between train and test — autocorrelation leaks information
for i in range(n_folds):
    train_end = fold_size * (i + 1)
    test_start = train_end  # WRONG: no gap
    test_end = test_start + fold_size
```

**CORRECT — with purge gap and embargo:**
```python
def walk_forward_purged(df, n_splits=5, max_train_size=None,
                        purge_bars=60, embargo_pct=0.01):
    """Walk-forward CV with purging and embargo.

    Purge: removes training samples whose label period overlaps with
           the test set's feature lookback period.
    Embargo: additional buffer after purge to handle autocorrelation.

    Args:
        purge_bars: Number of bars to purge before each test set.
                    Should equal max(feature_lookback, label_horizon).
        embargo_pct: Fraction of test set size to use as embargo.
    """
    n = len(df)
    test_size = n // (n_splits + 1)
    embargo_bars = max(1, int(test_size * embargo_pct))

    for i in range(n_splits):
        test_start = n - (n_splits - i) * test_size
        test_end = test_start + test_size

        # Purge: remove training samples near the test boundary
        train_end = test_start - purge_bars

        # Embargo: skip samples after test set (for expanding window)
        embargo_end = test_end + embargo_bars

        if max_train_size:
            train_start = max(0, train_end - max_train_size)
        else:
            train_start = 0

        if train_end <= train_start:
            continue  # Skip if insufficient training data

        train_idx = list(range(train_start, train_end))
        test_idx = list(range(test_start, test_end))

        yield train_idx, test_idx
```

**Purge gap calculation:** `purge_bars = max(feature_lookback_period, label_forward_horizon)`. If your features use 60 bars of history AND your label is 5-bar forward return, `purge_bars = 60`.

---

## Pattern 17: Feature Importance with Temporal Integrity

Feature importance must respect temporal structure — single-split importance is misleading.

**WRONG — single-split permutation importance:**
```python
from sklearn.inspection import permutation_importance
# Computed on a SINGLE train/test split — highly unstable
result = permutation_importance(model, X_test, y_test, n_repeats=10)
important_features = result.importances_mean > 0
```

**CORRECT — walk-forward averaged permutation importance:**
```python
def temporal_permutation_importance(model_fn, X, y, n_splits=5,
                                    purge_bars=60, n_repeats=5):
    """Permutation importance averaged across walk-forward folds.

    Stable estimates require multiple temporal folds. A feature
    important in only 1 of 5 folds is likely noise.
    """
    importance_per_fold = []

    for train_idx, test_idx in walk_forward_purged(
        X, n_splits=n_splits, purge_bars=purge_bars
    ):
        model = model_fn()
        model.fit(X.iloc[train_idx], y.iloc[train_idx])

        # Base score
        base_score = model.score(X.iloc[test_idx], y.iloc[test_idx])

        # Permute each feature
        importances = {}
        for col in X.columns:
            scores = []
            for _ in range(n_repeats):
                X_perm = X.iloc[test_idx].copy()
                X_perm[col] = np.random.permutation(X_perm[col].values)
                scores.append(model.score(X_perm, y.iloc[test_idx]))
            importances[col] = base_score - np.mean(scores)

        importance_per_fold.append(importances)

    # Average across folds — also compute stability
    result = pd.DataFrame(importance_per_fold)
    return pd.DataFrame({
        'mean_importance': result.mean(),
        'std_importance': result.std(),
        'stability': (result > 0).mean(),  # Fraction of folds where feature was important
    }).sort_values('mean_importance', ascending=False)
```

**Stability column is key:** A feature with high mean importance but `stability < 0.6` is unreliable across time periods.

---

## Pattern 18: Label Construction

Labels define what the model learns. Off-by-one errors here corrupt everything.

**WRONG — ambiguous forward return:**
```python
# What does this actually predict? Return from current close to next close.
# If features include current close, there's shared information.
df['label'] = (df['close'].shift(-1) > df['close']).astype(int)
```

**CORRECT — explicit forward return with clear temporal boundary:**
```python
def construct_labels(df, forward_bars=5, threshold_bps=0):
    """Construct labels with explicit temporal boundary documentation.

    Timeline:
    - Features at time T use data from T-1 and earlier (shift(1) applied)
    - Label at time T = forward return from T to T+forward_bars
    - Gap between feature data and label start = 1 bar (current bar)

    Args:
        forward_bars: How many bars ahead to measure return
        threshold_bps: Minimum return in bps for positive label (filters noise)
    """
    # Forward return: close[T + forward_bars] / close[T] - 1
    forward_return = df['close'].shift(-forward_bars) / df['close'] - 1

    if threshold_bps > 0:
        threshold = threshold_bps / 10000
        labels = pd.Series(0, index=df.index)  # 0 = no trade
        labels[forward_return > threshold] = 1   # long
        labels[forward_return < -threshold] = -1  # short
    else:
        labels = (forward_return > 0).astype(int)

    # Drop last forward_bars rows (no valid label)
    labels.iloc[-forward_bars:] = np.nan

    return labels, forward_return

# CRITICAL: verify no overlap
# Features use data[T-1] and earlier
# Labels use data[T] to data[T+forward_bars]
# The current bar close[T] is in the label but NOT in features
# This is correct: we predict what close[T] will lead to
```

**Threshold tuning:** Using `threshold_bps=0` creates 50/50 labels dominated by noise. A threshold of 5-20 bps (depending on frequency) filters out noise returns and creates more learnable labels.

---

## Pattern 19: Regime Detection

Regime models must be fit without future data — a subtle but critical requirement.

**WRONG — HMM fit on full dataset:**
```python
from hmmlearn import hmm

# Fitting on ALL data means regime labels at time T use future information
model = hmm.GaussianHMM(n_components=3)
model.fit(returns.values.reshape(-1, 1))
regimes = model.predict(returns.values.reshape(-1, 1))
```

**CORRECT — expanding window HMM refit:**
```python
def online_regime_detection(returns, n_regimes=3, min_history=252):
    """Regime detection using only past data at each point.

    At each timestamp T, fit HMM on returns[0:T] and predict regime at T.
    This is computationally expensive but temporally correct.
    """
    regimes = pd.Series(np.nan, index=returns.index)

    for t in range(min_history, len(returns)):
        try:
            model = hmm.GaussianHMM(
                n_components=n_regimes,
                covariance_type="full",
                n_iter=100,
                random_state=42
            )
            history = returns.iloc[:t].values.reshape(-1, 1)
            model.fit(history)

            # Predict current regime using only past data
            regimes.iloc[t] = model.predict(history)[-1]
        except Exception:
            regimes.iloc[t] = regimes.iloc[t-1]  # Carry forward on failure

    return regimes

# Optimization: refit every N bars instead of every bar
def periodic_regime_detection(returns, n_regimes=3, refit_every=20, min_history=252):
    """Refit every N bars for computational efficiency."""
    regimes = pd.Series(np.nan, index=returns.index)
    current_model = None

    for t in range(min_history, len(returns)):
        if t % refit_every == 0 or current_model is None:
            try:
                current_model = hmm.GaussianHMM(
                    n_components=n_regimes, n_iter=100, random_state=42
                )
                current_model.fit(returns.iloc[:t].values.reshape(-1, 1))
            except Exception:
                pass

        if current_model is not None:
            regimes.iloc[t] = current_model.predict(
                returns.iloc[max(0,t-252):t].values.reshape(-1, 1)
            )[-1]

    return regimes
```

**Why full-dataset HMM is wrong:** If the HMM at time T "knows" about a 2020 crash that hasn't happened yet (from fitting on 2015-2025), the regime label at 2019 will be influenced by future crash data. This leaks the timing of regime transitions.

---

## Pattern 20: Ensemble with Temporal Cross-Validation

Stacking ensembles must respect temporal ordering at every level.

**WRONG — standard k-fold stacking:**
```python
from sklearn.model_selection import cross_val_predict, KFold

# Inner CV shuffles time — stacked predictions use future information
kf = KFold(n_splits=5, shuffle=True)
meta_features = cross_val_predict(base_model, X, y, cv=kf)
meta_model.fit(meta_features, y)
```

**CORRECT — temporal stacking with non-overlapping folds:**
```python
def temporal_stacking(base_models, X, y, n_splits=5, purge_bars=60):
    """Stacking ensemble that respects temporal ordering.

    Level 1: Each base model generates OOS predictions via walk-forward.
    Level 2: Meta-learner trains on OOS predictions (also walk-forward).
    """
    n = len(X)
    meta_features = pd.DataFrame(index=X.index)

    # Level 1: Generate OOS predictions for each base model
    for name, model_fn in base_models.items():
        oos_preds = pd.Series(np.nan, index=X.index)

        for train_idx, test_idx in walk_forward_purged(
            X, n_splits=n_splits, purge_bars=purge_bars
        ):
            model = model_fn()
            model.fit(X.iloc[train_idx], y.iloc[train_idx])
            oos_preds.iloc[test_idx] = model.predict(X.iloc[test_idx])

        meta_features[name] = oos_preds

    # Drop NaN rows (from first fold where no OOS predictions exist)
    valid_idx = meta_features.dropna().index
    meta_X = meta_features.loc[valid_idx]
    meta_y = y.loc[valid_idx]

    # Level 2: Train meta-learner (also walk-forward!)
    # Simple approach: use second half of OOS predictions for meta-training
    split = len(meta_X) // 2
    meta_train_X = meta_X.iloc[:split]
    meta_train_y = meta_y.iloc[:split]
    meta_test_X = meta_X.iloc[split:]
    meta_test_y = meta_y.iloc[split:]

    from sklearn.linear_model import Ridge
    meta_model = Ridge(alpha=1.0)  # Simple meta-learner — resist the urge to overfit
    meta_model.fit(meta_train_X, meta_train_y)

    return meta_model, meta_features

# CRITICAL: The meta-learner must NEVER see the same data that base models were trained on.
# Walk-forward ensures base model OOS predictions are truly out-of-sample.
# A simple average of base model predictions often beats a learned meta-learner.
```

**Ensemble diversity:** If all base models are LightGBM with slightly different hyperparameters, the ensemble adds nothing. Combine structurally different models: tree-based + linear + neural network.

---

## Extended Anti-Pattern Summary

| Anti-Pattern | What Goes Wrong | Quick Check |
|---|---|---|
| Rolling window includes current bar | Feature leaks current price | Look for `.rolling()` without `.shift(1)` |
| Global normalization | Future distribution leaked | Look for `StandardScaler` before `train_test_split` |
| Random train/test split | Temporal leakage, inflated metrics | Look for `shuffle=True` on time series |
| EMA on unshifted data | Current bar in feature | Look for `.ewm()` without `.shift(1)` |
| Feature selection on full data | Data snooping, selection bias | Look for `feature_importances_` computed once on all data |
| Hyperparameter tuning on test set | Backtest overfitting | Count how many configs were evaluated on test |
| Forward-fill without publication delay | Future data via merge | Look for `.fillna(method='ffill')` after joins |
| Mid-price execution assumption | Costs ignored, fantasy P&L | Look for P&L computed from `close` price only |
| Missing random seeds | Non-reproducible results | Look for `random.seed` / `np.random.seed` / `torch.manual_seed` |
| Feature warm-up excluded | Unreliable partial-window features | Check if first N rows are dropped for rolling(N) |
| Cross-sectional survivorship | Future universe knowledge | Check if normalization universe changes over time |
| Sharpe without autocorrelation adjustment | Inflated risk-adjusted returns | Look for raw `mean/std * sqrt(252)` |
| Fixed cost model | Understated execution costs | Look for flat bps instead of spread+impact+commission |
| Equal-weight positions | Risk-ignorant sizing | Check if vol-adjusted sizing is implemented |
| No purge/embargo in walk-forward | Train-test info leakage | Check gap between train_end and test_start |
| Single-split feature importance | Unstable importance estimates | Check if importance averaged across folds |
| Ambiguous label construction | Off-by-one temporal errors | Verify shift direction and forward horizon |
| Full-dataset regime detection | Future regime information leaked | Check if HMM/changepoint uses expanding window |
| K-fold stacking | Temporal leakage in ensemble | Look for `KFold(shuffle=True)` in stacking |
| Simple average as "ensemble" | No diversity benefit | Check if base models are structurally different |

---

## Pattern 21: Overlapping Return Windows (P&L Inflation)

A strategy that generates signals every bar but holds for multiple bars can count the same price movement multiple times, inflating P&L by 10-60x.

**WRONG — overlapping returns counted multiple times:**
```python
# Signal fires every bar, hold horizon = 10 bars
# Each bar's return is counted in up to 10 overlapping trades
total_pnl = 0
for i in range(len(signals)):
    if signals[i] == 1:
        pnl = prices[i + 10] / prices[i] - 1
        total_pnl += pnl  # OVERLAPS with adjacent signals!

# Real failure: Strategy showed +170,000 bps
# After fixing overlaps: +2,800 bps (60x inflation)
```

**CORRECT — non-overlapping trade accounting:**
```python
# Method 1: Only count trades that don't overlap
total_pnl = 0
last_exit = -1
for i in range(len(signals)):
    if signals[i] == 1 and i > last_exit:
        exit_bar = i + 10
        pnl = prices[exit_bar] / prices[i] - 1
        total_pnl += pnl
        last_exit = exit_bar

# Method 2: Mark-to-market position tracking
position = 0
daily_returns = []
for i in range(1, len(prices)):
    daily_returns.append(position * (prices[i] / prices[i-1] - 1))
    if signals[i] == 1:
        position = 1  # Enter or maintain
    elif i - last_entry >= 10:
        position = 0  # Exit after hold period
# P&L = sum(daily_returns) — no overlap possible
```

**Diagnostic question:** "If two trades overlap in time, is the price movement in the overlap counted once or twice?"

**Detection rule:** Compare total trade P&L to mark-to-market P&L. If they differ by >10%, overlapping returns are likely present.

---

## Pattern 22: Normalization Bug (Zero-Sum Signal Destruction)

Z-scoring training features using training-set statistics makes them sum to zero, destroying any signal that correlates with feature magnitude.

**WRONG — z-scoring destroys directional signal:**
```python
# After this, sum of normalized features = 0 by mathematical identity
mean = X_train.mean(axis=0)
std = X_train.std(axis=0)
X_train_z = (X_train - mean) / std
# If direction correlates with feature LEVEL (not just relative ranking),
# this normalization removes that information entirely

# Real failure: 42 models trained on z-scored features
# All converged to 50.9% — the noise floor
# Honest signal existed but was destroyed by preprocessing
```

**CORRECT — preserve signal while stabilizing scale:**
```python
# Option 1: Expanding-window normalization (causal, preserves cross-time signal)
for t in range(lookback, len(X)):
    window = X[max(0, t-lookback):t]  # Strictly past data
    mean_t = window.mean(axis=0)
    std_t = window.std(axis=0).clip(min=1e-8)
    X_norm[t] = (X[t] - mean_t) / std_t

# Option 2: Rank transform (preserves ordering, robust to outliers)
from scipy.stats import rankdata
X_ranked = np.apply_along_axis(lambda x: rankdata(x) / len(x), 0, X_train)

# Option 3: If you must z-score, verify signal preservation
raw_ic = np.corrcoef(X_train.mean(axis=1), y_train)[0, 1]
normed_ic = np.corrcoef(X_train_z.mean(axis=1), y_train)[0, 1]
assert abs(normed_ic) >= abs(raw_ic) * 0.5, "Normalization destroyed >50% of signal"
```

**Diagnostic question:** "After normalization, do the features still correlate with the labels? Test this explicitly."

---

## Pattern 23: Within-Window Lookahead for Regime Detection

Computing volatility terciles or regime labels using data from the ENTIRE window (including the portion being evaluated) leaks information about the current state.

**WRONG — regime labels use within-window data:**
```python
# Volatility terciles computed on the full evaluation window
window_data = returns[start:end]
vol = window_data.rolling(20).std()
terciles = pd.qcut(vol, 3, labels=['low', 'mid', 'high'])
# Problem: the tercile boundaries use data from the CURRENT bar
# You're using information about whether current vol is "high" or "low"
# relative to the rest of the window — which you wouldn't know in real time
```

**CORRECT — regime labels from strictly past data:**
```python
# Expanding-window regime detection
for t in range(lookback, len(returns)):
    past_vol = returns[:t].rolling(20).std()
    current_vol = returns[t-20:t].std()
    # Tercile boundaries from past data only
    boundaries = past_vol.quantile([0.33, 0.67])
    if current_vol < boundaries.iloc[0]:
        regime[t] = 'low_vol'
    elif current_vol < boundaries.iloc[1]:
        regime[t] = 'mid_vol'
    else:
        regime[t] = 'high_vol'
```

**Diagnostic question:** "Are the regime boundaries/tercile thresholds computed from data that includes the current evaluation period?"

---

## Pattern 24: Shuffled CV Masking Complete Absence of Signal

Shuffled cross-validation on time series data gives dramatically inflated scores because it allows the model to memorize temporal autocorrelation patterns that span train/test boundaries.

**WRONG — shuffled CV hides temporal failure:**
```python
from sklearn.model_selection import cross_val_score, KFold

# XGBoost stacking with shuffled K-Fold
kf = KFold(n_splits=5, shuffle=True, random_state=42)
scores = cross_val_score(model, X, y, cv=kf, scoring='accuracy')
print(f"Accuracy: {scores.mean():.2f}")  # Shows 0.74

# Real failure: Temporal CV on the SAME model → 0.50
# 100% of the apparent skill was temporal leakage
# The model memorized autocorrelation patterns crossing fold boundaries
```

**CORRECT — temporal CV as ground truth:**
```python
from sklearn.model_selection import TimeSeriesSplit

# ALWAYS use temporal CV for time series
tscv = TimeSeriesSplit(n_splits=5)
scores = []
for train_idx, test_idx in tscv.split(X):
    model.fit(X[train_idx], y[train_idx])
    score = model.score(X[test_idx], y[test_idx])
    scores.append(score)

# DIAGNOSTIC: If shuffled >> temporal, the model has ZERO real skill
shuffled_score = 0.74  # From shuffled CV
temporal_score = 0.50  # From temporal CV
if shuffled_score > temporal_score * 1.3:
    print(f"WARNING: {(shuffled_score/temporal_score - 1)*100:.0f}% of skill is leakage")
```

**Rule:** Run BOTH shuffled and temporal CV. If shuffled > 1.3x temporal, the model has no real predictive power.

---

## Pattern 25: Simulation Loop with Zero Transaction Costs

Research scripts that simulate strategy performance without accounting for transaction costs produce results that are guaranteed to fail in production for any intraday strategy.

**WRONG — simulation ignores costs:**
```python
# Simulation loop that looks great on paper
pnl = 0
for signal, actual_return in zip(signals, returns):
    if signal == 1:  # Predicted up
        pnl += actual_return
    elif signal == -1:  # Predicted down
        pnl -= actual_return
    # NO COSTS APPLIED!

# Real failure: +2,381 bps without costs
# With 7 bps round-trip costs: +79 bps
# A 30x difference that destroyed the business case
```

**CORRECT — costs are non-negotiable:**
```python
# Every position change incurs costs
pnl = 0
prev_position = 0
ONE_WAY_COST_BPS = 3.5  # Conservative one-way cost

for i, (signal, actual_return) in enumerate(zip(signals, returns)):
    new_position = signal  # -1, 0, or 1

    # Cost on position change
    position_change = abs(new_position - prev_position)
    cost = position_change * ONE_WAY_COST_BPS / 10000

    # P&L from holding
    holding_pnl = prev_position * actual_return

    pnl += holding_pnl - cost
    prev_position = new_position

# ALWAYS report both gross and net P&L
print(f"Gross P&L: {gross_pnl:.0f} bps")
print(f"Cost drag: {total_costs:.0f} bps")
print(f"Net P&L:   {pnl:.0f} bps")
print(f"Cost/Gross ratio: {total_costs/max(gross_pnl, 1):.1%}")
```

**Hard rule:** If `cost_drag / gross_pnl > 0.70`, the strategy is not viable. The edge is too thin relative to execution costs.

---

## Pattern 26: Parameter Selection on Evaluation Data

Selecting strategy parameters (thresholds, lookbacks, sizing) by testing them on the same data used to evaluate the final strategy. This is the most insidious form of overfitting because each "improvement" feels justified.

**WRONG — tuning on evaluation data:**
```python
# "Let me try different agreement thresholds on the test set"
for threshold in [0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90]:
    accuracy = evaluate_with_threshold(model, X_test, y_test, threshold)
    print(f"Threshold {threshold}: accuracy {accuracy:.2%}")

# Pick the best one → 0.80 gives 73%!
# But you just tested 7 variants on test data
# Real accuracy is lower, and you burned your test set

# Real failure: 88+ such "improvements" on same evaluation data
# DSR = 6.8% — only 6.8% chance the result is real
# Expected max Sharpe from 65 zero-alpha trials = 2.37
# Observed Sharpe = 2.13 — LOWER than expected by chance
```

**CORRECT — nested validation:**
```python
# Split into train / validation / test (or better: walk-forward)
# Use validation for parameter selection, test ONLY for final evaluation

# Walk-forward parameter selection:
best_params = {}
for window_start in range(0, len(data) - train_size - val_size - test_size, step):
    train = data[window_start : window_start + train_size]
    val = data[window_start + train_size : window_start + train_size + val_size]

    # Tune on validation
    best_val_score = -np.inf
    for threshold in [0.60, 0.70, 0.80, 0.90]:
        score = evaluate(model, val, threshold)
        if score > best_val_score:
            best_val_score = score
            best_params[window_start] = threshold

# Final evaluation: use best params from validation, evaluate on held-out test
# Count TOTAL variants tested across ALL windows → use for DSR calculation
```

**Rule:** Every parameter choice is an implicit hypothesis test. Count them ALL toward N when computing DSR.

---

## Anti-Pattern Summary Table (Updated)

| # | Anti-Pattern | Impact | How to Detect |
|---|---|---|---|
| ... | (patterns 1-20 above) | ... | ... |
| 21 | Overlapping return windows | P&L inflated 10-60x | Compare trade P&L to mark-to-market P&L |
| 22 | Z-score normalization destroying signal | Model trains on noise, converges to ~50% | Check feature-label correlation before/after normalization |
| 23 | Within-window regime lookahead | Inflated regime-conditional performance | Check if tercile/regime boundaries use evaluation-period data |
| 24 | Shuffled CV on time series | Inflates accuracy 20-50% | Compare shuffled vs temporal CV scores |
| 25 | Simulation with zero costs | P&L inflated by cost drag (often 5-30x) | Check if position changes incur any cost |
| 26 | Parameter selection on evaluation data | DSR collapses under multiple testing | Count total variants tested, compute DSR |
| 27 | Alternating/interleaved train-test splits | Massive temporal leakage via autocorrelation | Check if split function creates temporally interleaved blocks |
| 28 | 100% fill rate assumption | 2-3x cost underestimation in live trading | Check if fill_rate is hardcoded to 1.0 or not modeled |
| 29 | Signal latency not modeled | Signal decay during execution eats alpha | Check if signal-to-order latency impacts are assessed |
| 30 | Static orderbook depth assumption | 5-10x capacity overestimation | Check if depth params are regime-conditional |
| 31 | Constant HMM transition matrix | Regime detection fails during transitions | Check if HMM transition probs are time-varying |
| 32 | Short-window regime inference | Excessive regime switching (whipsaw) | Check if regime window < 100 bars on minute data |

---

## Pattern 27: Alternating/Interleaved Train-Test Splits (REAL CASE)

Discovered in production repo. Data was split using alternating 3-day blocks between train and test, creating massive leakage.

**WRONG — interleaved blocks:**
```python
# Alternating 3-day blocks: train, test, train, test, ...
def alternating_3d_split(data, block_size=3):
    train_mask = np.zeros(len(data), dtype=bool)
    for i in range(0, len(data), block_size * 2):
        train_mask[i:i+block_size] = True
    return data[train_mask], data[~train_mask]

# Result: 70% "test" accuracy → 50% on true OOS
# Because feature windows (60+ bars) bridge train/test boundaries
```

**CORRECT — strict chronological split with purge:**
```python
def temporal_split(data, train_ratio=0.7, purge_bars=60, embargo_bars=10):
    split_idx = int(len(data) * train_ratio)
    train = data[:split_idx]
    test = data[split_idx + purge_bars + embargo_bars:]
    # purge_bars >= max feature window
    # embargo_bars >= prediction horizon
    return train, test
```

**Real impact:** Model appeared to have 70% directional accuracy. After fixing: ~50% (random). Entire project's results were invalidated.

---

## Pattern 28: Fill Rate and Execution Cost Illusion (REAL CASE)

Discovered in production execution system. Backtest assumed 100% fills at mid-price. Live: 65% fill rate, 8.1 bps costs vs 3.5 bps assumed.

**WRONG — optimistic execution model:**
```python
# Backtest: instant fill at mid-price, flat cost
cost_per_trade = 0.00035  # 3.5 bps flat
fill_rate = 1.0  # 100% fills assumed

for signal in signals:
    entry_price = mid_price  # Fantasy price
    pnl = exit_price - entry_price - cost_per_trade * entry_price
```

**CORRECT — realistic execution model:**
```python
import numpy as np

def realistic_execution_cost(trade_size_usd, daily_volume_usd, spread_bps,
                              sigma_daily, fee_bps=1.0):
    """Square-root impact law: Impact = sigma * sqrt(Q/V)"""
    spread_cost = spread_bps / 2  # Half-spread per side
    impact = sigma_daily * 10000 * np.sqrt(trade_size_usd / daily_volume_usd)
    total_one_way = spread_cost + impact + fee_bps
    return total_one_way  # in bps, per side

def simulate_with_realistic_fills(signals, prices, volume, volatility,
                                   fill_rate=0.65, latency_bars=1):
    """Simulate with partial fills, slippage, and latency."""
    pnl = 0
    for i, signal in enumerate(signals):
        if signal == 0:
            continue
        # Latency: order placed at bar i, fills at bar i + latency
        fill_bar = i + latency_bars
        if fill_bar >= len(prices):
            continue
        # Partial fill: only fill_rate fraction of desired size
        if np.random.random() > fill_rate:
            continue  # Order didn't fill
        # Slippage: price moved during latency
        entry_price = prices[fill_bar]  # Not mid_price at signal time
        cost = realistic_execution_cost(
            trade_size_usd=abs(signal) * entry_price,
            daily_volume_usd=volume[fill_bar],
            spread_bps=2.0,
            sigma_daily=volatility[fill_bar]
        )
        # ... compute P&L with realistic entry and costs
```

**Real impact:** Strategy Sharpe dropped from 2.0 to 0.8 after applying realistic costs. 2.3x cost inflation.

---

## Pattern 29: Signal Latency Eating Alpha (REAL CASE)

Signal on 1-minute BTC perp futures decays significantly within execution window (200-500ms).

**WRONG — ignoring signal persistence:**
```python
# Generate signal → trade immediately (assume zero latency)
signal = model.predict(features_at_bar_close)
execute_trade(signal, price=current_price)  # Assumes instant execution
```

**CORRECT — model signal persistence and only trade when edge survives latency:**
```python
def signal_persistence_analysis(signal_series, return_series, max_delay_bars=10):
    """Measure how quickly signal predictive power decays with delay."""
    results = {}
    for delay in range(max_delay_bars + 1):
        delayed_returns = return_series.shift(-delay)
        ic = signal_series.corr(delayed_returns, method='spearman')
        results[delay] = ic
    return results  # IC at each delay → estimate half-life

# Only trade when signal strength exceeds latency-adjusted threshold
persistence = signal_persistence_analysis(signal, returns)
latency_ic = persistence[estimated_latency_bars]
if latency_ic / persistence[0] < 0.5:
    print("WARNING: Signal loses >50% of power during execution latency")
    print("Options: higher timeframe, faster infrastructure, or accept reduced alpha")
```

---

## Pattern 30: Constant HMM Transition Matrix (REAL CASE)

Market simulator used constant HMM transition probabilities. Real markets have time-varying regime dynamics.

**WRONG — static transition matrix:**
```python
from hmmlearn import hmm

model = hmm.GaussianHMM(n_components=3, n_iter=100)
model.fit(full_dataset)  # Single calibration on all data
# model.transmat_ is CONSTANT across all time periods
# During crisis, transition probs to high-vol state are much higher than average
```

**CORRECT — time-varying or regime-aware transitions:**
```python
def rolling_hmm_calibration(data, window_size=500, n_states=3):
    """Recalibrate HMM on expanding/rolling window for time-varying dynamics."""
    transition_history = []
    for end in range(window_size, len(data)):
        window = data[end - window_size:end]
        model = hmm.GaussianHMM(n_components=n_states, n_iter=50)
        model.fit(window.reshape(-1, 1))
        transition_history.append(model.transmat_.copy())
    return transition_history  # Track how transitions evolve

# For simulation: draw transition matrix from historical distribution
# conditioned on current volatility regime
```

**Real impact:** Simulator indistinguishability score 84/100 in normal conditions, but orderbook depth stability was 5-10x overestimated during stress events.

---

## When to Load This Reference

This reference should be loaded by:
- **nr-executor** when writing code for quant projects — use as code review template
- **nr-debugger** when investigating LOOKAHEAD_CONTAMINATION or LEAKAGE issues — use as diagnostic checklist
- **nr-verifier** when verifying quant phase completion — use patterns to scan for anti-patterns in committed code
- **nr-mapper** (concerns focus) when flagging temporal risks — use anti-pattern summary to identify code smells
- **nr-quant-auditor** when performing automated code scanning — use all 26 patterns as detection rules
- **Backtest audit pipeline** — patterns 21-26 are the most common production failure modes
