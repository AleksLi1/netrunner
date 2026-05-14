# API/Backend Code Scan Patterns

## Purpose

Active scanning catalog for `nr-api-auditor`. Each pattern is a concrete, grep-able rule with a defined severity, a wrong/correct pair, a data-flow check, and a fix recommendation.

Companion to `api-code-patterns.md` (teaching prose). This file is operational: the auditor runs each grep against the codebase, then performs a context check on each hit before classifying severity.

**Stack assumptions:** Node.js (Express, Fastify, NestJS, Next.js API/route handlers), Python (FastAPI, Django, Flask), Go (net/http, chi, gin), Ruby (Rails), TypeScript runtimes. Patterns are language-agnostic where possible; language-specific patterns are marked.

**Severity scale:**
- **CRITICAL** — security hole, data corruption, contract break, production outage risk
- **WARNING** — likely problem requiring manual verification (perf, reliability, observability gap)
- **INFO** — code smell, missing instrumentation, weak hygiene

---

## Pattern 1: SQL string concatenation / template literals (injection)

**Why it matters:** SQL injection remains a top OWASP vulnerability. Any user input concatenated into SQL allows arbitrary query execution.

**Grep:**
```bash
grep -rnE "(query|execute|raw)\s*\(\s*[\"'\`].*?\\\$\{|\".*?\+.*?(req\.|input|body|params|query)" --include="*.{ts,js,py,go,rb}"
grep -rnE "f[\"'].*?\\\{.*?SELECT|f[\"'].*?\\\{.*?INSERT|f[\"'].*?\\\{.*?UPDATE" --include="*.py"
```

**WRONG:**
```ts
const result = await db.query(`SELECT * FROM users WHERE email = '${req.query.email}'`);
const sql = "DELETE FROM posts WHERE id = " + req.params.id;
```
```python
cursor.execute(f"SELECT * FROM users WHERE email = '{email}'")
```

**CORRECT:**
```ts
const result = await db.query('SELECT * FROM users WHERE email = $1', [req.query.email]);
const result = await prisma.user.findUnique({ where: { email: req.query.email } });
```
```python
cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
# Or ORM
User.objects.filter(email=email).first()
```

**Severity:** CRITICAL (SQL injection)

**Fix:** Parameterized queries. Prefer an ORM or query builder. Never interpolate user input into SQL strings.

---

## Pattern 2: Command execution with user input (RCE)

**Why it matters:** Passing user input to `exec`, `spawn`, `system`, `subprocess`, or shell command construction enables arbitrary command execution.

**Grep:**
```bash
grep -rnE "(exec|spawn|execSync|spawnSync)\s*\(\s*[\"'\`].*?\\\$\{|child_process" --include="*.{ts,js}"
grep -rnE "(subprocess\.(call|run|Popen)|os\.(system|popen)|eval|exec)" --include="*.py"
grep -rnE "exec\.Command\(|os/exec" --include="*.go"
```

**WRONG:**
```ts
const { exec } = require('child_process');
exec(`convert ${req.body.input} ${req.body.output}`);
exec(`grep "${req.query.term}" /var/log/app.log`);
```
```python
subprocess.run(f"git log {request.GET['ref']}", shell=True)
os.system(f"backup {user_dir}")
```

**CORRECT:**
```ts
import { spawn } from 'child_process';
spawn('convert', [req.body.input, req.body.output]);   // arg array, no shell
// Or: never accept arbitrary paths/refs; use an allowlist
```
```python
subprocess.run(['git', 'log', sanitized_ref], shell=False, check=True)
# Or use a library wrapper (gitpython) — no shell
```

**Severity:** CRITICAL (RCE)

**Fix:** Pass arguments as an array with `shell=False`. Validate input against an allowlist. Never use `shell: true` with user input.

---

## Pattern 3: Hardcoded secret in source

**Why it matters:** Secrets in source are leaked via git history, container images, error messages, and stack traces. Rotation requires a code deploy.

**Grep:**
```bash
grep -rnE "(api[_-]?key|secret|token|password|private[_-]?key|access[_-]?key)\s*[:=]\s*[\"'][a-zA-Z0-9_\-]{20,}[\"']" --include="*.{ts,tsx,js,jsx,py,go,rb,java,env*}"
grep -rnE "sk_(test|live)_[a-zA-Z0-9]{24,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|xox[baprs]-" --include="*"
grep -rnE "^-----BEGIN (RSA |EC )?PRIVATE KEY-----" --include="*"
```

**WRONG:**
```ts
const DB_PASSWORD = "supersecret_pw_2024";
const stripe = new Stripe("sk_live_<YOUR_SECRET_KEY>");
```

