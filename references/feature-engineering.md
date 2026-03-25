# Feature Engineering Lifecycle Reference

Comprehensive reference for feature engineering in quantitative trading systems.
Covers extraction through ablation with temporal safety enforced at every step.

---

## 1. When to Load This Reference

**Loaded by:** nr-executor, nr-researcher, nr-verifier, nr-quant-auditor

**Trigger keywords:** feature, rolling, indicator, signal, normalization, cross-sectional,
IC, information coefficient, ablation, feature importance, feature selection, rolling window,
lookback, z-score, rank, momentum, mean reversion, VWAP, microstructure

**Load condition:** Feature engineering detected in CONTEXT.md, current task, or code under review.

**See also:** `quant-finance.md` (reasoning triggers), `quant-code-patterns.md` (code patterns),
`verification-patterns.md` (validation framework)

---

## 2. Feature Categories for Trading

### Price-Based
- **Returns:** Log (`np.log(close/close.shift(1))`, additive over time) vs arithmetic (`pct_change()`, additive over assets). Multi-horizon: 1d, 5d, 10d, 21d, 63d. Always use `shift(1)` base when constructing return features.
- **Volatility:** Realized (`returns.shift(1).rolling(N).std() * sqrt(252)`), Garman-Klass (uses OHLC: `0.5*log(H/L)^2 - (2*log(2)-1)*log(C/O)^2`), Parkinson (high-low range: `sqrt(1/(4*log(2)) * log(H/L)^2)`), vol ratio (short/long term as regime indicator).
- **Momentum:** Rate of change (`close.shift(1)/close.shift(N+1) - 1`), RSI-like (ratio of up moves to total over lookback), cross-sectional momentum rank (percentile vs peers), momentum crash indicator (cross-sectional dispersion — high = crowded trade).
- **Mean reversion:** Z-score of price vs MA (`(close.shift(1) - ma) / std`), Bollinger band position, half-life from Ornstein-Uhlenbeck fit on residuals.

### Volume-Based
- **VWAP deviation:** `(close - vwap) / vwap` — institutional flow proxy
- **Volume profile:** Volume at price levels — identifies support/resistance
- **OBV (On-Balance Volume):** Cumulative volume signed by price direction
- **Relative volume:** `volume.shift(1) / volume.shift(1).rolling(20).mean()` — unusual activity detection
- **Volume-weighted momentum:** Returns weighted by relative volume — higher conviction signals
- **Volume clock:** Resample by volume bars instead of time bars for more uniform information flow

### Microstructure
- **Bid-ask spread (quoted):** `(ask - bid) / midpoint` — direct liquidity measure
- **Bid-ask spread (effective):** `2 * |trade_price - midpoint| / midpoint` — actual execution cost
- **Order book imbalance:** `(bid_size - ask_size) / (bid_size + ask_size)` — short-term direction
- **Trade flow imbalance:** Buy vs sell volume classified via tick rule or Lee-Ready algorithm
- **Kyle's lambda:** Price impact from `delta_price = lambda * signed_volume + eps`
- **Amihud illiquidity:** `|return| / dollar_volume` averaged over rolling window

### Cross-Asset
- Rolling correlations (MUST `shift(1)` both series), relative strength vs sector/market, macro factors (rates, VIX, credit spreads), lead-lag (Granger, unstable).

### Fundamental
- Earnings yield, book-to-price, debt ratios, credit ratings, earnings surprise, accruals.
- **CRITICAL:** Use ANNOUNCEMENT dates, not period-end. Q4 data released Feb 15 is not available Dec 31.

```python
# WRONG: period-end date = lookahead
df = pd.merge(prices, fundamentals, left_on='date', right_on='quarter_end')

# CORRECT: as-of join on announcement date
df = pd.merge_asof(prices.sort_values('date'),
    fundamentals.sort_values('announcement_date'),
    left_on='date', right_on='announcement_date', direction='backward')
```

### Sentiment
- News NLP (use publication timestamp), social media aggregates, COT reports (use release date, not data date), analyst revisions (use revision date).

### Alternative Data
- Satellite imagery, web traffic, app usage, credit card aggregates, geolocation, job postings.
- **Always verify actual availability date** — many vendors backfill or revise.

---

## 3. Feature Extraction Techniques

