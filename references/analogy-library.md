# Analogy Library — Cross-Domain Parallels for Lateral Reasoning

## Purpose

Curated pool of structural parallels between software problems and non-software domains. Used by `references/lateral-reframings.md` Primitive 1 (Analogical Transfer).

**The bet:** the LLM has read all these source domains. The framing just doesn't reach for them by default. An explicit reach-for target makes analogies surface every time, not just when the model happens to remember.

**Each entry includes:**
- **Software primitive** — the named pattern in our world
- **Source domain** — the field we're importing from
- **Source mechanism** — what they actually do, mechanistically
- **What transfers** — the abstract structural pattern
- **What does NOT transfer** — the surface detail that does not generalize
- **Worked application** — one concrete software adaptation

**How to use this file:** When `lateral-reframings.md` Primitive 1 fires, scan this file for entries indexed by your problem's primitive. Pick 2-3 candidates. Apply the Primitive 1 template. If none fit, generate a new analogy (and add it back to this file).

This is a seed library. It grows as the user accumulates working analogies via `references/creative-precedent.md`.

---

## Index by Software Primitive

| Software primitive | Entries below |
|---|---|
| Cache / state management | 1, 2, 3, 4 |
| Concurrency / coordination | 5, 6, 7, 8, 9 |
| Data storage / consistency | 10, 11, 12, 13 |
| API / protocol design | 14, 15, 16, 17, 18 |
| Performance / optimization | 19, 20, 21, 22, 23 |
| Auth / security | 24, 25, 26, 27, 28 |
| Reliability / failure handling | 29, 30, 31, 32, 33 |
| UI / UX patterns | 34, 35, 36, 37 |
| System architecture | 38, 39, 40, 41 |
| Algorithms / search | 42, 43, 44 |
| Process / team / governance | 45, 46, 47, 48 |

---

## Cache / State Management

### 1. Cache invalidation ↔ Cellular apoptosis

- **Source domain:** Cell biology
- **Source mechanism:** Cells carry intrinsic death timers (telomere shortening, mitochondrial damage accumulation) AND listen for extrinsic "die now" signals (death receptors, withdrawal of survival factors). No central registry decides who dies; each cell self-determines using local state and ambient signals.
- **What transfers:** Distributed self-invalidation > centralized invalidation tracking. Each cache entry carries its own lifetime budget plus listens for ambient "you're stale" signals.
- **What does NOT transfer:** Apoptosis is irreversible; cache entries can be soft-deleted and resurrected.
- **Application:** TTL + sliding window with "warm on read" survival signal, instead of a central invalidation event bus. Lower coordination cost, weaker freshness — pick when reads are cheap and stale-but-eventually-correct is acceptable.

### 2. Memoization ↔ Chess opening books

- **Source domain:** Competitive chess
- **Source mechanism:** Master-level players memorize the first 10-20 moves of common openings — positions analyzed centuries ago. They play opening moves nearly instantly from book, then switch to slow deep search when the position leaves "book" (drops into novelty).
- **What transfers:** Two-mode computation. Stable, well-characterized inputs use precomputed answers; novel inputs trigger expensive computation. The expensive mode contributes back to the book when its result is reusable.
- **What does NOT transfer:** Chess openings are agreed-upon canon; software memoization is per-process and not shared by default.
- **Application:** Hybrid cache + compute. Hash on input; book-lookup for known inputs; fallback to compute; promote frequently-recomputed inputs into the book. Distinguish "out of book" cases for observability ("we're playing novel positions" = the cache is doing nothing).

### 3. Stale-while-revalidate ↔ Journalism (publish first, fact-check while readers consume)

- **Source domain:** News operations
- **Source mechanism:** Breaking news goes out fast with a "developing" tag; fact-checking continues in the background; the story updates in place as new information arrives. Readers consume the current best version; the editor improves it.
- **What transfers:** Latency optimization at the cost of momentary inconsistency. Serve "best current answer" immediately; correct asynchronously.
- **What does NOT transfer:** News organizations explicitly tag uncertainty; caches usually don't surface staleness to consumers.
- **Application:** SWR / HTTP `stale-while-revalidate`. Combined with explicit staleness headers, lets clients display "this data may be a few minutes old" — turning the staleness from a bug into a UX affordance.

### 4. Cache warming ↔ Priming the pump

- **Source domain:** Mechanical engineering (well pumps)
- **Source mechanism:** A reciprocating pump can't suck water from a well until its chamber is full of water to push against. Operators pour water in *before* starting the pump — sacrificing some water to create the seal that lets the pump work.
- **What transfers:** Some systems perform terribly until they hold enough state. The initial state has to be paid for explicitly rather than expected to emerge.
- **What does NOT transfer:** Pump priming is a one-time event per pump start; cache warming may be ongoing.
- **Application:** Pre-deploy cache hydration — run synthetic traffic against the new instance before routing real users to it. Sacrifices N seconds of compute to avoid serving N minutes of slow responses.

---

