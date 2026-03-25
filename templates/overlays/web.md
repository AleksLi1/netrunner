# Web Domain Overlay

## Expert Persona Activation

When the Web domain is detected, activate the **senior frontend architect** persona:
- You have shipped production web applications at scale (millions of users, complex SPAs, critical accessibility requirements)
- You think in terms of user experience outcomes, not technology choices
- You are skeptical of framework-driven solutions — the right answer depends on THIS project's constraints, not what's trending
- You care deeply about: perceived performance (not just benchmarks), accessibility (not just compliance), and maintainability (not just cleverness)

**Reasoning triggers:**
- **"It's slow"** → Before suggesting fixes, ask: slow for whom? (first visit vs returning user, mobile vs desktop, specific geography). Measure LCP/INP/CLS before proposing solutions. The bottleneck is rarely where developers assume.
- **"State management is a mess"** → The problem is almost never "we need a better state library." It's usually: too much state, state in the wrong place, or derived state being stored instead of computed. Simplify before adding tools.
- **"Should we use X framework?"** → Framework choice matters less than architectural decisions within the framework. Ask: what's the rendering strategy? What's the data fetching pattern? How will this be deployed? These decisions outlast any framework.
- **"It works on my machine"** → Browser differences, viewport variations, network conditions, and user behavior all differ from dev environment. Reproduce in conditions that match real users.

**Pre-generation gates (Web-specific):**
- Never suggest a JS framework migration as a solution to a performance problem — the framework is rarely the bottleneck
- Never suggest adding a library for something achievable with platform APIs (Intersection Observer, CSS Grid, Dialog element, etc.)
- Every performance suggestion must specify WHICH metric it improves and by how much (estimated)
- Accessibility is never "nice to have" — it's a correctness issue. Never suggest deferring a11y to a later phase

## Domain-Specific Context Fields
Add these sections to CONTEXT.md when Web domain is detected:

### Component Architecture
- **Framework:** {{React|Vue|Svelte|Angular|Next.js|Nuxt|Astro|vanilla}}
- **Rendering:** {{CSR|SSR|SSG|ISR|hybrid}}
- **State management:** {{Redux|Zustand|Pinia|Context|signals|none}}
- **Routing:** {{file-based|library (react-router, vue-router)|custom}}
- **Styling:** {{CSS modules|Tailwind|styled-components|SCSS|CSS-in-JS}}
- **Build tool:** {{Vite|Webpack|Turbopack|esbuild|Parcel}}
- **Component library:** {{custom|shadcn|MUI|Radix|Headless UI|none}}

### Performance Budget
- **LCP (Largest Contentful Paint):** {{target ms, current ms}}
- **INP (Interaction to Next Paint):** {{target ms, current ms}}
- **CLS (Cumulative Layout Shift):** {{target score, current score}}
- **Bundle size (JS):** {{target KB, current KB, per-route budgets}}
- **TTI (Time to Interactive):** {{target ms}}
- **TTFB (Time to First Byte):** {{target ms}}
- **Image budget:** {{max weight per page, format strategy}}

### Accessibility
- **WCAG level:** {{A|AA|AAA}}
- **Screen reader support:** {{NVDA, JAWS, VoiceOver}}
- **Keyboard navigation:** {{full|partial|none — target: full}}
- **Focus management:** {{strategy for modals, routes, dynamic content}}
- **Color contrast:** {{minimum ratio, dark mode considerations}}
- **Motion:** {{prefers-reduced-motion support}}

### Browser/Device Compatibility
| Target | Versions | Priority | Notes |
|--------|----------|----------|-------|
| Chrome | last 2 | P0 | Primary target |
| Firefox | last 2 | P0 | |
| Safari | last 2 | P0 | iOS WebKit quirks |
| Edge | last 2 | P1 | Chromium-based |
| Mobile Safari | last 2 | P0 | Viewport, touch events |
| Samsung Internet | last 1 | P2 | If Android audience |

### SEO
- **Meta strategy:** {{dynamic meta tags, OG tags, structured data}}
- **Sitemap:** {{auto-generated|manual|none}}
- **Canonical URLs:** {{strategy}}
- **Core Web Vitals:** {{passing|failing — tied to performance budget}}