### 3.1 Rolling Statistics
```python
def rolling_features(df, col='close', windows=[5, 10, 21, 63]):
    """Rolling stats with temporal safety. shift(1) excludes current bar."""
    features = pd.DataFrame(index=df.index)
    lagged = df[col].shift(1)  # CRITICAL: shift first
    for w in windows:
        p = f'{col}_r{w}'
        features[f'{p}_mean'] = lagged.rolling(w).mean()
        features[f'{p}_std'] = lagged.rolling(w).std()
        features[f'{p}_skew'] = lagged.rolling(w).skew()
        features[f'{p}_kurt'] = lagged.rolling(w).kurt()
        features[f'{p}_zscore'] = (lagged - features[f'{p}_mean']) / features[f'{p}_std']
    return features
```

### 3.2 Wavelet Decomposition
```python
import pywt

def wavelet_features(series, wavelet='db4', level=4):
    """Multi-scale decomposition. Apply to shifted series for temporal safety."""
    shifted = series.shift(1).dropna().values
    coeffs = pywt.wavedec(shifted, wavelet, level=level)
    features = {}
    for i in range(level + 1):
        coeff_copy = [np.zeros_like(c) for c in coeffs]
        coeff_copy[i] = coeffs[i]
        component = pywt.waverec(coeff_copy, wavelet)[:len(shifted)]
        features[f'wavelet_L{i}_energy'] = np.sum(component**2)
    return features
```

### 3.3 Fourier / Spectral Features
```python
from scipy.fft import rfft, rfftfreq

def spectral_features(series, window=63):
    """Dominant frequency and spectral entropy from rolling windows."""
    shifted = series.shift(1)
    def _spectrum(x):
        yf = rfft(x.dropna().values)
        power = np.abs(yf)**2
        freqs = rfftfreq(len(x.dropna()))
        dominant = freqs[1:][np.argmax(power[1:])]
        entropy = -np.sum((power[1:]/power[1:].sum()) * np.log(power[1:]/power[1:].sum() + 1e-10))
        return dominant  # or entropy
    return shifted.rolling(window).apply(_spectrum, raw=False)
```

### 3.4 PCA Embeddings (Walk-Forward)
```python
def pca_features_wf(feature_matrix, n_components=5, train_window=252):
    """Walk-forward PCA: fit on past only, transform current row. Never fit on full dataset."""
    result = pd.DataFrame(index=feature_matrix.index,
                          columns=[f'pca_{i}' for i in range(n_components)])
    for i in range(train_window, len(feature_matrix)):
        train = feature_matrix.iloc[i-train_window:i]
        scaler = StandardScaler().fit(train.dropna())
        pca = PCA(n_components=n_components).fit(scaler.transform(train.dropna()))
        result.iloc[i] = pca.transform(scaler.transform(feature_matrix.iloc[[i]]))[0]
    return result.astype(float)
```

### 3.5 Regime Features (HMM)
```python
from hmmlearn.hmm import GaussianHMM

def regime_features(returns, n_regimes=3, train_window=504):
    """Walk-forward HMM: fit on past, predict current state."""
    shifted = returns.shift(1).dropna()
    regimes = pd.Series(index=shifted.index, dtype=float)
    for i in range(train_window, len(shifted)):
        train = shifted.iloc[i-train_window:i].values.reshape(-1, 1)
        model = GaussianHMM(n_components=n_regimes, covariance_type='full', n_iter=100, random_state=42)
        model.fit(train)
        regimes.iloc[i] = model.predict(shifted.iloc[i:i+1].values.reshape(-1, 1))[0]
    return regimes
```

### 3.6 Calendar Features
```python
def calendar_features(dates):
    """Cyclical encoding. No temporal safety concern — calendar is deterministic."""
    f = pd.DataFrame(index=dates)
    f['dow_sin'] = np.sin(2 * np.pi * dates.dayofweek / 5)
    f['dow_cos'] = np.cos(2 * np.pi * dates.dayofweek / 5)
    f['month_sin'] = np.sin(2 * np.pi * dates.month / 12)
    f['month_cos'] = np.cos(2 * np.pi * dates.month / 12)
    f['quarter_end'] = ((dates.month % 3 == 0) & (dates.day >= 25)).astype(int)
    return f
```

---

## 4. Temporal Safety Rules (CRITICAL SECTION)

This is where most feature engineering bugs live. Every rule has been observed
violated in production. Violations inflate backtests and guarantee live losses.

### Rule 1: Point-in-Time Enforcement
Every feature uses only data available at the timestamp. Fundamental data uses
announcement date, not period-end. (See Section 2 code example.)

