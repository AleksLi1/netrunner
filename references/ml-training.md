# ML Training Reference for Quantitative Trading

## When to Load This Reference

Loaded by nr-executor, nr-researcher, nr-verifier, nr-quant-auditor when ML model training, architecture selection, or hyperparameter tuning is detected in the project context.

**Trigger keywords:** model, train, architecture, LSTM, transformer, LightGBM, XGBoost, loss function, learning rate, hyperparameter, optimizer, epoch, batch size, early stopping, gradient, checkpoint, calibration, ensemble, overfitting, regularization.

When this reference is active, the agent should use these patterns as authoritative guidance: architecture decisions, training loop construction, loss function selection, and anti-pattern detection should all align with the principles documented here. An agent reading only this file should be able to correctly set up, train, and evaluate any ML model for trading.

---

## Architecture Selection for Trading

### Decision Principle

Always start with the simplest architecture that could work. Complexity must be justified by **measured improvement** on walk-forward out-of-sample data. "More complex" does not mean "better" in trading — it usually means "more overfit."

### Decision Tree

1. **Tabular data (structured features: indicators, ratios, lags)** → Gradient boosting. This is the DEFAULT for trading. Start here.
   - LightGBM: Preferred for speed, handles large feature sets, native categorical support.
   - XGBoost: Better regularization control, stronger when you need precise tuning.
2. **Sequential data (raw OHLCV, order book snapshots, tick data)** → Recurrent or attention models.
   - LSTM/GRU: Simpler, proven, lower data requirement. Default for sequential.
   - Transformer: More powerful but data-hungry. Risk of overfitting on small datasets. Justify with data.
3. **Mixed data (tabular features + sequential raw data)** → Hybrid architecture.
   - Sequential encoder (LSTM/Transformer) → embedding → concatenate with tabular features → tabular head (dense layers or gradient boosting on embeddings).
4. **Very small datasets (<5,000 samples)** → Linear models, Ridge/Lasso regression, or simple gradient boosting with heavy regularization. Deep learning will overfit.

### Architecture Decision Table

| Data Type | Dataset Size | Task | Recommended Architecture |
|-----------|-------------|------|--------------------------|
| Tabular features | Any | Regression/Classification | LightGBM (default) |
| Tabular features | <2,000 rows | Regression | Ridge/Lasso regression |
| OHLCV sequences | >50,000 samples | Next-step prediction | LSTM (2 layers) |
| OHLCV sequences | >500,000 samples | Multi-horizon prediction | Transformer |
| Order book snapshots | >100,000 samples | Direction classification | 1D-CNN + LSTM |
| Tabular + sequential | >50,000 samples | Signal generation | Hybrid (LSTM encoder + LightGBM) |
| Multiple assets | >100,000 per asset | Cross-asset signals | Transformer with asset embeddings |

**CRITICAL:** If you cannot justify why a complex architecture is needed, use LightGBM. The burden of proof is on complexity.

---

## Architecture Deep Dives

### LightGBM / XGBoost

**Growth strategy:**
- LightGBM: Leaf-wise growth (best-first). Faster convergence, but can overfit on small data. Control with `num_leaves`.
- XGBoost: Level-wise growth (breadth-first). More conservative, less prone to overfitting on small datasets.

**Feature importance methods:**
- `gain`: Total gain from splits using that feature. Most useful for understanding predictive power.
- `split`: Number of times feature is used. Can be misleading (high-cardinality features split often but may not add value).
- SHAP values: Gold standard. Use `shap.TreeExplainer` for tree models. Understand feature contribution per prediction.

**Regularization controls:**
- `max_depth`: Hard limit on tree depth. Start with 6-8 for trading.
- `num_leaves`: Soft complexity control. Upper bound: `2^max_depth - 1`. Start with 31.
- `min_child_samples`: Minimum samples per leaf. Higher = more conservative. Start with 20-50 for trading.
- `lambda_l1` (L1 reg): Feature selection effect. Start with 0.0, tune if needed.
- `lambda_l2` (L2 reg): Smoothing effect. Start with 0.0, tune if needed.
- `feature_fraction`: Random feature subsampling per tree. 0.7-0.9 typical.
- `bagging_fraction` + `bagging_freq`: Row subsampling. 0.7-0.9, freq=1.