**CORRECT:**
```ts
const DB_PASSWORD = process.env.DB_PASSWORD;
if (!DB_PASSWORD) throw new Error("DB_PASSWORD env var required");

// Better: secrets manager
const password = await getSecret("db/prod/password");
```

**Severity:** CRITICAL

**Fix:** Load from env vars (with required-check at boot). For production, use a secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager). Rotate exposed secrets immediately.

---

## Pattern 4: N+1 query (query inside loop)

**Why it matters:** A query per iteration produces O(N) database round-trips. List endpoints scaling linearly with result size is the most common API performance bug.

**Grep:**
```bash
grep -rnE "for\s*\(.*?\s+of\s+|forEach\(|\.map\(" --include="*.{ts,js}" -A 5 | grep -E "(await|\.then\()"
grep -rnE "(for\s+\w+\s+in|for\s+\w+\s+=)" --include="*.py" -A 5 | grep -E "objects\.|Session|\.query\("
```
Heuristic: for each loop construct, check if the body contains a DB call or `await`.

**WRONG:**
```ts
const orders = await db.order.findMany({ where: { userId } });
for (const order of orders) {
  order.items = await db.orderItem.findMany({ where: { orderId: order.id } });
}
```
```python
for order in Order.objects.filter(user=user):
    items = OrderItem.objects.filter(order=order)   # one query per order
```

**CORRECT (eager load):**
```ts
const orders = await db.order.findMany({
  where: { userId },
  include: { items: true },
});
```
```python
orders = Order.objects.filter(user=user).prefetch_related('items')
```

**CORRECT (DataLoader for GraphQL):**
```ts
const orderItemsLoader = new DataLoader(async (orderIds) => {
  const items = await db.orderItem.findMany({ where: { orderId: { in: orderIds } } });
  return orderIds.map(id => items.filter(i => i.orderId === id));
});
```

**Severity:** WARNING (CRITICAL when called from a high-traffic list endpoint)

**Fix:** Use eager loading (`include`, `prefetch_related`, `select_related`, JOINs). For GraphQL, use DataLoader. Verify with `EXPLAIN ANALYZE` and query logs.

---

## Pattern 5: Missing or wildcard CORS

**Why it matters:** `Access-Control-Allow-Origin: *` with credentials enables cross-origin attacks. CORS not configured at all blocks legitimate clients.

**Grep:**
```bash
grep -rnE "(Access-Control-Allow-Origin.*?\*|origin:\s*['\"]\*['\"]|cors\(\)|cors\(\{\s*origin:\s*true)" --include="*.{ts,js,py,go,rb}"
```

**WRONG:**
```ts
app.use(cors());                                        // default origin: *
app.use(cors({ origin: true, credentials: true }));     // reflects ANY origin
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Credentials', 'true');
```

**CORRECT:**
```ts
const ALLOWED = ['https://app.example.com', 'https://admin.example.com'];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED.includes(origin)) cb(null, true);
    else cb(new Error('CORS not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));
```

**Severity:** CRITICAL (if credentialed) / WARNING (otherwise)

**Fix:** Allowlist explicit origins. Never combine `origin: *` with `credentials: true`. Document the allowlist source (env var, config file).

---

## Pattern 6: JWT without expiration

**Why it matters:** A token without `exp` is valid forever. Stolen tokens cannot be revoked without a denylist or full key rotation.

**Grep:**
```bash
grep -rnE "(jwt\.sign|signToken|JWT\.encode|jwt_encode)" --include="*.{ts,js,py,go,rb}" -A 3
```
For each `sign` call, check whether `expiresIn`, `exp`, or `expires_delta` is set.

**WRONG:**
```ts
const token = jwt.sign({ userId: user.id }, JWT_SECRET);
const token = jwt.sign({ userId: user.id }, JWT_SECRET, { algorithm: 'HS256' });
```
```python
token = jwt.encode({"user_id": user.id}, SECRET, algorithm="HS256")
```

**CORRECT:**
```ts
const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
  algorithm: 'HS256',
  expiresIn: '15m',
  audience: 'api.example.com',
  issuer: 'auth.example.com',
});
```
```python
token = jwt.encode(
    {"user_id": user.id, "exp": datetime.utcnow() + timedelta(minutes=15)},
    SECRET, algorithm="HS256",
)
```

**Severity:** CRITICAL

**Fix:** Set short access-token expiry (5-15 min). Use refresh tokens with rotation for long sessions. Verify `exp`, `aud`, and `iss` on every request.

---

## Pattern 7: JWT verified without explicit algorithm

**Why it matters:** A verifier that accepts the `alg` from the token header allows the `none` algorithm attack and HS/RS confusion attacks. The verifier must enforce an expected algorithm.

