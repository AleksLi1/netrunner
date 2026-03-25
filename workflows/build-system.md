# Workflow: Build System

<purpose>
End-to-end systems/infrastructure project building from architecture to production readiness.
6 mandatory phases in strict order. Each phase has a gate that must pass before proceeding.
This is the gold standard workflow for infrastructure — no shortcuts, no skipped phases.
</purpose>

<inputs>
- System requirements from user (via run.md BUILD_SYSTEM classification)
- `.planning/CONTEXT.md` — project context, constraints, SLOs, existing infrastructure
- Cloud provider, orchestration platform, scale requirements
</inputs>

<prerequisites>
- Systems/Infra domain detected in CONTEXT.md
- References loaded: systems-reasoning.md, systems-reliability.md, systems-code-patterns.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "ARCHITECTURE",     # Phase 1: Architecture design and dependency mapping
    "PROVISIONING",     # Phase 2: Infrastructure provisioning with IaC
    "DEPLOYMENT",       # Phase 3: Deployment pipeline with rollback
    "OBSERVABILITY",    # Phase 4: Observability stack (metrics, logs, traces)
    "RELIABILITY",      # Phase 5: Reliability engineering and chaos testing
    "GO_LIVE"           # Phase 6: Production readiness and human review
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from RELIABILITY back to OBSERVABILITY).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL violations remain unresolved from prior reviews

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

## Phase 1: ARCHITECTURE DESIGN

**Goal:** Define system topology, service boundaries, data flow, and failure domains before writing any infrastructure code.

### 1.1 Requirements Gathering

Before designing anything, answer:
- **What are the SLOs?** Availability target, latency target, throughput target. If not defined, define them now.
- **What is the scale?** Current load, projected growth, peak-to-average ratio.
- **What are the constraints?** Cloud provider, budget, compliance (SOC2/HIPAA/PCI), data residency.
- **What are the dependencies?** External APIs, databases, message queues, third-party services.

### 1.2 Service Decomposition

For each service, document:

```markdown
## Service: [name]
- **Responsibility:** [single sentence — what does it do?]
- **Dependencies:** [upstream services it calls]
- **Dependents:** [downstream services that call it]
- **Data stores:** [databases, caches, queues it owns]
- **Failure mode:** [what happens when this service is down?]
- **Criticality:** [P0: user-facing | P1: business-critical | P2: internal | P3: nice-to-have]
```

### 1.3 Dependency Map

Create a dependency graph with failure annotations:

```
[User] → [CDN] → [Load Balancer]
                      ↓
              [API Gateway] → [Auth Service] (P0 — no auth = no access)
                      ↓
              [Order Service] → [Payment Service] (P0 — circuit breaker, fallback: queue)
                      ↓           ↓
              [Inventory DB]  [Payment Provider] (external — retry with backoff)
                      ↓
              [Notification Service] (P2 — async, can fail silently)
```

For each dependency arrow, document:
- **Protocol:** HTTP/gRPC/message queue/database
- **Timeout:** Max acceptable latency
- **Failure handling:** Circuit breaker / retry / fallback / async
- **Data consistency:** Strong / eventual / best-effort

### 1.4 Failure Domain Analysis

| Failure Scenario | Affected Services | Blast Radius | Mitigation |
|-----------------|-------------------|--------------|------------|
| Single pod crash | One instance of one service | Minimal | Replicas, health checks |
| AZ outage | All instances in one AZ | Moderate | Multi-AZ deployment |
| Database failover | All services using that DB | Major | Read replicas, connection retry |
| External API outage | Services calling that API | Varies | Circuit breaker, fallback |
| DNS failure | All services | Critical | Local DNS cache, fallback IPs |
| Full region outage | Everything | Total | Multi-region (if SLO requires) |

### 1.5 Outputs

- `.planning/system/ARCHITECTURE.md` — service map, dependency graph, failure domains
- `.planning/system/SLO_DOCUMENT.md` — SLOs for each service with SLI definitions
- `.planning/system/DECISIONS.md` — architecture decision records (ADRs)