**Early stopping:** Use `early_stopping_rounds=50` on walk-forward validation fold. NOT on training data.

**Categorical features:** LightGBM handles categoricals natively (`categorical_feature` param). Do NOT one-hot encode — it loses split efficiency.

```python
# CORRECT: LightGBM config for trading
import lightgbm as lgb

params = {
    "objective": "regression",       # or "binary" for classification
    "metric": "mae",                 # robust to outliers in returns
    "boosting_type": "gbdt",
    "num_leaves": 31,
    "max_depth": 7,
    "learning_rate": 0.05,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "min_child_samples": 30,
    "lambda_l1": 0.1,
    "lambda_l2": 0.1,
    "verbose": -1,
    "n_jobs": -1,
    "seed": 42,
}

train_set = lgb.Dataset(X_train, y_train)
val_set = lgb.Dataset(X_val, y_val, reference=train_set)

model = lgb.train(
    params,
    train_set,
    num_boost_round=2000,
    valid_sets=[val_set],
    callbacks=[
        lgb.early_stopping(stopping_rounds=50),
        lgb.log_evaluation(period=100),
    ],
)
```

### LSTM / GRU

**Sequence length:** Must match the lookback period of your features. If your features use 20-day rolling windows, your sequence length should be at least 20. Longer sequences capture more context but increase computation and overfitting risk.

**Statefulness:**
- `stateful=False` (default): Each batch is independent. Simpler, recommended for most cases.
- `stateful=True`: Hidden state carries across batches. Useful for online learning or very long dependencies. Requires careful batch ordering — batches must be temporally sequential.

**CRITICAL — Bidirectional CAUTION:**
```python
# WRONG: Bidirectional LSTM for time series prediction
model = nn.LSTM(input_size, hidden_size, bidirectional=True)
# This looks at FUTURE timesteps! Bidirectional = sees future in sequence.
# Only valid if predicting a label for the ENTIRE sequence, not next-step.

# CORRECT: Unidirectional LSTM for next-step prediction
model = nn.LSTM(input_size, hidden_size, bidirectional=False)
```

**Hidden size:** Start small (32-128). Financial signals are low SNR — large hidden sizes memorize noise. Scale up only if validation metric improves.

**Layer stacking:** 2-3 layers max. Beyond 3, gradient flow degrades and training becomes unstable. Use residual connections if stacking more.

```python
# CORRECT: LSTM for trading signal prediction (PyTorch)
import torch
import torch.nn as nn

class TradingLSTM(nn.Module):
    def __init__(self, input_size, hidden_size=64, num_layers=2, dropout=0.2):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout if num_layers > 1 else 0.0,
            batch_first=True,
            bidirectional=False,  # NEVER bidirectional for next-step prediction
        )
        self.head = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU(),
            nn.Dropout(dropout),
            nn.Linear(32, 1),
        )

    def forward(self, x):
        # x shape: (batch, seq_len, input_size)
        lstm_out, _ = self.lstm(x)
        last_hidden = lstm_out[:, -1, :]  # Use only last timestep
        return self.head(last_hidden)
```

### Transformer for Time Series

**Self-attention for time series:** Each timestep attends to all past timesteps. The attention mechanism learns which historical moments are relevant for current prediction.

**Positional encoding:**
- Sinusoidal: Fixed, no learnable parameters. Works for fixed-length sequences.
- Learned: Adapts to data. Better for variable patterns.
- Relative positional encoding: Encodes distance between timesteps rather than absolute position. Preferred for financial data where the pattern "3 days ago was a spike" matters more than "day 47 was a spike."

**Computational cost:** Standard attention is O(n^2) in sequence length. For long sequences (>512 timesteps), use efficient attention variants (Linformer, Performer) or chunk the sequence.

**Architecture guidance:**
- Attention heads: 4-8 for trading. Each head can learn different temporal patterns.
- Model dimension: 64-256. Must be divisible by number of heads.
- Pre-norm (LayerNorm before attention): More stable training. Preferred over post-norm.
- Feed-forward dimension: 2-4x model dimension.

**CAUTION:** Transformers require significantly more data than LSTMs to generalize. If you have <100,000 training samples, LSTM is almost certainly the better choice.

### Ensemble Methods

