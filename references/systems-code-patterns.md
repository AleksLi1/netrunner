# Systems/Infrastructure Code Patterns

## Purpose

This reference provides concrete correct vs. incorrect code patterns for common infrastructure and reliability mistakes. These are not checklists — they are examples that activate expert reasoning about what production-grade infrastructure looks like in code.

When this reference is active, the agent should use these patterns as diagnostic templates: "Does the code I'm reading/writing match the CORRECT pattern, or does it resemble the WRONG pattern?"

## When to Load This Reference

**Loaded by:** nr-executor, nr-verifier, nr-debugger, nr-quant-auditor (for infra code)

**Trigger keywords:** Terraform, Kubernetes, Docker, deployment, health check, retry, timeout,
circuit breaker, secrets, graceful shutdown, resource limits, backpressure, service discovery,
TLS, mTLS, correlation ID, observability, infrastructure-as-code

**Load condition:** Systems/Infra domain detected in CONTEXT.md, infrastructure code under review,
or deployment/reliability issues being debugged.

---

## Pattern 1: Hardcoded Secrets

### WRONG: Secrets in config files or environment variable defaults

```yaml
# kubernetes/deployment.yaml — WRONG
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  template:
    spec:
      containers:
      - name: api
        env:
        - name: DATABASE_URL
          value: "postgresql://admin:s3cret_passw0rd@db.prod.internal:5432/myapp"
        - name: API_KEY
          value: "sk-live-abc123def456"
        - name: JWT_SECRET
          value: "my-jwt-secret-that-never-rotates"
```

```python
# config.py — WRONG
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://admin:password@localhost:5432/app")
API_KEY = "sk-live-abc123def456"  # hardcoded fallback
```

### CORRECT: Secrets from a secret manager with no defaults

```yaml
# kubernetes/deployment.yaml — CORRECT
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  template:
    spec:
      containers:
      - name: api
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: database-url
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: api-secrets
              key: api-key
      # Secrets managed by External Secrets Operator or Sealed Secrets
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: api-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-backend
    kind: ClusterSecretStore
  target:
    name: api-secrets
  data:
  - secretKey: database-url
    remoteRef:
      key: prod/api/database-url
  - secretKey: api-key
    remoteRef:
      key: prod/api/api-key
```

```python
# config.py — CORRECT
import os

def get_required_env(name: str) -> str:
    """Fetch required env var. No defaults for secrets — fail loudly."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Required environment variable {name} is not set")
    return value

DATABASE_URL = get_required_env("DATABASE_URL")
API_KEY = get_required_env("API_KEY")
```

**Why it matters:** Hardcoded secrets end up in version control, container images, and log outputs. A single leaked credential can compromise the entire system. Secrets must come from a dedicated secret manager with rotation support, never from code or config files.

---

## Pattern 2: Missing Health Checks

### WRONG: No liveness or readiness probes

```yaml
# kubernetes/deployment.yaml — WRONG
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: api
        ports:
        - containerPort: 8080
        # No health checks — Kubernetes has no idea if the app is healthy
        # Broken instances keep receiving traffic
        # Deadlocked processes never get restarted
```

### CORRECT: Meaningful health checks that verify dependencies

```yaml
# kubernetes/deployment.yaml — CORRECT
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
      - name: api
        ports:
        - containerPort: 8080
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 2
        startupProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 5
          failureThreshold: 30  # 150 seconds for slow startup
```

```python
# health.py — CORRECT: Meaningful checks, not just 200 OK
from fastapi import FastAPI, Response

app = FastAPI()

@app.get("/healthz")
async def liveness():
    """Liveness: is the process alive and not deadlocked?"""
    return {"status": "alive"}

@app.get("/ready")
async def readiness():
    """Readiness: can this instance serve traffic?"""
    checks = {}
    try:
        await db_pool.execute("SELECT 1")
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"failed: {e}"
        return Response(status_code=503, content=json.dumps(checks))

    try:
        await redis_client.ping()
        checks["cache"] = "ok"
    except Exception as e:
        checks["cache"] = f"failed: {e}"
        return Response(status_code=503, content=json.dumps(checks))

    return {"status": "ready", "checks": checks}
```

