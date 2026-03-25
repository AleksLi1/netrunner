# Example: /nr Interaction on a Data Engineering Project

<!--
  This example demonstrates how Netrunner's data engineering persona activates and reasons
  when a user invokes /nr on a pipeline project. It shows:
  - Data engineering persona activation from context signals
  - Idempotency-first reasoning about duplicate records
  - Pipeline reliability focus in avenue generation
  - Expert-level diagnostic hypothesis
  - Pre-generation gate enforcement (never suggest INSERT without dedup strategy)
-->

## Setup

The user has a `.planning/CONTEXT.md` with pipeline context:
- Event processing pipeline: Kafka → Spark → Snowflake
- Duplicate rate: 0.3% after retries
- 4 tried approaches in "What Has Been Tried"
- Active hypothesis: "Duplicates caused by Kafka consumer rebalancing during Spark checkpoint recovery"

## User Query

```
/nr "We keep getting duplicate events in Snowflake after Spark executor restarts. We tried reducing the checkpoint interval and enabling idempotent producer but still have 0.3% dupe rate. Should I add another dedup step in the Spark job?"
```

## Netrunner Response

### Step 0 — Context loaded, data engineering persona activated

Context signals detected: Kafka, Spark, Snowflake, pipeline, checkpoint, dedup, exactly-once, event processing → **Data engineering persona active.**

*Loaded references/data-engineering-reasoning.md — applying "Idempotency Design" reasoning trigger.*

### Step 1 — Classification

**Shape:** FIX:DEBUGGING
**Subtype:** PIPELINE_RELIABILITY (idempotency failure — duplicates after retries)
**Domain:** Data Engineering

### Step 2 — Diagnostic questions

[Inferred from context — /nr --ask to force questions]

Context has 4 tried entries, 5 constraints, active hypothesis → **MODERATE context, asking 1 question.**

> What is the deduplication key? Is `event_id` guaranteed unique from the producer, or could the producer itself emit duplicate `event_id` values?

[User responds: "event_id is a UUID generated client-side, should be unique"]

### Step 3 — Diagnosis and response

```
QUERY (reframed): User has 0.3% duplicate events in Snowflake after Spark executor
  restarts. Idempotent producer reduced dupes 60% but residual dupes remain.
  Question: should they add dedup in Spark?

METRICS IN SCOPE: duplicate rate (0.3%), end-to-end latency (12min, target <5min)
CONSTRAINTS ACTIVE: Exactly-once semantics | <5min freshness SLA | Snowflake as warehouse
CLOSED PATHS: Checkpoint interval reduction (write amplification), micro-batch
  window reduction (cost increase)
```

### AVENUE 1 — Dedup at warehouse load, not in Spark

**Hypothesis:** Adding dedup in Spark adds complexity in the wrong layer. The
warehouse already supports MERGE with event_id — the issue is that the current
MERGE adds 3min latency. Optimize the MERGE, do not add a second dedup layer.

**Mechanism:** Spark is a processing engine, not a state store. Dedup in Spark
requires maintaining a state of seen event_ids across micro-batches, which grows
unboundedly and complicates checkpoint recovery — the exact failure mode you are
debugging. The warehouse is the right place for dedup because it has the full
history of event_ids and MERGE is atomic.

**Action:**
```sql
-- Optimize the Snowflake MERGE: cluster target table by event_id
-- and limit the MERGE window to recent partitions only
MERGE INTO fct_events t
USING staging_events s
ON t.event_id = s.event_id
  AND t.event_date >= DATEADD(day, -3, CURRENT_DATE)  -- bound the scan
WHEN NOT MATCHED THEN
  INSERT (event_id, event_timestamp, user_id, event_type, value, _loaded_at)
  VALUES (s.event_id, s.event_timestamp, s.user_id, s.event_type, s.value, CURRENT_TIMESTAMP);
```

**Expected outcome:** MERGE latency drops from 3min to <30s by bounding the scan
window. Duplicate rate goes to 0% at warehouse level. No Spark code changes needed.

**Risk:** If duplicates arrive more than 3 days apart (unlikely for streaming),
the bounded MERGE window would miss them. Add a weekly full-dedup job as insurance.

### AVENUE 2 — Fix the root cause: Spark-Kafka offset management

**Hypothesis:** The checkpoint recovery issue is caused by Spark replaying from
the last checkpoint while Kafka consumer group offsets have advanced. This creates
a window where events are processed by both the recovering executor and the new one.

**Mechanism:** Spark Structured Streaming manages its own offsets in the checkpoint
directory, separate from Kafka consumer group offsets. During executor restart,
Spark replays from the checkpoint offset, but if another executor has already
consumed those same partitions (due to rebalancing), the events are processed twice.

**Action:**
```python
# Disable Kafka consumer group offset management — let Spark own offsets entirely
spark.readStream \
    .format("kafka") \
    .option("kafka.group.id", "spark-events-consumer") \
    .option("startingOffsets", "earliest") \
    .option("failOnDataLoss", "false") \
    .option("kafka.enable.auto.commit", "false") \
    .load()

# Ensure exactly one Spark job reads from the topic — no competing consumers
# Use Spark's internal offset tracking only (checkpoint directory)
```

**Expected outcome:** Eliminates the rebalancing window that causes duplicate
processing. Combined with warehouse MERGE, achieves true exactly-once end-to-end.

### AVENUE 3 — Add pre-load dedup in staging table

**Hypothesis:** If MERGE optimization is insufficient, add a lightweight dedup
step using a staging table pattern — write to staging first, dedup there, then
INSERT from staging to final table.

**Action:**
```sql
-- Stage: write all events (including potential dupes)
INSERT INTO staging_events SELECT * FROM incoming_batch;

-- Dedup: keep only latest version per event_id
INSERT INTO fct_events
SELECT * FROM (
    SELECT *,
        ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY _loaded_at DESC) AS rn
    FROM staging_events
    WHERE event_date >= DATEADD(day, -1, CURRENT_DATE)
) WHERE rn = 1
AND event_id NOT IN (SELECT event_id FROM fct_events WHERE event_date >= DATEADD(day, -3, CURRENT_DATE));

-- Cleanup staging
TRUNCATE TABLE staging_events;
```

**Expected outcome:** Zero duplicates in fct_events. Staging table absorbs all
dupes and the ROW_NUMBER pattern picks the canonical record. Latency impact
depends on staging table size but should be <1min for a single day's data.

```
RECOMMENDED PATH: Avenue 1 first (optimize MERGE — lowest risk, highest impact),
then Avenue 2 (fix root cause — prevents dupes at source). Avenue 3 only if
MERGE optimization is insufficient.

DO NOT add dedup in Spark — it adds unbounded state management complexity in
the exact layer that is causing the current failure. Push dedup to the warehouse
where it belongs.
```

---

*Note: This response demonstrates the data engineering persona in action:*
- *Idempotency-first thinking — every solution is evaluated through "is this safe to retry?"*
- *Layer-appropriate reasoning — dedup belongs in the warehouse, not the processing engine*
- *Root cause focus — Avenue 2 fixes why dupes happen, not just how to filter them*
- *Pre-generation gate — refuses to suggest adding Spark-level dedup because it adds complexity in the wrong layer*
- *Operational awareness — bounded MERGE window, staging table cleanup, weekly full-dedup as insurance*