## Concurrency / Coordination

### 5. Distributed consensus ↔ Bee swarm voting (quorum sensing)

- **Source domain:** Apidae (honeybees) selecting a new hive site
- **Source mechanism:** Scout bees independently inspect candidate sites, return, and waggle-dance with intensity proportional to site quality. Other scouts visit highly-danced sites; consensus emerges when a quorum of scouts at a single site reaches threshold. Then the swarm moves. No central authority — local interactions and a quorum threshold.
- **What transfers:** Decentralized convergence via repeated independent observation + intensity-weighted broadcast + quorum threshold. No leader required.
- **What does NOT transfer:** Bees have millions of years of co-evolution to tune the protocol; distributed systems often need explicit failure modes (Byzantine).
- **Application:** Gossip protocols, eventual consistency systems with read-repair, leaderless replication (Cassandra, Riak). Especially useful when "no node is special" is a deployment goal.

### 6. Optimistic locking ↔ Retail checkout

- **Source domain:** Brick-and-mortar shopping
- **Source mechanism:** Everyone walks the aisles grabbing items off shelves. Conflicts (two people want the last one) resolve at the register or via "we'll have to put one back." The system does not lock the shelf to one shopper at a time.
- **What transfers:** Optimistic concurrency: assume conflict is rare; let many parties proceed; detect-and-resolve at commit. Saves the coordination cost when the contention rate is low.
- **What does NOT transfer:** Retail aisles have physical scarcity; database rows can be re-read.
- **Application:** Version-numbered optimistic update — read the version, propose the update, abort if the row has changed since. Pair with retry. Works when conflicts are <5% of writes.

### 7. Backpressure ↔ Ramp metering on freeways

- **Source domain:** Traffic engineering
- **Source mechanism:** On-ramp traffic lights pulse green at intervals tuned to the freeway's measured throughput. When freeway throughput is healthy, ramp throughput is high; when freeway nears congestion, ramp meters slow. The local cost (waiting at the ramp) prevents the global collapse (gridlock).
- **What transfers:** Admission control at producers, paced by consumer capacity. Local backup is preferred over global meltdown.
- **What does NOT transfer:** Cars don't drop; messages can. Different protocols (back off vs drop vs route around) emerge based on this difference.
- **Application:** Producer-side rate limiting that responds to downstream signal — circuit breaker tripping back-pressures the upstream queue. Pair with deadline propagation so producers know when their work has become useless.

### 8. Circuit breaker ↔ Electrical panel breakers

- **Source domain:** Residential electrical wiring
- **Source mechanism:** A breaker between mains and a load opens (trips) when current exceeds rated capacity, protecting the load and the wiring. It stays open until manually reset. Some "self-resetting" breakers close after a timeout to test whether the fault has cleared.
- **What transfers:** Three states (closed/healthy, open/tripped, half-open/probing). Trip on threshold breach; reset on probing success.
- **What does NOT transfer:** Electrical faults are usually persistent until repair; software faults may be transient (a single bad pod, a brief network blip). The half-open probe is more important in software than in panels.
- **Application:** Resilience4j / Polly / Hystrix-style circuit breakers around flaky downstream calls. Especially valuable on the critical request path; less valuable on background workers (where simple retry-with-backoff often suffices).

### 9. Bulkhead pattern ↔ Ship compartmentalization

- **Source domain:** Naval architecture
- **Source mechanism:** Ship hulls are divided into watertight compartments by bulkheads. A breach floods one compartment; the others stay dry and the ship stays afloat. The Titanic counter-example: bulkheads that didn't extend high enough let water spill over and successively flood compartments.
- **What transfers:** Isolate failures so one bad component can't drown the system. Resource pools sized per compartment.
- **What does NOT transfer:** Ship bulkheads are physical and fixed at construction; software bulkheads can be sized dynamically. But the Titanic lesson translates: a bulkhead that *almost* contains failure is worse than a smaller bulkhead that fully contains it.
- **Application:** Per-tenant thread pools / connection pools / memory budgets. One noisy tenant can't starve the others. Size budgets so the worst-case noisy tenant cannot exceed its compartment.

---

## Data Storage / Consistency

### 10. Schema migration ↔ Surgical anesthesia

- **Source domain:** Medicine
- **Source mechanism:** Anesthesiology distinguishes induction (going under), maintenance (staying under), and emergence (waking up). Each phase has its own protocols, monitoring, and risk profile. The patient is most vulnerable at induction and emergence.
- **What transfers:** Migrations have phases with different risk profiles. The "switch to new schema" moment is the analog of emergence — high-risk, requires monitoring, has rollback plans.
- **What does NOT transfer:** Patients aren't reversible; data isn't either, but rollback is more available.
- **Application:** Expand-contract migration with explicit phases — add new column (induction), backfill (maintenance), switch reads (emergence), drop old column (recovery). Don't try to do all four in one deploy.

### 11. Eventual consistency ↔ Wedding seating arrangements

