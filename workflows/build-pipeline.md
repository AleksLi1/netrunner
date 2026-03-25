# Workflow: Build Pipeline

<purpose>
End-to-end data pipeline construction from architecture design to production monitoring.
6 mandatory phases in strict order. Each phase has a quality gate that must pass before proceeding.
This workflow ensures pipeline reliability, data quality, and operational readiness from day one.
</purpose>

<inputs>
- Pipeline requirements from user (via run.md BUILD_PIPELINE classification)
- `.planning/CONTEXT.md` — project context, constraints, prior work
- Data sources, destinations, freshness requirements, volume estimates
</inputs>

<prerequisites>
- Data engineering persona must be active (2+ detection signals in CONTEXT.md)
- References loaded: data-engineering-reasoning.md, data-engineering-code-patterns.md, data-engineering-pipelines.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "ARCHITECTURE",    # Phase 1: Architecture & design decisions
    "INGESTION",       # Phase 2: Data ingestion with schema validation
    "TRANSFORMATION",  # Phase 3: Transformation layer with quality checks
    "QUALITY",         # Phase 4: Quality framework (freshness, completeness, accuracy)
    "ORCHESTRATION",   # Phase 5: Orchestration & scheduling
    "OPERATIONS",      # Phase 6: Monitoring & operational readiness
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from QUALITY back to TRANSFORMATION).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL violations remain unresolved from prior gates

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

## Phase 1: ARCHITECTURE & DESIGN

**Goal:** Establish the pipeline architecture, define data flow, and document SLAs before writing any code.

### 1.1 Requirements Gathering

Confirm these with the user before proceeding:

- **Data sources:** What systems produce the data? What format? What volume?
- **Data destinations:** Where does the data need to land? Who consumes it?
- **Freshness requirement:** How stale can the data be before it is useless?
- **Volume and velocity:** How many rows/events per hour/day? Is it growing?
- **Quality expectations:** What happens if data is wrong? Who notices? What is the blast radius?

If the user cannot articulate the freshness requirement, ask: "If this pipeline stops running for 24 hours, who notices and what breaks?"

### 1.2 Architecture Decision

Choose the pipeline architecture based on requirements:

| Requirement | Architecture | Rationale |
|-------------|-------------|-----------|
| Freshness > 1 hour acceptable | Batch (ELT) | Simplest, cheapest, most debuggable |
| Freshness 1-15 minutes | Micro-batch | Batch semantics with tighter windows |
| Freshness < 1 minute | Streaming | Required for true real-time, highest complexity |
| Need both historical accuracy + real-time | Lambda (batch + stream) | Only if team can maintain two codepaths |

**Default recommendation:** Start with batch ELT. Raw data lands first, transformations happen in the warehouse. Only introduce streaming if sub-minute latency is genuinely required by the business.

### 1.3 Data Flow Diagram

Document the data flow:

```markdown
## Data Flow
Source: [source system] → Extract: [method] → Raw Storage: [location]
  → Transform: [engine] → Target: [warehouse/table]
  → Consumers: [dashboards/models/APIs]

Partition strategy: [date/hour/custom]
Idempotency pattern: [partition overwrite/MERGE/checkpoint]
Deduplication key: [natural key or synthetic]
```

### 1.4 SLA Definition

Define SLAs for every output table:

```markdown
## SLAs
| Table | Freshness | Completeness | Accuracy | Monitoring Cadence |
|-------|-----------|-------------|----------|-------------------|
| [table] | [hours] | [min rows/day] | [validation rules] | [minutes] |
```

### 1.5 Outputs

- `.planning/pipeline/ARCHITECTURE.md` — architecture decisions with rationale
- `.planning/pipeline/DATA_FLOW.md` — source-to-target data flow diagram
- `.planning/pipeline/SLAS.md` — SLA definitions per output table

### Gate: ARCHITECTURE REVIEW

Before proceeding, verify:
- [ ] Data sources identified with volume estimates
- [ ] Architecture pattern chosen with explicit rationale
- [ ] Partition strategy defined
- [ ] Idempotency pattern chosen
- [ ] Deduplication key identified for each entity
- [ ] SLAs defined for every output table
- [ ] Freshness requirement confirmed with business stakeholder (or user)

Score: 7 checks. PASS requires all 7. Any failure → revise architecture.

---

## Phase 2: DATA INGESTION