**Why it matters:** Without health checks, Kubernetes cannot distinguish a healthy pod from a deadlocked or crashed one. Traffic continues to be routed to broken instances, causing user-visible errors. The liveness probe restarts stuck processes; the readiness probe stops routing traffic to instances that can't serve it.

---

## Pattern 3: No Graceful Shutdown

### WRONG: SIGTERM ignored, in-flight requests dropped

```python
# server.py — WRONG
from fastapi import FastAPI
import uvicorn

app = FastAPI()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
    # When Kubernetes sends SIGTERM, uvicorn exits immediately
    # In-flight requests get connection reset errors
    # Background tasks are interrupted mid-execution
    # Database connections are not closed cleanly
```

### CORRECT: Handle SIGTERM, drain connections, complete in-flight work

```python
# server.py — CORRECT
import asyncio
import signal
import logging
from fastapi import FastAPI
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)
shutdown_event = asyncio.Event()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown lifecycle."""
    # Startup: initialize connections
    await db_pool.connect()
    await redis_client.connect()
    logger.info("Application started")

    yield

    # Shutdown: drain and clean up
    logger.info("Shutdown initiated — draining connections")
    shutdown_event.set()
    # Give in-flight requests time to complete
    await asyncio.sleep(5)
    await db_pool.disconnect()
    await redis_client.close()
    logger.info("Shutdown complete")

app = FastAPI(lifespan=lifespan)

@app.middleware("http")
async def reject_during_shutdown(request, call_next):
    """Stop accepting new requests during shutdown."""
    if shutdown_event.is_set():
        return Response(status_code=503, content="Server shutting down")
    return await call_next(request)
```

```yaml
# kubernetes/deployment.yaml — CORRECT: Give time for graceful shutdown
spec:
  template:
    spec:
      terminationGracePeriodSeconds: 30  # Match your drain timeout
      containers:
      - name: api
        lifecycle:
          preStop:
            exec:
              command: ["/bin/sh", "-c", "sleep 5"]  # Wait for LB to deregister
```

**Why it matters:** Kubernetes sends SIGTERM and waits `terminationGracePeriodSeconds` before SIGKILL. If the application doesn't handle SIGTERM, in-flight requests are dropped, database transactions are left half-complete, and users see connection reset errors during every deployment.

---

## Pattern 4: Unbounded Retries

### WRONG: Retry storms amplifying failures

```python
# client.py — WRONG
import requests
import time

def call_payment_service(payload):
    while True:  # Infinite retry
        try:
            response = requests.post("http://payment-service/charge", json=payload)
            response.raise_for_status()
            return response.json()
        except Exception:
            time.sleep(1)  # Fixed delay, no backoff
            # Every caller retries forever → payment service gets 10x traffic during outage
            # One slow dependency causes thread exhaustion in the caller
```

### CORRECT: Bounded retries with exponential backoff and jitter

```python
# client.py — CORRECT
import httpx
import random
import logging

logger = logging.getLogger(__name__)

async def call_payment_service(
    payload: dict,
    max_retries: int = 3,
    base_delay: float = 0.5,
    max_delay: float = 10.0,
) -> dict:
    """Call payment service with bounded retries and exponential backoff."""
    last_exception = None

    for attempt in range(max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    "http://payment-service/charge",
                    json=payload,
                )
                response.raise_for_status()
                return response.json()
        except httpx.TimeoutException as e:
            last_exception = e
            logger.warning(f"Payment service timeout (attempt {attempt + 1}/{max_retries + 1})")
        except httpx.HTTPStatusError as e:
            if e.response.status_code < 500:
                raise  # Don't retry client errors (4xx)
            last_exception = e
            logger.warning(f"Payment service error {e.response.status_code} (attempt {attempt + 1})")

        if attempt < max_retries:
            delay = min(base_delay * (2 ** attempt), max_delay)
            jitter = delay * random.uniform(0.5, 1.5)
            await asyncio.sleep(jitter)

    raise last_exception
```