**Grep:**
```bash
grep -rnE "(jwt\.verify|verifyToken|JWT\.decode)" --include="*.{ts,js,py,go,rb}" -A 3
```
Check the `algorithms` / `algorithm` option.

**WRONG:**
```ts
jwt.verify(token, secret);                              // accepts any alg
jwt.verify(token, secret, { algorithms: ['HS256', 'none'] });
```
```python
jwt.decode(token, SECRET)                               # accepts any alg
```

**CORRECT:**
```ts
jwt.verify(token, secret, {
  algorithms: ['HS256'],
  audience: 'api.example.com',
  issuer: 'auth.example.com',
});
```
```python
jwt.decode(token, SECRET, algorithms=["HS256"], audience="api.example.com")
```

**Severity:** CRITICAL

**Fix:** Always pass an explicit `algorithms` list. Never include `none`. Verify `aud` and `iss`.

---

## Pattern 8: POST without idempotency on money path

**Why it matters:** Retry-safe POST mutations require idempotency keys. Without them, a client retry on network failure double-charges, double-orders, or double-creates.

**Grep:**
```bash
grep -rnE "(post|POST).*?(payment|charge|order|transfer|withdraw|invoice|subscription)" --include="*.{ts,js,py,go,rb}"
```
For each matching route, check the handler for `idempotencyKey`, `Idempotency-Key`, or a uniqueness constraint on a client-supplied request ID.

**WRONG:**
```ts
app.post('/payments', async (req, res) => {
  const charge = await stripe.charges.create({ amount: req.body.amount, ... });
  await db.payment.create({ data: { ...charge } });
  res.json(charge);
});
```

**CORRECT:**
```ts
app.post('/payments', async (req, res) => {
  const key = req.headers['idempotency-key'];
  if (!key) return res.status(400).json({ error: 'Idempotency-Key header required' });

  const existing = await db.idempotencyRecord.findUnique({ where: { key } });
  if (existing) return res.status(existing.statusCode).json(existing.responseBody);

  const charge = await stripe.charges.create({
    amount: req.body.amount,
    idempotency_key: key,                              // pass through to provider
  });
  const result = { id: charge.id, status: charge.status };
  await db.idempotencyRecord.create({ data: { key, statusCode: 200, responseBody: result, expiresAt: addHours(72) } });
  res.json(result);
});
```

**Severity:** CRITICAL (money paths) / WARNING (other mutations)

**Fix:** Require an `Idempotency-Key` header on all non-idempotent mutations. Store key + response with 24-72h TTL. Reject duplicate keys with stored response.

---

## Pattern 9: Missing request validation

**Why it matters:** Accepting any shape that parses as JSON allows clients to write malformed data. Database constraints may catch some, but type confusion bugs (string where number expected) often slip through.

**Grep:**
```bash
grep -rnE "(req\.body\.|request\.json\.|c\.request\.body)" --include="*.{ts,js,py,go,rb}" -A 3
```
For each handler reading `req.body`, check whether a schema validation library is invoked (`zod`, `joi`, `yup`, `ajv`, `pydantic`, `marshmallow`, `validator`).

**WRONG:**
```ts
app.post('/users', async (req, res) => {
  const user = await db.user.create({ data: req.body });   // any shape
  res.json(user);
});
```

**CORRECT:**
```ts
import { z } from 'zod';
const CreateUser = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  age: z.number().int().min(13).max(120).optional(),
});
app.post('/users', async (req, res) => {
  const parsed = CreateUser.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.flatten() });
  const user = await db.user.create({ data: parsed.data });
  res.json(user);
});
```
```python
from pydantic import BaseModel, EmailStr
class CreateUser(BaseModel):
    email: EmailStr
    name: str
    age: int | None = None

@app.post("/users")
async def create_user(body: CreateUser): ...
```

**Severity:** WARNING (CRITICAL if writing to financial/identity columns)

**Fix:** Validate every request body, query param, and path param against a typed schema at the API boundary.

---

## Pattern 10: No rate limiting on auth endpoints

**Why it matters:** Login, signup, password reset, and OTP endpoints without rate limits enable credential stuffing, enumeration, and SMS pumping attacks.

**Grep:**
```bash
grep -rnE "(login|sign[_-]?in|sign[_-]?up|register|password.*?reset|otp|verify[_-]?phone|forgot[_-]?password)" --include="*.{ts,js,py,go,rb}" -A 5
```
For each matching route, check whether a rate-limit middleware (`express-rate-limit`, `slowapi`, `django-ratelimit`, `rack-attack`, `limiter`) is applied.

**WRONG:**
```ts
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body.email, req.body.password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  res.json({ token: signToken(user) });
});
```

