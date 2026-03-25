# Data Analysis Methods Reference

## 1. When to Load This Reference

**Loaded by:** nr-executor, nr-researcher, nr-verifier, nr-planner

**Trigger keywords:** statistics, hypothesis test, p-value, confidence interval, EDA,
exploratory, visualization, chart, plot, outlier, A/B test, experiment, sampling,
correlation, regression, distribution, normality, effect size, power analysis,
dashboard, report, pandas, scipy, matplotlib, seaborn, statsmodels

**Load condition:** Data analysis domain detected in CONTEXT.md, current task, or code under review.

**See also:** `data-analysis-reasoning.md` (reasoning triggers), `data-analysis-code-patterns.md` (code patterns),
`verification-patterns.md` (validation framework)

---

## 2. Statistical Testing

### 2.1 Choosing the Right Test

```
Decision tree for common scenarios:

COMPARING TWO GROUPS:
├─ Continuous outcome
│  ├─ Normal distribution → Welch's t-test (stats.ttest_ind, equal_var=False)
│  ├─ Non-normal → Mann-Whitney U (stats.mannwhitneyu)
│  └─ Paired observations → Wilcoxon signed-rank (stats.wilcoxon)
├─ Categorical outcome (proportions)
│  ├─ Large samples (n*p > 5) → Chi-squared test (stats.chi2_contingency)
│  └─ Small samples → Fisher's exact test (stats.fisher_exact)
└─ Time-to-event → Log-rank test (lifelines.statistics.logrank_test)

COMPARING 3+ GROUPS:
├─ Normal → One-way ANOVA (stats.f_oneway) + post-hoc Tukey HSD
├─ Non-normal → Kruskal-Wallis (stats.kruskal) + post-hoc Dunn's test
└─ Paired/repeated → Friedman test (stats.friedmanchisquare)

TESTING RELATIONSHIPS:
├─ Two continuous → Pearson (linear) or Spearman (monotonic) correlation
├─ Two categorical → Chi-squared test of independence
├─ Continuous ~ categorical → Point-biserial correlation
└─ Multiple predictors → Multiple regression (statsmodels.OLS)
```

### 2.2 Effect Size Measures

Always report effect size alongside p-values. A significant p-value with a trivial effect size is practically meaningless.

```python
import numpy as np
from scipy import stats

def cohens_d(group1, group2):
    """Effect size for two-group comparison. Small=0.2, Medium=0.5, Large=0.8."""
    n1, n2 = len(group1), len(group2)
    pooled_std = np.sqrt(((n1 - 1) * group1.std()**2 + (n2 - 1) * group2.std()**2)
                         / (n1 + n2 - 2))
    return (group1.mean() - group2.mean()) / pooled_std

def cramers_v(contingency_table):
    """Effect size for chi-squared test. Small=0.1, Medium=0.3, Large=0.5."""
    chi2 = stats.chi2_contingency(contingency_table)[0]
    n = contingency_table.sum().sum()
    min_dim = min(contingency_table.shape) - 1
    return np.sqrt(chi2 / (n * min_dim))

def r_squared(x, y):
    """Proportion of variance explained. Reports how much of y is predicted by x."""
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, y)
    return r_value**2
```

### 2.3 Power Analysis

Determine required sample size BEFORE collecting data.

```python
from statsmodels.stats.power import TTestIndPower, NormalIndPower, GofChisquarePower

# For two-group comparison (t-test)
analysis = TTestIndPower()
sample_size = analysis.solve_power(
    effect_size=0.3,   # Expected Cohen's d (small=0.2, medium=0.5)
    alpha=0.05,         # Significance level
    power=0.8,          # Probability of detecting real effect
    ratio=1.0,          # Ratio of group sizes
    alternative='two-sided'
)
print(f"Required n per group: {int(np.ceil(sample_size))}")

# For proportions (A/B test)
from statsmodels.stats.proportion import proportion_effectsize
effect = proportion_effectsize(0.10, 0.12)  # Baseline 10%, detect 12%
analysis = NormalIndPower()
n = analysis.solve_power(effect_size=effect, alpha=0.05, power=0.8)
print(f"Required n per group for proportion test: {int(np.ceil(n))}")
```

