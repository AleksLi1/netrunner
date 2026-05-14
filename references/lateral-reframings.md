# Lateral Reframings — Operational Primitives for Creative Problem-Solving

## Purpose

This reference is the operational kit for Netrunner's **LATERAL** classification. Where domain references activate *expertise* (convergent, conventional, conservative), this file activates *generativity* (divergent, unconventional, exploratory).

The premise: LLMs aren't lacking creativity — they're lacking the activation pathway. Default sampling collapses to the median professional response because the median is the highest-probability mode in the training distribution. The primitives in this file are concrete, named, repeatable techniques for *deliberately leaving the median* before converging on a final answer.

This is not a license to be wild. It is a license to *briefly suspend conventional reasoning* in service of finding angles that conventional reasoning would never surface. The reconverge phase exists to filter the wild output back into something the user can actually use.

**When this reference is loaded** (any of):
- Query classifies as `LATERAL` (see `commands/nr.md` Step 1)
- User passes `--lateral` or `--creative` flag
- Query contains trigger words: "rethink", "out of the box", "novel angle", "what would [X] do", "we're stuck", "creative approach", "different angle"
- Auto-activated: 3+ EXHAUSTED experiment clusters detected on a STRATEGY query (conventional thinking is provably tapped out)

**When NOT to load:** Standard FIX/OPTIMIZE/EXPLAIN queries with active diagnostic hypotheses. The user wants competent expertise, not theatrics. Reserve LATERAL for the moments when the obvious has failed.

---

## The Four-Phase Pipeline (host pattern)

When LATERAL is active, Netrunner replaces the linear hypothesis → avenues flow with:

```
PHASE 1 — REFRAMING (divergent, judgment suspended)
  5-8 reframings of the problem itself. Each is "the problem is actually about ___, not about ___."
  No solutions yet. Wild allowed. Half-baked allowed.

PHASE 2 — ANALOGICAL TRANSFER
  For 3-4 surviving reframings, draw a deliberate parallel from a non-software field
  using references/analogy-library.md. Format: "Resembles X in field Y; there the move is Z."

PHASE 3 — ASSUMPTION INVERSION
  List 3 "obviously true" assumptions baked into the framing. For each: "If false, then [consequence]."
  Keep inversions producing surprising consequences.

PHASE 4 — RECONVERGE
  2-3 concrete avenues. Each carries a lineage tag (ANALOGY / INVERSION / HYBRID) and
  a PROVOCATION line ("the uncomfortable part of this is...").
```

The primitives below are the toolbox each phase reaches into.

---

## Primitive 1: Analogical Transfer

### Mechanism

Recognize that the structural shape of a problem in domain A is identical to the structural shape of a problem in domain B, where B has a well-developed solution that hasn't been imported to A. The bet is that **structure transfers even when surface details do not**.

The reason this works: a lot of cleverness in software has already been worked out in other domains (biology, civil engineering, finance, sports, music, military strategy, traffic engineering, medicine, agriculture). The LLM has read those domains. The framing just doesn't reach for them by default.

### Trigger conditions

- The conventional solutions in the user's domain have been tried and exhausted
- The problem has the smell of "this seems like a fundamental tension" — capacity vs latency, freshness vs cost, isolation vs coordination
- The user's framing leans heavily on jargon from their own field — a sign that they're stuck inside one vocabulary

### Template

```
The problem is: [restated in domain-agnostic structural terms — what's the actual tension or trade-off?]

In [non-software field X], this same structural problem appears as: [analog].
There, the solution is: [their move].
The mechanism that transfers is: [the abstract pattern, not the surface details].
What does not transfer: [the bits that are domain-specific].

Applied here: [concrete adaptation].
```

### Worked example A: Cache invalidation

**Conventional framing:** "How do we know when to invalidate cache entries? Phil Karlton said cache invalidation is one of the two hard things in CS."

**Analogical transfer:** This is the same structural problem as cellular apoptosis in biology — when does a cell decide to die? Cells use a combination of intrinsic timers (telomere length, mitochondrial damage accumulation) and extrinsic signals (death receptors, lack of survival signals). The system doesn't ask a central authority — each cell carries its own clock and listens for its own death signals.