### Gate: DEPENDENCY MAP REVIEW

```
Task(
  subagent_type="nr-verifier",
  description="Architecture dependency map review",
  prompt="Review the architecture design in .planning/system/ARCHITECTURE.md.

  Load references/systems-reasoning.md for expert reasoning.

  Check:
  1. Every service has documented failure mode and criticality
  2. Every dependency has timeout, retry, and failure handling defined
  3. No single point of failure in critical path (P0/P1 services)
  4. SLOs are defined for all user-facing services
  5. Blast radius is contained — one service failure cannot cascade to total outage

  Scoring:
  - CRITICAL (SPOF in critical path, no failure handling on P0 dependency): -20 points
  - WARNING (missing timeout, undocumented failure mode): -10 points
  - Must score >= 80 to pass

  Write review: .planning/system/ARCHITECTURE_REVIEW.md"
)
```

---

## Phase 2: INFRASTRUCTURE PROVISIONING

**Goal:** Provision all infrastructure using IaC with security, redundancy, and cost controls.

### 2.1 IaC Structure

Organize infrastructure code by layer:

```
infrastructure/
├── modules/               # Reusable Terraform modules
│   ├── networking/        # VPC, subnets, security groups
│   ├── compute/           # ECS/EKS/EC2 definitions
│   ├── database/          # RDS/DynamoDB with replicas
│   ├── monitoring/        # CloudWatch/Prometheus setup
│   └── security/          # IAM roles, KMS keys, secrets
├── environments/
│   ├── dev/               # Dev environment config
│   ├── staging/           # Staging — production-like
│   └── production/        # Production config
├── backend.tf             # State management (S3 + DynamoDB lock)
└── versions.tf            # Provider version pinning
```

### 2.2 Security Baseline

Every provisioned resource must satisfy:

```hcl
# REQUIRED: Encryption at rest for all storage
resource "aws_rds_cluster" "main" {
  storage_encrypted = true
  kms_key_id        = aws_kms_key.database.arn
  deletion_protection = true  # Prevent accidental deletion
}

# REQUIRED: Least-privilege IAM
resource "aws_iam_role" "api_service" {
  # Only the permissions this service actually needs
  # Never use *, never use admin policies
}

# REQUIRED: Network segmentation
resource "aws_security_group" "api" {
  # Only allow traffic from load balancer on port 8080
  # Deny all other inbound traffic
  ingress {
    from_port       = 8080
    to_port         = 8080
    security_groups = [aws_security_group.alb.id]
  }
}

# REQUIRED: Version pinning
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.30"  # Pin major.minor, allow patch updates
    }
  }
}
```

### 2.3 State Management

```hcl
# backend.tf — Remote state with locking
terraform {
  backend "s3" {
    bucket         = "myapp-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"  # Prevent concurrent modifications
  }
}
```

### 2.4 Outputs

- Infrastructure modules with full IaC coverage
- `.planning/system/INFRASTRUCTURE.md` — resource inventory, cost estimates
- Environment-specific configurations (dev, staging, production)

### Gate: IAC REVIEW + SECURITY SCAN

```
Task(
  subagent_type="nr-verifier",
  description="Infrastructure-as-Code review and security scan",
  prompt="Review all infrastructure code.

  Load references/systems-code-patterns.md for correct/incorrect patterns.

  Check:
  1. ALL resources defined in IaC — no manual provisioning (ClickOps)
  2. Secrets are NEVER in code or variable defaults (Pattern 1)
  3. Encryption at rest for all storage (databases, S3, EBS)
  4. Least-privilege IAM — no wildcard permissions
  5. Network segmentation — services only accept traffic from expected sources
  6. State is remote with locking enabled
  7. Provider versions are pinned
  8. Deletion protection on stateful resources (databases, S3)

  Scoring:
  - CRITICAL (secrets in code, wildcard IAM, no encryption): -20 points
  - WARNING (missing deletion protection, unpinned version): -10 points
  - Must score >= 85 to pass

  Write review: .planning/system/IAC_REVIEW.md"
)
```