### 2.4 Multiple Testing Correction

When testing multiple hypotheses, correct for the increased false positive rate.

```python
from statsmodels.stats.multitest import multipletests

# p-values from multiple tests
p_values = [0.01, 0.04, 0.03, 0.08, 0.005, 0.12, 0.045]

# Bonferroni — controls family-wise error rate (conservative)
reject_bonf, pvals_bonf, _, _ = multipletests(p_values, method='bonferroni', alpha=0.05)

# Benjamini-Hochberg — controls false discovery rate (less conservative)
reject_bh, pvals_bh, _, _ = multipletests(p_values, method='fdr_bh', alpha=0.05)

print("Original | Bonferroni | BH-adjusted | Bonf sig | BH sig")
for orig, bonf, bh, sig_b, sig_bh in zip(p_values, pvals_bonf, pvals_bh, reject_bonf, reject_bh):
    print(f"  {orig:.3f}  |   {bonf:.3f}    |   {bh:.3f}     |  {sig_b}  | {sig_bh}")
```

---

## 3. EDA Workflows

### 3.1 Data Profiling Checklist

Run this before any analysis. Takes 5 minutes, prevents hours of debugging.

```python
import pandas as pd
import numpy as np

def profile_dataset(df):
    """Comprehensive data profile — run this FIRST."""
    print(f"Shape: {df.shape[0]:,} rows x {df.shape[1]} columns")
    print(f"Memory: {df.memory_usage(deep=True).sum() / 1e6:.1f} MB")
    print(f"Duplicates: {df.duplicated().sum():,} ({df.duplicated().mean():.1%})")
    print()

    # Column-level summary
    summary = pd.DataFrame({
        'dtype': df.dtypes,
        'non_null': df.count(),
        'null_pct': df.isnull().mean().round(4),
        'nunique': df.nunique(),
        'sample': df.iloc[0]
    })

    # Numeric stats
    numeric_cols = df.select_dtypes(include='number').columns
    if len(numeric_cols) > 0:
        print("Numeric columns:")
        print(df[numeric_cols].describe().round(3))
        print()

        # Check for suspicious values
        for col in numeric_cols:
            neg = (df[col] < 0).sum()
            zeros = (df[col] == 0).sum()
            if neg > 0 or zeros > df.shape[0] * 0.5:
                print(f"  WARNING: {col} has {neg} negatives, {zeros} zeros")

    # Categorical stats
    cat_cols = df.select_dtypes(include=['object', 'category']).columns
    if len(cat_cols) > 0:
        print("Categorical columns:")
        for col in cat_cols:
            print(f"  {col}: {df[col].nunique()} unique, "
                  f"top='{df[col].mode().iloc[0]}' ({df[col].value_counts().iloc[0]:,})")

    # Date columns
    date_cols = df.select_dtypes(include='datetime').columns
    for col in date_cols:
        print(f"  {col}: {df[col].min()} to {df[col].max()}, "
              f"gaps={df[col].diff().dt.days.gt(1).sum()}")

    return summary

profile = profile_dataset(df)
```

### 3.2 Distribution Analysis

```python
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats
import numpy as np

def analyze_distributions(df, numeric_cols=None, figsize_per_col=(4, 3)):
    """Analyze and visualize distributions for numeric columns."""
    if numeric_cols is None:
        numeric_cols = df.select_dtypes(include='number').columns.tolist()

    n = len(numeric_cols)
    fig, axes = plt.subplots(n, 2, figsize=(figsize_per_col[0] * 2, figsize_per_col[1] * n))
    if n == 1:
        axes = axes.reshape(1, -1)

    for i, col in enumerate(numeric_cols):
        data = df[col].dropna()

        # Histogram with KDE
        axes[i, 0].hist(data, bins=50, density=True, alpha=0.7, edgecolor='black')
        if len(data) > 2:
            data.plot.kde(ax=axes[i, 0], color='red', linewidth=1.5)
        axes[i, 0].set_title(f'{col} distribution')

        # QQ plot for normality assessment
        stats.probplot(data, plot=axes[i, 1])
        axes[i, 1].set_title(f'{col} QQ plot')

        # Normality test
        if len(data) >= 8:
            _, p_normal = stats.shapiro(data.sample(min(len(data), 5000)))
            skew = data.skew()
            kurt = data.kurtosis()
            axes[i, 0].text(0.95, 0.95,
                           f'Shapiro p={p_normal:.3f}\nskew={skew:.2f}\nkurt={kurt:.2f}',
                           transform=axes[i, 0].transAxes, ha='right', va='top',
                           fontsize=8, bbox=dict(boxstyle='round', facecolor='wheat'))

    plt.tight_layout()
    return fig

fig = analyze_distributions(df)
plt.savefig('distributions.png', dpi=150, bbox_inches='tight')
```

