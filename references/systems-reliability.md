# Systems Reliability Engineering Reference

## 1. When to Load This Reference

**Loaded by:** nr-executor, nr-verifier, nr-debugger, nr-planner, nr-researcher

**Trigger keywords:** SLO, SLI, SLA, error budget, incident, postmortem, capacity, auto-scaling,
deploy, canary, blue-green, rollback, observability, metrics, traces, logs, chaos, game day,
reliability, uptime, availability, latency, throughput, toil, on-call

**Load condition:** Systems/Infra domain detected in CONTEXT.md with reliability, incident management,
observability, or deployment topics active.

**See also:** `systems-reasoning.md` (expert reasoning triggers), `systems-code-patterns.md` (code patterns),
`verification-patterns.md` (general verification)

---

## 2. SRE Principles

### Error Budgets

An error budget is the maximum amount of unreliability a service can tolerate before feature work stops and reliability becomes the sole priority.

```
Error Budget = 1 - SLO target

Example:
  SLO: 99.9% availability
  Error Budget: 0.1% = 43.8 minutes/month

  If 30 minutes of downtime occurred this month:
  Budget remaining: 13.8 minutes (31.5%)
  Status: CAUTION — slow down risky deploys
```

**Error budget policy:**
| Budget Remaining | Action |
|-----------------|--------|
| > 50% | Normal development velocity. Deploy at will. |
| 25% - 50% | Caution. Require canary deploys. Add rollback gates. |
| 10% - 25% | Slow down. Only ship with automated rollback. Prioritize reliability work. |
| < 10% | Freeze. No feature deploys. All engineering effort on reliability. |
| Exhausted | Full stop. Post-incident review. Reliability sprint until budget recovers. |

### SLOs / SLIs / SLAs

| Concept | Definition | Owned By | Example |
|---------|-----------|----------|---------|
| **SLI** (Service Level Indicator) | A quantitative measure of service behavior | Engineering | Ratio of successful HTTP requests (status < 500) to total requests |
| **SLO** (Service Level Objective) | A target value for an SLI | Engineering + Product | 99.9% of requests succeed over a 30-day rolling window |
| **SLA** (Service Level Agreement) | A contract with consequences for missing the SLO | Business | 99.9% availability; below this, customer gets 10% credit |

**SLO design principles:**
- Define SLOs from the **user's perspective**, not the system's. "API responds in < 200ms" matters; "CPU usage < 70%" does not (unless it correlates with user impact).
- SLOs should be **achievable but ambitious**. If you never burn error budget, the SLO is too loose.
- Fewer SLOs are better. 3-5 SLOs covering critical user journeys beats 30 SLOs nobody tracks.
- SLOs must **drive decisions**. An SLO that nobody looks at is documentation, not an objective.

**Common SLI patterns:**

```python
# Availability SLI
availability = successful_requests / total_requests
# Where successful = HTTP status < 500 (exclude client errors — those are user's fault)

# Latency SLI
latency_sli = requests_under_threshold / total_requests
# Where threshold = p99 < 500ms for API, p95 < 200ms for UI

# Freshness SLI (for data pipelines)
freshness_sli = measurements_where(data_age < max_staleness) / total_measurements
# Where max_staleness = 5 minutes for real-time, 1 hour for batch

# Correctness SLI (for data processing)
correctness_sli = correct_outputs / total_outputs
# Validated by sampling and comparison against known-good results
```

### Toil Reduction

Toil is manual, repetitive, automatable work that scales linearly with service size. SRE targets < 30% toil.

**Toil identification checklist:**
- Do you do this task more than once a week?
- Could a script or cron job do it?
- Does the task scale with the number of services/users/deploys?
- Does it interrupt deep work or sleep?
- Does it require production access?