**Stacking with temporal CV:**
1. Split data into K temporal folds (walk-forward).
2. Train base models, generate out-of-sample (OOS) predictions for each fold.
3. Train meta-learner on the OOS predictions.
4. CRITICAL: Meta-learner must ONLY see OOS predictions, never in-sample predictions.

**Diversity requirement:** An ensemble of 5 similar LightGBM models adds almost no value. Ensure diversity:
- Different model types (LightGBM + LSTM + Ridge)
- Different feature subsets
- Different lookback periods
- Different training windows

**Blend weights:** Simple averaging often beats learned weights. Learned weights overfit to the validation set. If you must learn weights, use very strong regularization (constrain weights to be positive and sum to 1).

**Temporal ensemble:** Train the same model on different lookback windows (e.g., 1 year, 2 years, 5 years of training data). Average predictions. Captures both short-term and long-term patterns.

---

## Loss Function Design

### Key Principle

The loss function must be aligned with what you actually optimize in production. MSE optimizes prediction accuracy; you probably want profit. Always ask: "If this loss is minimized perfectly, does that give me what I want?"

### MSE (Mean Squared Error)

Standard regression loss. Heavily penalizes outliers — financial returns have fat tails, so outlier predictions dominate the gradient.

```python
# Standard MSE — use as baseline only
def mse_loss(y_pred, y_true):
    return torch.mean((y_pred - y_true) ** 2)
```

### MAE / Huber Loss

More robust to outliers. Huber transitions from MAE to MSE at threshold `delta`.

```python
def huber_loss(y_pred, y_true, delta=1.0):
    error = y_pred - y_true
    is_small = torch.abs(error) <= delta
    squared_loss = 0.5 * error ** 2
    linear_loss = delta * (torch.abs(error) - 0.5 * delta)
    return torch.mean(torch.where(is_small, squared_loss, linear_loss))
# For financial returns, delta=0.01 to 0.05 is typical (scale of daily returns).
```

### Directional Loss

Penalizes wrong direction more than wrong magnitude. Correct direction with wrong magnitude is less costly than wrong direction entirely.

```python
def directional_loss(y_pred, y_true, alpha=2.0):
    mse = (y_pred - y_true) ** 2
    sign_match = (torch.sign(y_pred) == torch.sign(y_true)).float()
    sign_penalty = 1.0 - sign_match  # 1 if signs disagree, 0 if agree
    weighted = mse * (1.0 + alpha * sign_penalty)
    return torch.mean(weighted)
```

### Sharpe-Maximizing Loss

Differentiable approximation of Sharpe ratio. Directly optimizes risk-adjusted return.

```python
def sharpe_loss(y_pred, y_true, eps=1e-8):
    # y_pred acts as position sizing, y_true is actual returns
    portfolio_returns = y_pred * y_true
    mean_return = torch.mean(portfolio_returns)
    std_return = torch.std(portfolio_returns) + eps
    sharpe = mean_return / std_return
    return -sharpe  # Negative because we minimize loss
# CAUTION: Requires batch size large enough for meaningful std estimate (>=64).
```

### Asymmetric Loss

Different penalties for false positives vs false negatives. For long-only strategies: penalize predicted-up-actual-down much more.

```python
def asymmetric_loss(y_pred, y_true, alpha_up=1.0, alpha_down=3.0):
    error = y_pred - y_true
    # Predicted up but went down (costly false positive)
    false_positive = (y_pred > 0) & (y_true < 0)
    # Predicted down but went up (missed opportunity)
    false_negative = (y_pred < 0) & (y_true > 0)
    weights = torch.ones_like(error) * alpha_up
    weights[false_positive] = alpha_down  # Penalize costly mistakes more
    return torch.mean(weights * error ** 2)
```

### Multi-Task Loss

Predict direction and magnitude simultaneously. Forces model to learn both aspects.

```python
def multi_task_loss(direction_pred, magnitude_pred, y_true, alpha=0.5):
    direction_true = (y_true > 0).float()
    direction_loss = nn.BCEWithLogitsLoss()(direction_pred, direction_true)
    magnitude_loss = nn.HuberLoss()(magnitude_pred, torch.abs(y_true))
    return alpha * direction_loss + (1 - alpha) * magnitude_loss
```

### Custom P&L Loss

Directly optimizes profit and loss including transaction costs.