**Goal:** Build reliable data extraction with schema validation and error isolation.

### 2.1 Source Connection

For each data source:
- Implement connection with retry logic and timeout
- Handle authentication (API keys, OAuth, service accounts)
- Implement rate limiting for API sources
- Handle pagination for large datasets

### 2.2 Schema Validation

Every ingestion path MUST validate schema on arrival:

```python
# Reference: data-engineering-code-patterns.md Pattern 2
import pandera as pa

source_schema = pa.DataFrameSchema({
    # Define expected columns, types, constraints
    # This is the first line of defense against schema drift
})

def ingest(source_path):
    df = read_source(source_path)
    source_schema.validate(df, lazy=True)  # Catch ALL violations
    return df
```

### 2.3 Dead Letter Queue

Bad records must be quarantined, not dropped or crashing:

```python
# Reference: data-engineering-code-patterns.md Pattern 8
# Good records flow through, bad records go to DLQ
# Failure rate threshold catches systemic issues (e.g., schema change)
```

### 2.4 Idempotent Write

Implement the idempotency pattern chosen in Phase 1:

```python
# Reference: data-engineering-code-patterns.md Pattern 1
# Partition overwrite OR MERGE/upsert — never bare INSERT
```

### 2.5 Outputs

- Ingestion module with schema validation
- Dead letter queue implementation
- Source connection with retry logic
- Raw data landing zone with partition structure

### Gate: INGESTION RELIABILITY

Before proceeding, verify:
- [ ] Schema validation passes for sample data from each source
- [ ] Pipeline can be run twice for the same partition without duplicates (idempotency test)
- [ ] Bad records are quarantined to DLQ (not dropped, not crashing)
- [ ] Source connection handles timeouts and retries
- [ ] Partition structure matches architecture design
- [ ] Raw data is preserved (for ELT: land raw before transforming)

Score: 6 checks. PASS requires all 6.

---

## Phase 3: TRANSFORMATION LAYER

**Goal:** Build transformation logic with data quality checks between every stage.

### 3.1 Transformation Design

Follow these principles:
- Each transformation is a pure function: same input always produces same output
- Transformations are independently testable with unit tests
- Complex logic is broken into named, documented steps
- All joins are validated (row count before and after)

### 3.2 Join Validation

Every join MUST have row count validation:

```python
# Reference: data-engineering-code-patterns.md Pattern 6
# Validate: no unintended row drops (INNER JOIN) or explosions (Cartesian)
```

### 3.3 Null Handling

Explicit null policy for every column used in aggregations:

```python
# Reference: data-engineering-code-patterns.md Pattern 11
# Check null rates, handle explicitly, never let nulls silently distort aggregates
```

### 3.4 Intermediate Quality Gates

Quality checks between transformation stages:

```python
# Reference: data-engineering-code-patterns.md Pattern 3
# Gate after extraction, gate after transformation, gate before load
```

### 3.5 Outputs

- Transformation module with pure, testable functions
- Unit tests for each transformation step
- Join validation wrappers
- Null handling policy documentation

### Gate: TRANSFORMATION CORRECTNESS

Before proceeding, verify:
- [ ] All transformations are pure functions with unit tests
- [ ] All joins have row count validation (pre vs post)
- [ ] Null handling is explicit for every aggregation column
- [ ] Quality gates exist between stages (not just at the end)
- [ ] Transformation logic matches business requirements (review with user)

Score: 5 checks. PASS requires all 5.

---

## Phase 4: QUALITY FRAMEWORK

**Goal:** Implement comprehensive data quality monitoring covering all 5 layers.

### 4.1 Quality Layer Implementation

Reference: `data-engineering-pipelines.md` Section 3

Implement all 5 quality layers:
1. **Schema validation** (already done in Phase 2)
2. **Row-level constraints** — ranges, formats, uniqueness
3. **Dataset-level assertions** — row counts, null rates, distributions
4. **Cross-dataset consistency** — FK resolution, aggregate reconciliation
5. **Freshness and completeness** — staleness checks, date gap detection

### 4.2 Great Expectations / dbt Tests

Choose validation framework and implement:

```python
# For Python pipelines: Great Expectations or pandera
# For dbt pipelines: dbt tests in schema.yml
# For Spark pipelines: Custom validation with quality report
```

### 4.3 Data Contracts