**Toil reduction priority:**
1. **Automate the pager.** If an alert always results in the same manual action, automate the action and remove the alert.
2. **Self-service provisioning.** If teams wait for you to create a database/namespace/service account, build a self-service tool.
3. **Automated rollbacks.** If you manually roll back > 2 deploys per month, add automated rollback on health check failure.
4. **Config management.** If you SSH into boxes to change config, move to GitOps.

---

## 3. Incident Management

### Severity Levels

| Severity | Impact | Response Time | Communication | Example |
|----------|--------|---------------|---------------|---------|
| **SEV-1** | Complete outage or data loss | < 15 minutes | War room, exec notification, status page | Production database down, payment processing failed |
| **SEV-2** | Major degradation, SLA at risk | < 1 hour | Dedicated Slack channel, stakeholder update | 50% error rate on core API, auth system degraded |
| **SEV-3** | Minor degradation, workaround exists | < 4 hours | Team notification | Secondary feature broken, non-critical job failing |
| **SEV-4** | No user impact, reliability risk | Next business day | Ticket created | Monitoring gap found, config drift detected |

### Incident Commander Role

The Incident Commander (IC) does NOT debug. The IC:
1. **Coordinates.** Assigns roles: debugger, communicator, scribe.
2. **Communicates.** Provides status updates every 15 minutes (SEV-1) or 30 minutes (SEV-2).
3. **Decides.** Makes the call to rollback, failover, or escalate.
4. **Protects.** Shields the debugging team from interruptions.
5. **Documents.** Ensures a timeline is being maintained.

**IC communication template:**

```
[INCIDENT UPDATE — SEV-{N}]
Time: {HH:MM UTC}
Status: {Investigating | Identified | Monitoring | Resolved}
Impact: {Who is affected, how}
Current actions: {What is being done right now}
Next update: {time of next update}
```

### Postmortem Culture

Every SEV-1 and SEV-2 incident gets a postmortem within 48 hours. The postmortem is **blameless** — it identifies systemic causes, not individuals.

**Postmortem template:**

```markdown
# Postmortem: [Incident Title]
Date: [YYYY-MM-DD]
Severity: [SEV-N]
Duration: [start → end, total minutes]
Author: [name]
Reviewers: [names]

## Summary
[2-3 sentences: what happened, who was affected, what was the impact]

## Timeline
| Time (UTC) | Event |
|------------|-------|
| HH:MM | First alert fired |
| HH:MM | IC assigned, war room opened |
| HH:MM | Root cause identified |
| HH:MM | Mitigation applied |
| HH:MM | Service fully restored |

## Root Cause
[Technical explanation of what caused the incident. Not "human error."
What systemic condition allowed this to happen?]

## Contributing Factors
- [Factor 1: e.g., "No automated rollback on error rate spike"]
- [Factor 2: e.g., "Health check did not verify database connectivity"]
- [Factor 3: e.g., "Alert was noisy — team had pager fatigue"]

## What Went Well
- [e.g., "Incident detected within 2 minutes by monitoring"]
- [e.g., "Communication was clear and timely"]

## What Went Poorly
- [e.g., "Rollback took 25 minutes because it was manual"]
- [e.g., "No runbook for this failure mode"]

## Action Items
| Action | Owner | Priority | Due Date | Status |
|--------|-------|----------|----------|--------|
| Add automated rollback on 5xx spike | @alice | P1 | YYYY-MM-DD | TODO |
| Write runbook for DB failover | @bob | P2 | YYYY-MM-DD | TODO |
| Fix health check to verify DB | @carol | P1 | YYYY-MM-DD | TODO |

## Lessons Learned
[What should the team internalize? What changed about how they think about this system?]
```

---

## 4. Capacity Planning

### Load Modeling

