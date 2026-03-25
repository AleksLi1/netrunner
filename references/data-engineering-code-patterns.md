# Data Engineering Code Patterns

## Purpose

This reference provides concrete correct vs. incorrect code patterns for common data engineering bugs. These are not checklists — they are examples that activate expert reasoning about what pipeline reliability, data quality, and idempotency look like in code.

When this reference is active, the agent should use these patterns as diagnostic templates: "Does the code I'm reading/writing match the CORRECT pattern, or does it resemble the WRONG pattern?"

---

## Pattern 1: Non-Idempotent Write

The most common source of duplicate data. An INSERT that appends on every run means retries and backfills produce duplicates.

**WRONG — append-only INSERT:**
```python
# Every run appends new rows — retries create duplicates
def load_daily_data(df, engine, table_name, partition_date):
    df.to_sql(table_name, engine, if_exists='append', index=False)
```

**CORRECT — partition overwrite:**
```python
# Overwrite the entire partition atomically — retries are safe
def load_daily_data(df, engine, table_name, partition_date):
    with engine.begin() as conn:
        conn.execute(
            text(f"DELETE FROM {table_name} WHERE partition_date = :pd"),
            {"pd": partition_date}
        )
        df.to_sql(table_name, conn, if_exists='append', index=False)
```

**CORRECT — MERGE/upsert with deduplication key:**
```sql
-- MERGE ensures idempotency via natural key
MERGE INTO target_table AS t
USING staging_table AS s
ON t.event_id = s.event_id AND t.event_date = s.event_date
WHEN MATCHED THEN UPDATE SET
    t.value = s.value,
    t.updated_at = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN INSERT (event_id, event_date, value, updated_at)
VALUES (s.event_id, s.event_date, s.value, CURRENT_TIMESTAMP);
```

**Why this matters:** Pipelines are retried constantly — OOM kills, network timeouts, spot instance preemption. Without idempotent writes, every retry doubles the data. This is the single most damaging anti-pattern because duplicates propagate silently through all downstream aggregations.

**Diagnostic question:** "If I run this pipeline twice for the same date, do I get the same result?"

---

## Pattern 2: Schema Drift Ignorance

Ingesting data without schema validation means upstream changes break pipelines silently or corrupt data.

**WRONG — no schema validation:**
```python
# Blindly reads whatever the source provides
def ingest_events(source_path):
    df = pd.read_parquet(source_path)
    df.to_sql('events', engine, if_exists='append', index=False)
```

**CORRECT — explicit schema validation on ingest:**
```python
import pandera as pa

event_schema = pa.DataFrameSchema({
    "event_id": pa.Column(str, nullable=False, unique=True),
    "event_timestamp": pa.Column("datetime64[ns]", nullable=False),
    "user_id": pa.Column(str, nullable=False),
    "event_type": pa.Column(str, pa.Check.isin(["click", "view", "purchase", "signup"])),
    "value": pa.Column(float, pa.Check.ge(0), nullable=True),
})

def ingest_events(source_path):
    df = pd.read_parquet(source_path)
    try:
        event_schema.validate(df, lazy=True)
    except pa.errors.SchemaErrors as e:
        log.error(f"Schema validation failed: {e.failure_cases}")
        send_to_dead_letter_queue(df, source_path, errors=e.failure_cases)
        raise
    df.to_sql('events', engine, if_exists='append', index=False)
```

**Why this matters:** Source systems change schemas without warning. A new enum value, a renamed column, a type change — any of these can silently corrupt your data or crash your pipeline. Schema validation on ingest is your first line of defense.

**Diagnostic question:** "What happens when the source adds a new column or changes a type?"

---

## Pattern 3: Missing Data Quality Checks

Processing data without validation between pipeline stages means errors propagate downstream undetected.

