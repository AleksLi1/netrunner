# API/Backend Code Patterns Reference

<when_to_load>
Load this reference when working on API/backend code with any of these signals:
- Database queries, ORM usage, SQL construction
- API endpoint implementation (Express, Fastify, Flask, Django, etc.)
- Authentication/authorization code
- Input validation, error handling
- Rate limiting, caching, pagination
- Webhook implementation, external API calls
Each pattern shows WRONG (common mistake) and CORRECT (proper implementation).
</when_to_load>

## Pattern 1: N+1 Query Problem

**What goes wrong:** Fetching related data inside a loop, generating one query per parent record.

### WRONG — Querying in a loop
```typescript
// Express + Prisma — fetching users with their orders
app.get('/users', async (req, res) => {
  const users = await prisma.user.findMany(); // 1 query

  const result = [];
  for (const user of users) {
    // N queries — one per user!
    const orders = await prisma.order.findMany({
      where: { userId: user.id }
    });
    result.push({ ...user, orders });
  }

  res.json(result); // 1 + N queries executed
});
```

### CORRECT — Eager loading with include
```typescript
// Express + Prisma — single query with relation loading
app.get('/users', async (req, res) => {
  const users = await prisma.user.findMany({
    include: {
      orders: {
        select: { id: true, total: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 10, // Limit nested results
      }
    },
    take: parseInt(req.query.limit as string) || 20,
    skip: parseInt(req.query.offset as string) || 0,
  });

  res.json(users); // 1 query (or 2 with separate relation query)
});
```

**Why it matters:** An endpoint returning 100 users executes 101 queries instead of 1-2. Under load, this saturates the connection pool and causes cascading timeouts.

---

## Pattern 2: Missing Input Validation

**What goes wrong:** Trusting client-supplied data without validation, leading to type errors, injection, or corrupt data.

### WRONG — No validation
```typescript
app.post('/users', async (req, res) => {
  // Directly using unvalidated input
  const user = await prisma.user.create({
    data: {
      email: req.body.email,       // Could be anything — number, object, null
      name: req.body.name,         // Could contain SQL/HTML/script
      age: req.body.age,           // Could be negative, string, or 99999
      role: req.body.role,         // Client can set themselves as admin!
    }
  });
  res.status(201).json(user);
});
```

### CORRECT — Schema validation at boundary
```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email().max(255).toLowerCase().trim(),
  name: z.string().min(1).max(100).trim(),
  age: z.number().int().min(0).max(150).optional(),
  // role is NOT accepted from client — set server-side
});

app.post('/users', async (req, res) => {
  const parsed = CreateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      type: 'https://api.example.com/errors/validation-failed',
      title: 'Validation Failed',
      status: 422,
      errors: parsed.error.issues.map(issue => ({
        field: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    });
  }

  const user = await prisma.user.create({
    data: {
      ...parsed.data,
      role: 'user', // Server-controlled, never from client
    }
  });
  res.status(201).json(user);
});
```

**Why it matters:** Unvalidated input is the root cause of injection attacks, data corruption, and privilege escalation. Validate at the boundary, reject early.

---

## Pattern 3: Synchronous External Calls

**What goes wrong:** Blocking the request thread on third-party API calls with no timeout or fallback.

### WRONG — Blocking call with no protection
```typescript
app.post('/orders', async (req, res) => {
  const order = await prisma.order.create({ data: req.body });

  // Blocks the response on an external service with no timeout
  const receipt = await fetch('https://payment-provider.com/charge', {
    method: 'POST',
    body: JSON.stringify({ amount: order.total, orderId: order.id }),
  });
  const payment = await receipt.json();

  // If payment provider is slow or down, this request hangs forever
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentId: payment.id, status: 'paid' }
  });

  res.status(201).json(order);
});
```

### CORRECT — Async processing with timeout and fallback
```typescript
import { AbortController } from 'node:abort-controller';

app.post('/orders', async (req, res) => {
  const order = await prisma.order.create({
    data: { ...req.body, status: 'pending_payment' }
  });

  // Enqueue payment processing — don't block the response
  await paymentQueue.add('process-payment', {
    orderId: order.id,
    amount: order.total,
  });

  // Return immediately with pending status
  res.status(202).json({
    ...order,
    message: 'Order created. Payment processing.',
  });
});

// Separate worker processes the payment with timeout + retry
async function processPayment(job: Job) {
  const { orderId, amount } = job.data;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const receipt = await fetch('https://payment-provider.com/charge', {
      method: 'POST',
      body: JSON.stringify({ amount, orderId }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payment = await receipt.json();
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentId: payment.id, status: 'paid' },
    });
  } catch (err) {
    clearTimeout(timeout);
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'payment_failed', failureReason: String(err) },
    });
    throw err; // Let the queue retry
  }
}
```