```python
# capacity_model.py — Simple capacity model
from dataclasses import dataclass

@dataclass
class CapacityModel:
    current_rps: float          # Current requests per second at peak
    growth_rate_monthly: float  # Monthly growth rate (e.g., 0.10 = 10%)
    instance_capacity_rps: float  # Max RPS per instance before degradation
    target_utilization: float = 0.7  # Target 70% — leave headroom for spikes

    def instances_needed(self, months_ahead: int = 0) -> int:
        """Calculate instances needed for current or projected load."""
        projected_rps = self.current_rps * ((1 + self.growth_rate_monthly) ** months_ahead)
        effective_capacity = self.instance_capacity_rps * self.target_utilization
        return max(2, -(-int(projected_rps) // int(effective_capacity)))  # Ceiling division, min 2

    def headroom_months(self, current_instances: int) -> float:
        """How many months until current capacity is exhausted?"""
        max_rps = current_instances * self.instance_capacity_rps * self.target_utilization
        if self.current_rps >= max_rps:
            return 0.0
        if self.growth_rate_monthly <= 0:
            return float('inf')
        import math
        return math.log(max_rps / self.current_rps) / math.log(1 + self.growth_rate_monthly)

# Usage
model = CapacityModel(current_rps=500, growth_rate_monthly=0.15, instance_capacity_rps=200)
print(f"Instances needed now: {model.instances_needed(0)}")
print(f"Instances in 6 months: {model.instances_needed(6)}")
print(f"Headroom with 5 instances: {model.headroom_months(5):.1f} months")
```

### Auto-Scaling Configuration

```yaml
# kubernetes/hpa.yaml — Horizontal Pod Autoscaler
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3        # Never go below 3 (survive 1 AZ failure)
  maxReplicas: 20       # Cost cap — never exceed 20 replicas
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60   # Wait 60s before scaling up more
      policies:
      - type: Pods
        value: 4
        periodSeconds: 60  # Add at most 4 pods per minute
    scaleDown:
      stabilizationWindowSeconds: 300  # Wait 5 min before scaling down
      policies:
      - type: Percent
        value: 25
        periodSeconds: 60  # Remove at most 25% per minute (slow scale-down)
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60  # Scale up when CPU > 60%
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"  # Scale up when RPS > 100 per pod
```

### Cost Optimization Checklist

| Area | Check | Savings Potential |
|------|-------|-------------------|
| Right-sizing | Are instances using > 50% of provisioned CPU/memory? | 20-40% |
| Reserved instances | Are long-running workloads on reserved/savings plans? | 30-60% |
| Spot/preemptible | Can stateless workloads tolerate interruption? | 60-80% |
| Storage tiering | Is cold data on cheaper storage classes? | 30-50% |
| Idle resources | Are dev/staging environments running 24/7? | 50-70% |
| Orphaned resources | Unattached EBS volumes, old snapshots, unused EIPs? | 5-15% |
| Data transfer | Is cross-AZ/cross-region transfer minimized? | 10-30% |

---

## 5. Deploy Strategies

### Blue-Green Deployment

```
                    Load Balancer
                    /           \
                   /             \
          [Blue — v1.2]    [Green — v1.3]
          (current live)   (new version)

Step 1: Deploy v1.3 to Green (no traffic)
Step 2: Run smoke tests against Green
Step 3: Switch LB to Green (instant cutover)
Step 4: Monitor for 15 minutes
Step 5a: If healthy → decommission Blue
Step 5b: If errors → switch LB back to Blue (instant rollback)
```

**Pros:** Instant rollback, full environment testing before cutover.
**Cons:** Requires 2x infrastructure during deploy, database migrations must be backward-compatible.

### Canary Deployment with Metrics Gates