**WRONG — no validation between stages:**
```python
# Extract → Transform → Load with zero validation
def etl_pipeline():
    raw_df = extract_from_source()
    transformed_df = apply_transformations(raw_df)
    load_to_warehouse(transformed_df)
```

**CORRECT — quality gates between stages:**
```python
from great_expectations.core import ExpectationSuite

def etl_pipeline():
    raw_df = extract_from_source()

    # Gate 1: Post-extraction validation
    assert len(raw_df) > 0, "Empty extraction — source may be down"
    assert raw_df['event_id'].is_unique, "Duplicate event_ids in source"
    assert raw_df['event_timestamp'].notna().all(), "Null timestamps in source"

    transformed_df = apply_transformations(raw_df)

    # Gate 2: Post-transformation validation
    assert len(transformed_df) >= len(raw_df) * 0.95, (
        f"Transformation dropped >5% of rows: {len(raw_df)} -> {len(transformed_df)}"
    )
    assert transformed_df['amount'].between(0, 1_000_000).all(), (
        "Amount out of expected range — possible unit conversion error"
    )

    # Gate 3: Pre-load validation
    existing_count = get_row_count('target_table', transformed_df['date'].iloc[0])
    load_to_warehouse(transformed_df)
    new_count = get_row_count('target_table', transformed_df['date'].iloc[0])
    assert new_count == len(transformed_df), (
        f"Row count mismatch after load: expected {len(transformed_df)}, got {new_count}"
    )
```

**Why this matters:** Without intermediate checks, a bug in transformation silently corrupts all downstream tables. By the time someone notices, the bad data has been served to dashboards, models, and reports for days.

**Diagnostic question:** "If this transformation silently drops 10% of rows, when would we find out?"

---

## Pattern 4: Unbounded Backfill

Reprocessing the entire history when only a subset needs updating wastes compute and can exceed SLA windows.

**WRONG — full table reprocess on every backfill:**
```python
# Reprocesses ALL data regardless of what changed
def backfill(start_date, end_date):
    df = read_all_source_data()  # reads terabytes
    result = transform(df)
    write_to_target(result)  # overwrites everything
```

**CORRECT — partition-bounded incremental backfill:**
```python
def backfill(start_date, end_date):
    """Reprocess only the affected date range, one partition at a time."""
    dates = pd.date_range(start_date, end_date, freq='D')
    for partition_date in dates:
        log.info(f"Backfilling partition: {partition_date}")
        df = read_source_partition(partition_date)

        if df.empty:
            log.warning(f"No source data for {partition_date}, skipping")
            continue

        result = transform(df)
        validate_partition(result, partition_date)
        write_partition(result, partition_date)  # atomic overwrite

        log.info(
            f"Backfilled {partition_date}: {len(result)} rows"
        )
```

**Why this matters:** A full-table reprocess that takes 8 hours blocks your daily pipeline. Partition-bounded backfills let you reprocess specific dates in minutes while the daily pipeline continues running for other partitions.

**Diagnostic question:** "How long does a backfill take for a single day? For a full year?"

---

## Pattern 5: No Deduplication Strategy

Append-only ingestion without deduplication leads to silently growing duplicate counts.

**WRONG — append without dedup:**
```python
# Late-arriving events are appended even if already present
def ingest_events(new_events_df):
    new_events_df.to_sql('events', engine, if_exists='append', index=False)
```

**CORRECT — deduplication on ingest:**
```python
def ingest_events(new_events_df, engine):
    """Ingest events with deduplication based on event_id."""
    # Fetch existing event_ids for the relevant time window
    min_ts = new_events_df['event_timestamp'].min()
    max_ts = new_events_df['event_timestamp'].max()

    existing_ids = pd.read_sql(
        text("""
            SELECT event_id FROM events
            WHERE event_timestamp BETWEEN :min_ts AND :max_ts
        """),
        engine,
        params={"min_ts": min_ts, "max_ts": max_ts}
    )['event_id']

    # Filter out duplicates
    deduped_df = new_events_df[~new_events_df['event_id'].isin(existing_ids)]
    dropped = len(new_events_df) - len(deduped_df)
    if dropped > 0:
        log.info(f"Deduplication dropped {dropped} existing events")

    deduped_df.to_sql('events', engine, if_exists='append', index=False)
    return len(deduped_df)
```