```python
def pnl_loss(y_pred, y_true, cost_per_trade=0.001):
    positions = torch.tanh(y_pred)  # Constrain to [-1, 1]
    pnl = positions * y_true
    # Approximate transaction cost: cost when position changes
    position_change = torch.abs(positions[1:] - positions[:-1])
    costs = cost_per_trade * position_change
    net_pnl = pnl[1:] - costs
    return -torch.mean(net_pnl)
# Most aligned with production objective but gradient is noisy.
```

---

## Training Pipeline Best Practices

### DataLoader Configuration

```python
# WRONG: Shuffling time series data
train_loader = DataLoader(dataset, batch_size=64, shuffle=True)  # NEVER

# CORRECT: Sequential sampling for time series
from torch.utils.data import SequentialSampler

train_loader = DataLoader(
    dataset,
    batch_size=64,
    shuffle=False,
    sampler=SequentialSampler(dataset),
    drop_last=True,  # Avoid partial batches with different statistics
)

# CORRECT: Walk-forward fold DataLoaders
def create_fold_loaders(data, folds, batch_size=64):
    loaders = []
    for train_idx, val_idx in folds:
        train_set = Subset(data, train_idx)
        val_set = Subset(data, val_idx)
        train_loader = DataLoader(train_set, batch_size=batch_size, shuffle=False)
        val_loader = DataLoader(val_set, batch_size=batch_size, shuffle=False)
        loaders.append((train_loader, val_loader))
    return loaders
```

### Learning Rate Scheduling

```python
import torch.optim as optim

optimizer = optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)

# Option 1: Cosine annealing (smooth decay)
scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=100)

# Option 2: Reduce on plateau (reactive — good default)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(
    optimizer, mode="min", factor=0.5, patience=10, min_lr=1e-6
)

# Option 3: OneCycleLR (often best for training from scratch)
scheduler = optim.lr_scheduler.OneCycleLR(
    optimizer, max_lr=1e-3, total_steps=num_epochs * len(train_loader),
    pct_start=0.1,  # 10% warmup
)
```

### Early Stopping Implementation

```python
class EarlyStopping:
    def __init__(self, patience=20, min_delta=1e-6, restore_best=True):
        self.patience = patience
        self.min_delta = min_delta
        self.restore_best = restore_best
        self.best_score = None
        self.counter = 0
        self.best_weights = None

    def __call__(self, val_metric, model):
        if self.best_score is None or val_metric < self.best_score - self.min_delta:
            self.best_score = val_metric
            self.counter = 0
            if self.restore_best:
                self.best_weights = {k: v.clone() for k, v in model.state_dict().items()}
            return False  # Continue training
        self.counter += 1
        if self.counter >= self.patience:
            if self.restore_best and self.best_weights is not None:
                model.load_state_dict(self.best_weights)
            return True  # Stop training
        return False

# CRITICAL: Monitor VALIDATION metric, not training loss
early_stop = EarlyStopping(patience=20)
```

### Gradient Clipping

```python
# CORRECT: Always clip gradients for financial data
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
optimizer.step()

# Financial returns can have extreme values (flash crashes, earnings surprises).
# Without clipping, a single outlier can produce a gradient that destroys weights.
```

### Batch Size Selection

- **Gradient boosting (LightGBM/XGBoost):** Full dataset. These are not mini-batch methods.
- **Neural networks (LSTM/Transformer):** 32-256 for financial time series.
  - Smaller batch (32-64): More noise in gradient, better generalization, slower convergence.
  - Larger batch (128-256): Smoother gradient, faster convergence, risk of sharp minima.
  - Rule of thumb: Start with 64, scale up if training is too slow.

### Regularization Techniques

```python
# Dropout (applied in model definition)
self.dropout = nn.Dropout(p=0.2)  # 0.1-0.3 for financial data

# Weight decay (applied in optimizer)
optimizer = optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)

# Label smoothing (for classification)
criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

# Gaussian noise injection on inputs
class GaussianNoise(nn.Module):
    def __init__(self, std=0.01):
        super().__init__()
        self.std = std
    def forward(self, x):
        if self.training:
            return x + torch.randn_like(x) * self.std
        return x
```

### Complete Training Loop