### 3.3 Correlation Analysis

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns

def correlation_analysis(df, method='pearson', figsize=(10, 8)):
    """Compute and visualize correlation matrix with significance."""
    numeric_df = df.select_dtypes(include='number')
    corr = numeric_df.corr(method=method)

    # Mask upper triangle
    mask = np.triu(np.ones_like(corr, dtype=bool))

    fig, ax = plt.subplots(figsize=figsize)
    sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='RdBu_r',
                center=0, vmin=-1, vmax=1, ax=ax, square=True)
    ax.set_title(f'{method.title()} Correlation Matrix')
    plt.tight_layout()

    # Flag high correlations (potential multicollinearity)
    high_corr = []
    for i in range(len(corr.columns)):
        for j in range(i + 1, len(corr.columns)):
            if abs(corr.iloc[i, j]) > 0.7:
                high_corr.append({
                    'var1': corr.columns[i],
                    'var2': corr.columns[j],
                    'correlation': corr.iloc[i, j]
                })

    if high_corr:
        print("High correlations (|r| > 0.7):")
        for pair in sorted(high_corr, key=lambda x: abs(x['correlation']), reverse=True):
            print(f"  {pair['var1']} <-> {pair['var2']}: {pair['correlation']:.3f}")

    return fig, corr

fig, corr = correlation_analysis(df)
plt.savefig('correlations.png', dpi=150, bbox_inches='tight')
```

---

## 4. Visualization Patterns

### 4.1 Chart Type Selection Guide

```
DATA TYPE → CHART TYPE

Comparison (categorical):
  Few categories (< 8)     → Horizontal bar chart
  Many categories (8+)     → Sorted horizontal bar (top N + "Other")
  Two variables             → Grouped or stacked bar

Trend (temporal):
  Single series             → Line chart
  Multiple series           → Multi-line (max 5) or small multiples
  Before/after              → Slope chart or dumbbell chart

Distribution:
  Single variable           → Histogram (n > 30) or strip/swarm (n < 30)
  By group                  → Box plot, violin, or ridgeline
  Two variables             → Scatter plot with marginal histograms

Composition:
  Parts of whole            → Stacked bar (NOT pie chart)
  Over time                 → Stacked area chart
  Hierarchical              → Treemap

Relationship:
  Two continuous            → Scatter plot
  Three variables           → Scatter + color/size encoding
  Many variables            → Pair plot or correlation heatmap
```

### 4.2 Accessible Color Palettes

```python
# Colorblind-safe palettes (avoid red-green encoding)
PALETTE_CATEGORICAL = ['#4477AA', '#EE6677', '#228833', '#CCBB44',
                        '#66CCEE', '#AA3377', '#BBBBBB']  # Tol's qualitative

PALETTE_SEQUENTIAL = 'viridis'     # Perceptually uniform, colorblind-safe
PALETTE_DIVERGING = 'RdBu_r'      # Red-blue, clear midpoint

# Apply globally
import matplotlib.pyplot as plt
plt.rcParams['axes.prop_cycle'] = plt.cycler(color=PALETTE_CATEGORICAL)
```

### 4.3 Publication-Ready Chart Template

```python
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

def create_chart(figsize=(8, 5)):
    """Base chart with clean, professional styling."""
    fig, ax = plt.subplots(figsize=figsize)

    # Clean styling
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.tick_params(axis='both', which='major', labelsize=10)
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, p: f'{x:,.0f}'))

    return fig, ax