**Mechanism that transfers:** Distributed self-invalidation > centralized invalidation tracking. Each cache entry knows its own lifetime budget and refreshes its life when "used recently" (a survival signal). No central invalidation registry needed.

**What doesn't transfer:** Apoptosis is irreversible and immediate; cache entries can be soft-deleted and resurrected. The biology gives you the *trigger pattern*, not the *removal mechanism*.

**Applied:** TTL + sliding window with "warm" signal from recent reads, instead of a separate invalidation event system. Lower coordination cost, weaker freshness guarantees — pick this when reads are cheap and stale-but-eventually-correct is acceptable.

### Worked example B: API rate limiting

**Conventional framing:** "We need to prevent abuse. Token bucket vs sliding window vs fixed window?"

**Analogical transfer:** Highway ramp metering — when a freeway approaches capacity, traffic engineers don't reject cars at the on-ramp; they pace admission. The signal turns green at intervals tuned to the freeway's measured flow. The metric isn't "are we at capacity?" — it's "what admission rate keeps freeway throughput at the productive maximum?"

**Mechanism that transfers:** Optimize for *system throughput*, not for "fairness to each requester." The system has a productive maximum; the rate limiter's job is to keep aggregate demand at or just below that maximum, not to enforce identical quotas per user.

**What doesn't transfer:** Freeway physics give you a hard upper bound from car density and lane width; software systems often have softer, more graceful degradation. You may need to extrapolate the "productive maximum" from load tests rather than physics.

**Applied:** Adaptive rate limiting — measure tail latency in real time; when p99 starts climbing, admit fewer requests. Per-user quotas only as a *secondary* fairness layer on top of system-throughput admission control.

### Failure modes

- **Forced analogy:** When you reach so hard for an analogy that the structural similarity is superficial. If you have to bend the field-X solution heavily to make it fit, the analogy isn't working; abandon it.
- **Vague mechanism:** "It's like nature — it self-organizes." That's not a mechanism. Be specific: *which* biological process, *which* feedback loop.
- **Wrong direction of transfer:** Software → biology is sometimes worse than biology → software, because biology has had billions of years to optimize and software is younger. Default to importing FROM the older domain.
- **Skipping the "what doesn't transfer" step:** This is the most common failure. The whole point of the structural framing is to identify what's *abstract* and what's *surface*. Skipping it produces cargo-cult adaptations.

---

## Primitive 2: Constraint Inversion

### Mechanism

Take the constraint that's currently being treated as a liability and ask: **what if this constraint were the feature?** The technique works because product virtues often emerge from honored constraints, not despite them. Twitter's 140 chars, Vine's 6 seconds, esoteric programming languages — the constraint became the medium.

This is different from "remove the constraint" (constraint relaxation, see Primitive 5). Inversion *keeps* the constraint and asks what it makes possible that nothing else does.

### Trigger conditions

- The user has framed something as a limitation ("we only have N tokens", "we can only run during off-peak", "we can't write to disk")
- Multiple workaround attempts have failed
- The system competes on dimensions where the constraint is structurally present

### Template

```
Current framing: [constraint X] is preventing us from [Y].

Inversion: assume X is permanent and the feature. Now: what does that enable that nothing without X has?
- Capability enabled: [...]
- Discipline enforced: [...]
- Audience attracted: [users who specifically want X]
- Competitive moat: [why this is hard to copy]

Reframed product question: [the product as if the constraint were the value proposition]
```

### Worked example A: Limited LLM context window

**Conventional framing:** "The 200K context window is too small; we need a longer-context model."

**Inversion:** The context limit forces compression discipline. What does an aggressively-compressed-context system enable?
- *Capability:* Faster inference (smaller attention matrix), lower cost per query, easier caching, deterministic ordering of what's in context
- *Discipline:* Forces you to write your own summarizer, which becomes a portable knowledge representation
- *Audience:* Users who need predictable cost, predictable latency, and reproducible behavior
- *Moat:* Anyone with a "just throw it all in 1M context" approach loses on per-query cost and on reproducibility

**Reframed product question:** Instead of "how do we get more context?", "how do we build the world's best compression layer for context?" The compression layer becomes the product.