---

## Phase 3: DEPLOYMENT PIPELINE

**Goal:** Build CI/CD pipeline with automated testing, canary deploys, and rollback capability.

### 3.1 Pipeline Stages

```yaml
# .github/workflows/deploy.yaml — Reference pipeline
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Unit tests
      run: make test-unit
    - name: Integration tests
      run: make test-integration
    - name: Security scan
      run: make security-scan  # Trivy, Snyk, or equivalent

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - name: Build container image
      run: docker build -t $IMAGE:$SHA .
    - name: Push to registry
      run: docker push $IMAGE:$SHA
    # Tag with SHA, not :latest — every build is immutable

  deploy-staging:
    needs: build
    environment: staging
    steps:
    - name: Deploy to staging
      run: kubectl set image deployment/api api=$IMAGE:$SHA -n staging
    - name: Run smoke tests
      run: make test-smoke ENDPOINT=$STAGING_URL
    - name: Run load test
      run: make test-load ENDPOINT=$STAGING_URL DURATION=5m

  deploy-production:
    needs: deploy-staging
    environment: production  # Requires approval
    steps:
    - name: Canary deploy (5%)
      run: |
        kubectl argo rollouts set image api-server api=$IMAGE:$SHA
        kubectl argo rollouts promote api-server --step 1
    # Argo Rollouts handles progressive canary with metrics gates
```

### 3.2 Rollback Strategy

Every deploy must have an automated rollback path:

```bash
#!/bin/bash
# scripts/rollback.sh — Automated rollback
set -euo pipefail

SERVICE=$1
REASON=$2

echo "Rolling back $SERVICE — Reason: $REASON"

# Kubernetes rollback
kubectl rollout undo deployment/$SERVICE -n production

# Verify rollback
kubectl rollout status deployment/$SERVICE -n production --timeout=120s

# Notify
curl -X POST "$SLACK_WEBHOOK" -d "{
  \"text\": \"ROLLBACK: $SERVICE rolled back. Reason: $REASON\"
}"
```

### 3.3 Database Migration Safety

```python
# migrations/safety.py — Expand-contract migration pattern
"""
NEVER run destructive schema changes in the same deploy as code changes.

Phase 1 (Expand): Add new column/table, deploy code that writes to BOTH old and new
Phase 2 (Migrate): Backfill data from old to new
Phase 3 (Contract): Deploy code that reads from new only
Phase 4 (Cleanup): Remove old column/table (separate deploy, weeks later)

Each phase is a separate deploy with its own rollback.
"""
```

### 3.4 Outputs

- CI/CD pipeline configuration
- Rollback scripts and procedures
- `.planning/system/DEPLOY_STRATEGY.md` — deploy process documentation

### Gate: ROLLBACK TEST

```
Task(
  subagent_type="nr-verifier",
  description="Deployment pipeline rollback test",
  prompt="Verify the deployment pipeline has working rollback.

  Check:
  1. Canary or blue-green strategy configured (not just rolling)
  2. Automated rollback on error rate spike or health check failure
  3. Rollback tested in staging — verify it actually works
  4. Database migrations are backward-compatible (expand-contract)
  5. Rollback does not require manual intervention or SSH access

  Scoring:
  - CRITICAL (no rollback path, destructive migration): -20 points
  - WARNING (manual rollback, no staging test): -10 points
  - Must score >= 85 to pass

  Write review: .planning/system/DEPLOY_REVIEW.md"
)
```

---

## Phase 4: OBSERVABILITY STACK

**Goal:** Implement metrics, logs, and traces with actionable alerting.

### 4.1 Three Pillars

Implement all three observability pillars:

| Pillar | Tool | Purpose | Retention |
|--------|------|---------|-----------|
| **Metrics** | Prometheus + Grafana | RED/USE dashboards, SLO tracking | 30 days hot, 1 year cold |
| **Logs** | Loki / ELK | Structured JSON logs with correlation IDs | 14 days hot, 90 days cold |
| **Traces** | Jaeger / Tempo | Distributed request tracing | 7 days at 10% sampling |