**Why this matters:** Late-arriving events, Kafka consumer rebalancing, and pipeline retries all produce duplicate source records. Without an explicit deduplication strategy, duplicates accumulate and inflate all downstream metrics.

**Diagnostic question:** "What is the natural key for this data? Is it enforced at the database level?"

---

## Pattern 6: Wrong Join Type

Using the wrong join type silently drops or duplicates rows in transformation logic.

**WRONG — INNER JOIN silently drops unmatched rows:**
```sql
-- Orders without a matching customer are silently dropped
SELECT o.order_id, o.amount, c.customer_name
FROM orders o
JOIN customers c ON o.customer_id = c.customer_id;
```

**WRONG — LEFT JOIN without null handling:**
```python
# Merge drops rows where customer_id doesn't match, but looks correct
merged = orders.merge(customers, on='customer_id', how='left')
# Later aggregation silently ignores null customer_name rows
result = merged.groupby('customer_name')['amount'].sum()
# ^ Rows with NaN customer_name are dropped from the groupby
```

**CORRECT — explicit join validation:**
```python
merged = orders.merge(customers, on='customer_id', how='left', indicator=True)

# Check for unmatched rows
unmatched = merged[merged['_merge'] == 'left_only']
if len(unmatched) > 0:
    log.warning(
        f"{len(unmatched)} orders have no matching customer: "
        f"{unmatched['customer_id'].unique()[:10]}"
    )

# Handle nulls explicitly
merged['customer_name'] = merged['customer_name'].fillna('UNKNOWN')
merged = merged.drop(columns=['_merge'])
```

**CORRECT — SQL with explicit null handling:**
```sql
SELECT
    o.order_id,
    o.amount,
    COALESCE(c.customer_name, 'UNKNOWN') AS customer_name,
    CASE WHEN c.customer_id IS NULL THEN 1 ELSE 0 END AS is_unmatched
FROM orders o
LEFT JOIN customers c ON o.customer_id = c.customer_id;
```

**Why this matters:** JOIN mismatches are the second most common source of silent data loss. An INNER JOIN that drops 3% of rows goes unnoticed until a downstream report is wrong. Always validate join match rates and handle nulls explicitly.

**Diagnostic question:** "What percentage of left-side rows have no match? Is that expected?"

---

## Pattern 7: Hardcoded Partition Paths

Hardcoding file paths with date components creates brittle pipelines that break on edge cases.

**WRONG — hardcoded date formatting:**
```python
# Breaks on months < 10 if zero-padding is expected, breaks across years
def read_partition(year, month, day):
    path = f"s3://bucket/data/{year}/{month}/{day}/events.parquet"
    return pd.read_parquet(path)
```

**CORRECT — parameterized with proper formatting:**
```python
from datetime import date

def read_partition(partition_date: date) -> pd.DataFrame:
    """Read a single date partition with consistent path formatting."""
    path = (
        f"s3://bucket/data/"
        f"{partition_date.strftime('%Y')}/"
        f"{partition_date.strftime('%m')}/"
        f"{partition_date.strftime('%d')}/"
        f"events.parquet"
    )
    try:
        return pd.read_parquet(path)
    except FileNotFoundError:
        log.warning(f"No data for {partition_date} at {path}")
        return pd.DataFrame()  # empty df, caller decides what to do
```

**Why this matters:** Inconsistent date formatting produces paths like `2024/1/5` instead of `2024/01/05`, silently reading from wrong locations or failing to find data. A single `date` object with explicit formatting prevents this class of bug entirely.

**Diagnostic question:** "Does the path format match the actual partition layout in storage?"

