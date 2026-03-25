# Data Engineering Pipelines — Deep Reference

## 1. When to Load This Reference

**Loaded by:** nr-executor, nr-researcher, nr-verifier, nr-planner, nr-debugger

**Trigger keywords:** pipeline, ETL, ELT, Airflow, Spark, dbt, Kafka, warehouse, ingestion,
orchestration, backfill, data quality, schema evolution, idempotency, partitioning, freshness,
SLA, data lake, parquet, DAG, batch, streaming, great expectations, data contract, lineage

**Load condition:** Data engineering domain detected in CONTEXT.md, current task, or code under review.

**See also:** `data-engineering-reasoning.md` (reasoning triggers), `data-engineering-code-patterns.md` (code patterns)

---

## 2. Pipeline Architecture

### Batch vs Streaming Decision Framework

| Factor | Choose Batch | Choose Streaming |
|--------|-------------|-----------------|
| Latency requirement | Minutes to hours acceptable | Seconds to sub-second required |
| Data volume | High throughput, bounded windows | Continuous, potentially unbounded |
| Complexity budget | Lower — simpler error handling, replay | Higher — state management, exactly-once |
| Team experience | Data warehouse background | Event-driven systems experience |
| Cost sensitivity | Higher (compute during batch windows) | Higher (always-on infrastructure) |
| Debugging ease | Easier — bounded, replayable | Harder — state reconstruction, ordering |

**Default recommendation:** Start with batch. Move to streaming only when the business genuinely needs sub-minute latency. Most "real-time" requirements are actually "fresher than daily."

### ELT vs ETL

```
ETL (Extract → Transform → Load):
  Source → [Transform Engine] → Warehouse
  Pro: Only clean data enters warehouse
  Con: Lose raw data, harder to reprocess
  When: PII scrubbing required before storage, or warehouse compute is expensive

ELT (Extract → Load → Transform):
  Source → Warehouse → [Transform in Warehouse]
  Pro: Raw data preserved, warehouse handles compute
  Con: Raw storage costs, warehouse must handle messy data
  When: Cloud warehouse (Snowflake/BQ/Redshift), raw data is your insurance policy
```

**Default recommendation:** ELT for cloud warehouses. Raw data preservation is almost always worth the storage cost. You cannot reprocess data you did not keep.

### Micro-batch Pattern

When true streaming is overkill but hourly batch is too slow:

```python
# Micro-batch: process in small windows (e.g., every 5 minutes)
def micro_batch_ingest(source_stream, batch_interval_seconds=300):
    """Collect events for batch_interval, then process as a batch."""
    buffer = []
    window_start = time.time()

    for event in source_stream:
        buffer.append(event)

        if time.time() - window_start >= batch_interval_seconds:
            if buffer:
                process_batch(buffer)
                buffer = []
            window_start = time.time()
```

### Lambda vs Kappa Architecture

```
Lambda: Separate batch and streaming paths, merge at serving layer
  Batch Layer: Full recomputation for accuracy (Spark batch)
  Speed Layer: Real-time approximation (Kafka Streams/Flink)
  Serving Layer: Merge both views
  Pro: Accurate batch + fast streaming
  Con: Two codepaths to maintain, merging is complex

Kappa: Single streaming path, replay for recomputation
  Stream Layer: All processing through streaming engine
  Replay: Re-read from Kafka for recomputation
  Pro: Single codebase, simpler architecture
  Con: Kafka retention limits, replay can be slow at scale
```

**Default recommendation:** Kappa is simpler and sufficient for most use cases. Lambda only when batch accuracy and streaming speed are both genuinely required AND the team can maintain two codepaths.

---

## 3. Data Quality Framework

### Layered Defense Model

```
Layer 1: Schema Validation (on ingest)
  ├── Column presence and types
  ├── Nullable constraints
  └── Enum value validation

Layer 2: Row-Level Constraints (per record)
  ├── Range checks (amount > 0, age 0-150)
  ├── Format validation (email, phone, UUID)
  └── Referential integrity (FK exists)

Layer 3: Dataset-Level Assertions (per batch)
  ├── Row count within expected range
  ├── Null rate below threshold per column
  └── Unique constraint validation

Layer 4: Cross-Dataset Consistency (across tables)
  ├── Foreign key resolution rate
  ├── Aggregate reconciliation (sum of parts = total)
  └── Temporal consistency (events before entity creation)

Layer 5: Freshness & Completeness (SLA)
  ├── Last update timestamp within threshold
  ├── No date gaps in time-series tables
  └── Partition completeness (all expected partitions exist)
```