**Why it matters:** During a partial outage, unbounded retries amplify load on the struggling service by a factor of N (number of callers x retry rate). This turns a minor degradation into a full outage. Bounded retries with exponential backoff and jitter spread the retry load over time and prevent thundering herd effects.

---

## Pattern 5: Log Without Correlation ID

### WRONG: Impossible to trace requests across services

```python
# handler.py — WRONG
import logging

logger = logging.getLogger(__name__)

async def handle_order(order_id: str):
    logger.info(f"Processing order {order_id}")
    result = await payment_service.charge(order_id)
    logger.info(f"Payment result: {result}")
    # In a distributed system with 10 services, these log lines are
    # indistinguishable from thousands of other concurrent requests.
    # Debugging a specific user's failed order means searching for
    # order_id across 10 different log streams manually.
```

### CORRECT: Propagate correlation ID through every service

```python
# middleware.py — CORRECT
import uuid
import contextvars
import logging

correlation_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="")

class CorrelationIdFilter(logging.Filter):
    def filter(self, record):
        record.correlation_id = correlation_id_var.get("")
        return True

# Configure structured logging with correlation ID in every line
logging.basicConfig(format='{"time":"%(asctime)s","level":"%(levelname)s","correlation_id":"%(correlation_id)s","message":"%(message)s"}')
logger = logging.getLogger(__name__)
logger.addFilter(CorrelationIdFilter())

@app.middleware("http")
async def correlation_id_middleware(request, call_next):
    """Extract or generate correlation ID, propagate to downstream calls."""
    cid = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    correlation_id_var.set(cid)
    response = await call_next(request)
    response.headers["X-Correlation-ID"] = cid
    return response

# handler.py — CORRECT: Correlation ID is automatic in every log line
async def handle_order(order_id: str):
    logger.info(f"Processing order {order_id}")
    # Log output: {"time":"...","level":"INFO","correlation_id":"abc-123","message":"Processing order 42"}
    # Same correlation_id appears in payment-service, inventory-service, notification-service
```

**Why it matters:** In a microservices architecture, a single user request may touch 5-10 services. Without a correlation ID propagated through headers and included in every log line, debugging a specific request path requires manually correlating timestamps across services — which is nearly impossible under load.

---

## Pattern 6: Missing Resource Limits

### WRONG: Unbounded CPU/memory in containers

```yaml
# kubernetes/deployment.yaml — WRONG
spec:
  containers:
  - name: api
    image: myapp:latest
    # No resource limits — this container can consume unlimited CPU and memory
    # A memory leak slowly eats the entire node
    # A CPU-intensive request starves other pods on the same node
    # Node runs out of memory → OOM killer randomly kills pods
```

### CORRECT: Explicit requests and limits with headroom

```yaml
# kubernetes/deployment.yaml — CORRECT
spec:
  containers:
  - name: api
    image: myapp:v1.2.3  # Pinned version, not :latest
    resources:
      requests:
        cpu: "250m"       # Guaranteed minimum: 0.25 CPU cores
        memory: "256Mi"   # Guaranteed minimum: 256 MiB
      limits:
        cpu: "1000m"      # Hard cap: 1 CPU core (throttled beyond this)
        memory: "512Mi"   # Hard cap: 512 MiB (OOM killed beyond this)
```

```hcl
# terraform/ecs.tf — CORRECT: Resource limits for ECS
resource "aws_ecs_task_definition" "api" {
  family                   = "api"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"   # 0.5 vCPU
  memory                   = "1024"  # 1 GB

  container_definitions = jsonencode([{
    name   = "api"
    image  = "myapp:v1.2.3"
    cpu    = 512
    memory = 1024
    memoryReservation = 512  # Soft limit for scheduling

    ulimits = [{
      name      = "nofile"
      softLimit = 65536
      hardLimit = 65536
    }]
  }])
}
```