- **Source domain:** Event coordination
- **Source mechanism:** Wedding planners don't ask guests "where will you sit" in real-time; they accept RSVPs, group them, and finalize seating only at the end. Some guests rearrange themselves at the venue; the system converges by reception time.
- **What transfers:** Acceptance of intermediate inconsistency in exchange for lower coordination cost. The system has a convergence deadline (the actual event).
- **What does NOT transfer:** Wedding seating converges to a fixed final state; eventual-consistent systems may never reach a single "final" state because writes keep happening.
- **Application:** CRDTs and last-write-wins reconciliation. Useful when "we agree eventually" is acceptable. Less useful for inventory or money (where the convergence cost is too high).

### 12. Append-only logs ↔ Ship's log

- **Source domain:** Nautical record-keeping
- **Source mechanism:** A ship's log is written line by line, never erased. To "correct" an earlier entry, you write a new entry that references and supersedes it. The original entry remains visible. Auditable, forensic-quality, and recoverable from any point.
- **What transfers:** Immutability as the storage primitive; "edits" are new entries.
- **What does NOT transfer:** A ship's log is read in time order start-to-current; a software append-only log usually has indexes for non-temporal access.
- **Application:** Event sourcing, audit logs, accounting ledgers. The current state is derivable from the log; the log is the source of truth. Pair with snapshot tables for query performance.

### 13. Sharding ↔ Legal jurisdictions

- **Source domain:** Law
- **Source mechanism:** Each court has exclusive jurisdiction over cases in its geography or domain. Cases don't migrate between courts; cross-jurisdictional cases require explicit coordination (treaties, extradition, federal-vs-state).
- **What transfers:** Ownership-by-key partitioning. Each shard owns its keyspace absolutely; cross-shard operations are expensive and explicit.
- **What does NOT transfer:** Legal jurisdictions don't rebalance load when one court is overwhelmed; database shards can be resplit.
- **Application:** Consistent hashing for shard placement. Foreign-key relationships either co-located (in the same shard) or denormalized. Treat cross-shard transactions as exceptional, never as default.

---

## API / Protocol Design

### 14. API versioning ↔ Genetic code degeneracy

- **Source domain:** Molecular biology
- **Source mechanism:** Multiple codons (DNA triplets) encode the same amino acid (e.g., UUU and UUC both code for phenylalanine). This redundancy means most single-letter mutations are silent — the protein doesn't change. Evolution proceeds by exploration that's mostly buffered.
- **What transfers:** Robustness via redundant equivalent forms. New API versions can coexist with old, both producing the same downstream effect, while the system explores variations safely.
- **What does NOT transfer:** Codon degeneracy is fixed by chemistry; API redundancy is by deliberate choice and has maintenance cost.
- **Application:** Maintain v1 and v2 of an endpoint in parallel during migration. Both write through a translation layer to one canonical internal representation. Consumers upgrade asynchronously.

### 15. Retry policy ↔ Antibiotic stewardship

- **Source domain:** Infectious disease medicine
- **Source mechanism:** Antibiotic protocols escalate deliberately: first-line drug for N days; if fever persists, switch to broader-spectrum; if still failing, culture-guided narrow-spectrum. Each step trades off effectiveness against resistance development and patient harm.
- **What transfers:** Escalation ladder with explicit transitions. Not just "retry"; *what kind* of retry, at what interval, with what fallback.
- **What does NOT transfer:** Bacteria evolve resistance; downstream services don't (usually). But the meta-lesson — "every retry has a cost beyond compute" — does translate: retry storms are real.
- **Application:** Exponential backoff with circuit breaker, jitter to avoid thundering herd, distinct retry policies for distinct error classes (4xx-retryable vs 5xx-retryable). Cap total retry budget per request.

### 16. Webhook delivery ↔ Certified mail with return receipt

- **Source domain:** Postal systems
- **Source mechanism:** Certified mail records that a letter was sent; return receipt records that the recipient received it (signed acknowledgment). If the receipt doesn't come back, the sender knows delivery is uncertain — can retry, can route differently.
- **What transfers:** Acknowledged delivery semantics. Sender retries until receipt or timeout. Both ends keep evidence.
- **What does NOT transfer:** Postal mail is once-per-letter; webhooks can fire many times for one logical event. Idempotency on the receiver side becomes mandatory.
- **Application:** Webhook delivery with HMAC signature, retry on non-2xx, dead-letter queue after N attempts. Receiver must dedupe on event ID. Tooling to replay failed deliveries.

### 17. Rate limiting ↔ Amusement park queues

- **Source domain:** Theme park operations
- **Source mechanism:** Disney's FastPass / Genie+ partitions ride access into standby queue (free, slow) and reservation (paid or scarce, fast). Some rides have "single rider" lines for solo guests willing to be unpaired. The park optimizes for throughput (rides per hour) and revenue per guest simultaneously.
- **What transfers:** Multi-tier admission with explicit trade-offs between fairness, throughput, and revenue. Different lines for different users.
- **What does NOT transfer:** Theme park guests are present in real-time; API consumers are not, so "single rider"-style opportunism doesn't translate as cleanly.
- **Application:** Tiered rate limits — free tier (slow, generous burst), paid tier (faster sustained), enterprise (negotiated). Within a tier, distinguish bursts (allowed) from sustained load (limited). Surface remaining quota in response headers.