(Note: this is structurally what Netrunner is. The whole `CONTEXT.md` brain is a constraint-inversion artifact.)

### Worked example B: Read-only database replica

**Conventional framing:** "The read replica can't be written to, so we need to coordinate writes through the primary."

**Inversion:** Assume the read replica's read-only nature is the feature. What does that enable?
- *Capability:* Provable safety for analytics, ML training, audits — readers know the data can't shift under them
- *Discipline:* All writes flow through one place, making audit logging and rollback trivial
- *Architectural simplicity:* No conflict resolution between replicas

**Reframed product question:** Make the read replica the canonical surface for analytics and external consumers, and make the primary's writability a private implementation detail of the application. CQRS falls out naturally.

### Failure modes

- **Sour grapes inversion:** "We can't have X, so let's pretend not having X is the goal." This is just rationalization. The test: does the inverted framing produce a real product virtue *that paying users would describe in those terms*?
- **Permanent constraints aren't always permanent:** Some constraints are physics (speed of light, thermodynamics) and stay; some are temporary (Moore's law, current model size, current capital). Inverting a transient constraint locks you into a position that disappears.
- **Forgetting users:** A constraint can be a virtue for the builder while being torture for the user. "Our limited UI is a forcing function for simplicity" might just mean "our UI is bad."

---

## Primitive 3: First-Principles Regression

### Mechanism

Strip away the layers of accumulated convention, framework, and best-practice until you reach the *physical or mathematical force* that actually applies. Then build back up, choosing each layer deliberately rather than inheriting it.

The reason this works: software is unusually prone to inheriting solutions from contexts where they made sense to contexts where they don't. Object-oriented inheritance hierarchies, REST conventions, JSON-as-default — each of these was the right answer to a specific question at a specific time. Without regression, you build for the wrong question.

This is what Elon Musk's "boring company" rant was reaching for: the cost of a tunnel is the dirt removal, not the regulatory layer that everyone treats as the dominant cost. Regression separated the physics from the politics.

### Trigger conditions

- The conventional solutions feel heavy or ceremonial relative to the actual problem
- You catch yourself saying "well, that's how it's done" without being able to explain why
- The problem has been solved in similar contexts at vastly different cost — there's an order of magnitude gap that conventional explanations don't justify
- A junior engineer's "stupid question" cuts through the established framing

### Template

```
Conventional solution: [the established approach, with all its accreted layers]

Strip back to physics/math:
- What is actually moving? [data, time, computation, capital, attention]
- What is the irreducible cost? [bytes transferred, cycles burned, milliseconds elapsed, joules]
- What is the irreducible constraint? [Shannon, Nyquist, speed of light, P=NP, second law of thermo]
- Which conventional layers are physics-mandated vs. convention-mandated?

Build back up, choosing each layer deliberately:
- Layer 1 (physics-mandated): [must include]
- Layer 2 (convention, but justified here): [include because]
- Layer 3 (convention, not justified here): [drop]
- Layer 4 (cargo-culted from elsewhere): [drop, may surprise users]

Result: [the rebuilt solution, with explicit justification for each layer kept]
```

### Worked example A: "We need a REST API"

**Conventional framing:** "We need a REST API for our internal service."

**Regression:**
- What is actually moving? Function calls and their results between two services on the same private network.
- What is the irreducible cost? Serialization + transport + deserialization.
- What is the irreducible constraint? Latency budget, schema agreement.
- Physics-mandated: a transport, a serialization format.
- Convention-mandated (justified for public APIs): HTTP verbs as a uniform interface, cacheable representations, hypermedia.
- Convention-mandated (not justified internally): URL paths as resource identifiers when the call is really a function, status codes as the primary error channel when both ends are first-party.

**Result:** An internal-only RPC using gRPC or protobuf-over-HTTP/2 is closer to the physics than REST. The team will be slower at first (less Stack Overflow), but the wrong-question tax of REST goes away. If the same team also needs to expose to third parties, do REST *only* at that boundary, with a translation layer.

### Worked example B: "We need a Kubernetes cluster"

**Conventional framing:** "We need Kubernetes to deploy our services."