def annotate_chart(ax, title, subtitle=None, source=None):
    """Add title, subtitle, and source annotation."""
    ax.set_title(title, fontsize=14, fontweight='bold', loc='left', pad=15)
    if subtitle:
        ax.text(0, 1.02, subtitle, transform=ax.transAxes,
                fontsize=10, color='gray', va='bottom')
    if source:
        ax.text(1, -0.12, f'Source: {source}', transform=ax.transAxes,
                fontsize=8, color='gray', ha='right')
```

---

## 5. Outlier Treatment

### 5.1 Detection Methods

```python
import numpy as np
import pandas as pd
from scipy import stats

def detect_outliers(series, method='iqr'):
    """Detect outliers using multiple methods."""
    series = series.dropna()

    if method == 'iqr':
        q1, q3 = series.quantile([0.25, 0.75])
        iqr = q3 - q1
        lower, upper = q1 - 1.5 * iqr, q3 + 1.5 * iqr
        outliers = (series < lower) | (series > upper)

    elif method == 'zscore':
        z = np.abs(stats.zscore(series))
        outliers = z > 3

    elif method == 'modified_zscore':
        median = series.median()
        mad = np.median(np.abs(series - median))
        modified_z = 0.6745 * (series - median) / mad
        outliers = np.abs(modified_z) > 3.5

    elif method == 'isolation_forest':
        from sklearn.ensemble import IsolationForest
        clf = IsolationForest(contamination=0.05, random_state=42)
        outliers = clf.fit_predict(series.values.reshape(-1, 1)) == -1

    return outliers

# Compare methods
for method in ['iqr', 'zscore', 'modified_zscore']:
    mask = detect_outliers(df['value'], method=method)
    print(f"{method}: {mask.sum()} outliers ({mask.mean():.1%})")
```

### 5.2 Treatment Options

```python
def treat_outliers(series, method='winsorize', limits=(0.01, 0.01)):
    """Treat outliers without losing data points."""
    if method == 'winsorize':
        from scipy.stats.mstats import winsorize
        return pd.Series(winsorize(series, limits=limits), index=series.index)
    elif method == 'log_transform':
        return np.log1p(series.clip(lower=0))
    elif method == 'robust_scale':
        median = series.median()
        mad = np.median(np.abs(series - median))
        return (series - median) / (mad + 1e-8)
    else:
        raise ValueError(f"Unknown method: {method}")
```

---

## 6. A/B Testing

### 6.1 Pre-Experiment: Sample Size Calculation

```python
from statsmodels.stats.proportion import proportion_effectsize
from statsmodels.stats.power import NormalIndPower

def ab_test_sample_size(baseline_rate, min_detectable_effect,
                         alpha=0.05, power=0.8):
    """Calculate required sample size per group for A/B test on proportions."""
    target_rate = baseline_rate * (1 + min_detectable_effect)
    effect = proportion_effectsize(baseline_rate, target_rate)
    analysis = NormalIndPower()
    n = analysis.solve_power(effect_size=effect, alpha=alpha, power=power,
                             alternative='two-sided')
    n_per_group = int(np.ceil(n))

    print(f"Baseline rate: {baseline_rate:.1%}")
    print(f"Minimum detectable effect: {min_detectable_effect:.1%} relative")
    print(f"Target rate: {target_rate:.1%}")
    print(f"Required n per group: {n_per_group:,}")
    print(f"Total required: {n_per_group * 2:,}")
    return n_per_group

n = ab_test_sample_size(baseline_rate=0.05, min_detectable_effect=0.10)
```

### 6.2 Analysis: Full A/B Test Pipeline

```python
import numpy as np
import pandas as pd
from scipy import stats