### Rule 2: Shift-Before-Roll
```python
# WRONG: current bar in window = lookahead
df['sma_20'] = df['close'].rolling(20).mean()        # uses close[t-19:t+1]

# CORRECT: shift excludes current bar
df['sma_20'] = df['close'].shift(1).rolling(20).mean()  # uses close[t-20:t]
```

### Rule 3: No Future Bar Inclusion
```python
# Labels: shift BACKWARD (negative) — the future we predict
df['fwd_ret_5d'] = df['close'].shift(-5) / df['close'] - 1

# Features: shift FORWARD (positive) — only past data
df['past_ret_5d'] = df['close'].shift(1) / df['close'].shift(6) - 1
# NEVER mix directions
```

### Rule 4: Normalization Window Constraints
```python
# WRONG: full-dataset stats = lookahead
df[cols] = StandardScaler().fit_transform(df[cols])

# CORRECT: expanding window (only past observations)
def expanding_normalize(s):
    shifted = s.shift(1)
    return (shifted - shifted.expanding(20).mean()) / shifted.expanding(20).std()

# CORRECT: fixed lookback
def rolling_normalize(s, w=252):
    shifted = s.shift(1)
    return (shifted - shifted.rolling(w).mean()) / shifted.rolling(w).std()
```

### Rule 5: Cross-Sectional Feature Safety
```python
# WRONG: current universe = survivorship bias
features['rank'] = features.groupby('date')['ret_12m'].rank(pct=True)  # using today's S&P 500

# CORRECT: point-in-time universe membership
for date in dates:
    universe = get_universe_at_date(date)  # historical membership lookup
    mask = (features['date'] == date) & (features['ticker'].isin(universe))
    features.loc[mask, 'rank'] = features.loc[mask, 'ret_12m'].rank(pct=True)
```

### Rule 6: Feature Warm-Up Period
```python
# WRONG: training on rows with NaN/partial features
model.fit(df[features], df['label'])

# CORRECT: exclude warm-up
max_lookback = 50
df_valid = df.iloc[max_lookback + 1:].copy()  # +1 for shift
assert df_valid[features].isna().sum().sum() == 0
model.fit(df_valid[features], df_valid['label'])
```

---

## 5. Feature Construction Anti-Patterns

| # | Bug | Fix |
|---|-----|-----|
| 1 | `.rolling()` without `.shift(1)` | Always shift first |
| 2 | Full-dataset normalization before split | Expanding/rolling normalization |
| 3 | Off-by-one in label shift direction | Labels: `shift(-N)`, features: `shift(+N)` |
| 4 | Survivorship in cross-sectional features | Point-in-time universe membership |
| 5 | `fillna(method='bfill')` = future data | `ffill` with limit, or expanding mean |
| 6 | Correlation on overlapping windows | Non-overlapping returns or Newey-West adjustment |
| 7 | Log returns for features, arithmetic for labels | Be consistent; document the choice |
| 8 | No handling of market holidays/gaps | `ffill` with limit; mark multi-day gaps as NaN |

```python
# Anti-pattern 1 in detail:
# WRONG: includes current bar
df['vol_20'] = df['returns'].rolling(20).std()
# CORRECT: shift excludes current bar
df['vol_20'] = df['returns'].shift(1).rolling(20).std()

# Anti-pattern 5 in detail:
# WRONG: backfill pulls future values into past rows
df['feat'] = df['feat'].fillna(method='bfill')
# CORRECT: forward fill with limit, or expanding mean of past
df['feat'] = df['feat'].fillna(method='ffill', limit=5)
df['feat'] = df['feat'].fillna(df['feat'].shift(1).expanding().mean())

# Anti-pattern 8 in detail:
# WRONG: no gap handling — multi-day return treated as 1d
df['ret_1d'] = df['close'] / df['close'].shift(1) - 1  # after 3-day weekend = 3-day return
# CORRECT: detect and mark gaps
df['gap_days'] = (df.index - df.index.shift(1)).dt.days
df.loc[df['gap_days'] > 1, 'ret_1d'] = np.nan  # exclude multi-day returns
```

---

## 6. Feature Selection Methods