**Regression:**
- What is actually moving? Container images, configuration, secrets — onto compute, with some restart policy.
- What is the irreducible cost? Image pull, container start, port binding, health probe.
- What is the irreducible constraint? Resource isolation, restart on crash, network routing.
- Physics-mandated: a container runtime, a way to specify resources and restart policy.
- Convention-mandated (justified at scale): service discovery, rolling deployment, autoscaling, multi-tenant resource quotas.
- Convention-mandated (not justified at 5-service scale): the entire control plane, custom resource definitions, operators, service meshes, the YAML thicket.

**Result:** For a 5-service deploy with low traffic, Kubernetes is wrong-question. Fly.io, Render, Railway, or even a plain systemd service on a single VM are closer to the physics. Re-evaluate at 50 services, 5 teams, or genuine multi-region needs.

### Failure modes

- **Galaxy-brain syndrome:** Regressing so far that you reinvent things that were already correctly built. Don't reinvent TCP, sort algorithms, or hash functions because "let me think from first principles." The regression is for *the assembly*, not for every individual layer.
- **Ignoring switching costs:** First-principles is right about the destination; it's silent about whether to migrate. A working REST API is more valuable than a theoretically purer rebuild.
- **Underweighting team familiarity:** A solution that wins on physics but loses on "every new hire has to learn our custom thing" may net out negative. Account for the human layer.

---

## Primitive 4: The Naive Question

### Mechanism

Replace "how do we do X better?" with "**why do we do X at all?**" The first question presumes X is required; the second exposes whether that presumption is load-bearing.

This is the move that the consultant, the new hire, and the child all share — and it works because long-running systems accumulate Chesterton's Fences (rules whose original justification has decayed). Pulling the fences down on inspection often reveals that several were never needed.

### Trigger conditions

- A process has existed long enough that nobody remembers why it started
- An effort is being defended on the basis of "we've always done it this way"
- The system is being optimized along a metric whose connection to user value is unclear
- A workflow has more steps than seems necessary, and each individual step has a defender but the whole sequence has no defender

### Template

```
Process / artifact / metric being optimized: X.

Naive question: Why are we doing X at all?

Decompose:
- What is X supposed to produce? [output Y]
- Who consumes Y? [user, downstream system, regulatory, internal]
- What would happen if Y simply didn't exist? [consequence]
- If the consequence is "nothing user-visible," X is candidate for deletion.
- If the consequence is "the regulator complains," ask: is the regulator's actual goal Y, or is Y a proxy?

Cheaper alternatives:
- Achieve the consumer's actual goal differently: [alternatives]
- Achieve a smaller version of Y: [reduced scope]
- Delegate Y to a more direct producer: [different ownership]
```

### Worked example A: "Improve our weekly status report format"

**Conventional framing:** "The weekly status report is hard to read. Let's redesign the template."

**Naive question:** Why are we writing weekly status reports?
- Supposed output: Visibility into team progress for leadership.
- Consumer: VP and sibling-team leads.
- What if they didn't exist? Probably leadership would notice less variance in progress reporting and would ask more questions in 1:1s. Sibling teams would have to ping each other for context — friction.
- The actual goal isn't "weekly written reports." It's "low-friction lateral and vertical visibility."

**Cheaper alternatives:**
- A live dashboard auto-generated from PR/issue/deploy activity — zero authoring cost, real-time, machine-readable.
- A 15-minute weekly cross-team sync replacing the written report — synchronous, but reduces total time spent.
- A "ping me when X happens" subscription model — sibling teams subscribe to events they care about.

**Result:** The right move isn't a better report template. It's removing the report-as-artifact and serving the real goal (visibility) directly. The template redesign would have been the wrong-question tax.

### Worked example B: "Improve our integration test reliability"

**Conventional framing:** "Our integration tests flake 5% of the time. How do we make them more reliable?"

**Naive question:** Why do we run these integration tests?
- Supposed output: Confidence that end-to-end flows work before merge.
- Consumer: Reviewers, CI gating, "merging without breaking prod" promise.
- What if they didn't exist? Reviewers would rely on unit tests + manual smoke + production monitoring. Bugs would slip to staging, occasionally to prod.
- The actual goal isn't "green integration test runs." It's "merge confidence."