### 18. Idempotency keys ↔ Bank check serial numbers

- **Source domain:** Banking
- **Source mechanism:** Each check has a unique serial number. If a check is presented twice (lost in the mail, then found and re-presented), the bank detects the duplicate via serial number and rejects the second. The check serial is the deduplication key.
- **What transfers:** Client-generated unique identifier that the server uses to detect retries. Server stores the first result and returns it for any subsequent presentation of the same key.
- **What does NOT transfer:** Bank checks are physical and self-numbering; API clients must remember to send the key.
- **Application:** `Idempotency-Key` header on POST/PATCH for money/identity/state-changing operations. Server stores key + response with TTL (24-72h). Reject duplicate keys with stored response.

---

## Performance / Optimization

### 19. Bundle splitting ↔ Newspaper above-the-fold layout

- **Source domain:** Print journalism
- **Source mechanism:** Newspapers print the most attention-grabbing content above the fold (visible when the paper is folded on a newsstand). Less critical content goes inside. The fold is a forced split between "what you see immediately" and "what you see if you decide to engage further."
- **What transfers:** Initial-render prioritization. Optimize for first-meaningful-paint on the visible viewport; defer everything else.
- **What does NOT transfer:** Print layout is one-shot at press time; web layout is adaptive — different viewports have different folds.
- **Application:** Critical CSS inlined; route-level code splitting with `<Suspense>`; image `loading="lazy"` for below-fold images. Pair with bundle analyzer to verify what's actually in the initial bundle vs deferred chunks.

### 20. Lazy loading ↔ Progressive disclosure in interior design

- **Source domain:** Architecture / interior design
- **Source mechanism:** Good homes don't reveal their full layout from the entrance. Hallways turn, rooms open progressively, the experience unfolds as the visitor advances. The cognitive load at any moment stays bounded.
- **What transfers:** Reveal complexity in the order the user can absorb it. Hide structure that isn't immediately relevant.
- **What does NOT transfer:** Houses have spatial constraints; software does not. The temptation is to lazy-load everything; the right answer is to lazy-load what's *not immediately needed*.
- **Application:** Lazy-load routes (not initial route), modals, charts, rich text editors. Keep the first paint synchronous. Measure: did the deferred content arrive *before* the user needed it?

### 21. Profile-guided optimization ↔ Traffic study before road redesign

- **Source domain:** Civil engineering
- **Source mechanism:** Before redesigning an intersection, traffic engineers spend weeks counting cars by direction, time of day, vehicle type. The design then optimizes for *measured* peak load, not assumed peak.
- **What transfers:** Profile production workloads before optimizing. The intuition about hot paths is usually wrong; the profiler is usually right.
- **What does NOT transfer:** Traffic patterns shift slowly (years); software workloads can shift in hours. Re-profile after major changes.
- **Application:** Profile in production (with sampling, not full tracing — sampled flame graphs cost ~1% CPU). Decide which functions deserve manual optimization based on actual time spent, not theory.

### 22. Cold-start hydration ↔ Aircraft engine spool-up

- **Source domain:** Aviation
- **Source mechanism:** Jet engines need a startup sequence: APU feeds bleed air to start the main engine, which spools up to idle, then idle to takeoff thrust. The sequence takes minutes; you don't start the engine the moment you board.
- **What transfers:** Cold systems have minimum-time-to-readiness that resists shortcuts. The right move is parallel pre-warming, not "make the cold start fast."
- **What does NOT transfer:** Aircraft engines have ground crews; software cold starts often happen in production traffic.
- **Application:** Pre-warmed worker pools (Lambda provisioned concurrency, container pre-pulls). Health probes that gate traffic until warm-up completes. Measure cold-start as a separate metric from steady-state latency.

### 23. Tree shaking ↔ Marie Kondo decluttering

- **Source domain:** Home organization
- **Source mechanism:** "Does this item spark joy?" — pick up each item, ask, discard if no. The criterion is per-item and use-relevant; the elimination is by inspection, not by category.
- **What transfers:** Per-export liveness analysis. Each named import is asked "are you used?" — if no, it doesn't make it into the bundle.
- **What does NOT transfer:** Tree shaking is automatic; Marie Kondo requires human judgment. But the meta-lesson translates: defaults that include everything are worse than defaults that include only what's reached.
- **Application:** ES modules + named imports. `import { x } from 'lib'` shakes; `import * as lib from 'lib'` does not. Verify with bundle analyzer that unused code is actually gone.

---

## Auth / Security

### 24. JWT with refresh ↔ Hotel keycards