**CORRECT:**
```ts
import rateLimit from 'express-rate-limit';
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${req.body.email}`,
});
app.post('/login', loginLimit, async (req, res) => { /* ... */ });
```

**Severity:** CRITICAL

**Fix:** Apply rate limiting to all auth endpoints. Use both IP and identity (email/phone) as the key. Return `429` with `Retry-After` and `X-RateLimit-*` headers.

---

## Pattern 11: Missing pagination on list endpoint

**Why it matters:** A `GET /items` that returns all rows produces multi-MB responses on large tables, blows memory, and timeouts under load.

**Grep:**
```bash
grep -rnE "(findMany|find_all|all\(\)|\.find\(\{|select.*from)" --include="*.{ts,js,py,go,rb}" -A 3
```
For each query, check for `take`, `limit`, `LIMIT`, `paginate` in the same statement.

**WRONG:**
```ts
app.get('/posts', async (_req, res) => {
  const posts = await db.post.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(posts);
});
```

**CORRECT (cursor pagination — preferred):**
```ts
app.get('/posts', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const cursor = req.query.cursor as string | undefined;
  const posts = await db.post.findMany({
    take: limit + 1,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  const hasMore = posts.length > limit;
  res.json({ data: posts.slice(0, limit), nextCursor: hasMore ? posts[limit - 1].id : null });
});
```

**Severity:** WARNING (CRITICAL on tables >100k rows)

**Fix:** Default page size (e.g., 20). Cap at 100. Cursor-based pagination for tables with frequent inserts; offset-based only for stable, small data.

---

## Pattern 12: Wildcard SELECT in production code

**Why it matters:** `SELECT *` returns every column including deprecated/internal ones. Schema additions silently inflate payloads and may leak fields not intended for clients (`password_hash`, `internal_notes`).

**Grep:**
```bash
grep -rnE "SELECT\s+\*|\bselect_related\(\*\)" --include="*.{ts,js,py,go,rb,sql}"
```
ORM equivalents — `findMany({})` without `select:` is a soft form of this.

**WRONG:**
```ts
const user = await db.$queryRaw`SELECT * FROM users WHERE id = ${id}`;
const user = await db.user.findUnique({ where: { id } });   // returns ALL columns
```

**CORRECT:**
```ts
const user = await db.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true, role: true },
});
```

**Severity:** WARNING (CRITICAL if any column contains secrets like `password_hash`, `api_key`, `mfa_secret`)

**Fix:** Always specify column list. Use a serialization layer (DTO) to ensure response shape doesn't drift with schema.

---

## Pattern 13: Logging request bodies / responses with sensitive data

**Why it matters:** Logged passwords, tokens, PII land in centralized log stores accessible to engineers, often outside compliance scope. Long retention compounds the risk.

**Grep:**
```bash
grep -rnE "(log|logger|console)\.\w+\([^)]*?(req\.body|request\.body|res\.body|response)" --include="*.{ts,js,py,go,rb}"
```

**WRONG:**
```ts
app.use((req, _res, next) => { logger.info('Request', { body: req.body }); next(); });
logger.info(`Login attempt: ${JSON.stringify(req.body)}`);
```

**CORRECT:**
```ts
const REDACTED = ['password', 'token', 'mfaCode', 'ssn', 'creditCard'];
function redact(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(Object.entries(obj).map(
    ([k, v]) => [k, REDACTED.includes(k.toLowerCase()) ? '[REDACTED]' : redact(v)]
  ));
}
app.use((req, _res, next) => {
  logger.info('Request', { method: req.method, path: req.path, body: redact(req.body) });
  next();
});
```

**Severity:** CRITICAL

**Fix:** Use a logger with a built-in redaction config (pino-redact, datadog log scrubbing). Centralize redaction at the request-logger middleware.

---

## Pattern 14: Comparing tokens / hashes with `==` (timing attack)

**Why it matters:** String equality returns early on first mismatch, leaking byte-by-byte timing information. An attacker can recover a secret one byte at a time.

**Grep:**
```bash
grep -rnE "(token|hash|signature|hmac|sessionId|api[_-]?key)\s*={2,3}|secrets\.compare|crypto\.timingSafeEqual" --include="*.{ts,js,py,go,rb}"
```
Flag `==`/`===` on token-like values; pass `timingSafeEqual` matches as INFO (already correct).

**WRONG:**
```ts
if (signedToken === expected) { /* authorize */ }
if (req.headers['x-api-key'] == process.env.API_KEY) { /* authorize */ }
```
```python
if hmac.compare_digest(received, expected) == True:   # OK — compare_digest is safe
if received == expected:                              # NOT OK
```

**CORRECT:**
```ts
import { timingSafeEqual } from 'node:crypto';
const a = Buffer.from(signedToken);
const b = Buffer.from(expected);
if (a.length === b.length && timingSafeEqual(a, b)) { /* authorize */ }
```
```python
import hmac
if hmac.compare_digest(received, expected):
    ...