---

## Pattern 8: Missing Dead Letter Queue

Bad records crash the entire pipeline instead of being quarantined for later inspection and reprocessing.

**WRONG — bad record crashes everything:**
```python
def process_events(events):
    results = []
    for event in events:
        # One bad record kills the entire batch
        parsed = json.loads(event['payload'])
        transformed = transform_event(parsed)
        results.append(transformed)
    return results
```

**CORRECT — quarantine bad records, process good ones:**
```python
def process_events(events, dlq_table='dead_letter_queue'):
    results = []
    quarantined = []

    for event in events:
        try:
            parsed = json.loads(event['payload'])
            transformed = transform_event(parsed)
            results.append(transformed)
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            quarantined.append({
                'raw_event': event['payload'],
                'error_type': type(e).__name__,
                'error_message': str(e),
                'event_id': event.get('event_id', 'UNKNOWN'),
                'quarantined_at': datetime.utcnow().isoformat(),
            })

    if quarantined:
        log.warning(f"Quarantined {len(quarantined)}/{len(events)} bad records")
        write_to_dlq(quarantined, dlq_table)

        failure_rate = len(quarantined) / len(events)
        if failure_rate > 0.05:
            raise PipelineHealthError(
                f"DLQ failure rate {failure_rate:.1%} exceeds 5% threshold"
            )

    return results
```

**Why this matters:** In any real data pipeline, some records will be malformed. Without a dead letter queue, one bad record blocks the entire batch. With a DLQ, good records flow through while bad records are captured for debugging and reprocessing. The 5% threshold catches systemic issues (e.g., source schema change) while tolerating normal noise.

**Diagnostic question:** "What happens when 1 out of 10,000 records is malformed? Does the pipeline crash or quarantine?"

---

## Pattern 9: No Data Freshness Monitoring

Stale data is served to consumers without anyone knowing the pipeline stopped updating.

**WRONG — no freshness check:**
```python
# Pipeline runs on schedule but nobody checks if data actually arrived
@dag(schedule_interval='@daily')
def daily_pipeline():
    extract_task = extract()
    transform_task = transform(extract_task)
    load_task = load(transform_task)
```

**CORRECT — freshness monitoring with alerting:**
```python
def check_table_freshness(table_name, max_staleness_hours, engine):
    """Check that a table has been updated within the expected window."""
    result = engine.execute(text(f"""
        SELECT MAX(updated_at) AS last_update
        FROM {table_name}
    """)).fetchone()

    last_update = result['last_update']
    if last_update is None:
        raise FreshnessError(f"Table {table_name} has no data")

    staleness = datetime.utcnow() - last_update
    staleness_hours = staleness.total_seconds() / 3600

    if staleness_hours > max_staleness_hours:
        raise FreshnessError(
            f"Table {table_name} is {staleness_hours:.1f}h stale "
            f"(threshold: {max_staleness_hours}h, last update: {last_update})"
        )

    log.info(f"Table {table_name} freshness OK: {staleness_hours:.1f}h")
    return staleness_hours


# Airflow sensor pattern
@dag(schedule_interval='@daily')
def daily_pipeline():
    extract_task = extract()
    transform_task = transform(extract_task)
    load_task = load(transform_task)
    freshness_check = check_freshness(load_task, max_staleness_hours=6)
```

**Why this matters:** A pipeline that silently stops updating is worse than one that crashes. Crashes trigger alerts. Stale data gets served to dashboards and models without anyone noticing — until the CEO asks why last week's numbers are missing.

**Diagnostic question:** "If this pipeline stops running today, when would someone notice?"

---

## Pattern 10: Cartesian Join

A missing or incorrect join condition produces an explosive row count that can crash the pipeline or silently corrupt aggregations.

**WRONG — implicit cartesian product:**
```sql
-- Missing join condition produces N * M rows
SELECT o.order_id, p.product_name
FROM orders o, products p;
```