def analyze_ab_test(control, treatment, metric_type='proportion', alpha=0.05):
    """Complete A/B test analysis with effect size and confidence intervals."""
    results = {}

    if metric_type == 'proportion':
        n_c, n_t = len(control), len(treatment)
        p_c, p_t = control.mean(), treatment.mean()
        se = np.sqrt(p_c * (1 - p_c) / n_c + p_t * (1 - p_t) / n_t)
        z = (p_t - p_c) / se
        p_value = 2 * (1 - stats.norm.cdf(abs(z)))

        results['control_rate'] = p_c
        results['treatment_rate'] = p_t
        results['absolute_lift'] = p_t - p_c
        results['relative_lift'] = (p_t / p_c - 1) if p_c > 0 else float('inf')
        results['p_value'] = p_value
        results['ci_lower'] = (p_t - p_c) - 1.96 * se
        results['ci_upper'] = (p_t - p_c) + 1.96 * se

    elif metric_type == 'continuous':
        stat, p_value = stats.mannwhitneyu(control, treatment, alternative='two-sided')
        results['control_mean'] = control.mean()
        results['treatment_mean'] = treatment.mean()
        results['absolute_lift'] = treatment.mean() - control.mean()
        results['relative_lift'] = (treatment.mean() / control.mean() - 1)
        results['p_value'] = p_value
        results['cohens_d'] = cohens_d(treatment, control)

        # Bootstrap CI for mean difference
        rng = np.random.default_rng(42)
        diffs = []
        for _ in range(10000):
            c = rng.choice(control, size=len(control), replace=True).mean()
            t = rng.choice(treatment, size=len(treatment), replace=True).mean()
            diffs.append(t - c)
        results['ci_lower'] = np.percentile(diffs, 2.5)
        results['ci_upper'] = np.percentile(diffs, 97.5)

    results['significant'] = results['p_value'] < alpha
    results['ci_includes_zero'] = results['ci_lower'] <= 0 <= results['ci_upper']

    return results
```

### 6.3 Guardrail Metrics

```python
def check_guardrails(df, treatment_col='group', guardrails=None):
    """Check guardrail metrics to ensure experiment doesn't break existing metrics."""
    if guardrails is None:
        guardrails = {
            'page_load_time': {'direction': 'lower_better', 'threshold': 0.10},
            'error_rate': {'direction': 'lower_better', 'threshold': 0.05},
            'session_duration': {'direction': 'higher_better', 'threshold': 0.10}
        }

    control = df[df[treatment_col] == 'control']
    treatment = df[df[treatment_col] == 'treatment']
    alerts = []

    for metric, config in guardrails.items():
        c_mean = control[metric].mean()
        t_mean = treatment[metric].mean()
        pct_change = (t_mean - c_mean) / c_mean

        if config['direction'] == 'lower_better':
            degraded = pct_change > config['threshold']
        else:
            degraded = pct_change < -config['threshold']

        if degraded:
            alerts.append(f"ALERT: {metric} degraded by {pct_change:.1%} "
                         f"(threshold: {config['threshold']:.1%})")

    return alerts
```

---

## 7. Reporting Patterns

### 7.1 Analysis Report Structure

```
1. EXECUTIVE SUMMARY (1 paragraph)
   - Key finding in plain language
   - Business recommendation
   - Confidence level

2. METHODOLOGY (for technical audience)
   - Data source and date range
   - Sample size and selection criteria
   - Statistical methods used
   - Assumptions made

3. FINDINGS
   - Primary metric with confidence interval
   - Supporting metrics
   - Segmented results (by key dimensions)
   - Visualizations

4. LIMITATIONS
   - Data quality issues
   - Selection bias risks
   - Confounders not controlled for
   - Generalizability constraints

5. RECOMMENDATIONS
   - Actionable next steps
   - Additional analyses needed
   - Monitoring plan

6. REPRODUCIBILITY
   - Code location (repo, notebook)
   - Data version / hash
   - Environment (Python version, package versions)
   - Random seeds used
```

### 7.2 Uncertainty Communication

```python
def format_result(estimate, ci_lower, ci_upper, metric_name="lift"):
    """Format results with appropriate uncertainty language."""
    ci_width = ci_upper - ci_lower
    includes_zero = ci_lower <= 0 <= ci_upper

    if includes_zero:
        return (f"The estimated {metric_name} is {estimate:.1%}, but the 95% confidence "
                f"interval [{ci_lower:.1%}, {ci_upper:.1%}] includes zero. "
                f"We cannot confidently conclude there is a real effect.")
    elif ci_width > abs(estimate):
        return (f"The estimated {metric_name} is {estimate:.1%} "
                f"(95% CI: [{ci_lower:.1%}, {ci_upper:.1%}]). "
                f"While directionally positive, the wide interval suggests high uncertainty.")
    else:
        return (f"The {metric_name} is {estimate:.1%} "
                f"(95% CI: [{ci_lower:.1%}, {ci_upper:.1%}]). "
                f"The effect is statistically significant and practically meaningful.")
