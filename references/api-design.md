# API Design & Backend Engineering Deep Reference

<when_to_load>
Load this reference when:
- Designing new API endpoints or services
- Reviewing existing API architecture
- Investigating database performance issues
- Implementing auth/authorization patterns
- Designing error handling or versioning strategy
- Planning rate limiting or caching architecture
- Building webhook or event-driven systems
This is the comprehensive reference. For quick pattern checks, use api-code-patterns.md instead.
For reasoning triggers and expert persona, use api-reasoning.md.
</when_to_load>

## 1. API Design Principles

### REST Maturity Model (Richardson)

| Level | Description | Example | When to Use |
|-------|-------------|---------|-------------|
| 0 | Single URI, single verb | POST /api with action in body | Never for new APIs |
| 1 | Multiple URIs, single verb | POST /users, POST /orders | Transitioning from RPC |
| 2 | Multiple URIs, proper verbs | GET /users, POST /users, PUT /users/:id | **Most APIs should be here** |
| 3 | HATEOAS — hypermedia links | Responses include `_links` for navigation | APIs with complex state machines |

Most APIs should target Level 2. Level 3 (HATEOAS) adds value for APIs with complex workflows (e.g., order state machines, multi-step processes) but adds overhead for simple CRUD.

### Resource Naming Conventions

```
# GOOD — nouns, plural, hierarchical
GET    /users                     # List users
GET    /users/123                 # Get user 123
POST   /users                     # Create user
PUT    /users/123                 # Replace user 123
PATCH  /users/123                 # Partial update user 123
DELETE /users/123                 # Delete user 123
GET    /users/123/orders          # List orders for user 123
GET    /users/123/orders/456      # Get order 456 for user 123

# BAD — verbs, singular, flat
GET    /getUser?id=123            # Verb in URL
POST   /user/create               # Verb + singular
GET    /getAllUserOrders?userId=123 # Verb + flat structure
POST   /deleteUser                 # POST for deletion
```

Rules:
- **Nouns, not verbs.** The HTTP method IS the verb.
- **Plural.** `/users` not `/user`. Consistency across all resources.
- **Hierarchical for ownership.** `/users/123/orders` when orders belong to users.
- **Max 2 levels deep.** Beyond that, use query parameters or separate endpoints.
- **Kebab-case for multi-word.** `/user-profiles` not `/userProfiles`.

### Actions That Do Not Map to CRUD

Some operations are not CRUD. Use sub-resource verbs sparingly:

```
POST /users/123/activate          # State transition
POST /orders/456/cancel           # State transition
POST /reports/generate            # Trigger computation
POST /emails/send                 # Trigger side effect
```

Alternative: Use a status field with PATCH:
```
PATCH /orders/456
{ "status": "cancelled" }
```

### Filtering, Sorting, and Field Selection

```
# Filtering — use query parameters
GET /products?category=electronics&price_min=10&price_max=100&in_stock=true

# Sorting — field with optional direction
GET /products?sort=price:asc,name:desc

# Field selection — reduce payload
GET /users/123?fields=id,name,email

# Search — dedicated parameter
GET /products?q=wireless+headphones

# Date ranges — ISO 8601
GET /orders?created_after=2025-01-01T00:00:00Z&created_before=2025-12-31T23:59:59Z
```

### Pagination

**Offset-based** (simple, allows jumping to page N):
```json
GET /products?offset=40&limit=20

{
  "data": [...],
  "pagination": {
    "offset": 40,
    "limit": 20,
    "total": 1523
  }
}
```
Drawback: Slow on large datasets (DB must scan and skip rows). Inconsistent if data changes between pages.

**Cursor-based** (efficient, consistent):
```json
GET /products?limit=20&cursor=eyJpZCI6MTAwfQ

{
  "data": [...],
  "pagination": {
    "limit": 20,
    "hasNextPage": true,
    "nextCursor": "eyJpZCI6MTIwfQ",
    "hasPrevPage": true,
    "prevCursor": "eyJpZCI6MTAxfQ"
  }
}
```
Cursor is an opaque token (base64-encoded sort key). No total count (expensive on large tables). Use cursor-based for any endpoint that might serve more than 10,000 records.