**Why it matters:** Without resource limits, a single misbehaving container (memory leak, CPU spin loop) can starve all other workloads on the same node. The OOM killer will eventually intervene by randomly killing pods — often the wrong ones. Resource limits make failures predictable and contained.

---

## Pattern 7: Single Point of Failure

### WRONG: No redundancy in critical path

```hcl
# terraform/main.tf — WRONG
resource "aws_instance" "database" {
  ami           = "ami-12345"
  instance_type = "r5.xlarge"
  # Single database instance — if it fails, the entire application is down
  # No replication, no failover, no backup strategy
}

resource "aws_instance" "api" {
  ami           = "ami-67890"
  instance_type = "t3.medium"
  # Single API instance — zero redundancy
  # Deployment requires downtime
}
```

### CORRECT: Redundancy at every critical layer

```hcl
# terraform/main.tf — CORRECT
resource "aws_rds_cluster" "database" {
  cluster_identifier = "myapp-db"
  engine             = "aurora-postgresql"
  engine_version     = "15.4"

  # Multi-AZ: automatic failover if primary fails
  availability_zones = ["us-east-1a", "us-east-1b", "us-east-1c"]

  backup_retention_period = 7
  preferred_backup_window = "03:00-04:00"

  deletion_protection = true  # Prevent accidental deletion
}

resource "aws_rds_cluster_instance" "database" {
  count              = 2  # Writer + reader replica
  identifier         = "myapp-db-${count.index}"
  cluster_identifier = aws_rds_cluster.database.id
  instance_class     = "db.r5.large"
}

resource "aws_autoscaling_group" "api" {
  name                = "myapp-api"
  min_size            = 2   # Always at least 2 instances
  max_size            = 10
  desired_capacity    = 3
  vpc_zone_identifier = var.private_subnet_ids  # Spread across AZs

  health_check_type         = "ELB"
  health_check_grace_period = 120
}
```

**Why it matters:** A single point of failure means that one hardware fault, one misconfiguration, or one deploy takes down the entire service. Redundancy at every critical layer (compute, database, load balancer, DNS) ensures that individual component failures don't become service outages.

---

## Pattern 8: DNS-Based Service Discovery Without TTL Control

### WRONG: Stale DNS caching causes traffic to dead instances

```python
# client.py — WRONG
import requests

# DNS resolves once and is cached by the OS/runtime for hours
# If payment-service moves to a new IP (deploy, failover, scale event),
# this client keeps sending to the old IP until DNS cache expires
PAYMENT_URL = "http://payment-service.internal:8080"

def charge(amount):
    return requests.post(f"{PAYMENT_URL}/charge", json={"amount": amount})
```

### CORRECT: Connection pooling with TTL-aware resolution

```python
# client.py — CORRECT
import httpx

# Use a client that respects DNS TTL and refreshes connections
transport = httpx.AsyncHTTPTransport(
    retries=2,
    # httpx respects DNS TTL by default
    # For even tighter control, use a custom resolver
)

client = httpx.AsyncClient(
    base_url="http://payment-service.internal:8080",
    transport=transport,
    timeout=httpx.Timeout(5.0, connect=2.0),
)

async def charge(amount: float) -> dict:
    response = await client.post("/charge", json={"amount": amount})
    response.raise_for_status()
    return response.json()
```

```yaml
# kubernetes/service.yaml — CORRECT: Use Kubernetes service for discovery
apiVersion: v1
kind: Service
metadata:
  name: payment-service
spec:
  selector:
    app: payment
  ports:
  - port: 8080
    targetPort: 8080
  # kube-proxy handles routing to healthy pods
  # No stale DNS — endpoints are updated in real time
```

**Why it matters:** DNS caching is invisible until it causes an outage. After a failover or scale event, stale DNS records route traffic to instances that no longer exist. Using Kubernetes services, service mesh, or HTTP clients that respect DNS TTL prevents stale routing.

---

## Pattern 9: Unencrypted Internal Traffic