```python
import torch
import torch.nn as nn
import numpy as np
import random

# 1. Set ALL seeds for reproducibility
def set_seeds(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

set_seeds(42)

# 2. Training function with all best practices
def train_model(model, train_loader, val_loader, num_epochs=200, device="cuda"):
    model = model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=0.5, patience=10, min_lr=1e-6
    )
    early_stop = EarlyStopping(patience=20, restore_best=True)
    criterion = nn.HuberLoss(delta=0.02)  # Robust to outlier returns

    history = {"train_loss": [], "val_loss": [], "lr": []}

    for epoch in range(num_epochs):
        # --- Train ---
        model.train()
        train_losses = []
        for X_batch, y_batch in train_loader:
            X_batch, y_batch = X_batch.to(device), y_batch.to(device)
            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred.squeeze(), y_batch)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_losses.append(loss.item())

        # --- Validate ---
        model.eval()
        val_losses = []
        with torch.no_grad():
            for X_batch, y_batch in val_loader:
                X_batch, y_batch = X_batch.to(device), y_batch.to(device)
                pred = model(X_batch)
                loss = criterion(pred.squeeze(), y_batch)
                val_losses.append(loss.item())

        train_loss = np.mean(train_losses)
        val_loss = np.mean(val_losses)
        history["train_loss"].append(train_loss)
        history["val_loss"].append(val_loss)
        history["lr"].append(optimizer.param_groups[0]["lr"])

        scheduler.step(val_loss)

        if epoch % 20 == 0:
            print(f"Epoch {epoch}: train={train_loss:.6f}, val={val_loss:.6f}, "
                  f"lr={optimizer.param_groups[0]['lr']:.2e}")

        if early_stop(val_loss, model):
            print(f"Early stopping at epoch {epoch}. Best val: {early_stop.best_score:.6f}")
            break

    return model, history
```

---

## Hyperparameter Optimization

### Optuna / Bayesian Optimization

Preferred over grid search (exponential cost) and random search (no learning). Optuna's TPE (Tree-structured Parzen Estimator) sampler learns which regions of the search space are promising.

### Search Space by Architecture

**LightGBM search space:**
| Parameter | Range | Scale |
|-----------|-------|-------|
| num_leaves | 15-255 | int |
| learning_rate | 0.01-0.3 | log |
| max_depth | 3-12 | int |
| min_child_samples | 5-100 | int |
| feature_fraction | 0.5-1.0 | uniform |
| bagging_fraction | 0.5-1.0 | uniform |
| lambda_l1 | 1e-8 to 10 | log |
| lambda_l2 | 1e-8 to 10 | log |

**LSTM search space:**
| Parameter | Range | Scale |
|-----------|-------|-------|
| hidden_size | 16-256 | int (powers of 2) |
| num_layers | 1-3 | int |
| dropout | 0.0-0.5 | uniform |
| learning_rate | 1e-5 to 1e-2 | log |
| sequence_length | 10-120 | int |
| batch_size | 32-256 | int (powers of 2) |
| weight_decay | 1e-6 to 1e-2 | log |

### HPO Anti-Patterns

- **Optimizing on test set:** HPO must use inner walk-forward CV, never the final test set. Test set is used ONCE for final evaluation.
- **Single-split HPO:** Evaluating each trial on a single validation split is noisy. Use multiple walk-forward folds.
- **Too many trials on small data:** 1000 trials on 5000 samples = you found the hyperparameters that overfit your validation noise.
- **Not setting a reasonable search space:** Unbounded search wastes trials exploring useless regions.
- **Not pruning:** Use Optuna's `MedianPruner` to stop unpromising trials early.

### Nested Cross-Validation

Outer loop = walk-forward evaluation (unbiased performance estimate).
Inner loop = walk-forward HPO per fold (hyperparameter selection).

This gives an unbiased estimate of how well your HPO + training pipeline generalizes.

### Optuna Example with LightGBM