### Great Expectations Integration

```python
import great_expectations as gx

context = gx.get_context()

# Define expectations for a dataset
suite = context.add_expectation_suite("events_suite")

# Layer 1: Schema
suite.add_expectation(
    gx.expectations.ExpectTableColumnsToMatchOrderedList(
        column_list=["event_id", "timestamp", "user_id", "event_type", "value"]
    )
)

# Layer 2: Row-level
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToBeBetween(
        column="value", min_value=0, max_value=1_000_000
    )
)
suite.add_expectation(
    gx.expectations.ExpectColumnValuesToNotBeNull(column="event_id")
)

# Layer 3: Dataset-level
suite.add_expectation(
    gx.expectations.ExpectTableRowCountToBeBetween(
        min_value=1000, max_value=10_000_000
    )
)
suite.add_expectation(
    gx.expectations.ExpectColumnProportionOfUniqueValuesToBeAtLeast(
        column="event_id", value=0.99
    )
)

# Run validation
results = context.run_checkpoint(
    checkpoint_name="events_checkpoint",
    batch_request=batch_request,
)

if not results.success:
    handle_quality_failure(results)
```

### dbt Tests

```sql
-- schema.yml
models:
  - name: fct_orders
    description: "Fact table for completed orders"
    columns:
      - name: order_id
        tests:
          - unique
          - not_null
      - name: order_amount
        tests:
          - not_null
          - dbt_utils.expression_is_true:
              expression: "> 0"
      - name: customer_id
        tests:
          - not_null
          - relationships:
              to: ref('dim_customers')
              field: customer_id

    tests:
      - dbt_utils.recency:
          datepart: hour
          field: updated_at
          interval: 6
      - dbt_utils.equal_rowcount:
          compare_model: ref('stg_orders')
```

### Data Contracts

```yaml
# data_contract.yaml — agreement between producer and consumer
contract:
  name: "user_events"
  version: "2.1.0"
  owner: "platform-team"
  consumers: ["analytics", "ml-pipeline", "marketing"]

  schema:
    type: "avro"
    registry: "https://schema-registry.internal/subjects/user_events"
    compatibility: "BACKWARD"

  quality:
    freshness:
      max_staleness: "2 hours"
      check_interval: "15 minutes"
    completeness:
      min_row_count_per_hour: 10000
      max_null_rate:
        user_id: 0.0
        event_type: 0.0
        value: 0.05  # 5% nulls acceptable for value
    uniqueness:
      event_id: true

  sla:
    availability: "99.5%"
    latency_p99: "5 minutes"
    support_channel: "#data-platform-support"

  breaking_change_policy:
    notification: "14 days advance notice"
    migration_support: "Producer provides migration guide"
    deprecation_period: "30 days"
```

### Anomaly Detection for Data Quality

```python
def detect_metric_anomaly(table, column, lookback_days=30, sigma_threshold=3.0):
    """Detect anomalies in daily metric values using rolling statistics."""
    daily_stats = query(f"""
        SELECT
            DATE(created_at) AS dt,
            COUNT(*) AS row_count,
            AVG({column}) AS avg_value,
            STDDEV({column}) AS std_value,
            COUNT(CASE WHEN {column} IS NULL THEN 1 END)::FLOAT
                / COUNT(*) AS null_rate
        FROM {table}
        WHERE created_at >= CURRENT_DATE - INTERVAL '{lookback_days} days'
        GROUP BY DATE(created_at)
        ORDER BY dt
    """)

    # Rolling mean and std for anomaly detection
    daily_stats['rolling_mean'] = daily_stats['row_count'].rolling(7).mean()
    daily_stats['rolling_std'] = daily_stats['row_count'].rolling(7).std()

    # Check latest day against rolling statistics
    latest = daily_stats.iloc[-1]
    if abs(latest['row_count'] - latest['rolling_mean']) > sigma_threshold * latest['rolling_std']:
        return AnomalyAlert(
            table=table,
            metric='row_count',
            value=latest['row_count'],
            expected=latest['rolling_mean'],
            sigma=abs(latest['row_count'] - latest['rolling_mean']) / latest['rolling_std'],
        )

    return None
```