### Request/Response Envelope

Consistent envelope across all endpoints:

```json
// Success — single resource
{
  "data": { "id": 123, "name": "Alice" }
}

// Success — collection
{
  "data": [{ "id": 123 }, { "id": 124 }],
  "pagination": { "limit": 20, "hasNextPage": true, "nextCursor": "abc" }
}

// Error — RFC 7807 Problem Details
{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "The request body contains invalid fields",
  "instance": "/users",
  "errors": [
    { "field": "email", "code": "INVALID_FORMAT", "message": "Must be a valid email address" }
  ]
}
```

---

## 2. Database Optimization

### N+1 Query Detection and Resolution

**Detection checklist:**
1. Enable query logging in development (`prisma.$on('query')`, Django `DEBUG=True`, SQLAlchemy `echo=True`)
2. Count queries per request. If count grows with data size, you have N+1.
3. Look for identical query patterns with different parameter values.

**Resolution strategies:**

| Strategy | ORM Example | SQL Equivalent | When to Use |
|----------|-------------|---------------|-------------|
| Eager loading | Prisma `include`, SQLAlchemy `joinedload` | LEFT JOIN | Always-needed relations |
| Batch loading | DataLoader, SQLAlchemy `subqueryload` | WHERE id IN (...) | Optional relations, GraphQL |
| Query batching | `createMany`, bulk operations | INSERT ... VALUES (...), (...) | Bulk writes |
| Denormalization | Computed/cached fields | Materialized view, trigger | Read-heavy computed data |

### Indexing Strategy

```sql
-- Rule 1: Index columns used in WHERE clauses
CREATE INDEX idx_users_email ON users(email);

-- Rule 2: Composite indexes — most selective column first
-- For: WHERE status = 'active' AND created_at > '2025-01-01'
CREATE INDEX idx_orders_status_created ON orders(status, created_at);

-- Rule 3: Covering indexes — include columns used in SELECT
-- For: SELECT id, name, email FROM users WHERE email = ?
CREATE INDEX idx_users_email_covering ON users(email) INCLUDE (name);

-- Rule 4: Partial indexes — index only relevant rows
-- For: WHERE status = 'pending' (only 5% of rows)
CREATE INDEX idx_orders_pending ON orders(status) WHERE status = 'pending';

-- Rule 5: Expression indexes — for computed lookups
-- For: WHERE LOWER(email) = ?
CREATE INDEX idx_users_email_lower ON users(LOWER(email));
```

**Index anti-patterns:**
- Indexing every column (slows writes, wastes space)
- Missing composite indexes (two single-column indexes are NOT the same as one composite)
- Wrong column order in composite indexes (least selective first)
- Not analyzing query plans after adding indexes (EXPLAIN ANALYZE)

### Connection Pool Sizing

Formula: `pool_size = (core_count * 2) + effective_spindle_count`

For most applications:
- **Web server with PostgreSQL:** 10-20 connections per application instance
- **Background workers:** 2-5 connections per worker
- **Total across all instances** must not exceed `max_connections` on the database

```typescript
// Prisma connection pool configuration
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '?connection_limit=15&pool_timeout=10',
    },
  },
});
```

Monitor these metrics:
- Pool wait time (connections waiting for availability)
- Active connections vs pool size
- Query duration distribution (P50, P95, P99)
- Connection errors and timeouts

### Query Plan Analysis

```sql
-- Always use EXPLAIN ANALYZE, not just EXPLAIN
EXPLAIN ANALYZE
SELECT u.id, u.name, COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.created_at > '2025-01-01'
GROUP BY u.id, u.name
ORDER BY order_count DESC
LIMIT 20;
```

Red flags in query plans:
- **Seq Scan** on large tables (missing index)
- **Nested Loop** with large outer set (consider Hash Join)
- **Sort** with high memory usage (add index for ORDER BY)
- **Hash Aggregate** spilling to disk (increase work_mem or pre-aggregate)
- Estimated rows wildly different from actual rows (stale statistics — run ANALYZE)

### Migration Best Practices