**Why it matters:** A slow third-party API can exhaust your server's request handling capacity. One slow dependency should not take down your entire service.

---

## Pattern 4: Broken Idempotency

**What goes wrong:** Retrying a POST request creates duplicate records because there is no idempotency mechanism.

### WRONG — No idempotency protection
```typescript
app.post('/transfers', async (req, res) => {
  // If the client retries (network timeout, 502, etc.), this creates a DUPLICATE transfer
  const transfer = await prisma.transfer.create({
    data: {
      fromAccount: req.body.from,
      toAccount: req.body.to,
      amount: req.body.amount,
    }
  });

  await executeTransfer(transfer);
  res.status(201).json(transfer);
});
```

### CORRECT — Idempotency key prevents duplicates
```typescript
app.post('/transfers', async (req, res) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (!idempotencyKey) {
    return res.status(400).json({
      type: 'https://api.example.com/errors/missing-idempotency-key',
      title: 'Missing Idempotency Key',
      status: 400,
      detail: 'POST /transfers requires an Idempotency-Key header',
    });
  }

  // Check for existing result with this key
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key_userId: { key: idempotencyKey, userId: req.user.id } },
  });

  if (existing) {
    // Return the stored result — no duplicate execution
    return res.status(existing.statusCode).json(existing.responseBody);
  }

  // Execute the operation
  const transfer = await prisma.$transaction(async (tx) => {
    // Store the idempotency record first (prevents race condition)
    await tx.idempotencyRecord.create({
      data: {
        key: idempotencyKey,
        userId: req.user.id,
        statusCode: 201,
        responseBody: null, // Updated after execution
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72h TTL
      },
    });

    const t = await tx.transfer.create({
      data: {
        fromAccount: req.body.from,
        toAccount: req.body.to,
        amount: req.body.amount,
      },
    });

    await executeTransfer(t, tx);

    // Update the stored response
    await tx.idempotencyRecord.update({
      where: { key_userId: { key: idempotencyKey, userId: req.user.id } },
      data: { responseBody: t },
    });

    return t;
  });

  res.status(201).json(transfer);
});
```

**Why it matters:** Network failures cause retries. Without idempotency, retries create duplicates. For financial operations, this means double charges.

---

## Pattern 5: Password/Secret in Logs

**What goes wrong:** Logging full request objects exposes passwords, tokens, and API keys in log aggregators.

### WRONG — Logging raw request body
```typescript
app.post('/auth/login', async (req, res) => {
  console.log('Login attempt:', JSON.stringify(req.body));
  // Logs: {"email":"user@example.com","password":"MyS3cretP@ss!"}
  // This password is now in CloudWatch, Datadog, Splunk, etc.

  try {
    const user = await authenticate(req.body.email, req.body.password);
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET);
    console.log('Token issued:', token);
    // Token is now in logs — anyone with log access can impersonate users
    res.json({ token });
  } catch (err) {
    console.log('Login failed:', req.body);
    // Failed attempt STILL logs the password
    res.status(401).json({ error: 'Invalid credentials' });
  }
});
```

### CORRECT — Structured logging with redaction
```typescript
import pino from 'pino';

const logger = pino({
  redact: {
    paths: ['req.body.password', 'req.headers.authorization', '*.token', '*.secret'],
    censor: '[REDACTED]',
  },
});

app.post('/auth/login', async (req, res) => {
  logger.info({ email: req.body.email, ip: req.ip }, 'Login attempt');
  // Logs: {"email":"user@example.com","ip":"1.2.3.4","msg":"Login attempt"}

  try {
    const user = await authenticate(req.body.email, req.body.password);
    const token = jwt.sign({ sub: user.id, iat: Date.now() }, process.env.JWT_SECRET);
    logger.info({ userId: user.id }, 'Login successful');
    // Logs user ID, not the token
    res.json({ token });
  } catch (err) {
    logger.warn({ email: req.body.email, ip: req.ip, reason: err.message }, 'Login failed');
    // Logs the reason, never the password
    res.status(401).json({
      type: 'https://api.example.com/errors/invalid-credentials',
      title: 'Invalid Credentials',
      status: 401,
    });
  }
});
```