### 4.2 SLO Dashboard

Every service gets an SLO dashboard with:

```
┌────────────────────────────────────────────────────────────┐
│ Service: api-server                    SLO: 99.9%          │
│                                                            │
│ Error Budget:  ████████████░░░░░░░░  62% remaining         │
│ Current Rate:  99.94% (last 30 days)                       │
│ Burn Rate:     1.2x (budget exhausted in ~45 days)         │
│                                                            │
│ Error Rate (1h):  [sparkline chart]  0.06%                 │
│ p99 Latency (1h): [sparkline chart]  187ms                 │
│ Request Rate (1h): [sparkline chart]  1,247 rps            │
└────────────────────────────────────────────────────────────┘
```

### 4.3 Alerting Rules

Follow the alert design principles from systems-reliability.md:

```yaml
# Alert on SLO burn rate, NOT raw metrics
groups:
- name: slo_burn_rate
  rules:
  # Fast burn: 14.4x burn rate over 1 hour = budget gone in 5 days
  - alert: SLOFastBurn
    expr: error_ratio_1h > 14.4 * (1 - 0.999)
    for: 2m
    labels:
      severity: critical
    annotations:
      summary: "{{ $labels.service }}: error budget burning 14.4x — investigate now"
      runbook: "https://wiki/runbooks/high-error-rate"

  # Slow burn: 3x burn rate over 6 hours = budget gone in 10 days
  - alert: SLOSlowBurn
    expr: error_ratio_6h > 3 * (1 - 0.999)
    for: 30m
    labels:
      severity: warning
    annotations:
      summary: "{{ $labels.service }}: error budget burning 3x — review soon"
      runbook: "https://wiki/runbooks/elevated-error-rate"
```

### 4.4 Correlation ID Propagation

Every service must propagate correlation IDs (see systems-code-patterns.md Pattern 5).
Verify: a single request can be traced from load balancer through every service to database and back.

### 4.5 Outputs

- Prometheus/Grafana configuration
- Alert rules with runbook links
- Structured logging configuration
- Distributed tracing setup
- `.planning/system/OBSERVABILITY.md` — coverage map, alert inventory

### Gate: ALERT COVERAGE AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Observability and alert coverage audit",
  prompt="Audit the observability stack.

  Load references/systems-reliability.md for observability patterns.

  Check:
  1. All three pillars implemented (metrics, logs, traces)
  2. SLO dashboards exist for every P0/P1 service
  3. Alerting is SLO-based (burn rate), NOT threshold-based on raw metrics
  4. Every alert has a runbook link and clear response instructions
  5. Correlation IDs propagate through ALL services (test with a sample request)
  6. Log format is structured JSON with service name, correlation_id, trace_id

  Scoring:
  - CRITICAL (missing pillar, no SLO dashboard, no correlation IDs): -20 points
  - WARNING (threshold alerts, missing runbook link): -10 points
  - Must score >= 85 to pass

  Write review: .planning/system/OBSERVABILITY_REVIEW.md"
)
```

---

## Phase 5: RELIABILITY ENGINEERING

**Goal:** Validate system resilience through chaos experiments and failure testing.

### 5.1 Circuit Breaker Inventory

Verify every external dependency has a circuit breaker (see systems-code-patterns.md Pattern 12):

| Dependency | Circuit Breaker | Failure Threshold | Recovery Timeout | Fallback |
|-----------|----------------|-------------------|-----------------|----------|
| Payment API | Yes | 5 failures | 30s | Queue for retry |
| Auth Service | Yes | 3 failures | 15s | Cached tokens (5min) |
| Notification | Yes | 10 failures | 60s | Silent drop (non-critical) |
| Database | No (use retry) | N/A | N/A | Read replica failover |

### 5.2 Chaos Experiment Suite

Run progressive chaos experiments (see systems-reliability.md Section 7):

| Experiment | Hypothesis | Pass Criteria |
|-----------|-----------|---------------|
| Kill 1 pod | Service recovers with < 1% error spike | Error rate < 1.5% during recovery |
| Inject 200ms latency | Timeouts fire, circuit breakers engage | No cascade failure, p99 < 2x baseline |
| Database failover | App reconnects to replica within 30s | Downtime < 30s, no data loss |
| Dependency outage (5min) | Circuit breaker opens, fallback serves | Core functionality available |
| Full AZ failure | Traffic shifts to remaining AZs | Error rate < 2%, no manual intervention |

### 5.3 Backup and Recovery Test

```bash
#!/bin/bash
# scripts/dr-test.sh — Disaster recovery drill
set -euo pipefail

