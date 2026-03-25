# Workflow: Build API

<purpose>
End-to-end API/backend service building from design to deployment.
6 mandatory phases in strict order. Each phase has a gate that must pass before proceeding.
This workflow covers the full lifecycle: contract design, data layer, auth, business logic, testing, and deployment.
</purpose>

<inputs>
- API requirements from user (via run.md BUILD classification with API domain)
- `.planning/CONTEXT.md` — project context, constraints, prior work
- Target consumers, expected traffic, auth requirements
</inputs>

<prerequisites>
- API domain detected (2+ signals in CONTEXT.md)
- References loaded: api-reasoning.md, api-design.md, api-code-patterns.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "DESIGN",          # Phase 1: API contract and schema design
    "DATA",            # Phase 2: Data layer, migrations, indexes
    "AUTH",            # Phase 3: Authentication, authorization, security
    "LOGIC",           # Phase 4: Business logic implementation
    "TESTING",         # Phase 5: Integration testing, contract tests, load tests
    "DEPLOYMENT"       # Phase 6: Deployment, monitoring, runbook
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from LOGIC back to DATA).
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

## Phase 1: API DESIGN & CONTRACT

**Goal:** Define the complete API contract before writing any implementation code.

### 1.1 Requirements Gathering

Collect from user or CONTEXT.md:
- **Consumers:** Who calls this API? (browser SPA, mobile app, internal service, third-party)
- **Resources:** What are the core domain objects? (users, orders, products, etc.)
- **Operations:** What actions are needed per resource? (CRUD + custom actions)
- **Auth requirements:** Public, authenticated, role-based, or service-to-service?
- **Non-functional:** Expected RPS, latency SLA, uptime requirements

### 1.2 Resource Modeling

For each resource, define:

```markdown
## Resource: [Name]

### Fields
| Field | Type | Required | Mutable | Description |
|-------|------|----------|---------|-------------|
| id | UUID | auto | no | Primary identifier |
| ... | ... | ... | ... | ... |

### Relationships
| Related Resource | Cardinality | Fetch Strategy |
|-----------------|-------------|---------------|
| ... | one-to-many | eager/lazy/separate endpoint |

### Endpoints
| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| GET | /resources | required | 100/min | List with pagination |
| GET | /resources/:id | required | 200/min | Get by ID |
| POST | /resources | required | 20/min | Create |
| PATCH | /resources/:id | owner | 50/min | Partial update |
| DELETE | /resources/:id | admin | 10/min | Soft delete |
```

### 1.3 OpenAPI Specification

Generate or write OpenAPI 3.1 spec covering:
- All endpoints with request/response schemas
- Error response schemas (RFC 7807)
- Auth schemes (bearer token, API key, etc.)
- Pagination parameters
- Rate limiting headers

```
Task(
  subagent_type="nr-executor",
  description="Generate OpenAPI specification",
  prompt="Create an OpenAPI 3.1 specification based on the resource models defined in Phase 1.
  Include all endpoints, request/response schemas, error formats, and auth schemes.
  Output: openapi.yaml or openapi.json"
)
```

### 1.4 Outputs

- Resource model documentation
- OpenAPI specification file
- Endpoint inventory in CONTEXT.md
- `.planning/api/DESIGN.md` — design decisions and rationale

### Gate: CONTRACT VALIDATION

Verify:
- [ ] Every resource has at least CRUD endpoints defined
- [ ] All endpoints specify auth requirements
- [ ] All endpoints specify rate limits
- [ ] Error responses follow RFC 7807 format
- [ ] Request schemas have validation constraints (min, max, required, format)
- [ ] Pagination is defined for all list endpoints
- [ ] No endpoint returns unbounded results
- [ ] OpenAPI spec is valid (passes linting)

Score: 1 point per check. Gate passes at 7/8 (87.5%).

---

## Phase 2: DATA LAYER

**Goal:** Build the database schema, migrations, and data access layer.

### 2.1 Schema Design

Translate resource models into database schema:
- Map resources to tables with proper types and constraints
- Define foreign keys and relationships
- Add NOT NULL constraints, CHECK constraints, unique constraints
- Design indexes based on query patterns from Phase 1