```

**Severity:** WARNING (CRITICAL on signed-secret verification — webhook signatures, password reset tokens)

**Fix:** Use `crypto.timingSafeEqual` / `hmac.compare_digest`. Equalize lengths before comparison.

---

## Pattern 15: Webhook signature not verified

**Why it matters:** Webhooks from third parties (Stripe, GitHub, Slack) carry an HMAC signature. Not verifying it allows anyone to POST forged events.

**Grep:**
```bash
grep -rnE "/webhook|/webhooks|/callback|/hooks" --include="*.{ts,js,py,go,rb}" -A 10
```
For each webhook route, check the handler for:
- HMAC computation (`crypto.createHmac`, `hmac.new`)
- Library-specific verification (`stripe.webhooks.constructEvent`, `Webhooks` from `@octokit/webhooks`)
- Timestamp tolerance check (replay protection)

**WRONG:**
```ts
app.post('/webhooks/stripe', async (req, res) => {
  const event = req.body;
  if (event.type === 'checkout.session.completed') {
    await fulfillOrder(event.data.object);
  }
  res.send('ok');
});
```

**CORRECT:**
```ts
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,                                                // raw body required
      req.headers['stripe-signature'] as string,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    return res.status(400).send(`Signature failed: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    await fulfillOrder(event.data.object);
  }
  res.send('ok');
});
```

**Severity:** CRITICAL

**Fix:** Verify HMAC against raw body (parsed body won't byte-match). Reject events older than 5 minutes to prevent replay. Use the provider's official library where available.

---

## Pattern 16: No timeout on outbound HTTP

**Why it matters:** Default fetch / requests have no timeout. A slow upstream cascades into request thread exhaustion, taking the service down.

**Grep:**
```bash
grep -rnE "(fetch\(|axios\.\w+\(|got\(|requests\.(get|post|put|delete)|http\.Client)" --include="*.{ts,js,py,go,rb}" -A 3
```
For each call, check for `timeout`, `signal: AbortSignal.timeout`, `timeout=N`, or `httptest.WithTimeout`.

**WRONG:**
```ts
const data = await fetch(`https://api.partner.com/x`);              // no timeout
const data = await axios.get(`https://api.partner.com/x`);          // default = none
```
```python
r = requests.get(f"https://api.partner.com/x")                      # no timeout
```

**CORRECT:**
```ts
const data = await fetch('https://api.partner.com/x', {
  signal: AbortSignal.timeout(5000),
});
const data = await axios.get('https://api.partner.com/x', { timeout: 5000 });
```
```python
r = requests.get("https://api.partner.com/x", timeout=(3, 5))   # connect, read
```

**Severity:** WARNING (CRITICAL when called on the request path)

**Fix:** Set explicit timeouts on every outbound HTTP/db call. Use a circuit breaker (`opossum`, `pybreaker`) for dependencies with known instability.

---

## Pattern 17: Unbounded queue / in-memory state

**Why it matters:** A queue without a max size, an in-memory cache without an LRU bound, or a worker pool without backpressure grows until OOM kill.

**Grep:**
```bash
grep -rnE "new Map\(\)|new Set\(\)|: Map<|: Set<|new Queue\(\)" --include="*.{ts,js}" -A 5
grep -rnE "(deque|defaultdict|dict\(\))" --include="*.py" -A 5
```
For each module-level (singleton) collection, check whether items are removed (eviction) or capped (LRU).

**WRONG:**
```ts
const cache = new Map<string, User>();          // grows forever
async function getUser(id: string) {
  if (cache.has(id)) return cache.get(id);
  const user = await db.user.findUnique({ where: { id } });
  cache.set(id, user);
  return user;
}
```

**CORRECT:**
```ts
import LRU from 'lru-cache';
const cache = new LRU<string, User>({ max: 10_000, ttl: 5 * 60_000 });
```

**Severity:** WARNING (CRITICAL on a long-running service)

**Fix:** Use bounded LRU caches (`lru-cache`, `cachetools`). Bound queues with backpressure. Add memory monitoring.

---

## Pattern 18: Missing `await` on async call

**Why it matters:** A forgotten `await` returns the Promise (not the value) and silently swallows errors. The handler responds before the work completes, and rejections become unhandled.

**Grep:**
```bash
grep -rnE "^\s+(db|prisma|model|service)\." --include="*.{ts,js}" | grep -vE "(await|return|=)"
```

**WRONG:**
```ts
async function deleteUser(id: string) {
  db.user.delete({ where: { id } });                  // returns Promise, no await
  return { ok: true };
}
```

**CORRECT:**
```ts
async function deleteUser(id: string) {
  await db.user.delete({ where: { id } });
  return { ok: true };
}
```

**Severity:** WARNING (CRITICAL when followed by code that depends on the side effect)

**Fix:** `await` every Promise. Add `@typescript-eslint/no-floating-promises` to CI. Use `Promise.allSettled` when you genuinely want concurrent fire-and-collect.

---

## Pattern 19: Error response leaks internals

**Why it matters:** Returning the raw exception, stack trace, or DB driver error to clients leaks schema, library versions, and host paths — useful reconnaissance for attackers.

**Grep:**
```bash
grep -rnE "catch.*?(err|error|e)\s*\)\s*\{" --include="*.{ts,js}" -A 5
grep -rnE "except.*?as\s+\w+" --include="*.py" -A 5
```
Check the handler — does it `res.json(err)`, `res.send(err.stack)`, `return jsonify(str(e))`?

**WRONG:**
```ts
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message, stack: err.stack });
});
```
```python
except Exception as e:
    return jsonify({"error": str(e), "traceback": traceback.format_exc()}), 500