### 6.1 Univariate: Walk-Forward Mutual Information
```python
from sklearn.feature_selection import mutual_info_regression

def walkforward_mi(features, target, n_splits=5):
    """MI on walk-forward folds. NEVER on full dataset."""
    fold_size = len(features) // n_splits
    mi_scores = []
    for i in range(n_splits):
        end = fold_size * (i + 1)
        train_end = int(end * 0.6) + fold_size * i
        mi = mutual_info_regression(features.iloc[fold_size*i:train_end].fillna(0),
                                     target.iloc[fold_size*i:train_end])
        mi_scores.append(mi)
    return pd.Series(np.mean(mi_scores, axis=0), index=features.columns)
```

### 6.2 Model-Based: Walk-Forward Permutation Importance
```python
from sklearn.inspection import permutation_importance

def wf_permutation_importance(model, features, target, n_splits=5):
    """MUST be walk-forward averaged. Single-split importance is misleading."""
    fold_size = len(features) // (n_splits + 1)
    importances = []
    for i in range(n_splits):
        train_end = fold_size * (i + 1)
        test_end = train_end + fold_size
        model.fit(features.iloc[:train_end], target.iloc[:train_end])
        result = permutation_importance(model, features.iloc[train_end:test_end],
                                         target.iloc[train_end:test_end], n_repeats=10)
        importances.append(result.importances_mean)
    return pd.DataFrame({'mean_imp': np.mean(importances, axis=0),
        'stability': np.mean(importances, axis=0) / (np.std(importances, axis=0) + 1e-10)
    }, index=features.columns).sort_values('mean_imp', ascending=False)
```

### 6.3 Stability-Based: Rank Consistency Across Folds
```python
def feature_rank_stability(features, target, n_splits=10):
    fold_size = len(features) // (n_splits + 1)
    rankings = []
    for i in range(n_splits):
        train_end = fold_size * (i + 1)
        corr = features.iloc[:train_end].corrwith(target.iloc[:train_end]).abs()
        rankings.append(corr.rank(ascending=False))
    rank_df = pd.DataFrame(rankings)
    return pd.DataFrame({'mean_rank': rank_df.mean(), 'rank_cv': rank_df.std() / rank_df.mean()
    }).sort_values('rank_cv')  # Lower CV = more stable
```

### 6.4 Multiple Testing Correction
```python
from scipy import stats

def bonferroni(p_values, alpha=0.05):
    """Conservative: divide alpha by N tests."""
    return p_values < (alpha / len(p_values))

def benjamini_hochberg(p_values, alpha=0.05):
    """FDR control: less conservative."""
    n = len(p_values)
    sorted_idx = np.argsort(p_values)
    sorted_p = p_values[sorted_idx]
    thresholds = np.arange(1, n+1) / n * alpha
    sig = sorted_p <= thresholds
    if sig.any():
        max_k = np.max(np.where(sig))
        result = np.zeros(n, dtype=bool)
        result[sorted_idx[:max_k+1]] = True
        return result
    return np.zeros(n, dtype=bool)
```

---

## 7. Feature Evaluation

### 7.1 Information Coefficient (IC)
```python
from scipy.stats import spearmanr

def compute_ic(feature, forward_returns):
    """IC = Spearman rank corr between feature and forward return."""
    valid = pd.DataFrame({'f': feature, 'r': forward_returns}).dropna()
    if len(valid) < 30: return None
    # Cross-sectional IC by date
    ic_by_date = valid.groupby('date').apply(lambda x: spearmanr(x['f'], x['r'])[0])
    mu, sigma = ic_by_date.mean(), ic_by_date.std()
    n = len(ic_by_date.dropna())
    return {'mean_ic': mu, 'ic_std': sigma,
            'ic_ir': mu/sigma if sigma > 0 else 0,        # >0.5 good, >1.0 excellent
            't_stat': mu/(sigma/np.sqrt(n)) if sigma > 0 else 0,  # >2.0 significant
            'pct_positive': (ic_by_date > 0).mean()}
```

### 7.2 IC Decay Analysis
```python
def ic_decay(feature, prices, horizons=[1,2,5,10,20]):
    """IC at multiple horizons. Should decay monotonically; non-monotonic = noise."""
    results = {}
    for h in horizons:
        fwd = prices['close'].shift(-h) / prices['close'] - 1
        ic = compute_ic(feature, fwd)
        if ic: results[f'{h}d'] = ic['mean_ic']
    vals = list(results.values())
    monotonic = all(abs(vals[i]) >= abs(vals[i+1]) for i in range(len(vals)-1))
    return {'ic_by_horizon': results, 'monotonic': monotonic,
            'warning': None if monotonic else 'NON-MONOTONIC: may be noise'}
```

