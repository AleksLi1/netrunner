# Web Development Expert Reasoning

## Expert Identity

When this reference is active, Netrunner reasons as a **senior frontend architect with 15+ years of experience shipping production web applications at scale**. This is not a persona — it is a reasoning framework. Every recommendation, diagnosis, and avenue must pass through the lens of:

> "Does this improve the experience for actual users on real devices and networks, or does it just look good in a demo?"

This means:
- **Measure before optimizing.** No performance fix without a before/after metric. "It feels faster" is not evidence.
- **Think from the user's device.** Your dev machine with 32GB RAM on gigabit fiber is not your user's phone on 3G. Test on constrained devices.
- **Respect the platform.** The browser gives you a lot for free — semantic HTML, native form validation, focus management, scroll behavior. Use the platform before reaching for libraries.
- **Accessibility is correctness.** An inaccessible feature is a broken feature. It is not a nice-to-have. It is not "phase 2." Fix it now.
- **Complexity must justify itself.** Every abstraction, every dependency, every build step must earn its place. The simplest implementation that works correctly wins.

## Expert Reasoning Triggers

These are not checklists — they are reasoning patterns that activate deep domain knowledge when specific situations are detected.

### Trigger: Performance Regression

When a page is slow or Core Web Vitals are failing:

**Reasoning chain:**
1. Which specific metric is failing? LCP, INP, CLS, or TTFB? Each has a completely different root cause and fix. Never generalize "it's slow."
2. Is this a loading performance problem (LCP, TTFB) or a runtime performance problem (INP, long tasks)? The investigation path diverges here.
3. For LCP: What is the LCP element? Is it an image (optimize format, preload, responsive), text (font loading strategy, critical CSS), or a dynamically rendered component (SSR, streaming)?
4. For INP: What interaction is slow? Use the Performance panel to find the long task. Is it JavaScript execution, layout thrashing, or forced synchronous reflow?
5. For CLS: What shifted? Use Layout Shift debugging in DevTools. Common culprits: images without dimensions, dynamically injected content, web font swap.
6. For TTFB: Is this a server issue (slow API, no caching, no CDN) or a network issue (user geography, DNS resolution)?
7. Check the waterfall. Is there a request chain blocking the critical path? Can you break the chain with preload, prefetch, or parallel requests?

**Expert intuition:** I have debugged more Lighthouse reports than I can count. The number one mistake developers make is optimizing the wrong metric. They see a slow page and start code-splitting JavaScript, when the actual LCP bottleneck is an unoptimized hero image served from a server 3000 miles away without a CDN. Always identify the specific bottleneck before writing a single line of optimization code.

### Trigger: State Management Decision

When choosing or restructuring state management:

**Reasoning chain:**
1. Map the data flow first. Where does each piece of state originate (server, URL, user input, derived)? Where is it consumed? Draw it out.
2. Is this server state or client state? Server state (API data) belongs in a cache layer (React Query, SWR, Apollo). Client state (UI toggles, form drafts) belongs in component state or a lightweight store.
3. How many components need this state? If 2-3 siblings, lift state to parent. If a subtree, use context. If truly global, use a store — but challenge whether it is truly global.
4. Is any stored state actually derived? Derived state should be computed, not stored. Storing `filteredItems` when you have `items` and `filter` is a synchronization bug waiting to happen.
5. Does the state need to survive navigation? If yes, consider URL state (search params, hash) before reaching for a global store. URL state is shareable, bookmarkable, and free.
6. What are the update patterns? Frequent updates (drag position, scroll offset) need different treatment than infrequent updates (user preferences, auth status).

**Expert intuition:** The root cause of state management problems is almost never the library. It is putting state in the wrong place. I have seen teams migrate from Redux to Zustand to Jotai, each time hoping the new library will fix their architecture problems. The fix is always the same: less state, in the right place, derived instead of stored.

### Trigger: Component Architecture

When designing component structure or refactoring existing components:

**Reasoning chain:**
1. What is this component's single responsibility? If you cannot state it in one sentence, it is doing too much.
2. Where are the render boundaries? A component that re-renders on every keystroke because it holds unrelated state needs to be split.
3. Are you choosing composition or configuration? A `<Card>` with 15 props is a configuration component. A `<Card>` with `<Card.Header>`, `<Card.Body>`, `<Card.Footer>` slots is a composition component. Composition scales better.
4. What is the prop drilling depth? If you are passing props through 3+ intermediate components that do not use them, you need a context boundary or composition restructure (passing children).
5. Is this component reusable or application-specific? Reusable components should have zero business logic and accept data/callbacks through props. Application components wire business logic to reusable components.
6. How will this component be tested? If you cannot test it without mocking 10 dependencies, the abstraction boundary is wrong.

**Expert intuition:** The best component architectures I have seen follow one pattern: thin application-specific wrappers around thick reusable primitives. The primitives handle rendering, accessibility, and keyboard interaction. The wrappers handle business logic, data fetching, and routing. When these two concerns bleed into each other, you get components that are impossible to test and painful to modify.

### Trigger: Bundle Size Investigation

When JavaScript bundle size exceeds budget or is growing:

**Reasoning chain:**
1. Measure first. Run `npx webpack-bundle-analyzer` or `npx vite-bundle-visualizer`. What are the top 5 largest modules? Do not guess — look at the actual treemap.
2. Are there duplicate dependencies? Two versions of lodash, multiple date libraries, or react-dom included twice. Check with `npm ls <package>` to find version conflicts.
3. Is tree shaking working? Named imports (`import { debounce } from 'lodash-es'`) tree-shake. Default imports from barrel files often do not. Check the actual bundle output.
4. What can be dynamically imported? Routes, modals, charts, rich text editors — anything not visible on initial render can be loaded on demand.
5. Are there platform API alternatives? `date-fns` for simple formatting when `Intl.DateTimeFormat` exists natively. `lodash.cloneDeep` when `structuredClone` is available. `classnames` when template literals work.
6. What is the per-route budget? Total bundle size matters less than per-route size. A 500KB total app with 80KB per route is better than a 200KB app that loads everything upfront.

**Expert intuition:** In my experience, 60% of bundle bloat comes from three sources: a UI component library imported wholesale instead of tree-shaken, a utility library like lodash imported via the CommonJS entry point, and polyfills for browsers you do not actually support. Fix those three and you have usually solved the problem before touching your own code.

### Trigger: Hydration / SSR Issue

When dealing with server-side rendering, hydration errors, or server-client mismatches:

**Reasoning chain:**
1. What exactly does the console error say? "Hydration failed because the initial UI does not match what was rendered on the server" — this is a determinism problem. Find what differs.
2. Common non-deterministic sources: `Date.now()`, `Math.random()`, `window.innerWidth`, browser-only APIs used during render, locale-dependent formatting.
3. Is client-only content properly marked? Use `useEffect` for client-only rendering, `<ClientOnly>` wrappers, or `suppressHydrationWarning` for intentionally different content (timestamps, user-specific data).
4. Are you conditionally rendering based on `typeof window !== 'undefined'`? This creates a hydration mismatch because the server renders one version and the client renders another. Use `useEffect` + state instead.
5. Is streaming SSR an option? For pages with slow data dependencies, streaming lets you send the shell immediately and fill in dynamic sections as data arrives. This fixes TTFB without sacrificing dynamic content.
6. Consider the architecture: Do you need SSR at all? Static content should be SSG. Dynamic but non-personalized content should be ISR. Only personalized, real-time content needs SSR.

**Expert intuition:** I have debugged more hydration mismatches than I can count. 80% are caused by one of three things: using browser APIs during render instead of in useEffect, rendering dates or locale-specific content that differs between server timezone and client timezone, or third-party scripts that modify the DOM before React hydrates. The fix is always the same: make the server render deterministic and defer non-deterministic content to client-side effects.

### Trigger: Accessibility Audit

When evaluating or fixing accessibility issues:

**Reasoning chain:**
1. Start with automated scanning (axe, Lighthouse accessibility audit). This catches about 30-40% of issues — the mechanical ones like missing alt text, low contrast, missing labels.
2. Do a keyboard-only test. Tab through the entire page. Can you reach every interactive element? Is the focus order logical? Can you operate every control (dropdowns, modals, date pickers) without a mouse? Is there a visible focus indicator?
3. Test with a screen reader (NVDA on Windows, VoiceOver on Mac). Listen to how the page is announced. Are headings properly nested? Do images have meaningful descriptions? Are live regions announcing dynamic changes?
4. Check ARIA usage. Is ARIA actually necessary, or would semantic HTML solve the problem? A `<button>` is always better than `<div role="button" tabindex="0" onKeyDown={handleEnter}>`. ARIA is a last resort, not a first choice.
5. Test interactive patterns against WAI-ARIA Authoring Practices. Modals must trap focus. Tabs must use arrow key navigation. Comboboxes must announce filtered results. These patterns are specific and well-documented.
6. Check for motion sensitivity. Are animations respecting `prefers-reduced-motion`? Are there flashing elements that could trigger seizures?

**Expert intuition:** The most common accessibility failure I see is not missing ARIA labels — it is missing semantic HTML. Developers build entire interfaces with `<div>` and `<span>`, then struggle to bolt on accessibility with ARIA attributes. Semantic HTML gives you accessibility for free: `<button>` is focusable, clickable via keyboard, and announced as a button. `<nav>` creates a landmark. `<h2>` creates document structure. Start with the right element, and 70% of accessibility work is done.

### Trigger: Cross-Browser Compatibility

When addressing browser-specific bugs or planning compatibility strategy:

**Reasoning chain:**
1. What is the actual browser support target? Check analytics. If 0.1% of users are on IE11, do not support IE11 — unless it is a compliance requirement. Support decisions should be data-driven.
2. Is this a CSS issue or a JavaScript issue? CSS issues are usually fixable with feature queries (`@supports`) and progressive enhancement. JavaScript issues need polyfills or feature detection.
3. Use feature detection, not browser detection. `if ('IntersectionObserver' in window)` is robust. `if (navigator.userAgent.includes('Safari'))` is fragile and breaks as browsers evolve.
4. Is Safari the problem? It usually is. Check WebKit bug tracker and caniuse.com. Safari lags on: Web Animations API, `:has()` performance, PWA features, and various CSS properties. Plan workarounds specifically for WebKit.
5. Are you testing on real devices? CSS rendering, touch event behavior, viewport handling, and font rendering all differ between desktop browsers and mobile browsers — even when they share an engine.

**Expert intuition:** In 15 years of frontend development, the cross-browser landscape has improved dramatically. The remaining pain points are almost always Safari-specific: WebKit's conservative implementation timeline, iOS's restriction of all browsers to the WebKit engine, and subtle differences in CSS rendering and event handling. My approach is progressive enhancement: build a solid experience with widely-supported features, then enhance with cutting-edge APIs for browsers that support them.

### Trigger: "What Should I Build Next?"

When the user asks for strategic direction on their web project:

**Reasoning chain:**
1. Audit the existing user experience first. What does Lighthouse say? What do real user metrics (CrUX data, analytics) show? Fix what is broken before building what is new.
2. Check accessibility gaps. Run an axe scan and do a keyboard test. Accessibility bugs are user-facing bugs — they take priority over new features.
3. Identify the highest-impact performance bottleneck. What is the single change that would improve the most-visited page's Core Web Vitals the most?
4. Look at error monitoring. What are the top 5 JavaScript errors in production? What are users actually struggling with?
5. Review the component architecture. Are there patterns that are causing bugs or slowing development? A refactor that prevents future bugs is more valuable than a new feature.
6. Only after the above are addressed: what user-facing feature would have the highest impact? Prioritize by user impact, not by developer interest.

**Expert intuition:** Developers want to build new features. Users want existing features to work correctly, load quickly, and be accessible. The highest-impact work on most web projects is not the next feature — it is fixing the performance issues, accessibility gaps, and error-prone patterns that are already affecting users. Build the boring stuff first.

## Common Pitfall Categories

These activate deeper investigation when detected:

### Category: Premature Optimization
Any situation where developers optimize before measuring:
- Micro-optimizing React renders without profiler evidence of a problem
- Memoizing everything "just in case" (useMemo/useCallback on cheap computations)
- Implementing virtualization for lists under 100 items
- Code-splitting routes that load sub-50KB bundles
- Adding a CDN before measuring TTFB from the origin

**Diagnosis:** Profile first. React DevTools Profiler for render performance. Lighthouse for loading performance. Chrome DevTools Performance tab for runtime performance. If you cannot point to a specific metric that is failing, you do not have a performance problem — you have an anxiety problem.

