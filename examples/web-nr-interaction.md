# Example: /nr Interaction on a Web Application Project

<!--
  This example demonstrates how Netrunner's web expert persona activates and reasons
  when a user invokes /nr on a web application project. It shows:
  - Web persona activation from context signals
  - Performance-first reasoning about reported issues
  - Measurement before optimization mindset
  - Expert-level diagnostic hypothesis
  - Pre-generation gate enforcement
-->

## Setup

The user has a `.planning/CONTEXT.md` with the following signals:
- Framework: Next.js 14 (App Router)
- Rendering: SSR + client components
- Core Web Vitals failing on mobile (LCP 4.2s, CLS 0.35, INP 280ms)
- Bundle size: 420KB compressed JS
- Lighthouse Performance: 52
- No image optimization in place
- Third-party analytics script loaded synchronously

Previous avenues tried:
1. Added React.memo to 15 components — no measurable improvement
2. Switched from Redux to Zustand — reduced bundle by 8KB, no CWV improvement
3. Added loading spinners to all async components — CLS unchanged

Active hypothesis: "Component re-renders are causing poor performance"

## User Query

```
/nr "Our Core Web Vitals are terrible on mobile. LCP is 4.2s, CLS is 0.35, INP is 280ms. We've tried memoizing components and switching state libraries but nothing helps. What should we do?"
```

## Netrunner Response

### Step 0 — Context loaded, web persona activated

Context signals detected: Next.js, SSR, LCP, CLS, INP, bundle size, Lighthouse, Core Web Vitals → **Web expert persona active.**

*Loaded references/web-reasoning.md — applying "Performance Regression" reasoning trigger.*
*Loaded references/web-performance.md — Core Web Vitals deep dive.*

### Step 1 — Classification

**Shape:** FIX:DEBUGGING
**Subtype:** PERFORMANCE (Core Web Vitals failure — three distinct issues)
**Domain:** Web Development

### Step 2 — Adaptive questioning (MODERATE context — 3 prior avenues)

> Before I suggest anything, I need to understand your rendering pipeline. Three quick questions:
>
> 1. What is the LCP element on your worst-performing page? Is it an image, a text heading, or a dynamically rendered component?
> 2. Are your third-party scripts (analytics, ads, chat widgets) loaded with async/defer, or are they in the document head without attributes?
> 3. Do your images have explicit width and height attributes, or are dimensions set only via CSS?

### Step 3 — Expert reasoning (after user answers)

User confirms: LCP element is a hero image (2400px JPEG, no srcset), analytics script is synchronous in head, images have no explicit dimensions.

**Reasoning (internal):**

The prior avenues (memoization, state library switch) targeted the wrong problem. React re-renders are not causing poor Core Web Vitals — they are a runtime concern that affects INP, not LCP or CLS. The user optimized for component performance when the actual bottlenecks are:

1. **LCP 4.2s:** A 2400px unoptimized JPEG hero image with no responsive sizing and no preload hint. On a mobile connection, this image alone accounts for most of the LCP delay. Additionally, the synchronous analytics script in the head is render-blocking, delaying first paint.

2. **CLS 0.35:** Images without explicit dimensions cannot have space reserved during layout. Every image load causes a layout shift. This explains why CLS is 0.35 — well above the 0.1 threshold.

3. **INP 280ms:** The 420KB JS bundle is contributing to main thread blocking. On a mid-range mobile device, parsing and executing 420KB of JavaScript takes 200-400ms, during which the thread is blocked.

*Pre-generation gate: "Does this avenue improve a specific, measurable user-facing metric?" — YES, each suggestion targets a specific CWV metric.*

### Step 4 — Avenues

**Avenue 1 — Fix LCP: Optimize hero image + unblock render** (HIGH CONFIDENCE)
Convert hero image to WebP with responsive srcset (400w/800w/1200w). Add `<link rel="preload">` for the LCP image. Move analytics script to `defer`. Expected impact: LCP from 4.2s to under 2.5s.

**Avenue 2 — Fix CLS: Add explicit dimensions to all images** (HIGH CONFIDENCE)
Add width/height attributes or CSS aspect-ratio to every `<img>` and dynamic content container. Reserve space for the analytics banner. Expected impact: CLS from 0.35 to under 0.1.

**Avenue 3 — Fix INP: Code-split the 420KB bundle** (MEDIUM CONFIDENCE)
Route-based code splitting with `next/dynamic`. Move charting library and rich text editor to dynamic imports. Target: under 150KB initial JS, under 80KB per route. Expected impact: INP from 280ms to under 200ms.

### Step 5 — Cluster analysis of prior avenues

The 3 prior avenues (React.memo, Zustand migration, loading spinners) form an **EXHAUSTED CLUSTER: "React runtime optimization."** None of these address the actual bottlenecks, which are asset delivery (LCP), missing dimensions (CLS), and bundle size (INP). The cluster is exhausted because the performance problem is not in the React rendering pipeline — it is in the resource loading pipeline. Switching axis of investigation to asset optimization and delivery.

### Step 6 — Update CONTEXT.md

```
## Session 2 — Core Web Vitals investigation
- DIAGNOSED: LCP bottleneck is unoptimized hero image + render-blocking script (not React re-renders)
- DIAGNOSED: CLS caused by images without dimensions (not component state)
- DIAGNOSED: INP caused by 420KB monolithic bundle (not re-render frequency)
- CLUSTER EXHAUSTED: React runtime optimization (memo, state lib, spinners) — wrong axis
- AVENUE: image optimization + preload + defer scripts → LCP fix
- AVENUE: explicit dimensions on all images → CLS fix
- AVENUE: route-based code splitting → INP fix
```

<!--
  Note: This response demonstrates the web expert persona in action:
  - Measurement-first mindset — refuses to suggest fixes without knowing the LCP element
  - Identifies wrong axis of investigation — prior avenues targeted React internals when the problem is asset delivery
  - Specific metrics — each avenue specifies which CWV metric it fixes and by how much
  - Pre-generation gate — every suggestion targets a measurable metric, not a general "best practice"
  - Cluster detection — identifies that 3 React optimization attempts form an exhausted cluster
  - References web-performance.md for optimization patterns and web-code-patterns.md for implementation
-->