- **Source domain:** Hospitality
- **Source mechanism:** A guest's keycard expires at noon checkout. To extend, the guest visits the front desk and gets the card re-encoded — short trip, simple verification of identity. The keycard itself never knows the new expiry; it's overwritten.
- **What transfers:** Short-lived credential + long-lived "I can get a new one" mechanism. Compromise of a stolen keycard is bounded by expiry; compromise of the front desk is the real failure mode.
- **What does NOT transfer:** Hotels have physical front desks; software auth servers can be compromised remotely. Refresh-token rotation (single-use refresh tokens) addresses this.
- **Application:** Short access token (5-15 min) + refresh token (longer-lived, single-use). On refresh, issue new pair; invalidate old refresh. Detected reuse of an old refresh token signals compromise.

### 25. Capability tokens ↔ Movie ticket stubs

- **Source domain:** Cinemas
- **Source mechanism:** A ticket stub proves you paid for *this* showing. It doesn't carry your identity; it carries an entitlement. The ticket-taker verifies entitlement, not identity. Lost ticket = lost entitlement, no recovery.
- **What transfers:** Authorization decoupled from authentication. The token grants a specific capability; the bearer doesn't need to prove who they are, only that they hold the token.
- **What does NOT transfer:** Movie tickets are bearer instruments without revocation; software capability tokens often need revocation lists.
- **Application:** Signed URLs for object storage. Pre-signed link to a specific file with a specific expiry. No further auth check. Useful for "share this with whoever I send this link to" semantics.

### 26. Defense in depth ↔ Medieval castle design

- **Source domain:** Military architecture
- **Source mechanism:** A castle has multiple successive defenses: moat, curtain wall, gatehouse with murder holes, inner bailey, keep. An attacker breaching one layer faces the next. No single defense is expected to hold; the system holds by layering.
- **What transfers:** Layered defenses with the expectation that any single layer can fail. Each layer slows or detects intrusion.
- **What does NOT transfer:** Castle layers are sequential in space; security layers are often parallel in time (network, host, app, data). All layers active simultaneously.
- **Application:** WAF + rate limit + auth + RBAC + input validation + parameterized queries + DB constraints. An attacker breaching the WAF still faces auth; breaching auth still faces RBAC; etc. Pair with monitoring at each layer.

### 27. Zero trust ↔ TSA airport screening

- **Source domain:** Aviation security
- **Source mechanism:** Every passenger goes through screening, regardless of who they are or where they came from. The system assumes the threat could be anyone and verifies at every gate. The cost is added latency for every traveler.
- **What transfers:** Re-verify at every trust boundary. No "we already verified at the network edge" — verify at the service, at the data layer, at the file access.
- **What does NOT transfer:** TSA screening is uniform and slow; zero-trust services can use cached cryptographic proofs to keep latency low.
- **Application:** Service mesh with mTLS between services; per-request short-lived service tokens; data access control at the data layer not the gateway. Network position grants no privilege.

### 28. Salting passwords ↔ Adding unique grain to soup recipes

- **Source domain:** Cooking
- **Source mechanism:** Two restaurants making "the same" soup add their own salt levels and aromatics. A regular at one restaurant can't recognize the soup at the other from taste alone, even though the base recipe is the same. The unique seasoning makes each restaurant's output distinct.
- **What transfers:** Per-instance variation that prevents bulk identification. Two users with identical passwords produce different stored hashes.
- **What does NOT transfer:** Soup seasoning is per-restaurant; password salts are per-user.
- **Application:** Random salt per password, stored alongside the hash. Pre-computed rainbow tables become useless. Pair with a slow hash function (bcrypt, argon2) and a cost factor tuned to acceptable login latency.

---

## Reliability / Failure Handling

### 29. Graceful degradation ↔ Airline boarding when overbooked

- **Source domain:** Airlines
- **Source mechanism:** When a flight is oversold, the airline doesn't refuse to fly. They offer voluntary bumps with compensation, escalate to involuntary if needed, and as a last resort bump the lowest-priority passengers. The plane still flies; some passengers fly later.
- **What transfers:** Under load, degrade specific user experiences rather than failing the whole system. Make the degradation explicit and recoverable.
- **What does NOT transfer:** Airlines have legal compensation requirements; software graceful degradation often happens silently.
- **Application:** Under load: serve stale cache, disable optional features (recommendations, search), queue rather than reject. Surface the degradation to operators via metrics, and ideally to users via UI ("Real-time updates paused").

### 30. Chaos engineering ↔ Fire drills

- **Source domain:** Building safety
- **Source mechanism:** Scheduled fire drills test evacuation procedures under low-stakes conditions. Failures (jammed exit, missing fire warden) are discovered when the building is safe to learn from. Real fires then encounter a practiced response.
- **What transfers:** Deliberately inject failures during quiet periods to verify recovery. Discover broken recovery mechanisms before they're needed.
- **What does NOT transfer:** Fire drills are predictable; production chaos is more useful when partly randomized.
- **Application:** Scheduled "game days" where the team intentionally degrades a service and practices response. Automated chaos in pre-prod (Litmus, Gremlin) to verify infrastructure assumptions. Don't run chaos in prod until pre-prod chaos passes consistently.