**WRONG — join on non-unique key without handling fan-out:**
```python
# If one order has multiple line items AND one product has multiple variants,
# this produces a cartesian product per (order, product) pair
merged = orders.merge(line_items, on='order_id').merge(
    product_variants, on='product_id'
)
# ^ Row count can explode: 1000 orders * 3 items * 5 variants = 15,000 rows
```

**CORRECT — validate row counts after joins:**
```python
def safe_merge(left, right, on, how='inner', expected_ratio=(0.5, 2.0)):
    """Merge with row count validation to catch cartesian joins."""
    pre_count = len(left)
    result = left.merge(right, on=on, how=how)
    post_count = len(result)

    ratio = post_count / max(pre_count, 1)
    min_ratio, max_ratio = expected_ratio

    if ratio > max_ratio:
        raise DataQualityError(
            f"Join fan-out detected: {pre_count} -> {post_count} rows "
            f"(ratio: {ratio:.1f}x, max allowed: {max_ratio}x). "
            f"Check join key '{on}' for duplicates in right table."
        )

    if ratio < min_ratio:
        log.warning(
            f"Join dropped significant rows: {pre_count} -> {post_count} "
            f"(ratio: {ratio:.1f}x). Check for unmatched keys."
        )

    return result
```

**Why this matters:** Cartesian joins are the most explosive bug in data engineering. A join between two 1M-row tables with a bad key produces 1 trillion rows, killing the cluster. Even a partial fan-out (1:N becoming M:N) silently inflates metrics.

**Diagnostic question:** "Is the join key unique on at least one side? What is the expected cardinality?"

---

## Pattern 11: Inadequate Null Handling

Nulls propagating through aggregations produce incorrect results without errors.

**WRONG — nulls silently distort aggregations:**
```python
# AVG ignores nulls — if 30% of values are null, the average
# represents only 70% of the data without any warning
average_revenue = df['revenue'].mean()

# COUNT(*) counts all rows, COUNT(column) skips nulls
# This discrepancy is a common source of metric errors
total = df.shape[0]
non_null = df['revenue'].count()
# ^ These can differ significantly
```

**CORRECT — explicit null awareness:**
```python
def compute_metric(df, column, metric='mean', max_null_pct=0.05):
    """Compute metric with null awareness and threshold enforcement."""
    total = len(df)
    null_count = df[column].isna().sum()
    null_pct = null_count / total if total > 0 else 0

    if null_pct > max_null_pct:
        raise DataQualityError(
            f"Column '{column}' has {null_pct:.1%} nulls "
            f"(threshold: {max_null_pct:.1%}). "
            f"Investigate before computing {metric}."
        )

    if null_count > 0:
        log.info(
            f"Computing {metric} on '{column}' with "
            f"{null_count}/{total} ({null_pct:.1%}) null values excluded"
        )

    if metric == 'mean':
        return df[column].mean()
    elif metric == 'sum':
        return df[column].sum()
    elif metric == 'count':
        return df[column].count()  # explicitly excludes nulls
    else:
        raise ValueError(f"Unknown metric: {metric}")
```

**Why this matters:** Nulls are the silent distorter. `mean()` ignores them, `sum()` ignores them, `count()` ignores them — but the business interprets the result as "all data." If 30% of revenue values are null, the reported average represents only 70% of transactions. This is technically correct but practically misleading.

**Diagnostic question:** "What is the null rate for each column used in aggregations? Is that rate expected?"

---

## Pattern 12: Missing Pipeline Idempotency Key

Without a way to identify pipeline runs, there is no mechanism to detect or resolve duplicate processing.

**WRONG — no run identifier:**
```python
# No way to trace which pipeline run produced which rows
def process_and_load(df, target_table):
    result = transform(df)
    result.to_sql(target_table, engine, if_exists='append', index=False)
```

