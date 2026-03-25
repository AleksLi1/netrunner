# Data Analysis Code Patterns

## Purpose

This reference provides concrete correct vs. incorrect code patterns for common data analysis mistakes in Python. These are not checklists — they are examples that activate expert reasoning about what methodological rigor looks like in code.

When this reference is active, the agent should use these patterns as diagnostic templates: "Does the code I'm reading/writing match the CORRECT pattern, or does it resemble the WRONG pattern?"

---

## Pattern 1: p-Hacking Through Multiple Comparisons

The most common source of false discoveries. Testing many hypotheses without correction guarantees false positives.

**WRONG — testing many hypotheses, reporting only significant ones:**
```python
import pandas as pd
from scipy import stats

# Test every column against the target
results = {}
for col in df.select_dtypes(include='number').columns:
    stat, pval = stats.pearsonr(df[col], df['target'])
    if pval < 0.05:  # Only keep "significant" results
        results[col] = {'correlation': stat, 'p_value': pval}

print(f"Found {len(results)} significant features!")  # Cherry-picked
```

**CORRECT — test all, correct for multiple comparisons:**
```python
import pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests

# Test every column against the target
all_results = []
for col in df.select_dtypes(include='number').columns:
    stat, pval = stats.pearsonr(df[col], df['target'])
    all_results.append({'feature': col, 'correlation': stat, 'p_value': pval})

results_df = pd.DataFrame(all_results)

# Apply Benjamini-Hochberg correction for false discovery rate
reject, corrected_pvals, _, _ = multipletests(
    results_df['p_value'], method='fdr_bh', alpha=0.05
)
results_df['p_adjusted'] = corrected_pvals
results_df['significant'] = reject

# Report ALL results, not just significant ones
print(f"Tested {len(results_df)} features")
print(f"Significant after FDR correction: {reject.sum()}")
print(results_df.sort_values('p_adjusted'))
```

**Why this matters:** With 100 features and alpha=0.05, you expect 5 false positives by chance. Without correction, these false positives drive business decisions. Benjamini-Hochberg controls the false discovery rate — the proportion of discoveries that are false.

**Diagnostic question:** "How many hypotheses were tested? Was any correction applied?"

---

## Pattern 2: Survivorship Bias in Data Selection

Filtering out failures or incomplete cases before analysis biases all downstream results.

**WRONG — analyzing only surviving/active cases:**
```python
# Studying what makes customers successful
# But we only have data for CURRENT customers
active_customers = df[df['status'] == 'active']

# This ignores everyone who already churned
avg_spend = active_customers.groupby('segment')['spend'].mean()
print("Average spend by segment:", avg_spend)
# Conclusion: "All segments spend well" — but churned low-spenders are invisible
```

**CORRECT — include all outcomes, analyze holistically:**
```python
# Include ALL customers — active and churned
all_customers = df.copy()

# Segment analysis includes both outcomes
segment_analysis = all_customers.groupby(['segment', 'status'])['spend'].agg(
    ['mean', 'median', 'count']
).reset_index()

# Churn rate by segment reveals the full picture
churn_rate = all_customers.groupby('segment')['status'].apply(
    lambda x: (x == 'churned').mean()
).reset_index(name='churn_rate')

print("Segment analysis (all customers):")
print(segment_analysis)
print("\nChurn rate by segment:")
print(churn_rate)
# Now we see: high-spend segments may also have high churn
```

**Why this matters:** If high-spend customers churn faster, analyzing only active customers hides this. Decisions based on survivor-only data systematically overestimate retention and satisfaction.

**Diagnostic question:** "Does this dataset represent ALL cases, or only those that survived some selection process?"

---

## Pattern 3: Wrong Statistical Test

Using parametric tests on non-normal data or independent tests on paired observations produces invalid results.

**WRONG — parametric test on skewed data without checking assumptions:**
```python
from scipy import stats

# Revenue data is almost always right-skewed
group_a = df[df['group'] == 'A']['revenue']
group_b = df[df['group'] == 'B']['revenue']

# t-test assumes normality — invalid on skewed revenue data
stat, pval = stats.ttest_ind(group_a, group_b)
print(f"t-test p-value: {pval:.4f}")  # Unreliable result
```