| Operation | Risk | Safe Alternative |
|-----------|------|-----------------|
| Add NOT NULL column | Locks table, fails if data exists | Add nullable, backfill, then add constraint |
| Add index | Locks writes on large tables | `CREATE INDEX CONCURRENTLY` (PostgreSQL) |
| Rename column | Breaks all queries referencing old name | Add new column, dual-write, migrate readers, drop old |
| Change column type | May require full table rewrite | Add new column, backfill, swap |
| Drop column | Irreversible data loss | Remove from code first, drop column in a later migration |
| Add foreign key | Validates all existing rows (slow) | Add with `NOT VALID`, then `VALIDATE CONSTRAINT` separately |

---

## 3. Auth Patterns

### JWT Lifecycle

```
┌──────────┐    POST /auth/login     ┌──────────┐
│  Client  │ ──────────────────────► │  Server  │
│          │ ◄────────────────────── │          │
│          │   { access, refresh }   │          │
└──────────┘                         └──────────┘
     │
     │  GET /api/resource
     │  Authorization: Bearer <access_token>
     │
     ├──► Token valid? → Return resource
     │
     ├──► Token expired?
     │       POST /auth/refresh
     │       { refresh_token }
     │       ◄── New { access, refresh }
     │       Retry original request
     │
     └──► Refresh expired? → Redirect to login
```

**Token configuration:**

| Parameter | Access Token | Refresh Token |
|-----------|-------------|--------------|
| Lifetime | 15 minutes | 7 days |
| Storage (browser) | Memory (NOT localStorage) | HttpOnly secure cookie |
| Storage (mobile) | Secure keychain | Secure keychain |
| Rotation | Every refresh | One-time use (rotate on use) |
| Revocation | Short-lived, no revocation needed | Stored in DB, can be revoked |

**JWT claims (minimal):**
```json
{
  "sub": "user-uuid-123",
  "iat": 1711324800,
  "exp": 1711325700,
  "iss": "api.example.com",
  "aud": "api.example.com",
  "jti": "unique-token-id",
  "role": "user"
}
```

Do NOT put sensitive data in JWT claims (email, phone, address). JWTs are base64-encoded, not encrypted. Anyone can decode them.

### OAuth2 Flows

| Flow | Use Case | Security Level |
|------|----------|---------------|
| Authorization Code + PKCE | SPA, mobile, server-side web | High |
| Client Credentials | Service-to-service, backend-only | High (if secret is protected) |
| Device Code | Smart TV, CLI, IoT | Medium |
| ~~Implicit~~ | **DEPRECATED — never use** | Low |
| ~~Password~~ | **DEPRECATED — never use** | Low |

For SPAs and mobile: **Authorization Code with PKCE is the only acceptable flow.** Never use implicit grant.

### Permission Models

**RBAC (Role-Based Access Control):**
```
User → Role → Permissions
alice → admin → [users:read, users:write, orders:read, orders:write, settings:write]
bob   → editor → [users:read, orders:read, orders:write]
carol → viewer → [users:read, orders:read]
```

**ABAC (Attribute-Based Access Control):**
```
Policy: Allow if (user.department == resource.department AND user.clearance >= resource.classification)
```

Use RBAC when: Permission model is simple (< 10 roles), permissions are role-based not data-based.
Use ABAC when: Permissions depend on resource attributes, user attributes, or environmental conditions.

### API Key Management

```
API keys are for:
  ✓ Server-to-server authentication
  ✓ Identifying the calling application (not the user)
  ✓ Rate limiting per application

API keys are NOT for:
  ✗ User authentication (use OAuth2/JWT)
  ✗ Browser-side authentication (exposed in network tab)
  ✗ Authorization (keys don't carry permissions without server lookup)
```

Best practices:
- Prefix keys with environment: `sk_live_`, `sk_test_`, `pk_live_`
- Hash keys in the database (store only the hash, display prefix to user)
- Support key rotation (multiple active keys per account)
- Log key usage for audit (which key accessed what)
- Set expiration dates and require periodic rotation

---

## 4. Error Design

### RFC 7807 Problem Details