```

**CORRECT:**
```ts
app.use((err, req, res, _next) => {
  const id = crypto.randomUUID();
  logger.error('Unhandled', { id, err, path: req.path });
  if (err instanceof KnownError) {
    return res.status(err.statusCode).json({ error: err.code, message: err.publicMessage });
  }
  res.status(500).json({ error: 'INTERNAL', message: 'An unexpected error occurred', traceId: id });
});
```

**Severity:** WARNING (CRITICAL if stack traces include credentials or internal hostnames)

**Fix:** Distinguish known (return public message) from unknown (return generic + log internally). Always log with a correlation ID; surface only the ID to clients.

---

## Pattern 20: No correlation ID / structured logging

**Why it matters:** Without a request-scoped ID propagated to every log line, debugging a single user's failure means grepping a million lines and guessing temporal correlation.

**Grep:**
```bash
grep -rlE "(request[_-]?id|correlation[_-]?id|trace[_-]?id|x-request-id)" --include="*.{ts,js,py,go,rb}"
```
If the project has logging but no correlation ID middleware → flag.

**WRONG:**
```ts
logger.info('User signed up');
logger.info(`Charging ${amount} to user ${userId}`);
```

**CORRECT:**
```ts
import { AsyncLocalStorage } from 'node:async_hooks';
const als = new AsyncLocalStorage<{ requestId: string }>();

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', requestId);
  als.run({ requestId }, next);
});

const baseLogger = pino({
  mixin: () => ({ requestId: als.getStore()?.requestId }),
});
logger.info({ userId }, 'User signed up');
```

**Severity:** WARNING

**Fix:** Generate request ID per request. Propagate via `AsyncLocalStorage` / contextvars. Include in every log line. Forward `x-request-id` to upstream services.

---

## Pattern 21: Breaking API change (field removal / type change) without versioning

**Why it matters:** Removing a field, renaming it, or changing its type breaks existing consumers built against the old contract. Versioning is the only safe path.

**Grep (run as a diff between branches):**
```bash
git diff main -- 'src/**/*.ts' '**/openapi.{yaml,yml,json}' | grep -E "^-\s*(\w+\s*[:?]|type)"
git diff main -- '**/*.proto' | grep -E "^-"
```
Static cross-revision scan: for each removed or renamed field in a response type, flag.

**WRONG (diff):**
```diff
 type UserResponse = {
   id: string;
-  email: string;
+  emailAddress: string;     // rename = breaking
-  age: number;              // removed = breaking
 }