**Cheaper alternatives:**
- A contract test pact between the services involved — much faster, much more reliable, catches the schema-drift class of bug that integration tests usually catch.
- Production canary deploys with auto-rollback on error budget burn — replaces "prevent the bug pre-merge" with "detect-and-revert post-deploy at the cost of N seconds of incident."
- Shorten the integration test suite to the 3 flows that have actually caught real bugs.

**Result:** Sometimes integration tests are the answer; sometimes they're a fence whose original need has been served better by other tooling. Naive question separates them.

### Failure modes

- **Chesterton's fence violation:** Tearing down a process *before* understanding what it was holding up. The rule: you must be able to articulate why someone put the fence there, even if the reason has decayed. If you can't, you're not ready to remove it.
- **Inappropriate context:** Don't ask "why do we have tests?" in the middle of an incident. Naive questioning is a building-phase technique, not an incident-phase technique.
- **Naive-question theater:** Asking the naive question and then immediately answering "well, because X" without seriously sitting with the question. The discomfort of not knowing the answer is the productive part.

---

## Primitive 5: Adversarial Probing

### Mechanism

Take the most load-bearing assumption in the current framing and **attack it like a malicious actor would**. Not "what if it fails?" — but "how would I deliberately break it for personal benefit?"

This works because security thinking, abuse modeling, and red-team mindset surface failure modes that "what could go wrong?" never reaches. The mind defaults to "what could go wrong by accident"; "what could a motivated adversary do" is a strict superset.

### Trigger conditions