echo "=== DR DRILL: Database Restore ==="
echo "Step 1: Create test database from latest backup"
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier dr-test-$(date +%s) \
  --db-snapshot-identifier $(aws rds describe-db-snapshots \
    --db-instance-identifier production-db \
    --query 'sort_by(DBSnapshots, &SnapshotCreateTime)[-1].DBSnapshotIdentifier' \
    --output text)

echo "Step 2: Verify data integrity"
# Run data consistency checks against restored instance

echo "Step 3: Measure RTO"
# Time from start to verified restored instance

echo "Step 4: Cleanup test instance"
# Delete the test restore

echo "=== DR DRILL COMPLETE ==="
```

### 5.4 Outputs

- Circuit breaker configuration for all dependencies
- Chaos experiment results
- Backup restore test results with measured RTO/RPO
- `.planning/system/RELIABILITY_REPORT.md` — resilience findings, remediation items

### Gate: CHAOS TEST PASS

```
Task(
  subagent_type="nr-verifier",
  description="Reliability and chaos test review",
  prompt="Review reliability engineering results.

  Load references/systems-code-patterns.md for circuit breaker and retry patterns.

  Check:
  1. Circuit breakers on ALL external dependencies (Pattern 12)
  2. Chaos experiments passed for at least: pod kill, latency injection, dependency outage
  3. Backup restore tested — RTO measured and within target
  4. Graceful shutdown implemented (Pattern 3) — verified during pod kill test
  5. No unbounded retries in any service (Pattern 4)
  6. Resource limits set on all containers (Pattern 6)

  Scoring:
  - CRITICAL (no circuit breaker on P0 dependency, backup never tested): -20 points
  - WARNING (untested chaos scenario, missing resource limits): -10 points
  - Must score >= 80 to pass

  Write review: .planning/system/RELIABILITY_REVIEW.md"
)
```

---

## Phase 6: GO-LIVE

**Goal:** Verify production readiness with a comprehensive checklist and human review.

### 6.1 Production Readiness Checklist

| Category | Item | Status |
|----------|------|--------|
| **Architecture** | Dependency map documented | |
| **Architecture** | No single points of failure in P0/P1 path | |
| **Architecture** | SLOs defined for all user-facing services | |
| **Infrastructure** | 100% IaC coverage | |
| **Infrastructure** | Secrets in vault, not code or env vars | |
| **Infrastructure** | Encryption at rest and in transit | |
| **Deploy** | Canary/blue-green with automated rollback | |
| **Deploy** | Rollback tested in staging | |
| **Deploy** | Database migrations are backward-compatible | |
| **Observability** | SLO dashboards for all P0/P1 services | |
| **Observability** | Alerting on burn rate, not raw metrics | |
| **Observability** | Correlation IDs propagating end-to-end | |
| **Observability** | Every alert has a runbook link | |
| **Reliability** | Circuit breakers on all external deps | |
| **Reliability** | Chaos tests passed (pod kill, latency, dep outage) | |
| **Reliability** | Backup restore tested, RTO within target | |
| **Reliability** | Graceful shutdown on all services | |
| **Security** | Least-privilege IAM | |
| **Security** | Network policies restricting traffic | |
| **Security** | No exposed secrets or credentials | |
| **Operations** | Runbooks for all P0/P1 services | |
| **Operations** | On-call rotation configured | |
| **Operations** | Escalation paths documented | |

### 6.2 Runbook Verification

For every P0/P1 service, verify:

```markdown
## Runbook: [Service Name]
- [ ] Service owner and on-call identified
- [ ] Health check endpoint documented
- [ ] Top 3 failure modes with resolution steps
- [ ] Escalation path (on-call → secondary → management)
- [ ] Recovery procedure tested
- [ ] Rollback command documented
```

### 6.3 Outputs

- Completed production readiness checklist
- Verified runbooks for all critical services
- `.planning/system/GO_LIVE_PLAN.md` — launch plan with rollback triggers

### Gate: HUMAN REVIEW (NOT AUTOMATED)

This is the ONLY gate that requires explicit human approval.

Present the following to the user:

```
================================================================
  SYSTEM BUILD COMPLETE — HUMAN REVIEW REQUIRED