### 2.2 Migration Implementation

```
Task(
  subagent_type="nr-executor",
  description="Create database migrations",
  prompt="Create database migrations for the schema defined in Phase 2.
  Use the project's migration tool (Prisma migrate, Knex, Alembic, etc.).
  Each migration should be:
  - Idempotent (safe to re-run)
  - Reversible (include down migration)
  - Small and focused (one concern per migration)
  Reference: api-design.md section 2 for migration best practices."
)
```

### 2.3 Index Strategy

For each endpoint from Phase 1, define the necessary indexes:
- WHERE clause columns
- ORDER BY columns
- JOIN columns
- Composite indexes for multi-column filters
- Partial indexes for status-based filters

### 2.4 Connection Pool Configuration

Configure connection pooling based on:
- Number of application instances
- Expected concurrent queries
- Database max_connections setting
- Query timeout settings

### 2.5 Outputs

- Database migrations (up and down)
- Index definitions
- Connection pool configuration
- Seed data for development/testing
- `.planning/api/DATA_SCHEMA.md` — schema documentation

### Gate: DATA LAYER REVIEW

Verify:
- [ ] All migrations run successfully (up and down)
- [ ] Every foreign key has a corresponding index
- [ ] Every list endpoint's filter columns are indexed
- [ ] Connection pool sized appropriately (not exceeding DB max)
- [ ] NOT NULL constraints match required fields from Phase 1
- [ ] No raw SQL without parameterized queries
- [ ] Seed data covers all resource types and relationships

Score: 1 point per check. Gate passes at 6/7 (85.7%).

---

## Phase 3: AUTH & SECURITY

**Goal:** Implement authentication, authorization, and security hardening.

### 3.1 Authentication Implementation

Based on CONTEXT.md auth requirements:

| Auth Type | Implementation |
|-----------|---------------|
| JWT | Token issuance, validation middleware, refresh flow |
| OAuth2 | Provider integration, callback handling, token exchange |
| API Key | Key generation, hashing, lookup middleware |
| Session | Session store, cookie configuration, CSRF protection |

### 3.2 Authorization Layer

Implement permission checking:
- Role/permission model (RBAC or ABAC from api-design.md section 3)
- Middleware that checks permissions before handler execution
- Resource-level authorization (users can only access their own data)

### 3.3 Security Hardening (OWASP API Top 10)

| Threat | Mitigation |
|--------|-----------|
| Broken Object Level Auth | Check resource ownership in every handler |
| Broken Authentication | Rate limit auth endpoints, secure token storage |
| Broken Object Property Level Auth | Use allowlists for writable fields, never trust `req.body` shape |
| Unrestricted Resource Consumption | Rate limiting, pagination limits, payload size limits |
| Broken Function Level Auth | Verify role/permission for every endpoint, not just the UI |
| Server Side Request Forgery | Validate and allowlist external URLs |
| Security Misconfiguration | Helmet/security headers, disable debug in production |
| Injection | Parameterized queries, input validation, output encoding |
| Improper Asset Management | Document all endpoints, deprecate unused ones |
| Unsafe API Consumption | Validate responses from third-party APIs |

### 3.4 Outputs

- Auth middleware (authentication + authorization)
- Permission model implementation
- Security headers configuration
- CORS configuration
- Input validation middleware
- `.planning/api/SECURITY.md` — security decisions and OWASP checklist

### Gate: SECURITY AUDIT