### WRONG: Plaintext between services inside the network

```yaml
# kubernetes/deployment.yaml — WRONG
spec:
  containers:
  - name: api
    env:
    - name: PAYMENT_URL
      value: "http://payment-service:8080"  # Plaintext HTTP
    - name: DATABASE_URL
      value: "postgresql://user:pass@db:5432/app?sslmode=disable"  # SSL disabled
    # Any compromised pod on the network can sniff credentials and data
    # "But it's internal" is not a security boundary
```

### CORRECT: Encrypt all internal traffic

```yaml
# istio/peer-authentication.yaml — CORRECT: mTLS via service mesh
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT  # All traffic in the namespace must be mTLS
```

```python
# config.py — CORRECT: TLS for direct connections
DATABASE_URL = get_required_env("DATABASE_URL")
# Value: "postgresql://user@db:5432/app?sslmode=verify-full&sslrootcert=/etc/ssl/ca.pem"

PAYMENT_URL = "https://payment-service:8443"  # TLS even internal
```

**Why it matters:** "It's internal" is not a security boundary. Network-level access controls can be bypassed through compromised pods, misconfigured network policies, or lateral movement after an initial breach. Encrypting internal traffic (mTLS via service mesh or explicit TLS) ensures that a compromised component cannot sniff credentials or data from other services.

---

## Pattern 10: Missing Backpressure

### WRONG: Producer overwhelms consumer

```python
# worker.py — WRONG
import asyncio

async def process_queue():
    while True:
        messages = await queue.receive(max_messages=100)
        # Process ALL messages as fast as possible
        tasks = [process_message(msg) for msg in messages]
        await asyncio.gather(*tasks)
        # If processing is slower than publishing, memory grows unbounded
        # If downstream DB is slow, we keep piling up connections
        # Eventually: OOM kill or connection pool exhaustion
```

### CORRECT: Bounded concurrency with backpressure

```python
# worker.py — CORRECT
import asyncio
import logging

logger = logging.getLogger(__name__)

async def process_queue(max_concurrent: int = 10):
    """Process queue with bounded concurrency — apply backpressure when overloaded."""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def bounded_process(msg):
        async with semaphore:
            try:
                await process_message(msg)
            except Exception as e:
                logger.error(f"Failed to process message {msg.id}: {e}")
                await msg.nack()  # Return to queue for retry
                return
            await msg.ack()

    while True:
        messages = await queue.receive(max_messages=max_concurrent)
        tasks = [bounded_process(msg) for msg in messages]
        await asyncio.gather(*tasks)
        # Semaphore limits concurrent processing — queue naturally backs up
        # if consumer is slower than producer, which is the correct behavior
```

**Why it matters:** Without backpressure, a fast producer (or a spike in traffic) overwhelms the consumer, leading to memory exhaustion, connection pool starvation, or cascading failures in downstream services. Bounded concurrency ensures the consumer processes at a sustainable rate and lets the queue absorb spikes.

---

## Pattern 11: Hardcoded Timeouts

### WRONG: No context-aware deadline propagation

```python
# handler.py — WRONG
async def handle_request():
    # Each service adds its own timeout, but they don't coordinate
    user = await user_service.get_user(timeout=5)       # 5s
    orders = await order_service.get_orders(timeout=5)    # 5s
    payments = await payment_service.get_status(timeout=5) # 5s
    # Total possible time: 15s — but the load balancer times out at 10s
    # Client gets 504 Gateway Timeout after 10s
    # The remaining calls continue executing, wasting resources
```

### CORRECT: Deadline propagation from request context