```typescript
// Base error response — every error follows this shape
interface ProblemDetails {
  type: string;       // URI identifying the error type (documentation link)
  title: string;      // Human-readable summary (same for all instances of this type)
  status: number;     // HTTP status code
  detail?: string;    // Human-readable explanation of this specific instance
  instance?: string;  // URI of the request that caused the error
}

// Extended with field-level validation errors
interface ValidationProblem extends ProblemDetails {
  errors: Array<{
    field: string;    // JSON path to the invalid field
    code: string;     // Machine-readable error code
    message: string;  // Human-readable description
  }>;
}
```

### Error Code Registry

Define application-specific error codes that are stable across versions:

```typescript
const ERROR_CODES = {
  // Auth errors (1xxx)
  AUTH_TOKEN_EXPIRED: { status: 401, title: 'Token Expired' },
  AUTH_TOKEN_INVALID: { status: 401, title: 'Invalid Token' },
  AUTH_INSUFFICIENT_SCOPE: { status: 403, title: 'Insufficient Scope' },

  // Validation errors (2xxx)
  VALIDATION_FAILED: { status: 422, title: 'Validation Failed' },
  VALIDATION_DUPLICATE: { status: 409, title: 'Duplicate Resource' },

  // Resource errors (3xxx)
  RESOURCE_NOT_FOUND: { status: 404, title: 'Resource Not Found' },
  RESOURCE_GONE: { status: 410, title: 'Resource Deleted' },

  // Rate limiting (4xxx)
  RATE_LIMIT_EXCEEDED: { status: 429, title: 'Rate Limit Exceeded' },

  // Server errors (5xxx)
  INTERNAL_ERROR: { status: 500, title: 'Internal Server Error' },
  SERVICE_UNAVAILABLE: { status: 503, title: 'Service Unavailable' },
  UPSTREAM_TIMEOUT: { status: 504, title: 'Upstream Timeout' },
} as const;
```

### Error Hierarchy

```
ApplicationError (base)
├── ClientError (4xx — client's fault, safe to expose details)
│   ├── ValidationError (422 — invalid input)
│   ├── AuthenticationError (401 — who are you?)
│   ├── AuthorizationError (403 — not allowed)
│   ├── NotFoundError (404 — resource doesn't exist)
│   ├── ConflictError (409 — duplicate, stale data)
│   └── RateLimitError (429 — too many requests)
│
├── ServerError (5xx — our fault, log everything, expose nothing)
│   ├── InternalError (500 — unhandled exception)
│   ├── ServiceUnavailableError (503 — overloaded, maintenance)
│   └── UpstreamError (502/504 — dependency failed)
│
└── OperationalError (expected failures — retryable, non-fatal)
    ├── TimeoutError (deadline exceeded)
    ├── CircuitBreakerOpenError (dependency circuit open)
    └── QueueFullError (backpressure)
```

---

## 5. Versioning

### Versioning Strategies

| Strategy | Example | Pros | Cons |
|----------|---------|------|------|
| URL path | `/v1/users`, `/v2/users` | Explicit, cacheable, simple routing | URL pollution, hard to share code between versions |
| Header | `Accept: application/vnd.api.v2+json` | Clean URLs | Easy to forget, harder to test |
| Query param | `/users?version=2` | Easy to add | Pollutes query string, caching issues |
| Content negotiation | `Accept: application/vnd.api+json; version=2` | RESTful | Complex, poor tooling support |

**Recommendation:** URL path versioning for public APIs (explicit, discoverable). Header versioning for internal APIs (cleaner).

### Deprecation Lifecycle

```
Active → Deprecated → Sunset → Removed

Timeline example:
v1: Active    ──── v1: Deprecated (6 months) ──── v1: Sunset (3 months) ──── v1: Removed
                   v2: Active ──────────────────── v2: Active ──────────────── v2: Active
```

Deprecation response headers:
```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: </v2/users>; rel="successor-version"
```

### Breaking vs Non-Breaking Changes

**Non-breaking (safe to deploy without versioning):**
- Adding a new optional field to a response
- Adding a new endpoint
- Adding a new optional query parameter
- Adding a new enum value (if consumers handle unknown values)
- Relaxing a validation constraint (accepting more input)