```yaml
# argo-rollouts/canary.yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: api-server
spec:
  strategy:
    canary:
      steps:
      - setWeight: 5        # Route 5% of traffic to canary
      - pause:
          duration: 5m       # Wait 5 minutes
      - analysis:
          templates:
          - templateName: success-rate
            args:
            - name: service
              value: api-server
          # Automated analysis: if error rate > 1% or p99 > 500ms, ABORT
      - setWeight: 25        # Promote to 25%
      - pause:
          duration: 10m
      - analysis:
          templates:
          - templateName: success-rate
      - setWeight: 50        # 50%
      - pause:
          duration: 10m
      - setWeight: 100       # Full rollout

---
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: success-rate
spec:
  args:
  - name: service
  metrics:
  - name: success-rate
    interval: 60s
    successCondition: result[0] > 0.99  # 99% success rate required
    provider:
      prometheus:
        address: http://prometheus:9090
        query: |
          sum(rate(http_requests_total{service="{{args.service}}",status!~"5.."}[5m]))
          /
          sum(rate(http_requests_total{service="{{args.service}}"}[5m]))
  - name: latency-p99
    interval: 60s
    successCondition: result[0] < 500  # p99 < 500ms required
    provider:
      prometheus:
        address: http://prometheus:9090
        query: |
          histogram_quantile(0.99,
            sum(rate(http_request_duration_seconds_bucket{service="{{args.service}}"}[5m])) by (le)
          ) * 1000
```

**Pros:** Gradual rollout, automated metrics gates, limits blast radius.
**Cons:** Requires good observability, complex setup, old/new versions run simultaneously.

### Rolling Deployment

```yaml
# kubernetes/deployment.yaml — Rolling update with safety
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 6
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 2          # Create at most 2 extra pods during update
      maxUnavailable: 1    # At most 1 pod unavailable during update
  template:
    spec:
      terminationGracePeriodSeconds: 30
      containers:
      - name: api
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        # New pods must pass readiness before old pods are terminated
        # If new pod never becomes ready, rollout stalls (not auto-rolled back)
```

### Progressive Delivery Decision Matrix

| Factor | Blue-Green | Canary | Rolling | Feature Flag |
|--------|-----------|--------|---------|-------------|
| Rollback speed | Instant | Minutes | Minutes | Instant |
| Infrastructure cost | 2x during deploy | ~1.1x | ~1.1x | None |
| DB migration support | Requires backward-compat | Requires backward-compat | Requires backward-compat | N/A |
| Observability required | Basic | Advanced | Basic | Basic |
| Blast radius control | All or nothing | Percentage-based | Pod-by-pod | User-segment |
| Best for | Stateless services | APIs with good metrics | General workloads | Feature rollout |

---

## 6. Observability Patterns

### RED Method (Request-driven services)

| Signal | Metric | Alert Condition |
|--------|--------|-----------------|
| **R**ate | Requests per second | Sudden drop > 50% from baseline |
| **E**rrors | Error rate (5xx / total) | > 1% of requests over 5 minutes |
| **D**uration | Latency percentiles (p50, p95, p99) | p99 > 500ms over 5 minutes |

### USE Method (Resource-oriented)

| Signal | Metric | Alert Condition |
|--------|--------|-----------------|
| **U**tilization | CPU/memory/disk usage percentage | > 80% sustained for 10 minutes |
| **S**aturation | Queue depth, thread pool usage | Queue growing for > 5 minutes |
| **E**rrors | Hardware/software error counts | Any non-zero disk errors, OOM events |

### Distributed Tracing Setup

```python
# tracing.py — OpenTelemetry setup for distributed tracing
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

def setup_tracing(service_name: str, otlp_endpoint: str):
    """Initialize OpenTelemetry tracing with auto-instrumentation."""
    resource = Resource.create({"service.name": service_name})
    provider = TracerProvider(resource=resource)
    exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)

    # Auto-instrument frameworks — traces propagate automatically
    FastAPIInstrumentor.instrument()
    HTTPXClientInstrumentor.instrument()
    SQLAlchemyInstrumentor().instrument()

# Custom spans for business logic
tracer = trace.get_tracer(__name__)

async def process_order(order_id: str):
    with tracer.start_as_current_span("process_order", attributes={"order.id": order_id}):
        with tracer.start_as_current_span("validate_inventory"):
            await check_inventory(order_id)
        with tracer.start_as_current_span("charge_payment"):
            await process_payment(order_id)
        with tracer.start_as_current_span("send_notification"):
            await notify_customer(order_id)
```