```

**CORRECT — additive + deprecation:**
```ts
type UserResponse = {
  id: string;
  email: string;                                   // kept
  emailAddress: string;                            // new alias
  age?: number;                                    // marked optional, scheduled for removal
  /** @deprecated Use emailAddress. Removed in v2. */
};
```
Or versioned route: `/v1/users` keeps old shape; `/v2/users` returns new shape.

**Severity:** CRITICAL

**Fix:** Add new field alongside old. Mark old `@deprecated` with sunset date. Communicate to consumers. Remove only after deprecation window elapses and consumer migration confirmed.

---

## Pattern 22: Authorization check missing (BOLA / IDOR)

**Why it matters:** Broken Object-Level Authorization — the handler authenticates the user but doesn't check the user owns the resource. `GET /orders/123` returns any order regardless of who asked.

**Grep:**
```bash
grep -rnE "(req\.params\.id|request\.path_params|c\.Param)" --include="*.{ts,js,py,go,rb}" -A 5
```
For each handler reading an ID from path/query, check whether the subsequent DB call constrains by user.

**WRONG:**
```ts
app.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await db.order.findUnique({ where: { id: req.params.id } });   // no owner check
  res.json(order);
});
```

**CORRECT:**
```ts
app.get('/orders/:id', requireAuth, async (req, res) => {
  const order = await db.order.findFirst({
    where: { id: req.params.id, userId: req.user.id },          // constrained by owner
  });
  if (!order) return res.status(404).end();                     // 404 not 403 (no info leak)
  res.json(order);
});
```

**Severity:** CRITICAL (OWASP API#1)

**Fix:** Every resource read/write checks ownership or role. Use a centralized policy layer (Casbin, OSO, custom). Default 404 on auth failure (not 403) to avoid existence enumeration.

---

## Pattern 23: Open redirect

**Why it matters:** A login flow that redirects to a user-supplied URL (`?next=/path`) without validating the host can redirect to attacker-controlled domains, enabling phishing.

**Grep:**
```bash
grep -rnE "(redirect|res\.redirect|return Response\.redirect|HttpResponseRedirect)" --include="*.{ts,js,py,go,rb}" -A 3
```
Check if the destination comes from user input (req.query, req.body) without validation.

**WRONG:**
```ts
app.get('/login/callback', (req, res) => {
  res.redirect(req.query.next as string);                 // anywhere goes
});
```

**CORRECT:**
```ts
const SAFE_HOSTS = ['app.example.com'];
app.get('/login/callback', (req, res) => {
  const next = (req.query.next as string) || '/';
  try {
    const url = new URL(next, 'https://app.example.com');
    if (!SAFE_HOSTS.includes(url.host)) return res.redirect('/');
    res.redirect(url.pathname + url.search);              // path only
  } catch {
    res.redirect('/');
  }
});
```

**Severity:** WARNING (CRITICAL on auth/payment flows)

**Fix:** Validate the redirect target host against an allowlist, or use path-only redirects.

---

## Pattern 24: Cron / scheduled job without distributed lock

**Why it matters:** A "send daily digest" cron deployed across N instances sends N copies. Workers without leader election or distributed lock duplicate side effects.

**Grep:**
```bash
grep -rnE "(setInterval|node-cron|cron\.schedule|@scheduled|@Cron|APScheduler|schedule\.every)" --include="*.{ts,js,py,go,rb}" -A 5
```
For each scheduled job, check for `Redlock`, `redis.set NX`, `pg_try_advisory_lock`, leader election, or single-instance designation.

**WRONG:**
```ts
cron.schedule('0 9 * * *', async () => {
  for (const user of await db.user.findMany()) {
    await sendDigest(user);                              // runs once per replica
  }
});
```

**CORRECT (single-leader via lock):**
```ts
import Redlock from 'redlock';
const redlock = new Redlock([redisClient]);

cron.schedule('0 9 * * *', async () => {
  let lock;
  try {
    lock = await redlock.acquire(['cron:daily-digest'], 60_000);
    for (const user of await db.user.findMany()) await sendDigest(user);
  } catch (e) {
    if (e.name !== 'LockError') throw e;
    // another instance won — skip
  } finally {
    await lock?.release();
  }
});
```

**Severity:** WARNING (CRITICAL when side effects are user-visible: emails, charges, notifications)

**Fix:** Acquire a distributed lock before running the job, or designate a single "scheduler" instance via deployment config. Better: move to a job queue (BullMQ, Sidekiq, Celery) that handles dedup.

---

## Pattern 25: No database transaction across related writes

**Why it matters:** Creating a user + their default workspace in two separate queries means a failure between leaves orphaned state. Transactional integrity requires explicit transactions.

**Grep:**
```bash
grep -rnE "await db\.\w+\.create" --include="*.{ts,js}" -B 2 -A 5 | grep -c "await db"
grep -rnE "\.save\(\)" --include="*.py" -A 5
```
Heuristic: multiple sequential DB writes in the same function without `$transaction`, `with transaction.atomic()`, or `BEGIN/COMMIT`.

**WRONG:**
```ts
const user = await db.user.create({ data: { email } });
const workspace = await db.workspace.create({ data: { name: 'My space', ownerId: user.id } });
await db.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
// failure between any step leaves partial state
```

**CORRECT:**
```ts
await db.$transaction(async (tx) => {
  const user = await tx.user.create({ data: { email } });
  const workspace = await tx.workspace.create({ data: { name: 'My space', ownerId: user.id } });
  await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
});
```
```python
with transaction.atomic():
    user = User.objects.create(email=email)
    ws = Workspace.objects.create(name='My space', owner=user)
    Membership.objects.create(user=user, workspace=ws, role='OWNER')