### 7.3 Turnover Analysis
```python
def feature_turnover(feature_series):
    """High turnover = high transaction costs."""
    ranked = feature_series.groupby('date').rank(pct=True)
    turnover = 1 - ranked.groupby(level=1).apply(lambda x: x.corr(x.shift(1))).mean()
    return {'turnover': turnover,
            'level': 'LOW' if turnover < 0.1 else 'MOD' if turnover < 0.3 else 'HIGH'}
```

### 7.4 Regime Stability
```python
def regime_ic(feature, fwd_returns, regime_labels):
    """IC per regime. Robust features have consistent sign across regimes."""
    results = {r: compute_ic(feature[regime_labels==r], fwd_returns[regime_labels==r])
               for r in regime_labels.unique()}
    ics = [r['mean_ic'] for r in results.values() if r]
    consistent = all(ic > 0 for ic in ics) or all(ic < 0 for ic in ics)
    return {'regime_ic': results, 'consistent': consistent}
```

### 7.5 Marginal Contribution
```python
def marginal_contribution(feat_name, all_feats, target, model_class, n_splits=5):
    """Walk-forward: model with vs without the feature."""
    other = [f for f in all_feats.columns if f != feat_name]
    ic_with = np.mean(walkforward_eval(all_feats, target, model_class, n_splits))
    ic_without = np.mean(walkforward_eval(all_feats[other], target, model_class, n_splits))
    return {'feature': feat_name, 'ic_with': ic_with, 'ic_without': ic_without,
            'marginal': ic_with - ic_without}
```

---

## 8. Feature Ablation Methodology

### 8.1 Leave-One-Out (Walk-Forward)
```python
def loo_ablation(features, target, model_class, n_splits=5):
    """Remove one feature, retrain on WF folds, compare. NOT single split."""
    baseline = np.mean(wf_eval(features, target, model_class, n_splits))
    results = []
    for col in features.columns:
        reduced = features.drop(columns=[col])
        score = np.mean(wf_eval(reduced, target, model_class, n_splits))
        results.append({'feature': col, 'baseline': baseline,
                        'without': score, 'impact': baseline - score})
    return pd.DataFrame(results).sort_values('impact', ascending=False)
```

### 8.2 Group Ablation
Removing one of a correlated pair tells you nothing. Remove entire groups.

```python
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform

def group_ablation(features, target, model_class, corr_threshold=0.7, n_splits=5):
    """Cluster correlated features (dist=1-|corr|), ablate groups."""
    corr = features.corr().abs()
    dist = squareform((1 - corr).clip(0).values)
    clusters = fcluster(linkage(dist, method='average'), t=1-corr_threshold, criterion='distance')
    groups = {}
    for f, c in zip(features.columns, clusters):
        groups.setdefault(c, []).append(f)
    baseline = np.mean(wf_eval(features, target, model_class, n_splits))
    results = []
    for gid, gfeats in groups.items():
        reduced = features.drop(columns=gfeats)
        if reduced.shape[1] == 0: continue
        score = np.mean(wf_eval(reduced, target, model_class, n_splits))
        results.append({'group': gid, 'features': gfeats, 'impact': baseline - score})
    return pd.DataFrame(results).sort_values('impact', ascending=False)
```

### 8.3 Sequential Addition
```python
def sequential_addition(features, target, model_class, order=None, n_splits=5):
    """Start empty, add most important first, measure marginal gain with WF CV."""
    if order is None:
        ics = features.apply(lambda c: abs(spearmanr(c.dropna(), target.loc[c.dropna().index])[0]))
        order = ics.sort_values(ascending=False).index.tolist()
    selected, results = [], []
    for feat in order:
        selected.append(feat)
        score = np.mean(wf_eval(features[selected], target, model_class, n_splits))
        prev = results[-1]['cumulative'] if results else 0
        results.append({'added': feat, 'n': len(selected), 'cumulative': score, 'marginal': score - prev})
    return pd.DataFrame(results)
```

### 8.4 Ablation Report Template

| Column | Description |
|--------|-------------|
| feature | Feature name |
| single_ic | Standalone IC (mean Spearman with forward return) |
| ic_ir | IC information ratio (mean/std) |
| marginal_ic | IC improvement when added to model |
| loo_impact | Metric drop when removed |
| regime_consistent | Same IC sign across regimes? |
| recommendation | YES / REVIEW / REMOVE |