```

---

## 8. Sampling Methods

### 8.1 Sampling Strategies

```python
import pandas as pd
import numpy as np

def stratified_sample(df, strata_col, n_per_stratum=None, frac=None, seed=42):
    """Stratified random sample ensuring representation of all groups."""
    if n_per_stratum:
        return df.groupby(strata_col, group_keys=False).apply(
            lambda x: x.sample(min(n_per_stratum, len(x)), random_state=seed)
        )
    elif frac:
        return df.groupby(strata_col, group_keys=False).apply(
            lambda x: x.sample(frac=frac, random_state=seed)
        )

def bootstrap_estimate(data, statistic_fn, n_bootstrap=10000, ci=0.95, seed=42):
    """Bootstrap confidence interval for any statistic."""
    rng = np.random.default_rng(seed)
    boot_stats = []
    for _ in range(n_bootstrap):
        sample = rng.choice(data, size=len(data), replace=True)
        boot_stats.append(statistic_fn(sample))

    alpha = (1 - ci) / 2
    lower = np.percentile(boot_stats, alpha * 100)
    upper = np.percentile(boot_stats, (1 - alpha) * 100)

    return {
        'estimate': statistic_fn(data),
        'ci_lower': lower,
        'ci_upper': upper,
        'se': np.std(boot_stats)
    }

# Example: bootstrap confidence interval for median
result = bootstrap_estimate(df['revenue'].values, np.median)
print(f"Median: {result['estimate']:.2f} (95% CI: [{result['ci_lower']:.2f}, {result['ci_upper']:.2f}])")
```

### 8.2 Bias Detection

```python
def check_sampling_bias(sample_df, population_df, key_cols):
    """Compare sample distribution to population for bias detection."""
    from scipy import stats

    bias_report = []
    for col in key_cols:
        if sample_df[col].dtype in ['object', 'category']:
            # Categorical: chi-squared goodness of fit
            pop_dist = population_df[col].value_counts(normalize=True)
            sample_counts = sample_df[col].value_counts()
            expected = pop_dist[sample_counts.index] * len(sample_df)
            chi2, p_val = stats.chisquare(sample_counts, f_exp=expected)
            bias_report.append({
                'column': col, 'test': 'chi-squared',
                'statistic': chi2, 'p_value': p_val,
                'biased': p_val < 0.01
            })
        else:
            # Continuous: KS test
            stat, p_val = stats.ks_2samp(sample_df[col].dropna(),
                                          population_df[col].dropna())
            bias_report.append({
                'column': col, 'test': 'KS',
                'statistic': stat, 'p_value': p_val,
                'biased': p_val < 0.01
            })

    return pd.DataFrame(bias_report)
```

---

## 9. Anti-Patterns Table

| Anti-Pattern | Detection Signal | Risk | Correction |
|---|---|---|---|
| p-Hacking | Many tests, only significant reported | False discoveries | Multiple testing correction, pre-registration |
| Survivorship bias | Only successful cases in data | Biased estimates | Include all outcomes |
| Simpson's paradox | Subgroup trend reverses aggregate | Wrong conclusion | Stratified analysis |
| HARKing | Hypothesis stated after results | Overfitting to data | Pre-register hypotheses |
| Garden of forking paths | Many analytical choices | Inflated significance | Multiverse analysis, specification curve |
| Ecological fallacy | Group-level data, individual claims | Invalid inference | Use individual-level data |
| Base rate neglect | Rare events, precision reported without recall | Misleading accuracy | Report precision, recall, F1, and base rate |
| Regression to the mean | Extreme initial measurement | Overestimate treatment effect | Control group, repeated measures |
| Confounding | Omitted variable correlates with both X and Y | Spurious correlation | DAGs, partial correlation, stratification |
| Measurement error | Noisy or biased instruments | Attenuation bias | Reliability analysis, instrument validation |

---

## 10. Reference Implementation: Analysis Pipeline

```python
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from scipy import stats
from datetime import datetime
import logging
import hashlib

