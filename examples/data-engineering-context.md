# Netrunner Context — EventStream Pipeline

## Project Goal
Build a real-time event processing pipeline ingesting clickstream events from Kafka, transforming with Spark Structured Streaming, and loading to Snowflake for analytics dashboards. Target: <5 minute end-to-end latency with exactly-once semantics and 99.5% SLA uptime.

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| End-to-end latency | 12 minutes | <5 minutes |
| Duplicate rate | 0.3% | 0% |
| Schema validation coverage | 40% | 100% |
| Quality check layers | 2/5 | 5/5 |
| Freshness SLA compliance | 87% | 99.5% |
| Backfill time (1 day) | 4 hours | <30 minutes |

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| Exactly-once semantics | Revenue attribution depends on unique events | Double-counted revenue, finance audit failure |
| Backward-compatible schema changes only | 6 downstream consumers depend on event schema | Dashboard breakage, ML pipeline failures |
| <5 min freshness SLA for fct_events | Executive dashboard refreshes every 5 minutes | CEO sees stale data, trust erosion |
| Snowflake as warehouse | Company standard, analytics team trained on it | Migration cost, team retraining |
| GDPR: PII scrubbed before warehouse | Legal requirement for EU users | Regulatory fine, data breach liability |

## Diagnostic State
**Active hypothesis:** Duplicate rate is caused by Kafka consumer rebalancing during Spark checkpoint recovery. When a Spark executor fails and restarts, it replays from the last checkpoint but Kafka offsets have already advanced, creating a window where events are processed twice without deduplication.
**Evidence for:** Duplicate spikes correlate with Spark executor restarts in CloudWatch logs. Duplicates share the same event_id but different _pipeline_run_id values.
**Evidence against:** Some duplicates occur outside restart windows — may also have an upstream producer issue.
**Confidence:** Medium — need to implement MERGE with event_id dedup key to verify
**Open questions:** Is the upstream Kafka producer also producing duplicates (at-least-once delivery)? Should we dedup at ingest or at warehouse load?

## What Has Been Tried
| Approach | Outcome | Confidence | Failure Mode | Phase | Date |
|----------|---------|------------|--------------|-------|------|
| Spark checkpoint interval 30s→10s | Reduced duplicate window but increased write amplification | High | Excessive small files in S3 | Phase 2 | 2024-03-10 |
| Kafka idempotent producer | Reduced producer-side dupes by 60% | High | N/A — partial success | Phase 2 | 2024-03-12 |
| Snowflake MERGE on event_id | Eliminated warehouse-level dupes but added 3 min latency | Medium | Latency regression | Phase 3 | 2024-03-15 |
| Micro-batch window 5min→2min | Reduced latency to 8 min but increased Spark overhead | Medium | Resource cost increase | Phase 2 | 2024-03-18 |

## Domain Knowledge
- Kafka cluster: 3 brokers, 12 partitions on events topic, 7-day retention
- Spark Structured Streaming on EMR with S3 checkpointing
- Snowflake Enterprise edition with auto-clustering on fct_events
- dbt for downstream transformations (6 models depend on fct_events)
- Great Expectations for quality checks (schema + row-level implemented, dataset-level pending)
- Airflow 2.6 for batch orchestration of dbt models and quality checks

## Pipeline Architecture
- **Pattern:** Streaming (Kafka → Spark) + batch (dbt in Snowflake)
- **Orchestrator:** Airflow 2.6 (for batch dbt runs and quality checks)
- **Processing engine:** Spark Structured Streaming (ingest) + dbt (transformations)
- **Message broker:** Kafka (MSK, 3 brokers, 12 partitions)
- **Storage layer:** S3 (raw landing, Spark checkpoints)
- **Table format:** Parquet (S3 landing) → Snowflake native (warehouse)
- **Warehouse:** Snowflake Enterprise

## Quality Framework
- **Validation tool:** Great Expectations + dbt tests
- **Quality layers implemented:** Schema validation (ingest), row-level constraints (ingest) — 2/5
- **Data contracts:** Informal — no schema registry yet
- **Dead letter queue:** Yes — S3 path with quarantined records
- **Freshness SLA:** fct_events <5min, dim tables <1hr, aggregate tables <2hr

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|
| Phase 1 | Streaming over batch for ingest | Executive dashboard requires <5min freshness | Correct — batch cannot meet SLA |
| Phase 2 | S3 as intermediate landing zone | Decouple Spark from Snowflake, enable replay | Correct — saved us during Snowflake outage |
| Phase 3 | MERGE for dedup instead of pre-ingest dedup | Simpler, warehouse handles idempotency | Pending — latency trade-off under evaluation |

## Update Log
| Date | Phase | Change |
|------|-------|--------|
| 2024-03-08 | Phase 1 | Architecture finalized: Kafka → Spark → S3 → Snowflake |
| 2024-03-12 | Phase 2 | Kafka idempotent producer enabled, 60% dupe reduction |
| 2024-03-15 | Phase 3 | Snowflake MERGE implemented but added 3min latency |
| 2024-03-18 | Phase 2 | Micro-batch window reduced to 2min, latency now 8min |