```python
import optuna
import lightgbm as lgb
import numpy as np

def objective(trial, X, y, walk_forward_folds):
    params = {
        "objective": "regression",
        "metric": "mae",
        "boosting_type": "gbdt",
        "num_leaves": trial.suggest_int("num_leaves", 15, 255),
        "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
        "max_depth": trial.suggest_int("max_depth", 3, 12),
        "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
        "feature_fraction": trial.suggest_float("feature_fraction", 0.5, 1.0),
        "bagging_fraction": trial.suggest_float("bagging_fraction", 0.5, 1.0),
        "bagging_freq": 1,
        "lambda_l1": trial.suggest_float("lambda_l1", 1e-8, 10.0, log=True),
        "lambda_l2": trial.suggest_float("lambda_l2", 1e-8, 10.0, log=True),
        "verbose": -1,
        "seed": 42,
    }

    fold_scores = []
    for train_idx, val_idx in walk_forward_folds:
        X_train, X_val = X[train_idx], X[val_idx]
        y_train, y_val = y[train_idx], y[val_idx]

        train_set = lgb.Dataset(X_train, y_train)
        val_set = lgb.Dataset(X_val, y_val, reference=train_set)

        model = lgb.train(
            params,
            train_set,
            num_boost_round=1000,
            valid_sets=[val_set],
            callbacks=[lgb.early_stopping(50), lgb.log_evaluation(0)],
        )
        preds = model.predict(X_val)
        mae = np.mean(np.abs(preds - y_val))
        fold_scores.append(mae)

    return np.mean(fold_scores)

# Run optimization
study = optuna.create_study(
    direction="minimize",
    sampler=optuna.samplers.TPESampler(seed=42),
    pruner=optuna.pruners.MedianPruner(n_warmup_steps=10),
)
study.optimize(
    lambda trial: objective(trial, X, y, walk_forward_folds),
    n_trials=100,
    show_progress_bar=True,
)

print(f"Best MAE: {study.best_value:.6f}")
print(f"Best params: {study.best_params}")
```

---

## Overfitting Detection & Prevention

### Train/Validation Gap Monitoring

If training metric is significantly better than validation metric, the model is memorizing rather than learning. A healthy gap is <20% relative difference.

```python
# Monitor during training
def check_overfit(train_loss, val_loss, threshold=0.2):
    if train_loss == 0:
        return True
    gap = (val_loss - train_loss) / abs(train_loss)
    if gap > threshold:
        print(f"WARNING: Overfitting detected. Gap: {gap:.1%}")
        return True
    return False
```

### Learning Curve Analysis

Plot metric vs training set size. If more data consistently improves validation performance, collect more data. If it plateaus, the model may need more capacity (underfitting) or the signal is exhausted.

```python
# Learning curve: train on increasing subsets
def learning_curve(model_fn, X_train, y_train, X_val, y_val, fractions=[0.1, 0.25, 0.5, 0.75, 1.0]):
    results = []
    n = len(X_train)
    for frac in fractions:
        subset_n = int(n * frac)
        # Use LAST subset_n samples (most recent data, preserves temporal order)
        X_sub = X_train[-subset_n:]
        y_sub = y_train[-subset_n:]
        model = model_fn()
        model.fit(X_sub, y_sub)
        train_score = model.score(X_sub, y_sub)
        val_score = model.score(X_val, y_val)
        results.append({"fraction": frac, "n": subset_n,
                        "train": train_score, "val": val_score})
    return results
```

### Regularization Ladder

Apply regularization incrementally. Each step should be validated against walk-forward performance:

1. **Baseline:** No regularization. Establish upper bound of overfitting.
2. **Dropout (0.1):** Cheapest regularization. Increase to 0.2-0.3 if needed.
3. **Weight decay (1e-4):** Penalizes large weights. Standard for AdamW.
4. **Feature fraction (0.8):** Random feature subsampling per tree (gradient boosting).
5. **Max depth reduction:** Reduce tree depth or num_leaves by 20%.
6. **Early stopping patience reduction:** Reduce from 30 to 15 to 10. Stops training sooner.
7. **Data augmentation:** Last resort. Add noise, magnitude warping (see below).

**STOP when validation metric stops improving.** More regularization beyond that point = underfitting.

### Ensemble as Regularization

Training multiple models with different seeds and averaging predictions reduces variance without increasing bias.

```python
# Simple seed ensemble
def seed_ensemble(model_fn, X_train, y_train, X_test, seeds=[42, 123, 456, 789, 0]):
    predictions = []
    for seed in seeds:
        model = model_fn(seed=seed)
        model.fit(X_train, y_train)
        pred = model.predict(X_test)
        predictions.append(pred)
    return np.mean(predictions, axis=0)  # Average reduces variance
```

### Data Augmentation for Time Series

**CAUTION:** Financial time series augmentation can destroy the temporal structure that carries the signal. Use sparingly and validate carefully.