**CORRECT — check assumptions, use appropriate test:**
```python
from scipy import stats
import numpy as np

group_a = df[df['group'] == 'A']['revenue']
group_b = df[df['group'] == 'B']['revenue']

# Step 1: Check normality
_, p_norm_a = stats.shapiro(group_a.sample(min(len(group_a), 5000)))
_, p_norm_b = stats.shapiro(group_b.sample(min(len(group_b), 5000)))

if p_norm_a > 0.05 and p_norm_b > 0.05:
    # Data is approximately normal — t-test is valid
    stat, pval = stats.ttest_ind(group_a, group_b, equal_var=False)
    test_name = "Welch's t-test"
else:
    # Data is non-normal — use Mann-Whitney U (non-parametric)
    stat, pval = stats.mannwhitneyu(group_a, group_b, alternative='two-sided')
    test_name = "Mann-Whitney U"

# Always report effect size alongside p-value
cohens_d = (group_a.mean() - group_b.mean()) / np.sqrt(
    (group_a.var() + group_b.var()) / 2
)

print(f"Test: {test_name}")
print(f"p-value: {pval:.4f}")
print(f"Cohen's d: {cohens_d:.3f}")
print(f"Medians: A={group_a.median():.2f}, B={group_b.median():.2f}")
```

**Why this matters:** A t-test on heavily skewed data (revenue, session duration, purchase amounts) can miss real differences or find false ones. The Mann-Whitney U test compares distributions without assuming normality. Always report effect size — a "significant" p-value with Cohen's d=0.01 is practically meaningless.

**Diagnostic question:** "What is the distribution of each group? Were test assumptions checked?"

---

## Pattern 4: Misleading Axis Scales

Truncated Y-axes and non-linear scales without indication exaggerate or hide real patterns.

**WRONG — truncated Y-axis exaggerates differences:**
```python
import matplotlib.pyplot as plt

months = ['Jan', 'Feb', 'Mar', 'Apr', 'May']
revenue = [1020, 1035, 1028, 1045, 1050]

fig, ax = plt.subplots()
ax.bar(months, revenue)
ax.set_ylim(1010, 1060)  # Truncated — makes 3% change look like 300%
ax.set_title("Revenue Growth")
plt.savefig("misleading_chart.png")
```

**CORRECT — honest axis with annotation for context:**
```python
import matplotlib.pyplot as plt

months = ['Jan', 'Feb', 'Mar', 'Apr', 'May']
revenue = [1020, 1035, 1028, 1045, 1050]

fig, ax = plt.subplots()
ax.bar(months, revenue)
ax.set_ylim(0, max(revenue) * 1.15)  # Start at zero
ax.set_title("Revenue: +2.9% Jan-May ($1,020 to $1,050)")
ax.set_ylabel("Revenue ($)")

# Annotate the actual change
for i, v in enumerate(revenue):
    ax.text(i, v + 15, f"${v:,}", ha='center', fontsize=9)

plt.tight_layout()
plt.savefig("honest_chart.png")
```

**Why this matters:** A bar chart with Y-axis from 1010 to 1060 makes a 3% change look enormous. Starting at zero shows the true proportion. When the change IS small but important, use a line chart with clear annotation of the actual percentage change instead of bar charts that exaggerate.

**Diagnostic question:** "Does the Y-axis start at zero? If not, is there a clear justification?"

---

## Pattern 5: Missing Confidence Intervals

Point estimates without uncertainty mislead stakeholders into false confidence.

**WRONG — point estimates only:**
```python
import pandas as pd

# A/B test results — point estimates only
control = df[df['group'] == 'control']['converted']
treatment = df[df['group'] == 'treatment']['converted']

print(f"Control conversion: {control.mean():.1%}")
print(f"Treatment conversion: {treatment.mean():.1%}")
print(f"Lift: {(treatment.mean() / control.mean() - 1):.1%}")
# "Treatment is 5% better!" — but how confident are we?
```