**Breaking (requires versioning):**
- Removing a field from a response
- Renaming a field
- Changing a field's type
- Changing the meaning of a field
- Adding a required field to a request
- Tightening a validation constraint
- Changing error response format
- Removing an endpoint
- Changing authentication requirements

---

## 6. Rate Limiting

### Algorithms

**Token Bucket:**
```
Bucket capacity: 100 tokens
Refill rate: 10 tokens/second
Request arrives: If tokens > 0, consume 1 token, allow. Else reject.

Allows bursts up to bucket capacity. Smooth sustained rate.
Best for: APIs with bursty but bounded traffic.
```

**Sliding Window:**
```
Window: 60 seconds
Limit: 100 requests
Count requests in [now - 60s, now]. If count >= 100, reject.

No burst allowance. Smooth enforcement.
Best for: Strict per-minute quotas.
```

**Fixed Window:**
```
Window: 60 seconds (aligned to clock)
Limit: 100 requests
Count requests in current window. If count >= 100, reject.

Simple but has edge case: 100 requests at 0:59, 100 at 1:00 = 200 in 2 seconds.
Best for: Simple implementations where edge cases are acceptable.
```

### Distributed Rate Limiting

Single-instance rate limiting breaks in multi-node deployments. Options:

| Approach | Accuracy | Latency | Complexity |
|----------|----------|---------|-----------|
| Redis centralized | High | +1-2ms per request | Low |
| Redis + Lua script | High (atomic) | +1-2ms | Medium |
| Local + gossip sync | Approximate | None | High |
| API gateway (Kong, Envoy) | High | Varies | Low (managed) |

For most applications: Redis with Lua scripts for atomic increment-and-check.

### Client Guidance Headers

Every rate-limited response should include:
```http
X-RateLimit-Limit: 100           # Max requests in the window
X-RateLimit-Remaining: 23        # Remaining requests in current window
X-RateLimit-Reset: 1711325700    # Unix timestamp when the window resets
Retry-After: 37                  # Seconds until the client should retry (on 429)
```

---

## 7. Caching

### Cache Layers

```
Client ──► CDN ──► API Gateway ──► Application Cache ──► Database Cache ──► Database

Layer 1: HTTP caching (Cache-Control, ETag, Last-Modified)
  - Best for: Static or rarely-changing resources
  - Headers: Cache-Control: public, max-age=3600

Layer 2: CDN/reverse proxy (Cloudflare, Fastly, Varnish)
  - Best for: Public content, geographic distribution
  - Invalidation: Purge API, surrogate keys

Layer 3: Application cache (Redis, Memcached)
  - Best for: Computed results, session data, frequently-accessed records
  - Pattern: Cache-aside (read-through with manual invalidation)

Layer 4: Database query cache
  - Best for: Repeated identical queries
  - Caution: Most ORMs disable this by default for good reason
```

### Cache Invalidation Patterns

```typescript
// Pattern: Cache-aside with TTL
async function getUser(id: string): Promise<User> {
  const cacheKey = `user:${id}`;

  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Cache miss — fetch from DB
  const user = await prisma.user.findUnique({ where: { id } });
  if (user) {
    await redis.setex(cacheKey, 300, JSON.stringify(user)); // 5 min TTL
  }

  return user;
}

// Invalidate on write
async function updateUser(id: string, data: UpdateUserInput): Promise<User> {
  const user = await prisma.user.update({ where: { id }, data });
  await redis.del(`user:${id}`); // Invalidate cache
  return user;
}
```

### Cache Stampede Prevention

When a popular cache key expires, hundreds of concurrent requests all miss the cache and hit the database simultaneously.

```typescript
import Redlock from 'redlock';

const redlock = new Redlock([redisClient]);

async function getPopularResource(id: string): Promise<Resource> {
  const cacheKey = `resource:${id}`;
  const lockKey = `lock:${cacheKey}`;

  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Only one request fetches — others wait
  const lock = await redlock.acquire([lockKey], 5000);
  try {
    // Double-check after acquiring lock
    const cached2 = await redis.get(cacheKey);
    if (cached2) return JSON.parse(cached2);

    const resource = await prisma.resource.findUnique({ where: { id } });
    await redis.setex(cacheKey, 300, JSON.stringify(resource));
    return resource;
  } finally {
    await lock.release();
  }
}
```