**CORRECT — pipeline run tracking:**
```python
import uuid
from datetime import datetime

def process_and_load(df, target_table, partition_date):
    """Process with run tracking for auditability and deduplication."""
    run_id = str(uuid.uuid4())
    run_timestamp = datetime.utcnow()

    result = transform(df)

    # Tag every row with the run that produced it
    result['_pipeline_run_id'] = run_id
    result['_pipeline_run_at'] = run_timestamp
    result['_partition_date'] = partition_date

    # Atomic partition overwrite using run_id for auditability
    with engine.begin() as conn:
        # Delete previous run's output for this partition
        conn.execute(
            text(f"DELETE FROM {target_table} WHERE _partition_date = :pd"),
            {"pd": partition_date}
        )
        result.to_sql(target_table, conn, if_exists='append', index=False)

    # Log the run for audit trail
    log_pipeline_run(
        run_id=run_id,
        table=target_table,
        partition=partition_date,
        row_count=len(result),
        started_at=run_timestamp,
        completed_at=datetime.utcnow(),
    )

    return run_id
```

**Why this matters:** Run tracking answers critical operational questions: "When was this partition last updated? How many rows did that run produce? Which run produced the current data?" Without it, debugging data issues requires guessing which pipeline run is responsible.

**Diagnostic question:** "Can I trace every row in the target table back to the pipeline run that produced it?"

---

## Pattern 13: Orchestration Without Retry Backoff

Retrying failed tasks immediately and indefinitely creates retry storms that amplify transient failures.

**WRONG — aggressive retry without backoff:**
```python
# Retries immediately 10 times — hammers the already-struggling service
extract_task = PythonOperator(
    task_id='extract_from_api',
    python_callable=extract_from_api,
    retries=10,
    retry_delay=timedelta(seconds=0),
    dag=dag,
)
```

**WRONG — no distinction between transient and permanent failures:**
```python
# Retries schema errors (permanent) the same as timeouts (transient)
@task(retries=3, retry_delay=timedelta(minutes=1))
def ingest_data():
    try:
        df = fetch_from_api()
        validate_schema(df)
        load(df)
    except Exception:
        raise  # All exceptions get retried equally
```

**CORRECT — exponential backoff with failure classification:**
```python
from airflow.decorators import task
from datetime import timedelta

class PermanentError(Exception):
    """Errors that will not resolve with retries (schema, config, logic)."""
    pass

class TransientError(Exception):
    """Errors that may resolve with retries (timeout, rate limit, network)."""
    pass

@task(
    retries=4,
    retry_delay=timedelta(minutes=2),
    retry_exponential_backoff=True,
    max_retry_delay=timedelta(minutes=30),
)
def ingest_data():
    try:
        df = fetch_from_api()
    except requests.exceptions.Timeout as e:
        raise TransientError(f"API timeout: {e}") from e
    except requests.exceptions.ConnectionError as e:
        raise TransientError(f"Connection failed: {e}") from e

    try:
        validate_schema(df)
    except SchemaValidationError as e:
        # Schema errors are permanent — don't waste retries
        raise PermanentError(f"Schema mismatch: {e}") from e

    load(df)
```

```python
# In the DAG definition, configure different retry behavior
# For Airflow, use on_retry_callback to classify:
def classify_retry(context):
    exception = context.get('exception')
    if isinstance(exception, PermanentError):
        # Skip remaining retries for permanent errors
        context['task_instance'].max_tries = 0
        log.error(f"Permanent failure, skipping retries: {exception}")
```

**Why this matters:** When an upstream API is rate-limiting or overloaded, retrying immediately 10 times in rapid succession makes the problem worse. Exponential backoff gives the upstream system time to recover. Classifying errors as transient vs permanent prevents wasting retries (and on-call engineer attention) on failures that will never self-resolve.

**Diagnostic question:** "Is this failure transient (timeout, rate limit) or permanent (schema, config)? Does the retry policy match?"
