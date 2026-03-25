# Workflow: Build Web Application

<purpose>
End-to-end web application building from design system to production deployment.
6 mandatory phases in strict order. Each phase has a gate that must pass before proceeding.
This workflow enforces performance budgets, accessibility standards, and component quality at every stage.
</purpose>

<inputs>
- Project requirements from user (via run.md BUILD_WEBAPP classification)
- `.planning/CONTEXT.md` — project context, constraints, prior work
- Framework choice, rendering strategy, target audience
</inputs>

<prerequisites>
- Web persona must be active (web domain signals in CONTEXT.md)
- References loaded: web-reasoning.md, web-performance.md, web-code-patterns.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "DESIGN_SYSTEM",       # Phase 1: Design tokens, primitives, accessibility foundations
    "COMPONENT_ARCH",      # Phase 2: Component architecture, composition, reuse patterns
    "PAGE_IMPLEMENTATION", # Phase 3: Routes, pages, data fetching
    "STATE_MANAGEMENT",    # Phase 4: Data flow, caching, server/client state separation
    "PERFORMANCE",         # Phase 5: Core Web Vitals optimization, bundle optimization
    "DEPLOYMENT"           # Phase 6: Production readiness, monitoring, CI/CD
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from PERFORMANCE back to COMPONENT_ARCH).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL violations remain unresolved from prior audits

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

## Phase 1: DESIGN SYSTEM FOUNDATION

**Goal:** Establish the visual and interactive foundation that every component will build upon.

### 1.1 Design Token Definition

Define the design token system before writing any component:

```typescript
// tokens.ts — single source of truth for all visual decisions
export const tokens = {
  color: {
    // Semantic tokens, not raw values
    textPrimary: 'var(--color-text-primary)',
    textSecondary: 'var(--color-text-secondary)',
    bgSurface: 'var(--color-bg-surface)',
    bgCanvas: 'var(--color-bg-canvas)',
    accent: 'var(--color-accent)',
    error: 'var(--color-error)',
    success: 'var(--color-success)',
    focusRing: 'var(--color-focus-ring)',
  },
  spacing: {
    xs: '0.25rem',  // 4px
    sm: '0.5rem',   // 8px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
    xxl: '3rem',    // 48px
  },
  typography: {
    fontFamily: {
      body: 'system-ui, -apple-system, sans-serif',
      mono: 'ui-monospace, monospace',
    },
    fontSize: {
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '2rem',
    },
  },
  breakpoint: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
  },
} as const;
```

```css
/* CSS custom properties for runtime theming */
:root {
  --color-text-primary: #1a1a1a;
  --color-text-secondary: #666666;
  --color-bg-surface: #ffffff;
  --color-bg-canvas: #f5f5f5;
  --color-accent: #0066cc;
  --color-error: #dc2626;
  --color-success: #16a34a;
  --color-focus-ring: #4d90fe;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text-primary: #e5e5e5;
    --color-text-secondary: #a3a3a3;
    --color-bg-surface: #262626;
    --color-bg-canvas: #171717;
    --color-accent: #60a5fa;
    --color-error: #f87171;
    --color-success: #4ade80;
    --color-focus-ring: #93bbfd;
  }
}
```

### 1.2 Primitive Component Library

Build the foundational components that everything else composes from:

**Required primitives:**
- `Button` — with variants (primary, secondary, ghost), sizes, loading state, disabled state
- `Input` — text, email, password, search with label, error message, help text
- `Stack` / `Flex` — layout primitives replacing ad-hoc flexbox
- `Text` / `Heading` — typography components enforcing the type scale
- `Card` — content container with header/body/footer slots
- `Dialog` / `Modal` — with focus trap, Escape key, background click
- `Icon` — accessible icon wrapper (aria-hidden for decorative, aria-label for meaningful)

**Every primitive MUST include:**
1. Keyboard interaction (focus, Enter/Space activation, Escape dismissal)
2. ARIA attributes (role, aria-label, aria-expanded, aria-pressed as needed)
3. Visible focus indicator (outline, not just color change)
4. Reduced motion support (`prefers-reduced-motion` media query)

### 1.3 Accessibility Foundations