### 31. Health checks ↔ Pulse monitoring in ICU

- **Source domain:** Critical care medicine
- **Source mechanism:** ICU patients have multiple continuous monitors (ECG, pulse ox, blood pressure, temperature). Each measures a different aspect of "alive and well." A drop in one triggers investigation; multiple drops trigger intervention.
- **What transfers:** Multi-signal liveness. No single check is sufficient; the combination of checks distinguishes "process running" from "process running and serving traffic correctly."
- **What does NOT transfer:** ICU patients can be touched and observed in person; production services cannot. Probes must be designed to be lie-resistant.
- **Application:** Separate liveness (process up) from readiness (dependencies OK from this pod). Probe with timeout shorter than the failure-detection window. Avoid probes that depend on the same code path as user traffic (or you learn nothing extra).

### 32. Dead letter queues ↔ Post office return-to-sender

- **Source domain:** Postal systems
- **Source mechanism:** Mail that can't be delivered (bad address, postage due, undeliverable) goes to a dead-letter office. Some is returned; some is destroyed; some is investigated. The mail system doesn't keep trying the same address forever.
- **What transfers:** Bounded retry; failures park in a place where they can be inspected, replayed, or discarded without blocking the main flow.
- **What does NOT transfer:** Postal mail is one-shot; software failures may be transient. Replay is often the right next step.
- **Application:** Worker queue with max-retry; on exhaustion, move to DLQ. Operator tools to inspect DLQ items, replay them, or reject them. Alert on DLQ depth > N to surface systemic problems early.

### 33. Saga pattern ↔ Travel itinerary cancellation

- **Source domain:** Travel
- **Source mechanism:** A multi-leg trip (flight + hotel + car) booked in sequence. If hotel-booking fails after flight-booking succeeded, the flight needs an explicit cancellation, not a rollback (no airline supports "undo a confirmed booking" atomically). Each step has a known compensating action.
- **What transfers:** Distributed "transactions" via compensating actions, not via two-phase commit. Each step knows how to undo itself.
- **What does NOT transfer:** Travel cancellations may incur fees; software compensations are often free, which makes the saga more usable.
- **Application:** Multi-service workflows (order + payment + inventory + shipping) with explicit compensation handlers. Frameworks: Temporal, AWS Step Functions, Cadence. Trade strict consistency for operational tractability.

---

## UI / UX Patterns

### 34. Skeleton screens ↔ Blueprints during construction

- **Source domain:** Architecture / construction
- **Source mechanism:** A construction site posts the architect's rendering of the finished building. Passers-by can see what's coming even while the actual building is half-finished. The rendering manages expectations and signals progress.
- **What transfers:** Show the structure of the answer before the data arrives. The user's perception of speed depends on when the page starts looking like the answer, not when data fully loads.
- **What does NOT transfer:** Construction renderings don't update in real time; UI skeletons fade in real content.
- **Application:** Skeleton placeholders with the rough shape of the eventual content (paragraph-sized blocks for text, square placeholders for images). Critical: the skeleton's layout must match the eventual layout, or you've created CLS.

### 35. Optimistic UI ↔ Verbal "yes, I'll do it"

- **Source domain:** Conversation
- **Source mechanism:** When asked to do something, people often say "yes" immediately, then go do it. The verbal commitment lands before the action completes. If the action fails, an explicit "actually, I couldn't" follows.
- **What transfers:** Show success in the UI before the network round-trip completes. Reconcile if the server disagrees.
- **What does NOT transfer:** Verbal commitments are between trusted parties; optimistic UI must handle adversarial cases (server rejects the change due to permissions).
- **Application:** Immediate UI update on click; queued mutation; rollback with explanation on server rejection. Pair with a queue indicator ("syncing...") so the user knows real-world state may lag UI state.

### 36. Toast notifications ↔ Pneumatic tube messaging

- **Source domain:** Office systems (pre-email)
- **Source mechanism:** Pneumatic tubes carried short messages between floors of a building. The message was transient, didn't require reply, and didn't accumulate (it arrived, was read, was discarded).
- **What transfers:** Ephemeral notifications that don't accumulate in an inbox. Surface, decay, disappear.
- **What does NOT transfer:** Pneumatic messages were synchronous (someone caught the canister); toasts are async (the user may not be looking).
- **Application:** 3-5 second toasts for success/info, longer for error. Action toasts ("undo") with explicit dismissal. Don't use toasts for critical info that must persist — use a banner or modal.

### 37. Form validation ↔ Pre-flight checklists