### Structured Logging Standard

```python
# logging_config.py — Structured JSON logging
import logging
import json
from datetime import datetime, timezone

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "service": "api-server",
            "correlation_id": getattr(record, "correlation_id", ""),
            "trace_id": getattr(record, "otelTraceID", ""),
            "span_id": getattr(record, "otelSpanID", ""),
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

# Every log line is a JSON object with correlation_id and trace_id
# Queryable in any log aggregation system:
#   correlation_id="abc-123" → find all logs for one request across all services
#   trace_id="def-456" → link logs to distributed trace
```

### Alert Design Principles

```yaml
# alertmanager/rules.yaml — Good alert design
groups:
- name: slo_alerts
  rules:
  # GOOD: Alert on SLO burn rate, not raw metrics
  - alert: HighErrorBudgetBurn
    expr: |
      (
        sum(rate(http_requests_total{status=~"5.."}[1h]))
        /
        sum(rate(http_requests_total[1h]))
      ) > 14.4 * (1 - 0.999)
    # 14.4x burn rate = budget exhausted in 5 days
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "Error budget burning fast — {{ $value | humanizePercentage }} error rate"
      runbook: "https://wiki.internal/runbooks/high-error-rate"
      dashboard: "https://grafana.internal/d/slo-overview"

  # BAD (do NOT do this):
  # - alert: HighCPU
  #   expr: node_cpu_usage > 80
  #   # CPU at 80% is not necessarily a problem
  #   # This fires constantly and gets ignored
  #   # No runbook, no context, no action
```

---

## 7. Chaos Engineering

### Principles

1. **Define steady state.** Before breaking things, define what "normal" looks like in measurable terms (error rate, latency, throughput).
2. **Hypothesize.** "When we kill a pod, the service should continue serving with < 1% error rate increase."
3. **Contain blast radius.** Start with non-production. Move to production only with kill switches and limited scope.
4. **Run in production.** The goal is to test real infrastructure, not test environments. But start small.
5. **Automate.** Chaos experiments should run regularly, not just during game days.

### Experiment Types (Progressive)

| Level | Experiment | Blast Radius | Prerequisites |
|-------|-----------|--------------|---------------|
| 1 | Kill a single pod | One instance | Health checks, replica count > 1 |
| 2 | Inject network latency (100ms) | One service | Timeouts configured, circuit breakers |
| 3 | Kill an entire AZ | Multiple services | Multi-AZ deployment, data replication |
| 4 | DNS failure | Service discovery | Fallback DNS, cached resolution |
| 5 | Database failover | Data layer | Read replicas, auto-failover, connection retry |
| 6 | Full region failover | Everything | Multi-region, DNS failover, data replication |

### Game Day Template

```markdown
# Game Day: [Experiment Name]
Date: [YYYY-MM-DD]
Facilitator: [name]
Participants: [names]

## Hypothesis
"When [failure condition], the system should [expected behavior] with [acceptable degradation]."

## Steady State Definition
- Error rate: [current baseline, e.g., 0.1%]
- p99 latency: [current baseline, e.g., 200ms]
- Throughput: [current baseline, e.g., 1000 rps]

## Experiment Steps
1. [Action — e.g., "Kill 2 of 6 pods in api-server deployment"]
2. [Observation — e.g., "Monitor error rate and latency for 5 minutes"]
3. [Verification — e.g., "Confirm remaining pods absorbed traffic"]

## Kill Switch
[How to stop the experiment immediately if it goes wrong]
- Command: [e.g., "kubectl rollout undo deployment/api-server"]
- Responsible: [name]

## Results
- Hypothesis confirmed? [Yes/No]
- Steady state maintained? [Yes/No]
- Unexpected findings: [list]
- Action items: [list]
```

---

## 8. Anti-Patterns Table