Verify:
- [ ] All endpoints require authentication (or are explicitly marked public)
- [ ] Authorization checks exist for every write operation
- [ ] Resource ownership is verified (users cannot access others' data)
- [ ] Passwords are hashed with bcrypt/argon2 (never plain text)
- [ ] JWTs use RS256 or EdDSA (not HS256 with a weak secret)
- [ ] Rate limiting is active on all auth endpoints
- [ ] SQL injection is impossible (all queries parameterized)
- [ ] CORS is configured to allowed origins only (not `*` in production)
- [ ] Security headers are set (Helmet or equivalent)
- [ ] No secrets in source code (verified via grep)

Score: 1 point per check. Gate passes at 9/10 (90%).

---

## Phase 4: BUSINESS LOGIC

**Goal:** Implement all endpoint handlers with proper error handling, validation, and logging.

### 4.1 Endpoint Implementation

For each endpoint from Phase 1:

```
Task(
  subagent_type="nr-executor",
  description="Implement [resource] endpoints",
  prompt="Implement the following endpoints for [resource]:
  [endpoint list from Phase 1]

  Requirements:
  - Input validation using schema from Phase 1 (Zod, Joi, Pydantic)
  - Error responses following RFC 7807
  - Structured logging with correlation IDs
  - Proper HTTP status codes
  - Pagination for list endpoints
  - Idempotency keys for POST operations (if applicable)

  Reference: api-code-patterns.md for correct patterns.
  Reference: api-design.md section 9 for reference implementation."
)
```

### 4.2 Error Handling

Implement centralized error handling:
- Error class hierarchy (ClientError, ServerError, OperationalError)
- Error mapping middleware (catch all unhandled errors)
- Structured error logging (error + request context)
- Client-safe error responses (never leak stack traces or internal details)

### 4.3 Logging & Observability

- Structured JSON logging (pino, winston, structlog)
- Request/response logging middleware with redaction
- Correlation ID propagation
- Performance metrics (request duration, DB query time)

### 4.4 Outputs

- All endpoint handlers
- Centralized error handling middleware
- Logging configuration
- Request/response validation
- `.planning/api/IMPLEMENTATION.md` — implementation notes

### Gate: CODE QUALITY

Verify:
- [ ] Every endpoint has input validation
- [ ] Every endpoint returns proper error responses
- [ ] No N+1 query patterns (verify with query logging)
- [ ] All database operations that modify multiple tables use transactions
- [ ] No secrets in logs (redaction configured)
- [ ] No swallowed errors (every catch block logs or re-throws)
- [ ] Unit test coverage >= 80% on business logic
- [ ] No TODO or FIXME in production code paths

Score: 1 point per check. Gate passes at 7/8 (87.5%).

---

## Phase 5: INTEGRATION TESTING

**Goal:** Verify the API works end-to-end with contract tests, integration tests, and load testing.

### 5.1 Integration Tests

Test each endpoint with realistic data:
- Happy path: valid request returns expected response
- Validation: invalid input returns 422 with field errors
- Auth: unauthenticated returns 401, unauthorized returns 403
- Not found: missing resource returns 404
- Idempotency: retry with same key returns same result
- Pagination: cursor-based pagination traverses all records
- Concurrency: parallel writes do not corrupt data

### 5.2 Contract Tests

Validate the API matches its OpenAPI specification:
- Response schemas match spec
- Required fields are always present
- Status codes match documented behavior
- Error formats match RFC 7807

```
Task(
  subagent_type="nr-verifier",
  description="Run contract tests against OpenAPI spec",
  prompt="Verify that all endpoints match the OpenAPI specification from Phase 1.
  Test each endpoint for:
  - Response shape matches documented schema
  - Status codes match documented codes
  - Required fields are present
  - Error responses follow RFC 7807 format

  Report any discrepancies between spec and implementation."
)
```

### 5.3 Load Test Baseline

Establish performance baselines:
- Throughput: requests per second at steady state
- Latency: P50, P95, P99 response times per endpoint
- Saturation: at what RPS does latency degrade?
- Error rate: percentage of 5xx at various load levels

### 5.4 Outputs

- Integration test suite
- Contract test suite
- Load test configuration and baseline results
- `.planning/api/TEST_RESULTS.md` — test coverage report

### Gate: TEST COVERAGE

Verify:
- [ ] All endpoints have integration tests (happy path + error cases)
- [ ] Contract tests pass (API matches OpenAPI spec)
- [ ] Auth tests cover: unauthenticated, unauthorized, authorized
- [ ] Pagination tests verify full traversal
- [ ] Load test baseline established (P50, P95, P99 documented)
- [ ] No flaky tests (all tests pass 3 consecutive times)
- [ ] Edge cases tested: empty results, max page size, special characters

Score: 1 point per check. Gate passes at 6/7 (85.7%).

---

## Phase 6: DEPLOYMENT & MONITORING

**Goal:** Prepare the API for production with health checks, monitoring, alerting, and documentation.

### 6.1 Health Checks

Implement three health check endpoints:
- `/health/live` — process is alive (always 200 unless deadlocked)
- `/health/ready` — can handle traffic (checks DB, Redis, etc.)
- `/health/startup` — has finished initializing (for slow startup)

### 6.2 Monitoring & Alerting

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Error rate (5xx) | > 1% of requests | Page on-call |
| P99 latency | > 2x baseline | Warn in Slack |
| Request rate | > 80% of rate limit | Scale up notification |
| DB connection pool | > 80% utilized | Warn in Slack |
| Disk usage | > 85% | Warn, > 95% page |

### 6.3 Deployment Configuration

- Environment variable documentation (all required vars with descriptions)
- Docker/container configuration
- CI/CD pipeline (build, test, deploy stages)
- Database migration strategy for zero-downtime deploys
- Rollback procedure

### 6.4 Documentation

- OpenAPI spec published and accessible
- Getting started guide for consumers
- Authentication guide
- Error code reference
- Rate limiting documentation
- Changelog for version history

### 6.5 Runbook

Create an operational runbook covering:
- Common alert responses (high error rate, high latency, DB issues)
- Scaling procedures (horizontal, vertical, database)
- Incident response (who to contact, communication channels)
- Data recovery procedures (backup, restore, point-in-time recovery)

### 6.6 Outputs

- Health check endpoints
- Monitoring dashboard configuration
- Alert rules
- Deployment scripts/configuration
- Consumer documentation
- Operational runbook
- `.planning/api/DEPLOYMENT.md` — deployment specification

### Gate: PRODUCTION READINESS

Verify:
- [ ] Health check endpoints respond correctly (live, ready, startup)
- [ ] Monitoring covers error rate, latency, and resource utilization
- [ ] Alerting is configured for critical thresholds
- [ ] Environment variables are documented with defaults/requirements
- [ ] Database migrations run without downtime
- [ ] Rollback procedure is documented and tested
- [ ] OpenAPI documentation is published
- [ ] Consumer getting-started guide exists
- [ ] Runbook covers top 5 expected failure scenarios

Score: 1 point per check. Gate passes at 8/9 (88.9%).

</procedure>

<gate_failure_protocol>

## Gate Failure Protocol

When any gate fails:

### Step 1: Log Failure
Write to CONTEXT.md:
```
| Phase [N] gate failed | Score: [X]/[Y] | [N] checks failed | [date] |
```

### Step 2: Extract Remediation Tasks
Parse the gate report for failed checks and create a task list:
```markdown
## Remediation Tasks (Phase [N] Gate Failure)
- [ ] FAILED: [check description] — [specific issue]
- [ ] FAILED: [check description] — [specific issue]
```

### Step 3: Execute Fixes

```
Task(
  subagent_type="nr-executor",
  description="Fix gate failures for Phase [N]",
  prompt="Fix the following failed checks from the Phase [N] gate:

  [failed check list]

  Reference: api-code-patterns.md for correct patterns.
  Reference: api-design.md for design guidance.
  Fix each issue. Do not introduce new failures."
)
```

### Step 4: Re-check
Re-run the same gate. Compare scores.

### Step 5: Retry Limit
Maximum 3 gate retries per phase. After 3 failures:
- HALT the workflow
- Write to CONTEXT.md: "Phase [N] gate failed 3 times — requires user intervention"
- Present failure summary to user with specific unresolved checks
- Ask: "How would you like to proceed?"

</gate_failure_protocol>

<artifacts>

## Artifacts Per Phase

| Phase | Key Artifacts | Gate Report |
|-------|--------------|-------------|
| 1. Design | OpenAPI spec, resource models, DESIGN.md | Contract validation |
| 2. Data | Migrations, index definitions, DATA_SCHEMA.md | Data layer review |
| 3. Auth | Auth middleware, permission model, SECURITY.md | Security audit |
| 4. Logic | Endpoint handlers, error handling, IMPLEMENTATION.md | Code quality |
| 5. Testing | Test suites, load test baselines, TEST_RESULTS.md | Test coverage |
| 6. Deployment | Health checks, monitoring, runbook, DEPLOYMENT.md | Production readiness |

</artifacts>