```typescript
// Focus management utility — used across all interactive components
export function useFocusTrap(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const focusable = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }

    element.addEventListener('keydown', handleKeyDown);
    first?.focus();

    return () => element.removeEventListener('keydown', handleKeyDown);
  }, [ref]);
}

// Screen reader announcement utility
export function useAnnounce() {
  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', priority);
    el.setAttribute('aria-atomic', 'true');
    el.className = 'sr-only';
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }, []);

  return announce;
}
```

### 1.4 Outputs

- `src/tokens/` — design token definitions (CSS custom properties + TypeScript constants)
- `src/components/primitives/` — Button, Input, Stack, Text, Card, Dialog, Icon
- `src/utils/a11y.ts` — focus trap, announcer, keyboard utilities
- `.planning/DESIGN_SYSTEM.md` — token documentation, component inventory

### Gate: COMPONENT_INVENTORY_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Design system foundation audit",
  prompt="Audit the design system foundation.

  Check:
  1. ALL primitive components have keyboard interaction
  2. ALL interactive elements have accessible labels
  3. Focus indicators are visible on all focusable elements
  4. Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text)
  5. Design tokens are used consistently — no raw color/spacing values
  6. prefers-reduced-motion is respected in all animations
  7. All primitives render correctly with prefers-color-scheme: dark

  Scoring:
  - CRITICAL (missing keyboard support, no focus indicator, contrast failure): -20 points
  - WARNING (raw values instead of tokens, missing dark mode): -5 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-DESIGN-SYSTEM.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 2: COMPONENT ARCHITECTURE

**Goal:** Build application-specific components from primitives with proper composition, data flow, and render boundaries.

### 2.1 Component Hierarchy Design

Before writing components, map the component tree:

```
App
├── Layout (server component — no JS)
│   ├── Header (client — has interactive nav)
│   ├── Sidebar (client — has toggle state)
│   └── Main
│       ├── PageHeader (server — static per route)
│       └── PageContent (varies by route)
└── Providers (client — theme, auth, query client)
```

Rules:
- **Server components** by default — only mark as client when interactivity is needed
- **Error boundaries** at page boundaries — one component failure does not crash the app
- **Suspense boundaries** at data boundaries — each data source can load independently
- **Context boundaries** at state boundaries — avoid context that re-renders the entire tree

### 2.2 Composition Patterns

```typescript
// WRONG: configuration component with prop explosion
<DataTable
  data={data}
  columns={columns}
  sortable={true}
  filterable={true}
  filterComponent={CustomFilter}
  paginatable={true}
  pageSize={20}
  onSort={handleSort}
  onFilter={handleFilter}
  onPageChange={handlePageChange}
  emptyMessage="No data"
  loadingComponent={Spinner}
  headerClassName="custom-header"
  rowClassName={(row) => row.active ? 'active' : ''}
/>

// CORRECT: composition with slot pattern
<DataTable data={data}>
  <DataTable.Header>
    <DataTable.SortableColumn field="name">Name</DataTable.SortableColumn>
    <DataTable.SortableColumn field="date">Date</DataTable.SortableColumn>
    <DataTable.Column field="status">Status</DataTable.Column>
  </DataTable.Header>
  <DataTable.Body>
    {(row) => (
      <DataTable.Row className={row.active ? 'active' : ''}>
        <DataTable.Cell>{row.name}</DataTable.Cell>
        <DataTable.Cell>{formatDate(row.date)}</DataTable.Cell>
        <DataTable.Cell><StatusBadge status={row.status} /></DataTable.Cell>
      </DataTable.Row>
    )}
  </DataTable.Body>
  <DataTable.Empty>No data found</DataTable.Empty>
  <DataTable.Pagination pageSize={20} />
</DataTable>
```

### 2.3 Render Boundary Optimization

```typescript
// WRONG: entire form re-renders on every keystroke
function CheckoutForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  // Typing in name field re-renders email, address, and summary

  return (
    <form>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <input value={address} onChange={(e) => setAddress(e.target.value)} />
      <ExpensiveOrderSummary /> {/* Re-renders on every keystroke */}
    </form>
  );
}

// CORRECT: isolated state in child components
function CheckoutForm() {
  return (
    <form>
      <NameField />    {/* Only re-renders when name changes */}
      <EmailField />   {/* Only re-renders when email changes */}
      <AddressField /> {/* Only re-renders when address changes */}
      <OrderSummary /> {/* Only re-renders when cart changes */}
    </form>
  );
}
```