---

## 4. Schema Evolution

### Compatibility Rules

| Change Type | Backward Compatible | Forward Compatible | Full Compatible |
|-------------|--------------------|--------------------|-----------------|
| Add optional field | Yes | No | No |
| Add required field | No | No | No |
| Remove optional field | No | Yes | No |
| Remove required field | No | No | No |
| Rename field | No | No | No |
| Change type (widen) | Depends | Depends | No |
| Add enum value | Yes | No | No |
| Remove enum value | No | Yes | No |

**Default recommendation:** Use BACKWARD compatibility. Consumers can read data produced by newer schemas. This allows producers to evolve independently.

### Schema Registry Pattern (Confluent / AWS Glue)

```python
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroSerializer

# Register schema with compatibility check
schema_registry = SchemaRegistryClient({"url": "http://schema-registry:8081"})

# This will FAIL if the new schema breaks backward compatibility
schema_registry.register_schema(
    subject="user_events-value",
    schema=new_avro_schema,
)
```

### Migration Strategy for Breaking Changes

```python
# Step 1: Dual-write period (write both old and new format)
def produce_event(event):
    # Write to v1 topic (existing consumers)
    produce_to_topic("events-v1", serialize_v1(event))
    # Write to v2 topic (new consumers can migrate)
    produce_to_topic("events-v2", serialize_v2(event))

# Step 2: Migrate consumers one by one to v2
# Step 3: After all consumers migrated, stop writing v1
# Step 4: Decommission v1 topic after retention period
```

### Schema Versioning in Data Lake

```python
# Store schema version in partition path or metadata
def write_with_schema_version(df, base_path, schema_version):
    path = f"{base_path}/schema_version={schema_version}/{partition_date}"
    df.to_parquet(path)

# Readers can handle multiple schema versions
def read_with_schema_migration(path):
    df = pd.read_parquet(path)
    schema_version = extract_schema_version(path)

    if schema_version == 1:
        # Migrate v1 → v2: add default for new column
        df['new_column'] = 'default_value'
    elif schema_version == 2:
        pass  # current version, no migration needed

    return df
```

---

## 5. Idempotency Patterns

### Pattern 1: Partition Overwrite

The simplest and most reliable idempotency pattern. Rewrite the entire partition atomically.

```python
# Spark: overwrite individual partitions
(
    df.write
    .mode("overwrite")
    .partitionBy("date")
    .option("partitionOverwriteMode", "dynamic")
    .parquet("s3://warehouse/events/")
)

# SQL: DELETE + INSERT in transaction
BEGIN;
DELETE FROM events WHERE event_date = '2024-01-15';
INSERT INTO events SELECT * FROM staging_events WHERE event_date = '2024-01-15';
COMMIT;
```

### Pattern 2: MERGE / Upsert

For cases where partition overwrite is too coarse (e.g., updating specific records within a partition).

```sql
-- Snowflake MERGE
MERGE INTO target_table t
USING staging_table s
ON t.event_id = s.event_id
WHEN MATCHED AND s.updated_at > t.updated_at THEN
    UPDATE SET
        t.value = s.value,
        t.updated_at = s.updated_at
WHEN NOT MATCHED THEN
    INSERT (event_id, value, updated_at)
    VALUES (s.event_id, s.value, s.updated_at);
```

### Pattern 3: Checkpointing (Streaming)

Track processed offsets to resume from the last successful position.

```python
# Kafka consumer with manual offset commit
def consume_with_checkpoint(consumer, process_fn, checkpoint_store):
    while True:
        messages = consumer.poll(timeout_ms=1000, max_records=500)
        for partition, records in messages.items():
            for record in records:
                process_fn(record)

            # Commit offset AFTER successful processing
            last_offset = records[-1].offset
            checkpoint_store.save(partition, last_offset + 1)
            consumer.commit(offsets={partition: last_offset + 1})
```

### Pattern 4: Exactly-Once with Transaction

Combine processing and offset commit in a single transaction.

```python
# Kafka transactional producer + consumer
producer.init_transactions()
try:
    producer.begin_transaction()

    # Process and produce output
    for record in input_records:
        result = transform(record)
        producer.produce(output_topic, result)

    # Commit consumer offsets as part of the transaction
    producer.send_offsets_to_transaction(
        consumer.position(consumer.assignment()),
        consumer.consumer_group_metadata()
    )

    producer.commit_transaction()
except Exception:
    producer.abort_transaction()
    raise
```