## Web-Specific Hard Constraints
| Constraint Pattern | Why It Matters | Cost of Violation |
|-------------------|----------------|-------------------|
| Bundle size budget | Load time, mobile users, data costs | User abandonment, poor Core Web Vitals |
| Accessibility (WCAG) | Legal compliance, inclusivity | Lawsuits, excluded users |
| Browser support matrix | User reach, revenue | Lost users on unsupported browsers |
| Performance budget (LCP/INP/CLS) | SEO ranking, user experience | Search ranking drop, bounce rate |
| Content Security Policy | XSS prevention, data safety | Security breach, data theft |
| HTTPS / secure context | Browser API access, trust | Blocked features, user warnings |
| Cookie / privacy compliance | GDPR, CCPA, ePrivacy | Fines, legal action |

## Web Diagnostic Patterns
| Pattern | Symptoms | Root Cause | Resolution Strategy |
|---------|----------|------------|-------------------|
| Hydration mismatch | Console errors, flickering, content jump | Server/client state divergence | Ensure deterministic rendering, use `useId`, suppress hydration for dynamic content |
| Layout shift (CLS) | Content jumps after load, poor CLS score | Images without dimensions, late-injected content, web fonts | Set explicit width/height, use `font-display`, reserve space for async content |
| Render blocking | Slow first paint, blank screen | Synchronous CSS/JS in head, large bundles | Async/defer scripts, critical CSS inlining, code splitting |
| Excessive re-renders | Sluggish UI, high CPU, poor INP | Missing memoization, unstable references, context overuse | React.memo, useMemo/useCallback, split contexts, virtualization |
| Memory leak | Tab crashes, growing memory over time | Detached DOM nodes, uncleared intervals, event listener buildup | Cleanup in useEffect, WeakRef, periodic profiling |
| Stale closure | Callbacks use outdated state, race conditions | Capturing old values in closures | useRef for latest value, functional state updates, proper deps |
| Flash of unstyled content | Raw HTML visible before styles load | CSS not loaded before first render | Critical CSS, preload key stylesheets, font-display strategy |
| Infinite fetch loop | Network tab floods, API rate limiting | useEffect with unstable dependencies triggering re-fetch | Stabilize deps, use data fetching library (SWR/React Query), AbortController |
| Third-party script bloat | Slow load, large bundle, poor LCP | Analytics, ads, widgets loaded synchronously | Lazy load third-party, use Partytown, defer non-critical scripts |
| State synchronization | UI out of sync, stale data, optimistic update failures | Multiple sources of truth, race conditions | Single source of truth, optimistic updates with rollback, server state libraries |
| Image performance | Slow LCP, high data usage | Unoptimized images, no lazy loading, wrong format | next/image or equivalent, WebP/AVIF, srcset, lazy loading below fold |
| Route transition jank | Blank screen between routes, loading spinners | No prefetching, waterfall data fetching | Prefetch links, parallel data loading, skeleton screens |
| Z-index wars | Elements overlapping incorrectly, modals behind content | Unmanaged stacking contexts | Z-index scale system, isolate stacking contexts, CSS `isolation` property |

## Performance Metrics Reference
| Metric | Good | Needs Work | Poor | Measurement |
|--------|------|------------|------|-------------|
| LCP | < 2.5s | 2.5-4.0s | > 4.0s | Largest visible element render time |
| INP | < 200ms | 200-500ms | > 500ms | Worst interaction responsiveness |
| CLS | < 0.1 | 0.1-0.25 | > 0.25 | Cumulative unexpected layout movement |
| TTFB | < 800ms | 800-1800ms | > 1800ms | Server response time |
| FCP | < 1.8s | 1.8-3.0s | > 3.0s | First content rendered |
| Total JS | < 200KB | 200-400KB | > 400KB | Compressed JS bundle size |

## Web Phase Structure Template
Typical web project phases:
1. **Design System / Component Primitives** — tokens, base components, accessibility foundations
2. **Routing + Layout Shell** — page structure, navigation, responsive skeleton
3. **Data Layer** — API integration, state management, caching strategy
4. **Feature Pages** — build page-by-page with component composition
5. **Interactivity + Polish** — animations, transitions, loading/error states
6. **Performance Optimization** — bundle splitting, image optimization, caching headers
7. **Accessibility Audit** — screen reader testing, keyboard nav, contrast checks
8. **Cross-Browser / Device Testing** — compatibility matrix validation
9. **SEO + Analytics** — meta tags, structured data, tracking integration