- **Magnitude warping:** Scale values by a smooth random curve. Preserves temporal structure, simulates volatility regime changes.
- **Jittering:** Add small Gaussian noise. Simulates measurement noise. Keep std < 10% of data std.
- **Window slicing:** Take random sub-windows of sequences. Only valid for models that don't depend on absolute time.
- **Synthetic data (GANs):** Experimental and generally unreliable for trading. Generated data rarely captures tail dependencies or regime changes. NOT recommended.

---

## Training Anti-Patterns for Trading

These are the most common mistakes that lead to backtests that look great but fail in production.

### 1. Shuffling Time Series Data

```python
# WRONG: Shuffled DataLoader
DataLoader(dataset, shuffle=True)
# Temporal leakage: model trains on future data before past data.

# CORRECT: Sequential DataLoader
DataLoader(dataset, shuffle=False)
```

### 2. Training on Future Data

```python
# WRONG: Random train/test split
from sklearn.model_selection import train_test_split
X_train, X_test = train_test_split(X, test_size=0.2)  # TEMPORAL LEAKAGE

# CORRECT: Temporal split
split_idx = int(len(X) * 0.8)
X_train, X_test = X[:split_idx], X[split_idx:]  # Train is BEFORE test
```

### 3. Early Stopping on Training Loss

```python
# WRONG: Monitoring training loss
if train_loss < best_train_loss:
    save_model()  # Saves the most overfit model

# CORRECT: Monitoring validation loss
if val_loss < best_val_loss:
    save_model()  # Saves the model that generalizes best
```

### 4. Not Clipping Gradients

```python
# WRONG: No gradient clipping
loss.backward()
optimizer.step()  # A single outlier can produce NaN weights

# CORRECT: Always clip for financial data
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
optimizer.step()
```

### 5. Using Default Learning Rate

The default `lr=1e-3` in Adam is often too aggressive for fine-grained financial signals. Start with `1e-4` or use a learning rate finder.

### 6. Not Logging Training Runs

Every experiment should log: hyperparameters, training/validation curves, final metrics, data version, code version. Without logs, you cannot reproduce results or understand what improved performance.

### 7. Not Setting Random Seeds

```python
# WRONG: No seed setting → different results every run
model = train_model(data)

# CORRECT: Full seed management
random.seed(42)
np.random.seed(42)
torch.manual_seed(42)
torch.cuda.manual_seed_all(42)
torch.backends.cudnn.deterministic = True
```

### 8. HPO Data Leakage

```python
# WRONG: HPO and evaluation on same data
study.optimize(objective_with_test_data)  # Optimistic bias

# CORRECT: Nested CV — inner loop for HPO, outer loop for evaluation
# Outer fold test data is NEVER seen during HPO
```

### 9. Training Too Long Without Early Stopping

Without early stopping, the model will eventually memorize the training set. Always use early stopping with patience monitored on validation data.

### 10. Ignoring Class Imbalance

If 90% of your labels are "no trade" and 10% are "trade," the model will predict "no trade" always and achieve 90% accuracy. Use class weights, oversampling (SMOTE with temporal awareness), or threshold tuning.

```python
# CORRECT: Class-weighted loss
class_weights = torch.tensor([1.0, 9.0])  # Weight "trade" class 9x
criterion = nn.CrossEntropyLoss(weight=class_weights.to(device))
```

---

## Model Calibration & Reproducibility

### Probability Calibration

Raw model outputs are often not well-calibrated probabilities. A model that outputs 0.7 should be correct 70% of the time.

**Platt scaling:** Fit a logistic regression on model outputs using held-out temporal data.

```python
from sklearn.calibration import CalibratedClassifierCV

# WRONG: Calibrate on training data
calibrated = CalibratedClassifierCV(model, method="sigmoid", cv="prefit")
calibrated.fit(X_train, y_train)  # Overfit calibration

# CORRECT: Calibrate on held-out temporal data
calibrated = CalibratedClassifierCV(model, method="sigmoid", cv="prefit")
calibrated.fit(X_calibration, y_calibration)  # Separate temporal holdout
```

**Isotonic regression:** Non-parametric calibration. More flexible than Platt scaling but requires more calibration data. Use `method="isotonic"`.

### Confidence Estimation with MC Dropout