---

## 9. Feature Pipeline Architecture

### Pipeline Stages
```
Raw Data → Extraction → Construction → Selection → Evaluation → Storage
  │         shift(1)+     Temporal       Walk-fwd     IC/decay/    Point-in-time
  │         rolling()     normalize      importance   turnover     database
  └── PIT data sources (announcement dates)
```

### Point-in-Time Database (Bitemporal)
```python
class FeatureStore:
    def store(self, name, valid_date, as_of_date, value, version):
        self.db.execute("INSERT INTO features VALUES (?,?,?,?,?)",
                        (name, valid_date, as_of_date, value, version))

    def get_asof(self, name, valid_date, as_of_date):
        """Query feature as known at as_of_date. CORRECT for backtesting."""
        return self.db.execute("""SELECT value FROM features
            WHERE feature_name=? AND valid_date=? AND as_of_date<=?
            ORDER BY as_of_date DESC LIMIT 1""", (name, valid_date, as_of_date))
```

### Feature Versioning
```python
import hashlib, inspect

def feature_version(compute_fn, params):
    """Hash of code + params = unique version. Changes when code changes."""
    code = inspect.getsource(compute_fn)
    return hashlib.sha256(f"{code}|{sorted(params.items())}".encode()).hexdigest()[:12]
```

### Online vs Offline Features

| Aspect | Offline (Batch) | Online (Real-time) |
|--------|----------------|-------------------|
| Latency | Minutes-hours | Milliseconds |
| Computation | Full recompute | Incremental |
| Examples | PCA, HMM, IC eval | Rolling mean, VWAP |
| Temporal safety | shift(1) in pipeline | Use only completed bars |

### Online Feature Example
```python
class OnlineRollingMean:
    """
    Incremental rolling mean using only completed bars.
    Temporal safety: current bar not included until next update.
    """
    def __init__(self, window):
        self.window = window
        self.buffer = []

    def update(self, completed_bar_value):
        """Call AFTER bar is complete (e.g., at bar close + 1 second)."""
        self.buffer.append(completed_bar_value)
        if len(self.buffer) > self.window:
            self.buffer.pop(0)

    @property
    def value(self):
        if len(self.buffer) < self.window:
            return None
        return sum(self.buffer) / self.window
```

### Feature Drift Monitoring
```python
from scipy.stats import ks_2samp

def detect_drift(series, ref_window=252, test_window=21, alpha=0.05):
    """KS test for distribution shift. Run daily on all features."""
    ref = series.iloc[-ref_window:-test_window].dropna()
    recent = series.iloc[-test_window:].dropna()
    stat, p = ks_2samp(ref, recent)
    return {'drift': p < alpha, 'ks': stat, 'p': p,
            'action': 'INVESTIGATE' if p < alpha else 'OK'}

def monitor_all_features(feature_df, ref_window=252, test_window=21):
    """Batch monitor all features. Run daily."""
    alerts = []
    for col in feature_df.columns:
        result = detect_drift(feature_df[col], ref_window, test_window)
        if result['drift']:
            alerts.append({'feature': col, **result})
    if alerts:
        print(f"DRIFT ALERT: {len(alerts)} features shifted")
        for a in alerts:
            print(f"  {a['feature']}: KS={a['ks']:.3f}, p={a['p']:.4f}")
    return pd.DataFrame(alerts) if alerts else pd.DataFrame()
```

---

## Quick Reference: Temporal Safety Checklist

Before committing ANY feature engineering code, verify:

- [ ] **shift(1) before rolling()** — current bar excluded from all lookback computations
- [ ] **Labels shift(-N), features shift(+N)** — never mixed
- [ ] **Normalization uses past data only** — expanding or rolling window, not full dataset
- [ ] **Cross-sectional features use point-in-time universe** — no survivorship
- [ ] **Fundamental data uses announcement dates** — not period-end dates
- [ ] **No backfill (bfill)** — only forward fill with limit
- [ ] **Warm-up period excluded** — first N rows dropped from training AND evaluation
- [ ] **Feature selection is walk-forward** — importance on temporal splits
- [ ] **Ablation uses walk-forward CV** — not single train/test split
- [ ] **Multiple testing corrected** — Bonferroni or BH-FDR when testing many features

**If any box is unchecked, the backtest results are unreliable.**
