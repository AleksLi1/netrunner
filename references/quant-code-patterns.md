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

## When to Load This Reference

This reference should be loaded by:
- **nr-executor** when writing code for quant projects — use as code review template
- **nr-debugger** when investigating LOOKAHEAD_CONTAMINATION or LEAKAGE issues — use as diagnostic checklist
- **nr-verifier** when verifying quant phase completion — use patterns to scan for anti-patterns in committed code
- **nr-mapper** (concerns focus) when flagging temporal risks — use anti-pattern summary to identify code smells