### 2.4 Outputs

- `src/components/` — application-specific components built from primitives
- `src/layouts/` — page layout components (server components where possible)
- `.planning/ARCHITECTURE.md` — component tree diagram, data flow map

### Gate: COMPOSITION_REVIEW

```
Task(
  subagent_type="nr-verifier",
  description="Component architecture review",
  prompt="Review the component architecture for composition and reuse.

  Load references/web-code-patterns.md for common anti-patterns.

  Check:
  1. No component has more than 10 props (split into composition)
  2. No prop drilling deeper than 3 levels (use context or composition)
  3. Server and client components are correctly separated
  4. Error boundaries exist at page-level boundaries
  5. Suspense boundaries exist at data-fetching boundaries
  6. No business logic in primitive/reusable components
  7. Render boundaries prevent unnecessary re-renders

  Scoring:
  - CRITICAL (prop explosion, missing error boundary, biz logic in primitives): -20 points
  - WARNING (deep prop drilling, missing Suspense boundary): -10 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-COMPONENT-ARCH.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 3: PAGE IMPLEMENTATION

**Goal:** Build all routes and pages, connecting components to data sources with proper loading, error, and empty states.

### 3.1 Route Structure

Define all routes before implementing pages:

```typescript
// Route map — every page and its data requirements
const routes = [
  { path: '/', component: 'Home', data: ['featured'], auth: false },
  { path: '/products', component: 'ProductList', data: ['products'], auth: false },
  { path: '/products/:slug', component: 'ProductDetail', data: ['product', 'related'], auth: false },
  { path: '/cart', component: 'Cart', data: ['cart'], auth: false },
  { path: '/checkout', component: 'Checkout', data: ['cart', 'user'], auth: true },
  { path: '/account', component: 'Account', data: ['user', 'orders'], auth: true },
];
```

### 3.2 Page Component Pattern

Every page follows the same structure:

```typescript
// Consistent page pattern: metadata + data + layout + error handling
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = await getProduct(params.slug);
  return {
    title: product?.name ?? 'Product Not Found',
    description: product?.description?.slice(0, 160),
  };
}