- The system handles money, identity, content moderation, voting, or anything where users have asymmetric incentives
- An automated system is being designed and its decisions affect humans who can game it
- A metric is being adopted as an optimization target (Goodhart's Law territory)
- Trust in input data is assumed without enforcement

### Template

```
Assumption being attacked: [the implicit trust premise]

The adversary's perspective:
- Adversary's goal: [what they want — money, access, exposure, attention, denial-of-service]
- Adversary's resources: [time, compute, capital, social access]
- Adversary's constraints: [what they can't easily do]

Attack tree:
- Direct attack on the assumption: [...]
- Side-channel attack on the assumption: [...]
- Attack on the metric proxy rather than the goal: [...]
- Attack by making the defender's response itself harmful: [...]

Implications for the legitimate design:
- The system must assume [...] is hostile until proven otherwise.
- The cheap detection: [...]
- The costly but reliable detection: [...]
```

### Worked example A: "Reward users with referral bonuses"

**Conventional framing:** "We'll pay $20 for each new user a current user refers, to drive growth."

**Adversarial probe:**
- Adversary goal: Maximize $20 payouts at minimum cost.
- Adversary resources: Free email providers, phone number rental services, headless browser farms.
- Attack tree:
  - Direct: Create N throwaway accounts that "refer" each other. Cost: minutes per account; payoff: $20 per pair.
  - Side-channel: Stuff a referral code into every public forum post; bots and confused real users sign up; "real users" but extremely low LTV.
  - Goodhart: Define "successful referral" as "signed up + first action"; adversary scripts the first action.
  - Defender-harms-itself: Adversary uses stolen credit cards on referred accounts; chargebacks plus fraud signal degrades the org's payment processor relationship.

**Implications:**
- Default-distrust new accounts. Bonuses unlock only after the referred account demonstrates non-trivial engagement (LTV proxy, not action count).
- Cheap detection: Same payment method, IP cluster, device fingerprint cluster.
- Costly but reliable: Hold bonuses in escrow until 30-day retention or first paid action.

### Worked example B: "Use thumbs up/down voting on user-generated content for ranking"

**Conventional framing:** "Our community will self-moderate via upvotes/downvotes."

**Adversarial probe:**
- Adversary goal: Get specific content seen (or suppressed) regardless of merit.
- Adversary resources: Sockpuppet accounts, real "for hire" voters, bot networks, coordination via outside channels (Discord, Telegram).
- Attack tree:
  - Direct: Mass-upvote own content via sockpuppets.
  - Side-channel: Mass-downvote competitor content via sockpuppets.
  - Goodhart: Bait emotional reactions to drive upvotes regardless of substance (rage-bait, outrage farming).
  - Defender-harms-itself: Brigade content from outside the community; if defenders ban the content based on brigaded votes, they've handed adversaries a censorship tool.

**Implications:**
- Naive vote counts can't be the ranking signal. Weight votes by voter trust (account age, contribution history, voting pattern that correlates with quality).
- Cheap detection: Sudden vote bursts from new accounts.
- Costly but reliable: Network analysis on voting patterns to identify coordinated rings.

### Failure modes

- **Paranoia overreach:** Treating every legitimate user like an adversary makes the system unusable. The output of adversarial probing should be calibrated defenses, not "make everything require KYC."
- **Modeling only the obvious adversary:** A sophisticated red team will probe second-order and meta-level attacks. Don't stop at the first "well, but what if they did X."
- **Adversarial-probe in incident response:** Don't redesign your auth system during an active breach. The probe is a design-phase technique. The mid-incident technique is "contain, then investigate."

---

## Primitive 6: Combinatorial Recombination

### Mechanism

Take two or three primitives from genuinely unrelated domains and **forcibly recombine them into one system**, even when the combination feels nonsensical. The output of the recombination is often a system that nobody has built, because the domains don't normally talk to each other.

This is how a lot of category-defining products emerged: Spotify = jukebox + filesystem + recommendation; Slack = IRC + Outlook + Twitter; Stripe = bank + dev tools + invoicing.

### Trigger conditions

- The user is in a saturated competitive landscape where conventional approaches all converge
- The user has rich access to a non-obvious adjacent domain (their own background, their company's data assets, their user base's behavior)
- The conventional framing produces only incremental moves

### Template

```
Starting primitive (from the user's domain): [A]

Adjacent primitive 1 (from an unrelated domain): [B]
- Why it's interesting: [some property B has that A's domain doesn't]

Adjacent primitive 2 (from a third unrelated domain): [C]
- Why it's interesting: [...]

Forced combination — A + B + C → ?
- Surface-level absurd: [yes, this looks silly because it's never been built]
- Structural fit: [the parts that actually mate well]
- What this enables that no two-of-three combination does: [the unique capability]

Concrete product / system: [the recombination, built]
```

### Worked example A: Code review × game design × pair programming

**A:** Code review (the user's domain — async, asynchronous, written feedback, often slow).

**B:** Game design (real-time, asynchronous-but-co-present, leaderboards, achievements, social).

**C:** Pair programming (synchronous, co-located cognition, shared screen, real-time discussion).

**Recombination:** A code review system where:
- Reviewers see each other in real-time (game-like co-presence — "Alice is looking at line 42")
- Comments are gameified (you "claim" a concern, others can pile on or push back, fastest resolution wins reviewer points)
- A solo reviewer can request a "pair review" — invites a second reviewer to a real-time co-presence session for 15 minutes on the hard file
- The system tracks reviewer "specialties" (which files/areas they've reviewed productively) and routes new reviews to specialists

**What this enables that no two-of-three does:** Async PRs with the option to "pull synchronous" on the hard parts, with social signal (who's good at what) feeding routing. GitHub PRs have async-only. Pair programming has synchronous-only. Game leaderboards have neither code nor cognition. The three together produce a system where the social layer is functional, not ornamental.

### Worked example B: Time-series database × news article × notification feed

**A:** Time-series database (the user's domain — append-only, time-indexed, summarizable).

**B:** News article (human-readable, narrative, optional depth, summary-at-top).

**C:** Notification feed (push, prioritized, dismissible, threaded).

**Recombination:** A monitoring system where:
- Each metric publishes a continuous "story" — a narrative document that updates as new data arrives, with the latest reading at the top
- Anomalies generate notifications, but the notification *links to the story* (which has accumulated context — what this metric is, what its normal behavior looks like, what's changed)
- Stories can be subscribed to like RSS — instead of "configure an alert," you "follow this metric"

**What this enables:** Operations and on-call work shift from "react to bare numbers" to "consume the metric's autobiography." The metric becomes its own knowledge artifact. Datadog has time-series-as-charts; PagerDuty has notifications-as-tickets; nobody has time-series-as-articles.

### Failure modes

- **Frankenstein combinations:** Forced recombinations that produce systems with no actual user. The test: can you describe a 30-second user moment where the recombined system makes their life noticeably better? If not, it's an academic exercise.
- **Too-conservative source primitives:** Combining "REST + GraphQL + gRPC" is not recombination — it's all the same domain. The unrelated-ness has to be real.
- **Stopping at one combination:** The first combination is often weak. Generate 5-7, throw away 4-6.

---

## Primitive 7: Negative Space

### Mechanism

Look at the **space of things nobody is building**, identify the dominant reasons everyone's avoiding it, and ask whether those reasons are still true. The bet is that the cluster of "no one builds X" includes both genuinely bad ideas and *formerly-bad-now-good* ideas whose blocking constraint has been removed without anyone noticing.

Most of what becomes obvious-in-hindsight starts as negative space — Airbnb (formerly: nobody would let strangers stay in their home; broken by aggregated reputation systems), Uber (formerly: hailing rides from random drivers is unsafe; broken by tracking + reputation), serverless (formerly: cold starts make it useless for production; broken by warm pools).

### Trigger conditions

- The conventional space is competitive and crowded
- A platform/infrastructure shift has happened in the last 2-5 years that the user's domain hasn't internalized
- "Everyone knows you can't do X" is part of the user's domain folklore

### Template

```
Conventional category: [what people are building]

Adjacent negative space: [what people are NOT building, but is structurally adjacent]

The "why no one builds X" theories:
1. [Cost reason — used to be too expensive]
2. [Trust reason — users wouldn't trust it]
3. [Tech reason — needed capability didn't exist]
4. [Regulatory reason — wasn't allowed]
5. [Demand reason — no one wanted it]

For each theory, ask: is this still true in 2026?
- Cost: [check current cost curves]
- Trust: [check whether trust mechanisms have improved]
- Tech: [check whether the missing capability now exists]
- Regulatory: [check whether regs have shifted]
- Demand: [check whether adjacent products have created demand]

The unblocked-but-unbuilt opportunities: [the items where 2026's answer to "is this still true" is "no"]
```

### Worked example A: Personal LLM agents that work without a server

**Conventional framing:** Everyone's building cloud-hosted AI assistants with API key billing.

**Negative space:** Personal LLM agents that run entirely on the user's device with no server backend.

**Why no one builds it:**
1. Cost: GPUs on consumer devices used to be too weak for useful LLM inference.
2. Trust: Users wouldn't trust their device to keep an LLM running 24/7.
3. Tech: Local LLM tooling was hostile (compile chains, OS-specific quirks).
4. Regulatory: N/A really.
5. Demand: Users have been trained to expect "magic happens in the cloud."

**Still true in 2026?**
1. Cost: Apple Silicon + Snapdragon X Elite + consumer GPUs run 7B-8B models at usable speed. **NO LONGER TRUE.**
2. Trust: Privacy-conscious cohort growing; AI vendors have had high-profile training-data leaks. **TRUST IS NOW THE FEATURE.**
3. Tech: llama.cpp, Ollama, MLX, LM Studio. **NO LONGER TRUE.**
4. Regulatory: GDPR, EU AI Act push compute-on-device. **REGULATION NOW FAVORS IT.**
5. Demand: Cloud AI fatigue is rising (cost, vendor lock-in, latency, privacy). **TRENDING TOWARD DEMAND.**

**The opportunity:** A personal LLM agent that runs entirely on-device — productized form factor is "your computer becomes your AI." Not as good as Claude/GPT for complex reasoning, but private, free per-query, offline-capable, and tunable. Nobody's productized this with first-party polish because everyone's chasing cloud.

### Worked example B: Long-form serialized fiction over email

**Conventional framing:** Everyone reads fiction in apps (Kindle, Apple Books, Wattpad) or paper.

**Negative space:** Long-form serialized fiction delivered as email newsletters.

**Why no one builds it:**
1. Cost: Email infrastructure used to be expensive at scale.
2. Trust: Readers wouldn't pay for email content.
3. Tech: No good payment + delivery + subscription tooling.
4. Regulatory: GDPR consent overhead.
5. Demand: "Email is for work."

**Still true in 2026?**
1. Cost: SendGrid / Resend / Postmark are commodity. **NO LONGER TRUE.**
2. Trust: Substack alone has trained 2M+ paying email subscribers. **NO LONGER TRUE.**
3. Tech: Substack, Beehiiv, Ghost, Buttondown. **NO LONGER TRUE.**
4. Regulatory: Managed by the platforms now. **MANAGED.**
5. Demand: People are subscribing to newsletters at record rates. **REVERSED.**

**The opportunity:** A Substack-like specifically tuned for serialized fiction (chapter pacing, cliffhanger metadata, character/world bibles, reader-poll-driven plot branches). Substack is built for non-fiction essays and treats fiction as a second-class citizen. Someone could win in the fiction niche by purpose-building.

(Royal Road and Wattpad exist but are app-based, not email-native; the negative-space play is "email-native serialized fiction.")

### Failure modes

- **All-five-still-true:** Sometimes the reasons no one's building it are all still valid, and you're about to learn why the hard way. Be honest in the still-true-in-2026 check.
- **Wrong adjacency:** "No one builds X" because X is genuinely orthogonal to what users want. The negative space has to be *structurally adjacent* to a known want, not arbitrarily distant.
- **The hard part is execution:** "No one builds X" often means many have tried and bounced off execution complexity. Identify what the execution challenge actually is before celebrating the opportunity.

---

## Combining primitives

The primitives stack. A strong LATERAL response often runs:

1. **Naive question** to identify the actual goal (vs the stated goal).
2. **Constraint inversion** OR **negative space** to reframe the opportunity surface.
3. **Analogical transfer** to import a mechanism from a richer domain.
4. **Adversarial probing** to stress-test the proposed move against motivated attackers.
5. **Combinatorial recombination** to assemble the final shape from cross-domain primitives.

Not every response uses all five. A tight LATERAL response might use only two, with the others left as latent options for follow-up.

---

## Anti-patterns for LATERAL mode

<critical_rules>

- **DO NOT do LATERAL when the user has a clear, well-scoped, conventional question.** They want competent expertise. LATERAL is for when the obvious is exhausted.
- **DO NOT skip the reconverge phase.** The wild ideas are not the deliverable. The filtered, lineage-tagged avenues are.
- **DO NOT use vague analogies ("it's like nature").** Be specific: which process, which mechanism, what transfers, what doesn't.
- **DO NOT hide the lineage.** Every LATERAL avenue must carry a tag (ANALOGY: from X / INVERSION: of Y / NAIVE: re-asking Z / RECOMBO: A + B + C) so the user can interrogate the reasoning.
- **DO NOT use LATERAL as cover for half-baked thinking.** "Be creative" is not a license to skip rigor. The bar is "interesting but not for us" — not "obvious."
- **DO NOT propose avenues that violate Hard Constraints.** The Netrunner pre-generation gates apply equally to LATERAL output.
- **DO NOT propose avenues that repeat exhausted clusters.** Exhausted-cluster avoidance is the *trigger* for LATERAL; landing back in the same cluster defeats the purpose.

</critical_rules>

---

## Integration with Netrunner core

When LATERAL is active:

- **Pre-generation gate** adds: "At least one avenue must carry an ANALOGY, INVERSION, or RECOMBO lineage tag" and "No avenue may be the top Google result for the user's exact problem statement."
- **Avenue format** adds two fields: `LINEAGE: [tag — source]` and `PROVOCATION: [the uncomfortable part of this]`.
- **Constraint frame** adds: `EXHAUSTED CLUSTERS: [list]` — the explicit list of "do not propose anything resembling these" alongside the standard Hard Constraints.
- **Brain write-back:** If the user marks a LATERAL avenue as having actually unlocked something, append to `references/creative-precedent.md` for that user's growing personal library.

See `references/analogy-library.md` for the curated cross-domain pool that Primitive 1 reaches into.
See `references/creative-precedent.md` (initially empty) for the per-project personal library of analogies that worked.