Define data contracts for each output table:

```yaml
# Reference: data-engineering-pipelines.md Section 3 (Data Contracts)
# Contract includes: schema, quality expectations, freshness SLA, breaking change policy
```

### 4.4 Anomaly Detection

Implement statistical anomaly detection for key metrics:

```python
# Reference: data-engineering-pipelines.md Section 3 (Anomaly Detection)
# Rolling mean + std, flag deviations beyond threshold
```

### 4.5 Outputs

- Quality check suite (all 5 layers)
- Data contracts for output tables
- Anomaly detection for key metrics
- Quality dashboard or report

### Gate: QUALITY COVERAGE

Before proceeding, verify:
- [ ] All 5 quality layers implemented (schema, row, dataset, cross-dataset, freshness)
- [ ] Every output table has quality checks
- [ ] Data contracts defined for consumer-facing tables
- [ ] Anomaly detection active for key metrics (row counts, null rates)
- [ ] Quality failure triggers alerting (not silent logging)
- [ ] DLQ failure rate threshold configured

Score: 6 checks. PASS requires 5/6 (anomaly detection can be deferred for v1).

---

## Phase 5: ORCHESTRATION & SCHEDULING

**Goal:** Build the DAG with proper dependencies, retry policies, and SLA monitoring.

### 5.1 DAG Design

Follow Airflow DAG design principles from `data-engineering-pipelines.md` Section 6:

- Shallow dependency chains (minimize critical path length)
- Each task is independently retriable
- Modular DAGs with clear boundaries (one DAG per data domain)
- Dataset-triggered downstream DAGs (Airflow 2.4+)

### 5.2 Retry Policy

Implement differentiated retry strategy:

```python
# Reference: data-engineering-code-patterns.md Pattern 13
# Transient errors: exponential backoff, multiple retries
# Permanent errors: fail fast, alert, no retry
```

### 5.3 Dependency Management

For downstream pipelines:
- Use dataset triggers (Airflow 2.4+) over cron-based scheduling
- Document the dependency graph
- Ensure backfill of upstream triggers backfill of downstream

### 5.4 Backfill Strategy

Implement bounded backfill capability:

```python
# Reference: data-engineering-code-patterns.md Pattern 4
# Partition-bounded, parallel where possible, with post-backfill validation
```

### 5.5 Outputs

- Airflow DAG (or equivalent orchestrator configuration)
- Retry policy with failure classification
- Dependency documentation
- Backfill procedure and validation

### Gate: ORCHESTRATION REVIEW

Before proceeding, verify:
- [ ] DAG dependency graph is documented and reviewed
- [ ] Retry policy differentiates transient vs permanent failures
- [ ] Exponential backoff configured (not immediate retry)
- [ ] SLA monitoring configured for critical tasks
- [ ] Backfill works correctly for a single partition (test with re-run)
- [ ] No circular dependencies in DAG

Score: 6 checks. PASS requires all 6.

---

## Phase 6: MONITORING & OPERATIONS

**Goal:** Ensure the pipeline is observable, alertable, and operable in production.

### 6.1 Freshness Monitoring

Implement per-table freshness checks:

```python
# Reference: data-engineering-code-patterns.md Pattern 9
# Check staleness after every load, alert if SLA breached
```

### 6.2 Pipeline Metrics

Instrument the following metrics:
- Task duration (per task, per DAG)
- Row counts (per stage: extracted, transformed, loaded)
- Data freshness (per output table)
- Quality check pass/fail rates
- DLQ volume (records quarantined per run)
- Error rates (by error type: transient vs permanent)

### 6.3 Alerting Configuration

| Alert | Condition | Severity | Channel |
|-------|-----------|----------|---------|
| Pipeline failure | Task fails after all retries | HIGH | PagerDuty / on-call |
| SLA breach | Data fresher than SLA threshold | HIGH | Slack + PagerDuty |
| Quality degradation | Quality check failure rate > threshold | MEDIUM | Slack |
| DLQ spike | DLQ records > 5% of batch | HIGH | Slack + PagerDuty |
| Anomaly detected | Metric deviates > 3 sigma | MEDIUM | Slack |
| Backfill needed | Date gaps detected in output | MEDIUM | Slack |

### 6.4 Runbook

Create an operational runbook:

```markdown
## Runbook: [Pipeline Name]

### Common Failures
1. **Source API timeout** → Transient, auto-retries with backoff. If persistent (>1hr), check source status page.
2. **Schema validation failure** → Permanent, check source for schema change. Update schema contract if intentional.
3. **Row count anomaly** → Check source for outage or bulk load. Verify with source team.
4. **Duplicate detection** → Check for concurrent pipeline runs. Verify idempotency key.

### Backfill Procedure
1. Identify affected date range
2. Run: `airflow dags backfill [dag_id] -s [start] -e [end]`
3. Validate: run post-backfill checks
4. Verify downstream tables updated

### Escalation
- L1: On-call data engineer (auto-paged for HIGH severity)
- L2: Data platform team lead
- L3: Source system owner (for upstream issues)
```

### 6.5 Outputs

- Monitoring dashboard (Grafana/Datadog/CloudWatch)
- Alerting configuration
- Operational runbook
- On-call procedure documentation

### Gate: OPERATIONAL READINESS

This is the final gate before production deployment.

Verify:
- [ ] Freshness monitoring active for all output tables
- [ ] Pipeline metrics instrumented (duration, row counts, quality rates)
- [ ] Alerting configured for failure, SLA breach, and quality degradation
- [ ] Runbook exists with common failures, backfill procedure, and escalation path
- [ ] Pipeline has been run successfully for at least 3 consecutive days (or equivalent test)
- [ ] On-call engineer can independently diagnose and resolve common failures using the runbook

Score: 6 checks. PASS requires 5/6 (3-day run can be replaced by comprehensive integration test).

Present to user:

```
═══════════════════════════════════════════════════════
  PIPELINE BUILD COMPLETE — REVIEW
═══════════════════════════════════════════════════════

Pipeline: [name]
Architecture: [batch/streaming/micro-batch]
Sources: [source list]
Destinations: [destination list]
Freshness SLA: [hours]

Phase Results:
  1. Architecture:     [PASS]
  2. Ingestion:        [PASS] (schema validated, idempotent)
  3. Transformation:   [PASS] (quality gates, join validation)
  4. Quality:          [PASS] (5 layers, contracts defined)
  5. Orchestration:    [PASS] (backoff retries, SLA monitoring)
  6. Operations:       [PASS] (monitoring, alerting, runbook)

═══════════════════════════════════════════════════════
```

</procedure>

<gate_failure_protocol>

## Gate Failure Protocol

When any gate fails:

### Step 1: Log Failure
Write to CONTEXT.md:
```
| Phase [N] gate failed | [N] checks failed out of [M] | [list of failed checks] | [date] |
```

### Step 2: Extract Remediation Tasks
Parse the gate report for failures and create a task list:
```markdown
## Remediation Tasks (Phase [N] Gate Failure)
- [ ] [failed check description] — [specific fix needed]
```

### Step 3: Execute Fixes

```
Task(
  subagent_type="nr-executor",
  description="Fix gate failures for Phase [N]",
  prompt="Fix the following gate failures for the [pipeline name] pipeline:

  [failure list from gate report]

  Reference: data-engineering-code-patterns.md for correct patterns.
  Fix each failure. Do not introduce new failures."
)
```

### Step 4: Re-Check Gate
Re-run the same gate checks. Compare results.

### Step 5: Retry Limit
Maximum 3 gate retries per phase. After 3 failures:
- HALT the workflow
- Write to CONTEXT.md: "Phase [N] gate failed 3 times — requires user intervention"
- Present failure summary to user with specific unresolved issues
- Ask: "How would you like to proceed?"

</gate_failure_protocol>

<artifacts>

## Artifacts Per Phase

| Phase | Key Artifacts | Gate |
|-------|--------------|------|
| 1. Architecture | ARCHITECTURE.md, DATA_FLOW.md, SLAS.md | Architecture review (7 checks) |
| 2. Ingestion | Ingestion module, schema validation, DLQ | Ingestion reliability (6 checks) |
| 3. Transformation | Transform module, unit tests, join validation | Transformation correctness (5 checks) |
| 4. Quality | Quality suite (5 layers), data contracts, anomaly detection | Quality coverage (6 checks) |
| 5. Orchestration | DAG, retry policy, backfill procedure | Orchestration review (6 checks) |
| 6. Operations | Monitoring, alerting, runbook | Operational readiness (6 checks) |

</artifacts>