- **Source domain:** Aviation
- **Source mechanism:** Pilots run through structured checklists before takeoff. Each item is binary, named, and verified by the pilot stating the value aloud. The checklist surfaces both expected items ("flaps?") and unexpected anomalies ("does this look right?").
- **What transfers:** Pre-submission verification of all required state. Surface specific failures, not generic "form invalid."
- **What does NOT transfer:** Pre-flight checklists are verbal and human-driven; form validation is automated. The automation can be exhaustive in ways pilots can't be.
- **Application:** Inline validation as the user types (debounced); on-submit re-validation as the final guard; field-specific error messages. Reserve "form has errors" for the focus-summary, not the only feedback.

---

## System Architecture

### 38. Microservices vs monolith ↔ Specialized restaurants vs all-you-can-eat buffet

- **Source domain:** Restaurant operations
- **Source mechanism:** A specialized restaurant (sushi-only) optimizes deeply for one cuisine, has a small menu, can scale its kitchen for that menu's load profile, and fails gracefully (sushi unavailable doesn't break the burger place across the street). An all-you-can-eat buffet has one giant kitchen serving everything, with shared infrastructure, easier coordination, but cascading failure (a power outage takes down the whole buffet).
- **What transfers:** The trade is operational independence (microservices, restaurants) vs operational simplicity (monolith, buffet). Right answer depends on team size, scaling needs, and failure tolerance.
- **What does NOT transfer:** Restaurants in a food court share the building, not the kitchen; microservices share the network, not the process. Network is a sharper boundary than building.
- **Application:** Don't start with microservices; start with a well-modularized monolith. Split out a service when *operational* concerns (deploy cadence, team ownership, scaling profile) actually diverge. "Microservices for code organization" is a category error.

### 39. Event sourcing ↔ Ship's log replay for navigation reconstruction

- **Source domain:** Nautical history / maritime forensics
- **Source mechanism:** When a ship is lost or grounded, investigators reconstruct the voyage by replaying the log — each course change, each speed adjustment, each sighting. The log is the truth; the current "where is the ship" is derivable.
- **What transfers:** State as a function of an event history. Current state can be regenerated by replaying events from the start (or from a snapshot).
- **What does NOT transfer:** Ship logs are written sequentially by humans; event-sourced systems are written by code at high rates. The log's *projection* (current state) needs to be cached for query performance.
- **Application:** Event store + projections. Append-only event log; multiple read models (projections) materialized for different queries. Useful for audit-heavy domains (finance, healthcare, legal). Heavy ceremony for simple CRUD.

### 40. CQRS ↔ Library writing room vs reading room

- **Source domain:** Academic libraries
- **Source mechanism:** Some libraries separate writing-the-book (research, drafts, manuscripts in a workspace) from reading-the-book (final, indexed, shelved copies in the public reading room). The two spaces have different rules, different access patterns, different layouts.
- **What transfers:** Different optimization for writes vs reads. Writes go to a normalized, transactional store; reads go to denormalized, query-optimized projections.
- **What does NOT transfer:** Library reading rooms have low write rates; CQRS systems can have high write rates with read-side latency from projection lag.
- **Application:** Write-side: normalized SQL with strict transactions. Read-side: denormalized cache, search index, materialized views. Async projection from write side to read side. Accept some read-side staleness.

### 41. Pub/sub ↔ Newspaper subscriptions