---

## 8. Anti-Patterns Table

| Anti-Pattern | Symptom | Root Cause | Fix |
|-------------|---------|------------|-----|
| God endpoint | One endpoint does everything based on action param | RPC thinking applied to REST | Split into proper REST resources |
| Chatty API | Client makes 10+ calls to render one page | Over-normalized resources | BFF pattern, composite endpoints |
| Anemic validation | 500 errors from DB constraint violations | No input validation at API boundary | Schema validation middleware |
| Boolean blindness | `?active=true&deleted=false&verified=true` | Complex state as booleans | Use status enum: `?status=active` |
| Timestamp chaos | Dates in 5 different formats across endpoints | No standard | ISO 8601 everywhere, UTC always |
| Enum as string | `status: "Active"` vs `status: "active"` vs `status: "ACTIVE"` | No convention | SCREAMING_SNAKE for enums, document all values |
| Nested creation | POST that creates parent + children + grandchildren | Transaction complexity, partial failure | Separate endpoints, or explicit transaction with rollback |
| Silent truncation | Long string silently cut to DB column max | No length validation | Validate max length at API boundary |
| Leaky abstraction | DB column names in API response | No DTO layer | Map internal models to API response schemas |
| Missing correlation | Cannot trace a request across services | No request ID propagation | Generate request ID at edge, propagate via header |

---

## 9. Reference Implementation

A complete Express endpoint implementing all patterns from this reference:

```typescript
import express from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import rateLimit from 'express-rate-limit';

const prisma = new PrismaClient();
const logger = pino({ redact: ['req.headers.authorization'] });
const app = express();

// --- Middleware ---

// Request ID for tracing
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] as string || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
});

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// --- Schema ---
const ListProductsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
  category: z.string().max(50).optional(),
  sort: z.enum(['price:asc', 'price:desc', 'name:asc', 'createdAt:desc']).default('createdAt:desc'),
});

// --- Endpoint ---
app.get('/api/v1/products', authenticate, async (req, res, next) => {
  // 1. Validate input
  const parsed = ListProductsSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(422).json({
      type: 'https://api.example.com/errors/validation-failed',
      title: 'Validation Failed',
      status: 422,
      errors: parsed.error.issues.map(i => ({
        field: i.path.join('.'),
        code: i.code,
        message: i.message,
      })),
    });
  }

  const { limit, cursor, category, sort } = parsed.data;
  const [sortField, sortDir] = sort.split(':') as [string, 'asc' | 'desc'];

  try {
    // 2. Query with cursor pagination, eager loading, bounded limit
    const products = await prisma.product.findMany({
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      where: {
        ...(category && { category }),
        deletedAt: null, // Soft-delete filter
      },
      orderBy: { [sortField]: sortDir },
      include: {
        images: { take: 3, orderBy: { position: 'asc' } }, // Eager load, bounded
      },
    });

    // 3. Pagination metadata
    const hasNextPage = products.length > limit;
    const results = hasNextPage ? products.slice(0, limit) : products;
    const nextCursor = hasNextPage ? results[results.length - 1].id : null;

    // 4. Cache headers for GET
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Vary', 'Authorization');

    // 5. Consistent envelope
    res.json({
      data: results,
      pagination: { limit, hasNextPage, nextCursor },
    });
  } catch (err) {
    logger.error({ err, requestId: req.id, query: parsed.data }, 'Failed to list products');
    next(err);
  }
});

// --- Health check ---
app.get('/health/ready', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'degraded', checks: { database: 'failed' } });
  }
});

// --- Centralized error handler ---
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, method: req.method, url: req.url, requestId: req.id }, 'Unhandled error');
  res.status(500).json({
    type: 'https://api.example.com/errors/internal',
    title: 'Internal Server Error',
    status: 500,
  });
});
```

This single endpoint demonstrates: input validation (Zod), cursor pagination, bounded queries, eager loading (no N+1), soft deletes, cache headers, request tracing, rate limiting, error handling with RFC 7807, and health checks.