```python
# handler.py — CORRECT
import asyncio
import time

async def handle_request(request):
    """Propagate deadline from the incoming request through all downstream calls."""
    # Get deadline from upstream (load balancer, API gateway)
    request_deadline = float(request.headers.get("X-Request-Deadline", time.time() + 10))

    async def call_with_deadline(coro, label: str):
        remaining = request_deadline - time.time()
        if remaining <= 0:
            raise TimeoutError(f"Deadline exceeded before calling {label}")
        try:
            return await asyncio.wait_for(coro, timeout=remaining)
        except asyncio.TimeoutError:
            raise TimeoutError(f"Deadline exceeded during {label}")

    user = await call_with_deadline(user_service.get_user(), "user_service")
    orders = await call_with_deadline(order_service.get_orders(user.id), "order_service")
    payments = await call_with_deadline(payment_service.get_status(orders), "payment_service")

    return {"user": user, "orders": orders, "payments": payments}
```

**Why it matters:** Hardcoded timeouts don't account for time already spent upstream. If a request has a 10-second overall budget and user_service takes 8 seconds, there's no point calling order_service with a fresh 5-second timeout — the request is already dead to the client. Deadline propagation ensures downstream calls respect the remaining budget.

---

## Pattern 12: Missing Circuit Breaker

### WRONG: Cascading failures on dependency outage

```python
# client.py — WRONG
async def get_recommendations(user_id: str):
    # If recommendation-service is down, every request to our service
    # blocks for the full timeout duration, exhausting our thread/connection pool
    # Our service becomes unresponsive because of someone else's outage
    try:
        response = await httpx.get(
            f"http://recommendation-service/recommend/{user_id}",
            timeout=5.0,
        )
        return response.json()
    except Exception:
        return []  # Silent fallback, but we still waited 5 seconds
```

### CORRECT: Circuit breaker with fast failure and fallback

```python
# circuit_breaker.py — CORRECT
import asyncio
import time
import logging
from enum import Enum

logger = logging.getLogger(__name__)

class CircuitState(Enum):
    CLOSED = "closed"        # Normal operation
    OPEN = "open"            # Failing — reject immediately
    HALF_OPEN = "half_open"  # Testing recovery

class CircuitBreaker:
    def __init__(self, name: str, failure_threshold: int = 5,
                 recovery_timeout: float = 30.0, half_open_max: int = 1):
        self.name = name
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max = half_open_max
        self.last_failure_time = 0.0
        self.half_open_calls = 0

    async def call(self, coro, fallback=None):
        if self.state == CircuitState.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                self.half_open_calls = 0
                logger.info(f"Circuit {self.name}: OPEN -> HALF_OPEN")
            else:
                logger.debug(f"Circuit {self.name}: OPEN — fast failing")
                if fallback is not None:
                    return fallback
                raise CircuitOpenError(self.name)

        if self.state == CircuitState.HALF_OPEN and self.half_open_calls >= self.half_open_max:
            if fallback is not None:
                return fallback
            raise CircuitOpenError(self.name)

        try:
            result = await coro
            self._on_success()
            return result
        except Exception as e:
            self._on_failure()
            if fallback is not None:
                return fallback
            raise

    def _on_success(self):
        if self.state == CircuitState.HALF_OPEN:
            logger.info(f"Circuit {self.name}: HALF_OPEN -> CLOSED")
        self.state = CircuitState.CLOSED
        self.failure_count = 0

    def _on_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.state == CircuitState.HALF_OPEN:
            self.state = CircuitState.OPEN
            logger.warning(f"Circuit {self.name}: HALF_OPEN -> OPEN")
        elif self.failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(f"Circuit {self.name}: CLOSED -> OPEN after {self.failure_count} failures")


# Usage
recommendations_circuit = CircuitBreaker("recommendations", failure_threshold=5, recovery_timeout=30)

async def get_recommendations(user_id: str):
    return await recommendations_circuit.call(
        httpx.AsyncClient().get(f"http://recommendation-service/recommend/{user_id}", timeout=2.0),
        fallback=[]  # Graceful degradation: return empty recommendations
    )
```

**Why it matters:** Without a circuit breaker, a failing dependency drains the caller's resources (threads, connections, memory) while waiting for timeouts. If recommendation-service is down and every request waits 5 seconds, the API server's connection pool exhausts within minutes. A circuit breaker detects the failure pattern and short-circuits immediately, preserving resources for healthy code paths.