- **Source domain:** Publishing
- **Source mechanism:** Subscribers don't know each other; the newspaper doesn't know who reads which articles. Publishers send out the paper; subscribers receive it; the publisher has no real-time view of consumption.
- **What transfers:** Decoupling of publisher and consumer. Publisher doesn't know consumer count or behavior; consumer doesn't know publisher identity beyond the channel.
- **What does NOT transfer:** Newspapers are time-bounded (today's edition); pub/sub topics often have no temporal boundary. Retention policy becomes a design decision.
- **Application:** Kafka / Kinesis / Pub/Sub with explicit retention. Multiple consumer groups read independently; consumers can replay from offset. Decouples producer scaling from consumer scaling.

---

## Algorithms / Search

### 42. Greedy algorithms ↔ Navigation by always heading toward destination

- **Source domain:** Foot navigation in a city
- **Source mechanism:** Without a map, you walk in the rough direction of your destination at each intersection. You sometimes get there efficiently; you sometimes hit a river and have to backtrack significantly. The strategy is local-optimal at each step, not global-optimal.
- **What transfers:** Cheap-to-compute, locally optimal choices. Often "good enough" and dramatically faster than searching the whole solution space.
- **What does NOT transfer:** Cities have terrain that breaks greedy navigation; some algorithmic problem spaces are smooth enough that greedy is provably optimal.
- **Application:** Greedy set cover, greedy scheduling, Huffman coding. Use when (a) the problem space has structure that makes greedy near-optimal, OR (b) global optimization is intractable and "near-optimal fast" beats "optimal eventually."

### 43. Bloom filters ↔ Guest list with allowed false positives

- **Source domain:** Event security
- **Source mechanism:** A nightclub bouncer with a long guest list memorizes only an approximation — "anyone with these characteristics is probably on the list." Some non-guests slip through (false positive), but no real guests get turned away (no false negatives). The compromise enables high throughput at the door.
- **What transfers:** Probabilistic membership testing with one-sided error. Cheap, fast, "definitely not in the set" answers without storing the full set.
- **What does NOT transfer:** Real guest lists don't tolerate false positives in security-critical applications; Bloom filters are used where the false positive only triggers a more expensive check, not a security breach.
- **Application:** "Is this URL probably in our cache?" — if Bloom says no, skip the lookup. If yes, do the (more expensive) actual cache check. Useful for any "skip the expensive lookup if probably-not-there" pattern.

### 44. Dynamic programming ↔ Route planning by memorizing subroutes

- **Source domain:** Cartography
- **Source mechanism:** When you frequently route between many city pairs, you eventually realize that many routes share subpaths. Memorizing "from Boston to NYC is best via X" lets you reuse that subpath in any longer route that passes through both.
- **What transfers:** Subproblem reuse. Solve and cache subproblems; build larger solutions from cached subsolutions.
- **What does NOT transfer:** Map subroutes are smooth and reusable across many queries; DP works only when subproblems overlap in a predictable structure.
- **Application:** Edit distance, optimal BST, knapsack variants. Worth the implementation effort only when subproblem reuse rate is high. Memoization (top-down) is often easier to write than tabulation (bottom-up).

---

## Process / Team / Governance

### 45. Feature flags ↔ Wartime field promotion

- **Source domain:** Military command structure
- **Source mechanism:** Junior officers can be temporarily given authority for a specific operation without permanent promotion. The authority is scoped, revocable, and tied to context (this battlefield, this mission). After the operation, the temporary rank ends.
- **What transfers:** Capability granting that's scoped, conditional, and revocable. The flag enables behavior for some subset of contexts (users, deployments, regions) without committing to permanence.
- **What does NOT transfer:** Military field promotions are visible to all observers; feature flags are often invisible to users, which creates testing complexity.
- **Application:** Per-user, per-cohort, per-region flags. Use for both rollout (gradually expose to more users) and kill switches (instantly disable misbehaving features). Discipline: every flag has an owner and a removal date.

### 46. A/B testing ↔ Pharmaceutical clinical trials

- **Source domain:** Medicine
- **Source mechanism:** Randomized, controlled, double-blind: patients are randomly assigned to drug or placebo; both patients and treating physicians are blind to which; the comparison is between the groups, not within patients. Statistical significance is the bar.
- **What transfers:** Random assignment, control group, pre-registered analysis plan, statistical significance bar.
- **What does NOT transfer:** Clinical trials have strict ethics protocols (informed consent, dropout rules); product A/B tests usually don't, and the difference matters when stakes are higher (e.g., financial services A/B tests).
- **Application:** A/B test infra with pre-registered metric, fixed sample size, Bonferroni correction for multiple comparisons. Don't peek at results before the planned sample size — you'll declare significance too early. Treat A/B as truth, not as confirmation of intuition.

### 47. Code review ↔ Pre-publication peer review

- **Source domain:** Academic publishing
- **Source mechanism:** A submitted paper goes to 2-3 reviewers in the field. They check methodology, novelty, soundness. Their critique is private to the author and editor. The editor weighs reviews and decides accept/revise/reject. Reviewers are anonymous; authors often are not.
- **What transfers:** Independent expert assessment before publication (merge). Multiple perspectives on the same artifact. Editor (maintainer) reconciles.
- **What does NOT transfer:** Academic review is slow (months); code review needs to be fast (hours-days). Academic reviewers are unpaid and rotate; code reviewers are usually peers with ongoing relationships.
- **Application:** Code review with multiple reviewers for high-stakes changes (security, schema, public APIs). Single reviewer for routine. Reviewers focus on what local linters/tests can't: design, intent, maintenance burden. Don't review what tools should review.

### 48. Refactoring ↔ Kitchen renovation while still cooking

- **Source domain:** Restaurants
- **Source mechanism:** Restaurants can't close for renovation; they renovate one station at a time while the others serve. The kitchen stays operational. Stations are swapped during off-peak hours; new equipment is brought in nightly; the menu doesn't change.
- **What transfers:** Incremental, behavior-preserving change. The system stays operational; the change is invisible to users.
- **What does NOT transfer:** Kitchen renovations have a defined endpoint; refactoring is continuous in software.
- **Application:** Strangler fig pattern — wrap the old code in an adapter; replace one route at a time; eventually retire the old code. Pair with test coverage on the contract being preserved. Never refactor and add features in the same PR.

---

## Adding a new analogy

When LATERAL mode produces a useful analogy that's not in this library, add it back. Format:

```markdown
### N. [Software primitive] ↔ [Source]

- **Source domain:** [field]
- **Source mechanism:** [what they actually do]
- **What transfers:** [the abstract pattern]
- **What does NOT transfer:** [surface details that don't generalize]
- **Application:** [concrete software adaptation]
```

When the user marks an analogy as having actually unlocked their thinking, append it to `references/creative-precedent.md` (the personal library) in addition to this shared library.