Run inference with dropout enabled N times. Variance across runs estimates model uncertainty.

```python
def mc_dropout_predict(model, X, n_forward=50):
    model.train()  # Keep dropout active
    predictions = []
    with torch.no_grad():
        for _ in range(n_forward):
            pred = model(X)
            predictions.append(pred.cpu().numpy())
    predictions = np.array(predictions)
    mean_pred = predictions.mean(axis=0)
    uncertainty = predictions.std(axis=0)
    return mean_pred, uncertainty

# Usage: High uncertainty → reduce position size or skip trade
mean, uncertainty = mc_dropout_predict(model, X_test)
confident_mask = uncertainty < uncertainty_threshold
positions = np.where(confident_mask, mean, 0.0)  # Zero position when uncertain
```

### Ensemble Disagreement

When using an ensemble, the variance across member predictions measures uncertainty.

```python
def ensemble_uncertainty(models, X):
    predictions = [model.predict(X) for model in models]
    predictions = np.array(predictions)
    mean_pred = predictions.mean(axis=0)
    disagreement = predictions.std(axis=0)
    return mean_pred, disagreement
```

### Seed Management

For full reproducibility, set every source of randomness:

```python
import random
import numpy as np
import torch
import os

def set_all_seeds(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)  # For multi-GPU
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
    os.environ["PYTHONHASHSEED"] = str(seed)
    # For LightGBM/XGBoost: pass seed in params
    # For sklearn: pass random_state=seed

# CRITICAL: Call BEFORE any model creation or data splitting
set_all_seeds(42)
```

### Experiment Tracking

Every training run must be tracked. Use MLflow or Weights & Biases.

```python
import mlflow

mlflow.set_experiment("trading_model_v2")

with mlflow.start_run(run_name="lgb_baseline"):
    # Log hyperparameters
    mlflow.log_params(params)

    # Log data version
    import hashlib
    data_hash = hashlib.md5(X_train.tobytes()).hexdigest()[:8]
    mlflow.log_param("data_hash", data_hash)

    # Train model
    model = train_model(params, X_train, y_train)

    # Log metrics
    mlflow.log_metric("val_mae", val_mae)
    mlflow.log_metric("val_sharpe", val_sharpe)
    mlflow.log_metric("val_direction_accuracy", val_dir_acc)

    # Log training curves
    for epoch, (tl, vl) in enumerate(zip(train_losses, val_losses)):
        mlflow.log_metric("train_loss", tl, step=epoch)
        mlflow.log_metric("val_loss", vl, step=epoch)

    # Log model artifact
    mlflow.sklearn.log_model(model, "model")
```

### Checkpoint Management

```python
def save_checkpoint(model, optimizer, epoch, val_metric, path):
    torch.save({
        "epoch": epoch,
        "model_state_dict": model.state_dict(),
        "optimizer_state_dict": optimizer.state_dict(),
        "val_metric": val_metric,
    }, path)

def load_checkpoint(model, optimizer, path):
    checkpoint = torch.load(path)
    model.load_state_dict(checkpoint["model_state_dict"])
    optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
    return checkpoint["epoch"], checkpoint["val_metric"]

# Save at best validation metric
if val_loss < best_val_loss:
    best_val_loss = val_loss
    save_checkpoint(
        model, optimizer, epoch, val_loss,
        f"checkpoints/model_best_{experiment_id}.pt"
    )
```

---

## Quick Reference Card

| Decision | Guidance |
|----------|----------|
| Which architecture? | LightGBM first. Justify complexity. |
| Which loss? | Directional or Sharpe-maximizing for trading. MSE only as baseline. |
| Shuffle data? | NEVER for time series. |
| Learning rate? | Start 1e-4 for neural nets, 0.05 for LightGBM. |
| Gradient clipping? | Always. max_norm=1.0. |
| Early stopping? | Always. On validation metric. Patience 15-30. |
| Batch size? | 64 default for neural nets. Full data for gradient boosting. |
| Dropout? | 0.1-0.3 for financial data. |
| HPO method? | Optuna TPE. Walk-forward inner CV. |
| Seeds? | Set ALL of them. Before everything else. |
| Experiment tracking? | Mandatory. MLflow or W&B. |
| When uncertain? | Reduce position size. MC dropout or ensemble disagreement. |