---

## 6. Orchestration

### Airflow DAG Design Principles

```python
from airflow.decorators import dag, task
from airflow.datasets import Dataset
from datetime import datetime, timedelta

EVENTS_DATASET = Dataset("s3://warehouse/events/")
METRICS_DATASET = Dataset("s3://warehouse/metrics/")

default_args = {
    "owner": "data-platform",
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(hours=2),
    "sla": timedelta(hours=4),
    "on_failure_callback": alert_on_failure,
}

@dag(
    schedule="@daily",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args=default_args,
    tags=["events", "critical"],
)
def events_pipeline():
    @task
    def extract(execution_date=None):
        """Extract events for a single date partition."""
        return extract_events(execution_date.strftime('%Y-%m-%d'))

    @task
    def validate_source(data):
        """Gate: Validate extracted data before transformation."""
        validate_schema(data)
        validate_row_count(data, min_rows=1000)
        validate_null_rates(data, max_rate=0.05)
        return data

    @task
    def transform(data):
        """Apply business logic transformations."""
        return apply_transforms(data)

    @task
    def validate_output(data):
        """Gate: Validate transformed data before loading."""
        validate_referential_integrity(data)
        validate_aggregates(data)
        return data

    @task(outlets=[EVENTS_DATASET])
    def load(data, execution_date=None):
        """Load to warehouse with partition overwrite for idempotency."""
        partition_date = execution_date.strftime('%Y-%m-%d')
        load_partition(data, "events", partition_date)

    raw = extract()
    validated = validate_source(raw)
    transformed = transform(validated)
    checked = validate_output(transformed)
    load(checked)

events_pipeline()
```

### Dataset-Triggered DAGs (Airflow 2.4+)

```python
# Downstream DAG triggers automatically when upstream dataset is updated
@dag(
    schedule=[EVENTS_DATASET],  # Triggered by dataset update, not cron
    tags=["metrics", "derived"],
)
def metrics_pipeline():
    @task
    def compute_daily_metrics():
        return compute_metrics()

    @task(outlets=[METRICS_DATASET])
    def load_metrics(metrics):
        load_partition(metrics, "daily_metrics")

    metrics = compute_daily_metrics()
    load_metrics(metrics)
```

### SLA Monitoring

```python
from airflow.models import SlaCallback

def sla_miss_callback(dag, task_list, blocking_task_list, slas, blocking_tis):
    """Called when a task misses its SLA."""
    message = (
        f"SLA MISS: DAG={dag.dag_id}, "
        f"Tasks={[t.task_id for t in task_list]}, "
        f"Blocked by={[t.task_id for t in blocking_tis]}"
    )
    send_pagerduty_alert(message, severity="warning")
    log.warning(message)
```

---

## 7. Warehouse Modeling

### Dimensional Model (Star Schema)

```sql
-- Fact table: measures and foreign keys, partitioned by date
CREATE TABLE fct_orders (
    order_id        STRING      NOT NULL,
    order_date      DATE        NOT NULL,
    customer_key    INT64       NOT NULL,
    product_key     INT64       NOT NULL,
    quantity        INT64       NOT NULL,
    unit_price      NUMERIC     NOT NULL,
    total_amount    NUMERIC     NOT NULL,
    discount_amount NUMERIC     DEFAULT 0,
    _loaded_at      TIMESTAMP   NOT NULL,
    _pipeline_run   STRING      NOT NULL
)
PARTITION BY order_date
CLUSTER BY customer_key, product_key;

-- Dimension table: descriptive attributes
CREATE TABLE dim_customers (
    customer_key    INT64       NOT NULL,
    customer_id     STRING      NOT NULL,  -- natural key
    customer_name   STRING,
    email           STRING,
    segment         STRING,
    region          STRING,
    valid_from      TIMESTAMP   NOT NULL,
    valid_to        TIMESTAMP,  -- NULL = current
    is_current      BOOLEAN     NOT NULL,
    _loaded_at      TIMESTAMP   NOT NULL
);
```

### Slowly Changing Dimensions (SCD Type 2)