================================================================

System: [name]
Architecture: [summary — services, dependencies, cloud provider]

Phase Results:
  1. Architecture Design:    [PASS/FAIL] (dependency map, failure domains)
  2. Infrastructure:         [PASS/FAIL] (IaC review score: [XX]/100)
  3. Deployment Pipeline:    [PASS/FAIL] (rollback test score: [XX]/100)
  4. Observability:          [PASS/FAIL] (alert coverage score: [XX]/100)
  5. Reliability:            [PASS/FAIL] (chaos test score: [XX]/100)

SLOs: [list SLOs with targets]
Error Budget Policy: [configured/not configured]
On-Call: [configured/not configured]
Runbooks: [N/N services covered]

================================================================
```

Ask: **"Do you want to proceed to production?"**
- On YES: execute go-live plan, monitor for 48 hours
- On NO: ask what concerns remain, address them, re-present

</procedure>

<gate_failure_protocol>

## Gate Failure Protocol

When any gate fails:

### Step 1: Log Failure
Write to CONTEXT.md:
```
| Phase [N] gate failed | Score: [XX]/100 | [N] CRITICAL, [M] WARNING violations | [date] |
```

### Step 2: Extract Remediation Tasks
Parse the review report for violations and create a task list:
```markdown
## Remediation Tasks (Phase [N] Gate Failure)
- [ ] CRITICAL: [violation description] — [file:line]
- [ ] CRITICAL: [violation description] — [file:line]
- [ ] WARNING: [violation description] — [file:line]
```

### Step 3: Execute Fixes

```
Task(
  subagent_type="nr-executor",
  description="Fix review violations for Phase [N]",
  prompt="Fix the following violations from the [gate name] review:

  [violation list from review report]

  Reference: systems-code-patterns.md for correct patterns.
  Fix each violation. Do not introduce new violations."
)
```

### Step 4: Re-Review
Re-run the same gate review. Compare scores.

### Step 5: Retry Limit
Maximum 3 gate retries per phase. After 3 failures:
- HALT the workflow
- Write to CONTEXT.md: "Phase [N] gate failed 3 times — requires user intervention"
- Present failure summary to user with specific unresolved violations
- Ask: "How would you like to proceed?"

</gate_failure_protocol>

<artifacts>

## Artifacts Per Phase

| Phase | Key Artifacts | Review Report |
|-------|--------------|---------------|
| 1. Architecture | ARCHITECTURE.md, SLO_DOCUMENT.md, DECISIONS.md | ARCHITECTURE_REVIEW.md |
| 2. Provisioning | IaC modules, INFRASTRUCTURE.md | IAC_REVIEW.md |
| 3. Deployment | CI/CD pipeline, rollback scripts, DEPLOY_STRATEGY.md | DEPLOY_REVIEW.md |
| 4. Observability | Dashboards, alerts, logging config, OBSERVABILITY.md | OBSERVABILITY_REVIEW.md |
| 5. Reliability | Chaos results, circuit breakers, RELIABILITY_REPORT.md | RELIABILITY_REVIEW.md |
| 6. Go-Live | Production readiness checklist, runbooks, GO_LIVE_PLAN.md | Human approval |

All artifacts are stored under `.planning/system/`.

</artifacts>