**Why it matters:** Log aggregators are often accessible to many team members and third-party services. Secrets in logs are a data breach waiting to happen.

---

## Pattern 6: Missing Rate Limiting

**What goes wrong:** No protection against request floods, enabling abuse, brute force, and resource exhaustion.

### WRONG — Unprotected endpoint
```typescript
// Any client can call this endpoint as fast as they want
app.post('/auth/login', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user || !await bcrypt.compare(req.body.password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  // Attacker can try millions of passwords with no throttling
  res.json({ token: generateToken(user) });
});
```

### CORRECT — Layered rate limiting
```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redisClient = createClient({ url: process.env.REDIS_URL });

// Global rate limit — applies to all endpoints
const globalLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 60 * 1000,    // 1 minute
  max: 100,                // 100 requests per minute per IP
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,
  message: {
    type: 'https://api.example.com/errors/rate-limited',
    title: 'Too Many Requests',
    status: 429,
    detail: 'Rate limit exceeded. Retry after the period indicated in the Retry-After header.',
  },
});

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  store: new RedisStore({ sendCommand: (...args) => redisClient.sendCommand(args) }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 attempts per 15 min per IP
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body?.email || 'unknown'}`, // Per IP+email
});

app.use(globalLimiter);
app.post('/auth/login', authLimiter, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (!user || !await bcrypt.compare(req.body.password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: generateToken(user) });
});
```

**Why it matters:** Without rate limiting, your login endpoint is a brute-force target. Your expensive search endpoint is a denial-of-service vector. Rate limiting is infrastructure protection.

---

## Pattern 7: Unversioned Breaking Change

**What goes wrong:** Renaming or removing API fields without versioning breaks all existing consumers.

### WRONG — Breaking change without versioning
```typescript
// v1 response (consumers built integrations against this)
// { "id": 1, "userName": "alice", "email_address": "alice@example.com" }

// Developer "cleans up" the response — breaking change!
app.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  res.json({
    id: user.id,
    username: user.name,      // Renamed from userName — breaks consumers
    email: user.email,        // Renamed from email_address — breaks consumers
    // fullName removed — breaks consumers who depend on it
  });
});
```

### CORRECT — Versioned endpoints with deprecation
```typescript
// v1 preserved — existing consumers keep working
app.get('/v1/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  res.set('Deprecation', 'true');
  res.set('Sunset', 'Sat, 01 Jan 2027 00:00:00 GMT');
  res.set('Link', '</v2/users/' + user.id + '>; rel="successor-version"');
  res.json({
    id: user.id,
    userName: user.name,           // Old field name preserved
    email_address: user.email,     // Old field name preserved
    fullName: user.fullName,       // Old field preserved
  });
});