class AnalysisPipeline:
    """Reproducible analysis pipeline: load -> profile -> clean -> analyze -> visualize -> report."""

    def __init__(self, seed=42, log_dir='logs'):
        self.seed = seed
        np.random.seed(seed)
        self.logger = self._setup_logging(log_dir)
        self.data = None
        self.profile_results = None
        self.analysis_results = {}

    def _setup_logging(self, log_dir):
        logger = logging.getLogger(f'analysis_{datetime.now():%Y%m%d}')
        logger.setLevel(logging.INFO)
        handler = logging.FileHandler(
            f'{log_dir}/analysis_{datetime.now():%Y%m%d_%H%M%S}.log'
        )
        handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
        logger.addHandler(handler)
        return logger

    def load(self, path, **kwargs):
        """Load data with integrity logging."""
        self.data = pd.read_csv(path, **kwargs)
        data_bytes = self.data.to_csv(index=False).encode()
        data_hash = hashlib.md5(data_bytes).hexdigest()
        self.logger.info(f"Loaded {path}: {self.data.shape}, hash={data_hash}")
        return self

    def profile(self):
        """Generate data quality profile."""
        df = self.data
        self.profile_results = {
            'shape': df.shape,
            'dtypes': df.dtypes.value_counts().to_dict(),
            'missing_pct': df.isnull().mean().to_dict(),
            'duplicates': df.duplicated().sum(),
            'numeric_summary': df.describe().to_dict()
        }
        high_missing = {k: v for k, v in self.profile_results['missing_pct'].items() if v > 0.05}
        if high_missing:
            self.logger.info(f"High missing: {high_missing}")
        return self

    def clean(self, drop_duplicates=True, missing_strategy='median'):
        """Clean data with documented transformations."""
        initial_rows = len(self.data)

        if drop_duplicates:
            self.data = self.data.drop_duplicates()
            dropped = initial_rows - len(self.data)
            self.logger.info(f"Dropped {dropped} duplicates")

        numeric_cols = self.data.select_dtypes(include='number').columns
        if missing_strategy == 'median':
            fill_values = self.data[numeric_cols].median()
            self.data[numeric_cols] = self.data[numeric_cols].fillna(fill_values)
        elif missing_strategy == 'drop':
            self.data = self.data.dropna(subset=numeric_cols)

        self.logger.info(f"After cleaning: {self.data.shape}")
        return self

    def analyze(self, target, features, test='auto'):
        """Statistical analysis with appropriate test selection."""
        for feature in features:
            data = self.data[[feature, target]].dropna()
            if data[feature].dtype in ['object', 'category']:
                table = pd.crosstab(data[feature], data[target])
                chi2, p, dof, expected = stats.chi2_contingency(table)
                self.analysis_results[feature] = {
                    'test': 'chi-squared', 'statistic': chi2,
                    'p_value': p, 'dof': dof
                }
            else:
                corr, p = stats.spearmanr(data[feature], data[target])
                self.analysis_results[feature] = {
                    'test': 'spearman', 'correlation': corr, 'p_value': p
                }
            self.logger.info(f"{feature}: {self.analysis_results[feature]}")

        return self

    def report(self, output_path='analysis_report.md'):
        """Generate markdown report."""
        lines = [
            f"# Analysis Report",
            f"Generated: {datetime.now():%Y-%m-%d %H:%M}",
            f"Random seed: {self.seed}",
            f"",
            f"## Data Profile",
            f"- Shape: {self.profile_results['shape']}",
            f"- Duplicates: {self.profile_results['duplicates']}",
            f"",
            f"## Statistical Results",
        ]
        for feature, result in self.analysis_results.items():
            lines.append(f"### {feature}")
            for k, v in result.items():
                lines.append(f"- {k}: {v}")
            lines.append("")

        with open(output_path, 'w') as f:
            f.write('\n'.join(lines))

        self.logger.info(f"Report written to {output_path}")
        return self
```