| Anti-Pattern | Symptoms | Root Cause | Fix |
|-------------|----------|------------|-----|
| Alert fatigue | >50 alerts/day, pager ignored | Threshold-based alerts on raw metrics | SLO-based alerting, burn rate alerts, tiered severity |
| Snowflake servers | "Don't touch that box," fear of rebuild | Manual configuration, no IaC | Immutable infrastructure, full Terraform/Pulumi coverage |
| YOLO deploys | No rollback plan, big-bang releases | Missing CI/CD maturity | Canary deploys with automated metrics gates |
| SSH debugging | Engineers SSH to prod to read logs | Missing log aggregation, poor observability | Structured logging, centralized log platform, distributed tracing |
| Monolith monitoring | One dashboard for everything | No service decomposition of metrics | Per-service SLO dashboards, RED/USE metrics per service |
| Manual scaling | Human triggers scale events | No auto-scaling, fear of cost | HPA with proper metrics, cost caps, scale-down policies |
| Backup theater | Backups exist but never tested | No restore testing, no DR drills | Monthly restore tests, annual DR drill, measured RTO/RPO |
| Dependency blindness | "It just calls that service" | No dependency map, no failure mode analysis | Service dependency graph, circuit breakers, fallback behavior |
| Config sprawl | Settings in 5 different places | Organic growth, no config strategy | Single source of truth (GitOps), environment-specific overlays |
| Toil acceptance | "That's just how we do it" | Normalized manual work | Toil tracking, SRE budget (< 30% toil target), automation sprints |

---

## 9. Reference Implementation

A production-grade Kubernetes deployment incorporating all patterns from this reference.

```yaml
# Complete reference deployment: api-server with full production readiness
---
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    istio-injection: enabled  # mTLS via service mesh

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: production
  labels:
    app: api-server
    version: v1.2.3
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0  # Zero downtime deploys
  template:
    metadata:
      labels:
        app: api-server
        version: v1.2.3
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "9090"
        prometheus.io/path: "/metrics"
    spec:
      terminationGracePeriodSeconds: 30
      serviceAccountName: api-server  # Least-privilege RBAC
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        fsGroup: 1000
      containers:
      - name: api
        image: registry.internal/api-server:v1.2.3  # Pinned version
        ports:
        - name: http
          containerPort: 8080
        - name: metrics
          containerPort: 9090

        # --- Resource Limits (Pattern 6) ---
        resources:
          requests:
            cpu: "250m"
            memory: "256Mi"
          limits:
            cpu: "1000m"
            memory: "512Mi"

        # --- Health Checks (Pattern 2) ---
        startupProbe:
          httpGet:
            path: /healthz
            port: http
          failureThreshold: 30
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /healthz
            port: http
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: http
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2

        # --- Secrets from Secret Manager (Pattern 1) ---
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: database-url
        - name: LOG_FORMAT
          value: "json"
        - name: OTEL_EXPORTER_OTLP_ENDPOINT
          value: "http://otel-collector.observability:4317"

        # --- Graceful Shutdown (Pattern 3) ---
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 5"]

      # --- Anti-affinity for HA (Pattern 7) ---
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            podAffinityTerm:
              labelSelector:
                matchLabels:
                  app: api-server
              topologyKey: topology.kubernetes.io/zone

---
# --- Auto-Scaling ---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 15
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 65

---
# --- Pod Disruption Budget ---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-server
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api-server

---
# --- Network Policy (Pattern 5, 9) ---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-server
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-server
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress  # Only accept traffic from ingress namespace
    ports:
    - port: 8080
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: production  # Can talk to services in same namespace
    - namespaceSelector:
        matchLabels:
          name: observability  # Can send telemetry
  - to:  # DNS
    - namespaceSelector: {}
    ports:
    - port: 53
      protocol: UDP
```

This reference implementation demonstrates: secret management, health checks, graceful shutdown, resource limits, high availability, auto-scaling, pod disruption budgets, network policies, observability integration, and security hardening — all in a single deployable configuration.