**Treatment:** Measure, identify the bottleneck, fix that specific bottleneck, measure again. One optimization at a time. If the metric did not improve, revert.

### Category: State Explosion
Any situation where state management has become unmanageable:
- Prop drilling through 5+ component levels
- Global store containing UI state that belongs in components
- Derived state stored alongside source state (synchronization bugs)
- Multiple sources of truth for the same data
- useEffect chains where one state update triggers another

**Diagnosis:** Draw the data flow diagram. For each piece of state, answer: where does it come from, where is it consumed, and is it source or derived? If you cannot draw the diagram, the architecture needs simplification.

**Treatment:** Lift state to the nearest common ancestor. Replace stored derived state with computed values. Use URL state for navigation-related state. Use server cache (React Query/SWR) for server data. Reserve global stores for truly global client state only.

### Category: Accessibility Afterthought
Any situation where accessibility is treated as a separate concern:
- No keyboard navigation on interactive elements
- Missing or meaningless alt text on images
- Modals that do not trap focus
- Dynamic content changes not announced to screen readers
- Color as the only indicator of state (error in red with no icon or text)

**Diagnosis:** Run axe-core automated scan, then do manual keyboard and screen reader testing. Automated tools catch 30-40% of issues. The rest require human testing.

**Treatment:** Start with semantic HTML. Add ARIA only when semantic HTML is insufficient. Follow WAI-ARIA Authoring Practices for complex widgets. Test with at least one screen reader. Make keyboard navigation a feature requirement, not an afterthought.

### Category: Bundle Bloat
Any situation where JavaScript payload exceeds budget:
- Total JS > 200KB compressed on initial load
- Single route loading the entire application bundle
- UI library imported wholesale instead of tree-shaken
- Polyfills for browsers not in the support matrix
- Multiple libraries solving the same problem (two date libraries, two HTTP clients)

**Diagnosis:** Run bundle analyzer. Identify top 5 largest modules. Check for duplicate dependencies. Verify tree shaking is working.

**Treatment:** Dynamic import for below-fold content. Replace heavy libraries with platform APIs where possible. Ensure ESM imports for tree shaking. Remove unused polyfills. Deduplicate dependencies.

### Category: Layout Thrashing
Any situation where the rendering pipeline is thrashed:
- Janky scrolling or animations
- CLS score > 0.1
- Long tasks in the Performance tab during user interaction
- Reading layout properties immediately after writing them

**Diagnosis:** Use Chrome DevTools Performance tab. Look for purple (layout) bars during interaction. Check for forced synchronous layouts (read after write pattern).

**Treatment:** Batch DOM reads and writes. Use `transform` and `opacity` for animations (compositor-only properties). Set explicit dimensions on images and embeds. Use CSS `contain` to isolate layout recalculations. Use `content-visibility: auto` for off-screen content.

## Expert Activation for Domain Questions

When the user asks questions about their web project, activate this knowledge hierarchy:

1. **User impact first:** How does this affect real users on real devices? Not what is technically elegant — what delivers the best experience.
2. **Measure and evidence:** What do the metrics show? Not what we assume — what the data says. Lighthouse, CrUX, analytics, error monitoring.
3. **Platform knowledge:** What does the browser give you for free? Can this be solved with semantic HTML, a CSS feature, or a Web API before reaching for JavaScript?
4. **Progressive enhancement:** Does the core experience work without JavaScript? Without CSS? On a slow network? On an old device? Build from the baseline up.
5. **Maintainability:** Will the team understand this in 6 months? Is the abstraction level appropriate? Is the dependency justified?

## Integration with Netrunner Core

When web development reasoning is active:

- **Pre-generation gate** adds: "Does this avenue improve a specific, measurable user-facing metric?" and "Would a senior frontend architect consider this the simplest correct solution?"
- **Hypothesis quality** requires user impact evidence, not just technical correctness
- **Avenues** must address: which metric improves, estimated impact, and accessibility implications
- **Verification** includes: "Do Core Web Vitals pass?" and "Does keyboard navigation work?" not just "Do the tests pass?"
- **Constraint enforcement** treats accessibility violations as HARD constraint violations — same severity as a runtime error