```

**Severity:** WARNING (CRITICAL on financial or identity flows)

**Fix:** Wrap multi-write operations in a transaction. For cross-service writes, use the outbox pattern or saga.

---

## Pattern 26: Health check uses business endpoint

**Why it matters:** A k8s readiness probe hitting `/api/products` triggers a real DB query every N seconds. Under load, the probe itself becomes a noisy neighbor.

**Grep:**
```bash
grep -rnE "(/health|/healthz|/ready|/readiness|/liveness)" --include="*.{ts,js,py,go,rb,yaml,yml}"
```
If no dedicated health route exists, and the deployment manifest references a business endpoint → flag.

**WRONG (k8s manifest):**
```yaml
readinessProbe:
  httpGet: { path: /api/products, port: 8080 }
```

**CORRECT:**
```yaml
livenessProbe:
  httpGet: { path: /healthz, port: 8080 }
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /readyz, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 5
```
```ts
app.get('/healthz', (_req, res) => res.json({ ok: true }));   // liveness — process up
app.get('/readyz', async (_req, res) => {                     // readiness — dependencies up
  try {
    await db.$queryRaw`SELECT 1`;
    await redisClient.ping();
    res.json({ ok: true });
  } catch (err) {
    res.status(503).json({ ok: false, error: err.message });
  }
});
```

**Severity:** WARNING

**Fix:** Distinguish liveness (process alive) from readiness (dependencies healthy). Health endpoints bypass auth and skip business logic.

---

## Pattern Summary Table

| # | Pattern | Mode | Severity |
|---|---------|------|----------|
| 1 | SQL string concat / template literal | SECURITY_AUDIT | CRITICAL |
| 2 | Command exec with user input | SECURITY_AUDIT | CRITICAL |
| 3 | Hardcoded secret in source | SECURITY_AUDIT | CRITICAL |
| 4 | N+1 query | N_PLUS_ONE_AUDIT | WARNING |
| 5 | Missing / wildcard CORS | SECURITY_AUDIT | CRITICAL/WARNING |
| 6 | JWT without expiration | AUTH_AUDIT | CRITICAL |
| 7 | JWT verified without explicit alg | AUTH_AUDIT | CRITICAL |
| 8 | POST without idempotency on money path | IDEMPOTENCY_AUDIT | CRITICAL |
| 9 | Missing request validation | CONTRACT_AUDIT | WARNING |
| 10 | No rate limit on auth | RATE_LIMIT_AUDIT | CRITICAL |
| 11 | Missing pagination | CONTRACT_AUDIT | WARNING |
| 12 | Wildcard SELECT | SECURITY_AUDIT | WARNING |
| 13 | Logging sensitive data | OBSERVABILITY_AUDIT | CRITICAL |
| 14 | Token compared with `==` | SECURITY_AUDIT | WARNING |
| 15 | Webhook signature unchecked | SECURITY_AUDIT | CRITICAL |
| 16 | No outbound timeout | RELIABILITY_AUDIT | WARNING |
| 17 | Unbounded queue / cache | RELIABILITY_AUDIT | WARNING |
| 18 | Missing `await` | RELIABILITY_AUDIT | WARNING |
| 19 | Error response leaks internals | SECURITY_AUDIT | WARNING |
| 20 | No correlation ID / structured logs | OBSERVABILITY_AUDIT | WARNING |
| 21 | Breaking API change | CONTRACT_AUDIT | CRITICAL |
| 22 | Missing authz check (IDOR/BOLA) | AUTH_AUDIT | CRITICAL |
| 23 | Open redirect | SECURITY_AUDIT | WARNING |
| 24 | Cron without distributed lock | RELIABILITY_AUDIT | WARNING |
| 25 | No transaction across related writes | RELIABILITY_AUDIT | WARNING |
| 26 | Health check hits business endpoint | OBSERVABILITY_AUDIT | WARNING |

## Scoring

```
score = 100
for each CRITICAL: score -= 20
for each WARNING:  score -= 5
for each INFO:     score -= 1
score = max(score, 0)
```

| Score | Status | Action |
|-------|--------|--------|
| 90-100 | PASS | Safe to deploy |
| 70-89 | CONDITIONAL | Address WARNINGs before next release |
| 50-69 | FAIL | Resolve CRITICALs before further development |
| 0-49 | FAIL_SEVERE | Comprehensive security/reliability review required |

## NR-SAFE Annotations

Mark intentional exceptions with `// NR-SAFE: [reason]` (or `# NR-SAFE: [reason]`). The auditor downgrades the finding to INFO and records the exemption.

```ts
// NR-SAFE: internal admin endpoint, behind VPN allowlist
app.get('/admin/raw-query', requireAdmin, async (req, res) => { ... });
```

## Integration with nr-api-auditor

This file is loaded by `agents/nr-api-auditor.md`. The auditor runs each grep, performs the context check (false-positive guard), classifies severity, and writes the structured report to `.planning/audit/AUDIT-API-{MODE}-{timestamp}.md`.