export default async function ProductPage({ params }: PageProps) {
  const product = await getProduct(params.slug);
  if (!product) notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      <Breadcrumbs items={[
        { label: 'Products', href: '/products' },
        { label: product.name, href: `/products/${product.slug}` },
      ]} />

      <ProductHeader product={product} />

      <ErrorBoundary fallback={<p>Failed to load gallery</p>}>
        <Suspense fallback={<GallerySkeleton />}>
          <ProductGallery images={product.images} />
        </Suspense>
      </ErrorBoundary>

      <ErrorBoundary fallback={<p>Failed to load recommendations</p>}>
        <Suspense fallback={<RecommendationsSkeleton />}>
          <RelatedProducts categoryId={product.categoryId} />
        </Suspense>
      </ErrorBoundary>
    </main>
  );
}
```

### 3.3 Loading and Error States

Every async boundary MUST have:
1. **Loading state** — skeleton screen matching the content layout (not a spinner)
2. **Error state** — meaningful error message with retry action
3. **Empty state** — helpful message when data exists but collection is empty

```typescript
// Skeleton that matches the actual content layout — prevents CLS
function ProductCardSkeleton() {
  return (
    <div className="product-card" aria-hidden="true">
      <div className="skeleton" style={{ aspectRatio: '1/1' }} />
      <div className="skeleton skeleton-text" style={{ width: '80%' }} />
      <div className="skeleton skeleton-text" style={{ width: '40%' }} />
    </div>
  );
}
```

### 3.4 Outputs

- `src/app/` or `src/pages/` — all route pages implemented
- `src/components/skeletons/` — skeleton loading states for every async boundary
- SEO metadata for every public page

### Gate: ROUTE_COMPLETENESS_CHECK

```
Task(
  subagent_type="nr-verifier",
  description="Route and page completeness check",
  prompt="Verify all routes are implemented with proper states.

  Check:
  1. Every route in the route map has a corresponding page component
  2. Every async boundary has loading, error, and empty states
  3. Every public page has SEO metadata (title, description, OG tags)
  4. Every page has a skip-to-content link and landmark regions
  5. 404 and 500 error pages exist and are user-friendly
  6. Protected routes redirect unauthenticated users appropriately
  7. Breadcrumbs or navigation context exists on all subpages

  Scoring:
  - CRITICAL (missing route, no error handling, no 404 page): -20 points
  - WARNING (missing metadata, no empty state, no breadcrumbs): -5 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-ROUTES.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 4: STATE MANAGEMENT

**Goal:** Establish clean data flow with proper separation of server state, client state, and URL state.

### 4.1 State Audit

Categorize every piece of state in the application:

| State | Type | Source | Storage | Update Frequency |
|-------|------|--------|---------|-----------------|
| User session | Server | Auth API | Cookie + React Query | On login/logout |
| Product list | Server | Products API | React Query cache | On filter change |
| Cart items | Client/Server | Local + Cart API | Zustand + API sync | On add/remove |
| Filter selection | URL | Search params | URL state | On user interaction |
| Modal open/close | Client | User action | Component state | On click |
| Form draft | Client | User input | Component state | On keystroke |

### 4.2 State Placement Rules

```typescript
// Rule 1: Server data → React Query / SWR
const { data: products } = useQuery({
  queryKey: ['products', { category, sort }],
  queryFn: () => fetchProducts({ category, sort }),
});

// Rule 2: URL-dependent state → URL search params
const [searchParams, setSearchParams] = useSearchParams();
const category = searchParams.get('category') ?? 'all';

// Rule 3: UI state used by 1-2 components → component state
const [isOpen, setIsOpen] = useState(false);

// Rule 4: UI state shared across distant components → lightweight store
const useCartStore = create<CartState>((set) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

// Rule 5: Derived state → compute, never store
// WRONG: const [filteredProducts, setFilteredProducts] = useState([]);
// CORRECT:
const filteredProducts = useMemo(
  () => products?.filter((p) => p.category === category),
  [products, category]
);
```

### 4.3 Outputs

- Data fetching layer configured (React Query / SWR / server components)
- State stores for global client state
- URL state management for filter/pagination state
- `.planning/STATE_MAP.md` — complete state inventory

### Gate: DATA_FLOW_VALIDATION

```
Task(
  subagent_type="nr-verifier",
  description="Data flow and state management validation",
  prompt="Validate the state management architecture.

  Load references/web-code-patterns.md for state anti-patterns.

  Check:
  1. Server data uses a cache layer (React Query/SWR), not manual useState+useEffect
  2. No derived state is stored — all derived values are computed
  3. URL state is used for shareable/bookmarkable state (filters, pagination, sort)
  4. No prop drilling deeper than 3 levels
  5. No useEffect chains where one state update triggers another
  6. Optimistic updates have rollback handling for failure cases
  7. Loading and error states cover all async operations

  Scoring:
  - CRITICAL (manual server state, stored derived state, no error handling): -20 points
  - WARNING (deep prop drilling, no optimistic updates, missing loading state): -10 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-STATE.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 5: PERFORMANCE OPTIMIZATION

**Goal:** Meet Core Web Vitals targets and performance budgets across all routes and devices.

### 5.1 Performance Budget Definition

Define budgets BEFORE optimizing:

```markdown
| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| LCP | < 2.5s | TBD | |
| INP | < 200ms | TBD | |
| CLS | < 0.1 | TBD | |
| TTFB | < 800ms | TBD | |
| JS (initial) | < 150KB | TBD | |
| JS (per route) | < 80KB | TBD | |
| Images (per page) | < 500KB | TBD | |
| Lighthouse Perf | >= 90 | TBD | |
| Lighthouse A11y | >= 95 | TBD | |
| Lighthouse BP | >= 90 | TBD | |
```

### 5.2 Optimization Checklist

Load `references/web-performance.md` and apply in order of impact:

1. **Images:** responsive srcset, WebP/AVIF, lazy loading below fold, explicit dimensions
2. **Fonts:** preload, font-display: optional or swap with size-adjust fallback
3. **JavaScript:** route-based code splitting, dynamic imports for heavy components
4. **CSS:** critical CSS inlined, rest loaded async, no render-blocking stylesheets
5. **Caching:** immutable headers for hashed assets, stale-while-revalidate for API
6. **Third-party:** defer non-critical scripts, lazy load analytics/ads
7. **Rendering:** content-visibility: auto for off-screen content, CSS containment

### 5.3 Bundle Analysis

```bash
# Generate and review bundle analysis
npx webpack-bundle-analyzer stats.json
# or
npx vite-bundle-visualizer

# Check for duplicate dependencies
npm ls --all | grep -E "^[├│└]" | sort | uniq -d

# Verify tree shaking
# Look for lodash, moment, or date-fns being fully bundled
```

### 5.4 Outputs

- Optimized image pipeline (responsive, compressed, lazy)
- Code-split routes with per-route budgets met
- Caching headers configured
- Performance metrics baseline documented

### Gate: LIGHTHOUSE_AUDIT

```
Task(
  subagent_type="nr-verifier",
  description="Performance and accessibility audit via Lighthouse",
  prompt="Run Lighthouse audit on all key routes.

  Load references/web-performance.md for metric targets and optimization patterns.

  Requirements (ALL must pass):
  1. Lighthouse Performance score >= 90 on mobile
  2. Lighthouse Accessibility score >= 95
  3. Lighthouse Best Practices score >= 90
  4. LCP < 2.5s on all routes (mobile simulation)
  5. CLS < 0.1 on all routes
  6. INP < 200ms on interactive pages
  7. Total JS per route < 80KB compressed
  8. No render-blocking resources
  9. All images have explicit dimensions
  10. All images use modern formats (WebP/AVIF)

  Scoring:
  - CRITICAL (Lighthouse score below threshold, CLS > 0.25): -20 points
  - WARNING (LCP 2.5-4s, missing image optimization): -10 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-PERFORMANCE.md
  Return: PASS/FAIL with score and per-route breakdown"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

---

## Phase 6: DEPLOYMENT & MONITORING

**Goal:** Production readiness with monitoring, error tracking, and operational runbooks.

### 6.1 Production Readiness Checklist

| Category | Check | Status |
|----------|-------|--------|
| Security | CSP headers configured | |
| Security | HTTPS enforced, HSTS enabled | |
| Security | No inline scripts without nonce/hash | |
| Security | Sanitization on all user-generated content | |
| Performance | CDN configured for static assets | |
| Performance | Compression (Brotli/gzip) enabled | |
| Performance | Cache headers set (immutable for hashed, revalidate for HTML) | |
| Monitoring | Error tracking (Sentry/Datadog) configured | |
| Monitoring | Core Web Vitals reporting (web-vitals library) | |
| Monitoring | Uptime monitoring configured | |
| SEO | robots.txt and sitemap.xml generated | |
| SEO | OG tags and structured data on all pages | |
| Accessibility | WCAG AA compliance verified | |
| Accessibility | Screen reader tested (NVDA or VoiceOver) | |
| Legal | Cookie consent (if required by jurisdiction) | |
| Legal | Privacy policy linked | |

### 6.2 Monitoring Setup

```typescript
// Error tracking
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
});

// Core Web Vitals reporting
import { onLCP, onINP, onCLS } from 'web-vitals';

function reportVital(metric: { name: string; value: number }) {
  navigator.sendBeacon('/api/vitals', JSON.stringify({
    name: metric.name,
    value: metric.value,
    url: window.location.href,
    connection: (navigator as any).connection?.effectiveType,
  }));
}

onLCP(reportVital);
onINP(reportVital);
onCLS(reportVital);
```

### 6.3 Outputs

- Production deployment configuration
- Error tracking and monitoring setup
- Core Web Vitals reporting pipeline
- `.planning/DEPLOYMENT.md` — production checklist, runbook

### Gate: PRODUCTION_READINESS

```
Task(
  subagent_type="nr-verifier",
  description="Production readiness checklist verification",
  prompt="Verify the application is ready for production deployment.

  Check:
  1. ALL items in the production readiness checklist are completed
  2. Error tracking is configured and verified (test error reaches dashboard)
  3. Core Web Vitals reporting is configured and sending data
  4. CSP headers are set and do not block legitimate resources
  5. HTTPS is enforced with proper HSTS headers
  6. SEO essentials: sitemap, robots.txt, OG tags all present
  7. No console.log statements in production code
  8. Environment variables are properly configured (no hardcoded secrets)
  9. Build produces no TypeScript errors and no ESLint warnings
  10. All Lighthouse scores meet thresholds from Phase 5

  Scoring:
  - CRITICAL (missing error tracking, no HTTPS, hardcoded secrets): -20 points
  - WARNING (missing monitoring, console.log in prod): -5 points
  - Must score >= 90 to pass

  Write audit: .planning/audit/AUDIT-PRODUCTION.md
  Return: PASS/FAIL with score"
)
```

**If FAIL:** Fix violations, re-run audit. Max 3 retries.

</procedure>

<gate_failure_protocol>

Maximum 3 gate retries per phase. After 3 failures:
- HALT the workflow
- Write to CONTEXT.md: "Phase [N] gate failed 3 times — requires user intervention"
- Present failure summary to user with specific unresolved violations
- Ask: "How would you like to proceed?"

</gate_failure_protocol>

<artifacts>

## Artifacts Per Phase

| Phase | Key Artifacts | Audit Report |
|-------|--------------|--------------|
| 1. Design System | Token definitions, primitive components, a11y utilities | AUDIT-DESIGN-SYSTEM.md |
| 2. Component Architecture | Application components, layouts, composition patterns | AUDIT-COMPONENT-ARCH.md |
| 3. Page Implementation | All route pages, skeletons, metadata | AUDIT-ROUTES.md |
| 4. State Management | Data fetching layer, state stores, URL state | AUDIT-STATE.md |
| 5. Performance | Optimized assets, code splitting, caching | AUDIT-PERFORMANCE.md |
| 6. Deployment | Production config, monitoring, error tracking | AUDIT-PRODUCTION.md |

All artifacts are written to the project source directory.
All audits are written to `.planning/audit/`.

</artifacts>

<integration>

## Integration with run.md

This workflow is dispatched when run.md classifies intent as `BUILD_WEBAPP`:

**Detection signals (need 3+ for activation):**
- COLD state (no existing .planning/ for this project)
- User mentions "build a web app", "create a website", "build a frontend", "build a React app"
- Web persona already active (web domain signals in CONTEXT.md)
- Web-specific language: components, pages, routes, responsive, mobile-first

**Handoff from run.md:**
```
run.md CLASSIFY → BUILD_WEBAPP detected
  → Load build-webapp.md workflow
  → Execute Phase 1 through Phase 6 sequentially
  → Each phase: execute → gate → pass/fail → next or remediate
  → Phase 6 gate: production readiness
  → On completion: return control to run.md → DONE action
```

**State tracking:**
Update STATE.md after each phase completion:
```bash
node ~/.claude/netrunner/bin/nr-tools.cjs state update-phase \
  --phase "[phase_name]" --status "COMPLETE" --gate "PASS" --score "[score]"
```

</integration>

<success_criteria>

## Success Criteria

The workflow is COMPLETE when ALL of the following are true:

1. **All 6 phases completed in strict order** — no phases skipped
2. **All gates passed** — verifier score >= 90 for each
3. **Performance targets met:**
   - Lighthouse Performance >= 90
   - Lighthouse Accessibility >= 95
   - Lighthouse Best Practices >= 90
   - LCP < 2.5s, INP < 200ms, CLS < 0.1
   - JS per route < 80KB compressed
4. **Accessibility verified:**
   - WCAG AA compliance
   - Keyboard navigation on all interactive elements
   - Screen reader tested
5. **Production ready:**
   - Error tracking and monitoring configured
   - Core Web Vitals reporting active
   - Security headers set
6. **Documentation complete:**
   - Component inventory
   - State map
   - Deployment runbook

</success_criteria>