**CORRECT — include confidence intervals and effect size:**
```python
import numpy as np
from scipy import stats

control = df[df['group'] == 'control']['converted']
treatment = df[df['group'] == 'treatment']['converted']

def proportion_ci(series, confidence=0.95):
    """Wilson score interval for proportions."""
    n = len(series)
    p = series.mean()
    z = stats.norm.ppf((1 + confidence) / 2)
    denominator = 1 + z**2 / n
    center = (p + z**2 / (2 * n)) / denominator
    margin = z * np.sqrt((p * (1 - p) + z**2 / (4 * n)) / n) / denominator
    return center - margin, center + margin

ci_control = proportion_ci(control)
ci_treatment = proportion_ci(treatment)

# Lift with confidence interval via bootstrap
def bootstrap_lift(control, treatment, n_boot=10000, seed=42):
    rng = np.random.default_rng(seed)
    lifts = []
    for _ in range(n_boot):
        c = rng.choice(control, size=len(control), replace=True).mean()
        t = rng.choice(treatment, size=len(treatment), replace=True).mean()
        lifts.append(t / c - 1)
    return np.percentile(lifts, [2.5, 97.5])

lift_ci = bootstrap_lift(control.values, treatment.values)

print(f"Control: {control.mean():.1%} (95% CI: {ci_control[0]:.1%} - {ci_control[1]:.1%})")
print(f"Treatment: {treatment.mean():.1%} (95% CI: {ci_treatment[0]:.1%} - {ci_treatment[1]:.1%})")
print(f"Lift: {(treatment.mean() / control.mean() - 1):.1%} "
      f"(95% CI: {lift_ci[0]:.1%} - {lift_ci[1]:.1%})")
```

**Why this matters:** A 5% lift with a confidence interval of [-2%, 12%] means the true effect could be negative. Without confidence intervals, stakeholders make irreversible decisions on noisy estimates. The Wilson score interval is preferred for proportions (especially near 0 or 1) over the normal approximation.

**Diagnostic question:** "Is uncertainty quantified? Do confidence intervals include zero (no effect)?"

---

## Pattern 6: Correlation Reported as Causation

Reporting correlations without confounder analysis leads to incorrect causal claims.

**WRONG — correlation presented as causal:**
```python
import pandas as pd
from scipy import stats

# "Ice cream sales cause drowning"
corr, pval = stats.pearsonr(df['ice_cream_sales'], df['drowning_incidents'])
print(f"Correlation: {corr:.3f} (p={pval:.4f})")
print("Conclusion: Ice cream sales are associated with drowning risk")
# Missing: temperature is the confounder
```

**CORRECT — partial correlation controlling for confounders:**
```python
import pandas as pd
import numpy as np
from scipy import stats

def partial_correlation(df, x, y, covariates):
    """Compute partial correlation controlling for covariates."""
    # Residualize x and y by regressing out covariates
    from sklearn.linear_model import LinearRegression

    cov_data = df[covariates].values

    reg_x = LinearRegression().fit(cov_data, df[x])
    resid_x = df[x] - reg_x.predict(cov_data)

    reg_y = LinearRegression().fit(cov_data, df[y])
    resid_y = df[y] - reg_y.predict(cov_data)

    return stats.pearsonr(resid_x, resid_y)

# Raw correlation
raw_corr, raw_p = stats.pearsonr(df['ice_cream_sales'], df['drowning_incidents'])

# Partial correlation controlling for temperature
partial_corr, partial_p = partial_correlation(
    df, 'ice_cream_sales', 'drowning_incidents', covariates=['temperature']
)

print(f"Raw correlation: {raw_corr:.3f} (p={raw_p:.4f})")
print(f"Partial correlation (controlling for temperature): {partial_corr:.3f} (p={partial_p:.4f})")
print("The apparent relationship is explained by temperature (confounder)")
```

**Why this matters:** Observational data cannot establish causation without careful confounder analysis. Partial correlation removes the linear effect of confounders. For stronger causal claims, consider instrumental variables, regression discontinuity, or difference-in-differences designs.

**Diagnostic question:** "What confounders could explain this relationship? Was any adjustment applied?"