```sql
-- dbt SCD Type 2 snapshot
{% snapshot dim_customers_snapshot %}
{{
    config(
        target_schema='warehouse',
        unique_key='customer_id',
        strategy='timestamp',
        updated_at='updated_at',
        invalidate_hard_deletes=True,
    )
}}

SELECT
    customer_id,
    customer_name,
    email,
    segment,
    region,
    updated_at
FROM {{ source('crm', 'customers') }}

{% endsnapshot %}
```

### Materialized Views for Performance

```sql
-- BigQuery materialized view with auto-refresh
CREATE MATERIALIZED VIEW mv_daily_revenue
PARTITION BY order_date
CLUSTER BY region
AS
SELECT
    order_date,
    c.region,
    c.segment,
    COUNT(DISTINCT o.order_id) AS order_count,
    SUM(o.total_amount) AS total_revenue,
    AVG(o.total_amount) AS avg_order_value,
    COUNT(DISTINCT o.customer_key) AS unique_customers
FROM fct_orders o
JOIN dim_customers c ON o.customer_key = c.customer_key AND c.is_current
GROUP BY order_date, c.region, c.segment;
```

---

## 8. Backfill Patterns

### Incremental Backfill with Dependency Cascade

```python
def backfill_with_dependencies(
    dag_id,
    start_date,
    end_date,
    include_downstream=True,
    max_parallel=4,
):
    """Backfill a date range with optional downstream retriggering."""
    dates = pd.date_range(start_date, end_date, freq='D')

    for batch in chunked(dates, max_parallel):
        # Process batch in parallel
        futures = []
        for partition_date in batch:
            future = trigger_dag_run(
                dag_id=dag_id,
                execution_date=partition_date,
                conf={"is_backfill": True},
            )
            futures.append(future)

        # Wait for batch to complete
        for future in futures:
            result = future.result(timeout=3600)
            if not result.success:
                raise BackfillError(
                    f"Backfill failed for {result.execution_date}: {result.error}"
                )

    if include_downstream:
        # Trigger downstream DAGs for the backfilled range
        downstream_dags = get_downstream_dependencies(dag_id)
        for downstream_dag in downstream_dags:
            backfill_with_dependencies(
                downstream_dag,
                start_date,
                end_date,
                include_downstream=True,
                max_parallel=max_parallel,
            )
```

### Post-Backfill Validation

```python
def validate_backfill(table, start_date, end_date):
    """Validate that a backfill produced consistent results."""
    checks = {
        "no_date_gaps": check_no_date_gaps(table, start_date, end_date),
        "row_counts_stable": check_row_count_stability(table, start_date, end_date),
        "no_duplicates": check_no_duplicates(table, start_date, end_date),
        "aggregates_match": check_aggregate_consistency(table, start_date, end_date),
    }

    failures = {k: v for k, v in checks.items() if not v.passed}
    if failures:
        raise BackfillValidationError(
            f"Backfill validation failed: {failures}"
        )
```

---

## 9. Anti-Patterns Table

| Anti-Pattern | Symptom | Root Cause | Fix |
|-------------|---------|------------|-----|
| Non-idempotent writes | Duplicates after retry | INSERT without dedup key | MERGE/upsert or partition overwrite |
| No schema validation | Pipeline crashes on source change | Blind data ingestion | Schema validation on ingest |
| Missing quality gates | Silent data corruption | No validation between stages | Great Expectations / dbt tests |
| Unbounded backfill | Backfill exceeds SLA window | Full-table reprocessing | Partition-bounded incremental |
| No dedup strategy | Duplicate row accumulation | Append-only without unique key | Dedup on ingest or MERGE |
| Wrong join type | Silent row loss or explosion | INNER JOIN dropping nulls | Explicit join validation |
| Hardcoded paths | Pipeline breaks on date edge cases | String-formatted dates | Parameterized date objects |
| No dead letter queue | One bad record crashes batch | No error isolation | DLQ with failure rate threshold |
| No freshness monitoring | Stale data served silently | No staleness check | Freshness SLA with alerting |
| Cartesian join | Row count explosion | Missing/wrong join key | Pre/post join row count validation |
| Null propagation | Distorted aggregations | No null handling policy | Null rate checks, explicit handling |
| No run tracking | Cannot trace data provenance | Missing pipeline metadata | Run ID, timestamp per row |
| Retry storms | Amplified transient failures | Immediate retry, no backoff | Exponential backoff, failure classification |
| Monolithic DAG | Cascade failures, slow debugging | 200+ tasks in one DAG | Modular DAGs, dataset triggers |
| Full-table scans | Slow queries, high cost | No partitioning or clustering | Partition by date, cluster by filter keys |