// v2 with clean naming — new consumers use this
app.get('/v2/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  res.json({
    id: user.id,
    username: user.name,
    email: user.email,
    displayName: user.fullName,
  });
});
```

**Why it matters:** Consumers integrate against your API contract. Changing that contract without versioning breaks their production systems. Always version, always deprecate with a timeline.

---

## Pattern 8: Raw SQL Injection

**What goes wrong:** Building SQL queries by string concatenation allows attackers to execute arbitrary SQL.

### WRONG — String concatenation in queries
```typescript
app.get('/users/search', async (req, res) => {
  const { name, sort } = req.query;
  // CRITICAL VULNERABILITY: SQL injection via name or sort parameter
  const users = await prisma.$queryRawUnsafe(
    `SELECT * FROM users WHERE name LIKE '%${name}%' ORDER BY ${sort}`
  );
  // Input: name='; DROP TABLE users; --
  // Executes: SELECT * FROM users WHERE name LIKE '%'; DROP TABLE users; --%'
  res.json(users);
});
```

### CORRECT — Parameterized queries
```typescript
app.get('/users/search', async (req, res) => {
  const { name } = req.query;
  const sort = req.query.sort as string;

  // Allowlist for sort columns — never interpolate user input into SQL structure
  const allowedSortColumns = ['name', 'email', 'createdAt'] as const;
  const sortColumn = allowedSortColumns.includes(sort as any) ? sort : 'createdAt';

  // Parameterized query — values are escaped by the driver
  const users = await prisma.$queryRaw`
    SELECT id, name, email, "createdAt"
    FROM users
    WHERE name ILIKE ${'%' + name + '%'}
    ORDER BY "${Prisma.raw(sortColumn)}" DESC
    LIMIT 50
  `;

  res.json(users);
});
```

**Why it matters:** SQL injection is consistently in the OWASP Top 10. It can expose, modify, or destroy your entire database. Always use parameterized queries. Always allowlist structural inputs (column names, sort directions).

---

## Pattern 9: Missing Database Transaction

**What goes wrong:** Multi-step database operations without a transaction leave data in an inconsistent state on partial failure.

### WRONG — Multiple writes without transaction
```typescript
app.post('/orders', async (req, res) => {
  // Step 1: Create order
  const order = await prisma.order.create({ data: { userId: req.user.id, total: req.body.total } });

  // Step 2: Create line items
  for (const item of req.body.items) {
    await prisma.orderItem.create({ data: { orderId: order.id, ...item } });
  }

  // Step 3: Deduct inventory
  for (const item of req.body.items) {
    await prisma.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.quantity } },
    });
  }
  // If step 3 fails midway: order exists, some items created, some inventory deducted
  // Data is now INCONSISTENT — manual cleanup required

  res.status(201).json(order);
});
```

### CORRECT — Atomic transaction
```typescript
app.post('/orders', async (req, res) => {
  const order = await prisma.$transaction(async (tx) => {
    // All operations succeed or all roll back
    const order = await tx.order.create({
      data: { userId: req.user.id, total: req.body.total },
    });

    await tx.orderItem.createMany({
      data: req.body.items.map((item: any) => ({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    // Verify stock availability and deduct atomically
    for (const item of req.body.items) {
      const product = await tx.product.findUnique({ where: { id: item.productId } });
      if (!product || product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.productId}`);
      }
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    return order;
  });

  res.status(201).json(order);
});
```

**Why it matters:** Without transactions, any failure mid-operation leaves your database in an inconsistent state. Orders without items, inventory deducted for unfulfilled orders, partial transfers. Always wrap related writes in a transaction.

---

## Pattern 10: Unbounded Pagination

**What goes wrong:** Returning all records with no limit causes timeouts, OOM errors, and database strain.

### WRONG — No pagination or limit
```typescript
app.get('/products', async (req, res) => {
  // Returns ALL products — could be millions of rows
  const products = await prisma.product.findMany();
  res.json(products);
  // With 500k products: ~500MB JSON response, 30+ second query, potential OOM
});
```

### CORRECT — Cursor-based pagination with limits
```typescript
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

app.get('/products', async (req, res) => {
  const limit = Math.min(
    parseInt(req.query.limit as string) || DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  const cursor = req.query.cursor as string | undefined;

  const products = await prisma.product.findMany({
    take: limit + 1, // Fetch one extra to determine if there's a next page
    ...(cursor && {
      cursor: { id: cursor },
      skip: 1, // Skip the cursor itself
    }),
    orderBy: { id: 'asc' },
    select: { id: true, name: true, price: true, category: true },
  });

  const hasNextPage = products.length > limit;
  const results = hasNextPage ? products.slice(0, limit) : products;
  const nextCursor = hasNextPage ? results[results.length - 1].id : null;

  res.json({
    data: results,
    pagination: {
      limit,
      hasNextPage,
      nextCursor,
    },
  });
});
```

**Why it matters:** Unbounded queries are a denial-of-service vector. A single request for "all records" can bring down the database. Always enforce limits, always paginate.

---

## Pattern 11: Hardcoded Configuration

**What goes wrong:** Secrets, URLs, and environment-specific values embedded in source code.

### WRONG — Secrets in source code
```typescript
const stripe = new Stripe('sk_live_EXAMPLE_KEY_DO_NOT_USE'); // Real API key in code!
const db = new Pool({
  host: 'prod-db.internal.company.com',
  password: 'SuperSecret123!', // Production password in code!
  database: 'production',
});
const jwtSecret = 'my-jwt-secret-do-not-share'; // JWT signing key in code!

app.post('/webhook', (req, res) => {
  const isValid = verifySignature(req.body, 'whsec_abc123xyz'); // Webhook secret in code!
});
```

### CORRECT — Environment-based configuration
```typescript
import { z } from 'zod';

// Validate ALL required config at startup — fail fast if missing
const EnvSchema = z.object({
  STRIPE_SECRET_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
});

const env = EnvSchema.parse(process.env);
// If any required var is missing, the app crashes immediately with a clear error

const stripe = new Stripe(env.STRIPE_SECRET_KEY);
const db = new Pool({ connectionString: env.DATABASE_URL });

app.post('/webhook', (req, res) => {
  const isValid = verifySignature(req.body, env.WEBHOOK_SECRET);
});
```

**Why it matters:** Secrets in source code end up in git history, CI logs, and developer machines. Use environment variables, validate them at startup, and never commit `.env` files.

---

## Pattern 12: Missing Health Check

**What goes wrong:** No liveness or readiness endpoints makes it impossible for orchestrators (Kubernetes, load balancers) to manage the service.

### WRONG — No health endpoints
```typescript
// The entire application
app.get('/api/users', usersHandler);
app.post('/api/orders', ordersHandler);
// No health check — load balancer sends traffic to unhealthy instances
// Kubernetes restarts never happen because there's no liveness probe
// Deploys route traffic before the service is ready
app.listen(3000);
```

### CORRECT — Liveness and readiness probes
```typescript
// Liveness — "is the process alive and not deadlocked?"
app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

// Readiness — "can this instance handle traffic?"
app.get('/health/ready', async (req, res) => {
  const checks: Record<string, string> = {};

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'failed';
  }

  // Check Redis connectivity
  try {
    await redisClient.ping();
    checks.redis = 'ok';
  } catch {
    checks.redis = 'failed';
  }

  const allHealthy = Object.values(checks).every(v => v === 'ok');
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// Startup — "has the service finished initializing?"
let isReady = false;
app.get('/health/startup', (req, res) => {
  res.status(isReady ? 200 : 503).json({ started: isReady });
});

async function start() {
  await prisma.$connect();
  await redisClient.connect();
  await runMigrations();
  isReady = true;
  app.listen(3000);
}
start();
```

**Why it matters:** Without health checks, orchestrators cannot distinguish healthy instances from broken ones. Traffic routes to dead instances. Deploys cause downtime because traffic arrives before the service is ready.

---

## Pattern 13: Swallowed Errors

**What goes wrong:** Empty catch blocks or generic error handling hides failures, making debugging impossible.

### WRONG — Swallowed errors
```typescript
app.post('/orders', async (req, res) => {
  try {
    const order = await createOrder(req.body);
    await sendConfirmationEmail(order.userEmail, order.id);
    await updateInventory(order.items);
    await notifyWarehouse(order);
    res.status(201).json(order);
  } catch (err) {
    // ALL errors caught here — no distinction between:
    // - validation error (client's fault, 422)
    // - email service down (non-critical, should still return success)
    // - inventory update failed (critical, order is now inconsistent)
    // - warehouse notification failed (retry-able)
    res.status(500).json({ error: 'Something went wrong' });
  }
});
```

### CORRECT — Granular error handling with classification
```typescript
import { logger } from './logger';

class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public isOperational = true,
  ) {
    super(message);
  }
}

app.post('/orders', async (req, res, next) => {
  // Critical path — must succeed for the order to be valid
  let order: Order;
  try {
    order = await createOrder(req.body);
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(422).json({
        type: 'https://api.example.com/errors/validation-failed',
        title: 'Validation Failed',
        status: 422,
        errors: err.details,
      });
    }
    return next(err); // Unexpected error — let centralized handler deal with it
  }

  // Non-critical side effects — failures should not block the response
  const sideEffects = [
    sendConfirmationEmail(order.userEmail, order.id).catch(err => {
      logger.error({ err, orderId: order.id }, 'Failed to send confirmation email');
      // Email failure is non-critical — log and continue
    }),
    notifyWarehouse(order).catch(err => {
      logger.error({ err, orderId: order.id }, 'Failed to notify warehouse');
      // Enqueue for retry
      retryQueue.add('notify-warehouse', { orderId: order.id });
    }),
  ];

  // Fire side effects but don't await them for the response
  Promise.allSettled(sideEffects);

  res.status(201).json(order);
});

// Centralized error handler — catches everything that falls through
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err, method: req.method, url: req.url, requestId: req.id }, 'Unhandled error');

  if (err instanceof AppError && err.isOperational) {
    return res.status(err.statusCode).json({
      type: `https://api.example.com/errors/${err.code}`,
      title: err.message,
      status: err.statusCode,
    });
  }

  // Unknown error — don't leak internals
  res.status(500).json({
    type: 'https://api.example.com/errors/internal',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected error occurred. Please try again.',
  });
});
```

**Why it matters:** Swallowed errors make production debugging impossible. Classify errors by severity and criticality. Log everything. Only expose safe details to clients.