---

## Pattern 7: Data Leakage in Train/Test Split

Using information from the test set during training invalidates performance estimates.

**WRONG — preprocessing before split:**
```python
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# Scale ALL data — leaks test distribution into training
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Impute ALL data — leaks test statistics into training
X_scaled = pd.DataFrame(X_scaled).fillna(pd.DataFrame(X_scaled).mean())

X_train, X_test, y_train, y_test = train_test_split(
    X_scaled, y, test_size=0.2, random_state=42
)
```

**CORRECT — split first, then preprocess:**
```python
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# Split FIRST
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Pipeline ensures preprocessing is fit on training data only
pipeline = Pipeline([
    ('imputer', SimpleImputer(strategy='median')),
    ('scaler', StandardScaler()),
    ('model', RandomForestClassifier(n_estimators=100, random_state=42))
])

# fit() learns imputation values and scaling params from TRAIN only
pipeline.fit(X_train, y_train)

# transform() on test uses TRAIN statistics — no leakage
score = pipeline.score(X_test, y_test)
print(f"Test accuracy: {score:.3f}")
```

**Why this matters:** Fitting the scaler or imputer on the full dataset means the training phase "knows" the test set's mean, variance, and distribution. This inflates test performance. Pipelines prevent this by encapsulating the fit-transform workflow.

**Diagnostic question:** "Was any preprocessing step fit on data that includes the test set?"

---

## Pattern 8: Ignoring Missing Data Mechanism

Listwise deletion on data that is not missing completely at random (MCAR) biases results.

**WRONG — drop all rows with any missing value:**
```python
# 30% of rows have missing income data
# Income is missing more often for high earners (MNAR)
df_clean = df.dropna()  # Drops 30% of data, biased toward lower income

model = LogisticRegression()
model.fit(df_clean[features], df_clean['target'])
# Model trained on biased subsample — predictions are systematically wrong
```

**CORRECT — diagnose missingness mechanism, impute appropriately:**
```python
import pandas as pd
import numpy as np
from sklearn.impute import KNNImputer
import missingno as msno

# Step 1: Diagnose the missingness pattern
print("Missing rates:")
print(df.isnull().mean().sort_values(ascending=False))

# Step 2: Visualize missingness correlations
msno.heatmap(df)  # Shows which columns are missing together

# Step 3: Test if missingness is related to observed variables
# If income missingness correlates with other features, it's MAR or MNAR
from scipy import stats
missing_flag = df['income'].isnull().astype(int)
for col in ['age', 'education_years', 'job_level']:
    stat, pval = stats.pointbiserialr(missing_flag, df[col].fillna(df[col].median()))
    print(f"Missingness ~ {col}: r={stat:.3f}, p={pval:.4f}")

# Step 4: Use appropriate imputation
# KNN imputation is appropriate for MAR data
imputer = KNNImputer(n_neighbors=5)
df_imputed = pd.DataFrame(
    imputer.fit_transform(df[features]),
    columns=features
)

# Step 5: Sensitivity analysis — compare results with and without imputation
print("Results comparison:")
print(f"  Listwise deletion (n={df.dropna().shape[0]}): ...")
print(f"  KNN imputation (n={df_imputed.shape[0]}): ...")
```

**Why this matters:** If data is missing not at random (MNAR) — e.g., high earners skip the income question — listwise deletion systematically excludes a subpopulation. KNN imputation uses similar observations to estimate missing values, reducing bias for MAR data. For MNAR data, consider selection models or sensitivity analysis.

**Diagnostic question:** "Why is this data missing? Is missingness related to the value itself or other variables?"

---

## Pattern 9: Binning Continuous Variables

Arbitrary binning loses information and creates artificial discontinuities.

**WRONG — arbitrary binning:**
```python
# Convert age to categories with arbitrary cutoffs
df['age_group'] = pd.cut(df['age'], bins=[0, 25, 35, 45, 55, 100],
                          labels=['young', 'young_adult', 'middle', 'senior', 'elderly'])

# Now a 34-year-old and 36-year-old are in different groups
# But a 26-year-old and 34-year-old are in the same group
model = LogisticRegression()
model.fit(pd.get_dummies(df[['age_group']]), df['target'])
```