---

## 10. Reference Implementation: Idempotent Pipeline with Quality Gates

A complete, production-ready pipeline template combining all patterns:

```python
"""
Reference implementation: Idempotent Airflow DAG with quality gates,
schema validation, deduplication, and freshness monitoring.
"""

from airflow.decorators import dag, task
from airflow.datasets import Dataset
from datetime import datetime, timedelta
import pandera as pa
import pandas as pd
import uuid

EVENTS_DATASET = Dataset("warehouse://events")

# Schema contract
event_schema = pa.DataFrameSchema({
    "event_id": pa.Column(str, nullable=False, unique=True),
    "event_timestamp": pa.Column("datetime64[ns]", nullable=False),
    "user_id": pa.Column(str, nullable=False),
    "event_type": pa.Column(str, pa.Check.isin(
        ["click", "view", "purchase", "signup"]
    )),
    "value": pa.Column(float, pa.Check.ge(0), nullable=True),
})


default_args = {
    "retries": 3,
    "retry_delay": timedelta(minutes=5),
    "retry_exponential_backoff": True,
    "max_retry_delay": timedelta(minutes=30),
    "execution_timeout": timedelta(hours=1),
    "sla": timedelta(hours=3),
}


@dag(
    schedule="@daily",
    start_date=datetime(2024, 1, 1),
    catchup=False,
    default_args=default_args,
    tags=["events", "critical", "idempotent"],
)
def events_pipeline():

    @task
    def extract(execution_date=None):
        """Extract events for a single date partition."""
        partition_date = execution_date.strftime('%Y-%m-%d')
        df = read_source_partition(partition_date)
        if df.empty:
            raise ValueError(f"No source data for {partition_date}")
        return df

    @task
    def validate_schema(df):
        """Gate 1: Schema validation on ingested data."""
        try:
            event_schema.validate(df, lazy=True)
        except pa.errors.SchemaErrors as e:
            quarantine_bad_records(df, e.failure_cases)
            raise
        return df

    @task
    def deduplicate(df):
        """Remove duplicate events based on event_id."""
        pre_count = len(df)
        df = df.drop_duplicates(subset=['event_id'], keep='last')
        post_count = len(df)
        if pre_count != post_count:
            log.info(f"Dedup removed {pre_count - post_count} duplicates")
        return df

    @task
    def transform(df):
        """Apply business logic transformations."""
        df['event_hour'] = df['event_timestamp'].dt.hour
        df['event_date'] = df['event_timestamp'].dt.date
        df['is_conversion'] = df['event_type'].isin(['purchase', 'signup'])
        return df

    @task
    def validate_output(df, execution_date=None):
        """Gate 2: Quality checks on transformed data."""
        partition_date = execution_date.strftime('%Y-%m-%d')
        assert len(df) > 0, "Empty output after transformation"
        assert df['event_id'].is_unique, "Duplicate event_ids in output"

        null_rate = df['value'].isna().mean()
        assert null_rate < 0.1, f"Value null rate {null_rate:.1%} exceeds 10%"

        return df

    @task(outlets=[EVENTS_DATASET])
    def load(df, execution_date=None):
        """Idempotent load with partition overwrite and run tracking."""
        partition_date = execution_date.strftime('%Y-%m-%d')
        run_id = str(uuid.uuid4())

        df['_pipeline_run_id'] = run_id
        df['_loaded_at'] = datetime.utcnow()

        # Atomic partition overwrite
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM events WHERE event_date = :pd"),
                {"pd": partition_date}
            )
            df.to_sql('events', conn, if_exists='append', index=False)

        log_pipeline_run(run_id, 'events', partition_date, len(df))

    @task
    def check_freshness():
        """Gate 3: Post-load freshness verification."""
        check_table_freshness('events', max_staleness_hours=6)

    # Pipeline flow
    raw = extract()
    validated = validate_schema(raw)
    deduped = deduplicate(validated)
    transformed = transform(deduped)
    checked = validate_output(transformed)
    load(checked)
    check_freshness()

events_pipeline()
```