**CORRECT — keep continuous, or use data-driven splits:**
```python
import numpy as np
from sklearn.preprocessing import SplineTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline

# Option 1: Keep continuous — use splines for non-linear effects
pipeline = Pipeline([
    ('spline', SplineTransformer(n_knots=5, degree=3)),
    ('model', LogisticRegression(max_iter=1000))
])
pipeline.fit(df[['age']], df['target'])

# Option 2: If binning is required (e.g., for reporting), use quantile bins
df['age_quintile'] = pd.qcut(df['age'], q=5, labels=False)
# Quantile bins ensure equal-sized groups — less arbitrary than fixed cutoffs

# Option 3: For tree-based models, just use the raw variable
from sklearn.ensemble import GradientBoostingClassifier
model = GradientBoostingClassifier(n_estimators=100, random_state=42)
model.fit(df[['age']], df['target'])  # Trees find optimal splits automatically
```

**Why this matters:** Binning a continuous variable throws away within-bin variation. A 35-year-old and a 44-year-old are treated identically if both fall in "35-45." Spline transformations capture non-linear relationships without information loss. If you must bin for reporting, use quantile bins for equal group sizes.

**Diagnostic question:** "Is there a reason to bin this variable, or should it remain continuous?"

---

## Pattern 10: Cherry-Picked Time Window

Selecting date ranges that support a narrative while hiding contradictory periods.

**WRONG — cherry-picked window:**
```python
import matplotlib.pyplot as plt

# Campaign launched in March — show March-June to highlight growth
campaign_period = df[(df['date'] >= '2025-03-01') & (df['date'] <= '2025-06-30')]
campaign_period.plot(x='date', y='revenue', title='Revenue Growth After Campaign')
plt.savefig('campaign_success.png')
# Hides: revenue was already growing before campaign, or dropped in July
```

**CORRECT — full context with campaign annotation:**
```python
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

fig, ax = plt.subplots(figsize=(12, 5))

# Show full year for context
full_year = df[(df['date'] >= '2025-01-01') & (df['date'] <= '2025-12-31')]
ax.plot(full_year['date'], full_year['revenue'], linewidth=1.5)

# Highlight campaign period
campaign_start = pd.Timestamp('2025-03-01')
campaign_end = pd.Timestamp('2025-06-30')
ax.axvspan(campaign_start, campaign_end, alpha=0.15, color='blue',
           label='Campaign period')

# Add trend lines for pre/during/post
for period, label, color in [
    (full_year['date'] < campaign_start, 'Pre-campaign', 'gray'),
    ((full_year['date'] >= campaign_start) & (full_year['date'] <= campaign_end),
     'During campaign', 'blue'),
    (full_year['date'] > campaign_end, 'Post-campaign', 'orange')
]:
    subset = full_year[period]
    if len(subset) > 1:
        z = np.polyfit(mdates.date2num(subset['date']), subset['revenue'], 1)
        p = np.poly1d(z)
        ax.plot(subset['date'], p(mdates.date2num(subset['date'])),
                '--', color=color, alpha=0.7, label=f'{label} trend')

ax.legend()
ax.set_title('Revenue: Full Year Context with Campaign Period Highlighted')
ax.set_ylabel('Revenue ($)')
plt.tight_layout()
plt.savefig('campaign_context.png')
```

**Why this matters:** Any metric can look like it's improving if you pick the right window. Showing the full context — including pre-campaign trends and post-campaign sustainability — gives stakeholders the information they need to evaluate whether the campaign actually worked.

**Diagnostic question:** "Why was this time window chosen? What does the full timeline show?"

---

## Pattern 11: Aggregation Without Segmentation (Simpson's Paradox)

Aggregate statistics can hide or reverse subgroup patterns.

**WRONG — aggregate only:**
```python
# Overall treatment success rate
treatment_a = df[df['treatment'] == 'A']
treatment_b = df[df['treatment'] == 'B']

print(f"Treatment A success rate: {treatment_a['success'].mean():.1%}")
print(f"Treatment B success rate: {treatment_b['success'].mean():.1%}")
print("Conclusion: Treatment A is better overall")
# Misses: Treatment A is given more to mild cases (confounding)
```

**CORRECT — stratified analysis reveals Simpson's paradox:**
```python
import pandas as pd

# Overall rates
overall = df.groupby('treatment')['success'].agg(['mean', 'count']).reset_index()
overall.columns = ['treatment', 'success_rate', 'n']
print("Overall:")
print(overall)

# Stratified by severity (the confounder)
stratified = df.groupby(['treatment', 'severity'])['success'].agg(
    ['mean', 'count']
).reset_index()
stratified.columns = ['treatment', 'severity', 'success_rate', 'n']
print("\nStratified by severity:")
print(stratified)

# Check for Simpson's paradox
print("\nSimpson's Paradox check:")
for severity in df['severity'].unique():
    subset = stratified[stratified['severity'] == severity]
    a_rate = subset[subset['treatment'] == 'A']['success_rate'].values[0]
    b_rate = subset[subset['treatment'] == 'B']['success_rate'].values[0]
    winner = 'A' if a_rate > b_rate else 'B'
    print(f"  {severity}: Treatment {winner} is better "
          f"(A={a_rate:.1%}, B={b_rate:.1%})")

# Treatment assignment distribution reveals the confounding
assignment = df.groupby(['treatment', 'severity']).size().unstack(fill_value=0)
print(f"\nTreatment assignment (reveals confounding):\n{assignment}")
```

**Why this matters:** If Treatment A is assigned more to mild cases (which have higher baseline success), its overall rate looks better even if Treatment B is better within every severity group. Always stratify by potential confounders before drawing conclusions from aggregated data.

**Diagnostic question:** "Are there subgroups that could reverse this trend? Is the treatment/exposure evenly distributed?"

---

## Pattern 12: Reproducibility Failure

Analyses that cannot be reproduced give different results each time, undermining trust.

**WRONG — no seeds, no environment pinning, no documentation:**
```python
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# No random seed — different results every run
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)
model = RandomForestClassifier(n_estimators=100)
model.fit(X_train, y_train)
print(f"Accuracy: {model.score(X_test, y_test):.3f}")  # Different each time
# No record of data version, no environment info, no output logging
```

**CORRECT — fully reproducible analysis:**
```python
import pandas as pd
import numpy as np
import logging
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier

# Configuration block — all parameters in one place
RANDOM_SEED = 42
TEST_SIZE = 0.2
N_ESTIMATORS = 100
DATA_PATH = "data/customers_v3.csv"

# Set all random seeds
np.random.seed(RANDOM_SEED)

# Logging setup
logging.basicConfig(
    filename=f"analysis_{datetime.now():%Y%m%d_%H%M%S}.log",
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Data loading with hash for version tracking
df = pd.read_csv(DATA_PATH)
data_hash = pd.util.hash_pandas_object(df).sum()
logger.info(f"Data: {DATA_PATH}, rows={len(df)}, hash={data_hash}")
logger.info(f"Config: seed={RANDOM_SEED}, test_size={TEST_SIZE}, n_estimators={N_ESTIMATORS}")

# Reproducible split
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=TEST_SIZE, random_state=RANDOM_SEED, stratify=y
)

model = RandomForestClassifier(n_estimators=N_ESTIMATORS, random_state=RANDOM_SEED)
model.fit(X_train, y_train)
accuracy = model.score(X_test, y_test)

logger.info(f"Accuracy: {accuracy:.4f}")
logger.info(f"Train size: {len(X_train)}, Test size: {len(X_test)}")
print(f"Accuracy: {accuracy:.3f} (seed={RANDOM_SEED})")
```

**Why this matters:** If an analysis gives accuracy 0.87 today and 0.82 tomorrow (because of different random splits), which number do you present to stakeholders? Reproducibility means anyone can rerun the code and get the exact same results. This requires fixed random seeds, versioned data, and logged configurations.

**Diagnostic question:** "Can this analysis be rerun from scratch and produce identical results?"
