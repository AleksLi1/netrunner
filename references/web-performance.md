# Web Performance Deep Reference

## When to Load This Reference

Load when ANY of these keywords or signals appear in the task context:
- LCP, CLS, INP, FCP, TTFB, Core Web Vitals, CWV
- Lighthouse, PageSpeed, performance audit, performance budget
- Bundle size, code splitting, tree shaking, lazy loading
- SSR, SSG, ISR, streaming, hydration, rendering strategy
- Image optimization, font loading, resource hints
- Accessibility performance, focus management, reduced motion
- Server state, client state, cache invalidation, optimistic updates

## How to Use This Reference

This reference provides deep knowledge on web performance optimization. Each section contains:
1. Conceptual explanation of the problem space
2. Measurement techniques with specific tools and metrics
3. WRONG/CORRECT code pairs showing common mistakes and fixes
4. Decision frameworks for choosing between approaches

---

## 1. Core Web Vitals Deep Dive

Core Web Vitals are Google's standardized metrics for user experience. They measure loading (LCP), interactivity (INP), and visual stability (CLS).

### 1.1 Largest Contentful Paint (LCP)

**What it measures:** The time from navigation start until the largest visible element (image, video, text block) finishes rendering.

**Targets:**
| Rating | Threshold | User Perception |
|--------|-----------|----------------|
| Good | < 2.5s | Content appears quickly |
| Needs Improvement | 2.5s - 4.0s | Noticeable wait |
| Poor | > 4.0s | Users consider leaving |

**Common LCP Elements:**
- Hero images or background images
- Large text blocks (headings, paragraphs)
- Video poster images
- SVG elements

**Optimization Chain (ordered by impact):**

1. **Eliminate render-blocking resources:**
```html
<!-- WRONG: synchronous CSS and JS block first render -->
<head>
  <link rel="stylesheet" href="/styles/main.css">
  <link rel="stylesheet" href="/styles/components.css">
  <link rel="stylesheet" href="/styles/utilities.css">
  <script src="/js/analytics.js"></script>
</head>

<!-- CORRECT: critical CSS inline, rest deferred -->
<head>
  <style>
    /* Critical CSS: only styles needed for above-fold content */
    .hero { display: flex; align-items: center; min-height: 60vh; }
    .hero-title { font-size: 3rem; font-weight: 700; }
  </style>
  <link rel="preload" href="/styles/main.css" as="style" onload="this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="/styles/main.css"></noscript>
  <script src="/js/analytics.js" defer></script>
</head>
```

2. **Preload the LCP resource:**
```html
<!-- Tell the browser about the LCP image before it discovers it in CSS/JS -->
<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">

<!-- For responsive images, preload the most likely candidate -->
<link rel="preload" as="image" href="/hero-1200.webp"
      imagesrcset="/hero-400.webp 400w, /hero-800.webp 800w, /hero-1200.webp 1200w"
      imagesizes="100vw">
```

3. **Optimize server response time (TTFB):**
```typescript
// WRONG: every request hits the database
export async function getServerSideProps() {
  const data = await db.query('SELECT * FROM articles WHERE featured = true');
  return { props: { articles: data } };
}

// CORRECT: cache at the edge with stale-while-revalidate
export async function getStaticProps() {
  const data = await db.query('SELECT * FROM articles WHERE featured = true');
  return {
    props: { articles: data },
    revalidate: 60, // Regenerate at most every 60 seconds
  };
}

// CDN headers for API responses
// Cache-Control: public, s-maxage=60, stale-while-revalidate=300
```

### 1.2 Interaction to Next Paint (INP)

**What it measures:** The worst interaction latency across the page lifecycle. An "interaction" is a click, tap, or keyboard input. INP measures from the event to the next paint.

**Targets:**
| Rating | Threshold | User Perception |
|--------|-----------|----------------|
| Good | < 200ms | Instant response |
| Needs Improvement | 200ms - 500ms | Slight delay |
| Poor | > 500ms | App feels broken |

**Components of interaction latency:**
```
INP = Input Delay + Processing Time + Presentation Delay
       (queued)     (event handler)    (render + paint)
```

**Optimization strategies:**

1. **Break up long tasks:**
```typescript
// WRONG: 200ms synchronous processing blocks the thread
function handleFilterChange(filters: Filters) {
  const results = expensiveFilter(items, filters); // 150ms
  setState({ results, filters }); // 50ms render
  // Total: 200ms — user sees no response for 200ms
}

// CORRECT: yield to the browser between processing and rendering
function handleFilterChange(filters: Filters) {
  // Immediate visual feedback
  setState({ filters, isFiltering: true });

  // Schedule heavy work after paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      const results = expensiveFilter(items, filters);
      setState({ results, isFiltering: false });
    }, 0);
  });
}

// BEST: use scheduler.yield() for explicit yielding (Chrome 129+)
async function handleFilterChange(filters: Filters) {
  setState({ filters, isFiltering: true });
  await scheduler.yield(); // Give browser a chance to paint
  const results = expensiveFilter(items, filters);
  setState({ results, isFiltering: false });
}
```

2. **Debounce frequent interactions:**
```typescript
// WRONG: filter runs on every keystroke
<input onChange={(e) => filterProducts(e.target.value)} />

// CORRECT: debounce the expensive operation, not the input update
function SearchInput() {
  const [inputValue, setInputValue] = useState('');
  const debouncedSearch = useMemo(
    () => debounce((query: string) => filterProducts(query), 300),
    []
  );

  return (
    <input
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value); // Immediate: input feels responsive
        debouncedSearch(e.target.value); // Deferred: expensive work is batched
      }}
    />
  );
}
```

### 1.3 Cumulative Layout Shift (CLS)

**What it measures:** The total of all unexpected layout shifts during the page lifecycle. A layout shift occurs when a visible element changes position between two frames without user interaction.

**Targets:**
| Rating | Threshold | User Perception |
|--------|-----------|----------------|
| Good | < 0.1 | Stable layout |
| Needs Improvement | 0.1 - 0.25 | Occasional jumps |
| Poor | > 0.25 | Frustrating instability |

**CLS formula:** `impact_fraction * distance_fraction`
- Impact fraction: how much of the viewport was affected
- Distance fraction: how far the element moved

**Top CLS causes and fixes:**

```typescript
// CAUSE 1: Images without dimensions
// WRONG:
<img src="/photo.jpg" />

// CORRECT: explicit dimensions or aspect-ratio
<img src="/photo.jpg" width={800} height={600} style={{ maxWidth: '100%', height: 'auto' }} />
// Or CSS:
// img { aspect-ratio: 4/3; width: 100%; height: auto; }

// CAUSE 2: Dynamically injected content above viewport
// WRONG: banner appears after 2 seconds, pushes content down
function Page() {
  const [showBanner, setShowBanner] = useState(false);
  useEffect(() => {
    checkPromotion().then((promo) => setShowBanner(!!promo));
  }, []);

  return (
    <div>
      {showBanner && <PromoBanner />} {/* Shifts everything below */}
      <MainContent />
    </div>
  );
}

// CORRECT: reserve space for dynamic content
function Page() {
  const [promo, setPromo] = useState<Promo | null>(null);

  useEffect(() => {
    checkPromotion().then(setPromo);
  }, []);

  return (
    <div>
      <div style={{ minHeight: '60px' }}> {/* Space always reserved */}
        {promo && <PromoBanner promo={promo} />}
      </div>
      <MainContent />
    </div>
  );
}

// CAUSE 3: Web font swap
// WRONG: swap causes text to reflow
// @font-face { font-display: swap; }

// CORRECT: preload + optional (or size-adjusted fallback)
// <link rel="preload" href="/font.woff2" as="font" crossorigin>
// @font-face { font-display: optional; }
```

---

## 2. Rendering Patterns

Choosing the right rendering pattern is the highest-leverage performance decision for a web application.

### 2.1 Decision Framework

```
Is the content the same for all users?
├── YES: Is it updated frequently?
│   ├── NO → SSG (Static Site Generation)
│   └── YES → ISR (Incremental Static Regeneration)
└── NO: Is the content needed for SEO/LCP?
    ├── YES → SSR (Server-Side Rendering) or Streaming SSR
    └── NO → CSR (Client-Side Rendering) with skeleton
```

### 2.2 Pattern Comparison

| Pattern | TTFB | LCP | INP | JS Bundle | SEO | Best For |
|---------|------|-----|-----|-----------|-----|----------|
| CSR | Fast | Slow | Depends | Large | Poor | Dashboards, admin panels |
| SSR | Slow | Fast | Slow (hydration) | Large | Good | Dynamic personalized pages |
| SSG | Fastest | Fastest | Fast | Small | Best | Blogs, docs, marketing |
| ISR | Fast (cached) | Fast | Fast | Small | Good | E-commerce, news |
| Streaming SSR | Fast | Progressive | Good | Large | Good | Pages with mixed fast/slow data |
| Islands | Fastest | Fast | Best | Minimal | Best | Content-heavy with interactivity |

### 2.3 Streaming SSR

Streaming SSR sends HTML in chunks as data becomes available, instead of waiting for all data before sending anything.

```typescript
// WRONG: traditional SSR — wait for ALL data before sending anything
// User sees blank screen until the slowest API responds
export async function getServerSideProps() {
  const [user, posts, recommendations] = await Promise.all([
    fetchUser(),        // 50ms
    fetchPosts(),       // 100ms
    fetchRecommendations(), // 2000ms — THIS blocks the entire page
  ]);

  return { props: { user, posts, recommendations } };
}

// CORRECT: streaming SSR with Suspense boundaries
// Shell sent immediately, slow components stream in as ready
export default function Page() {
  return (
    <div>
      {/* These render in the initial HTML shell */}
      <Header />
      <UserProfile /> {/* Data fetched server-side, ready immediately */}

      {/* This streams in when recommendations API responds */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations /> {/* Slow data — rendered when ready */}
      </Suspense>
    </div>
  );
}
```

### 2.4 Island Architecture

Islands architecture renders most of the page as static HTML, with interactive "islands" hydrated independently.

```typescript
// Traditional SPA: entire page is a React app — all JS must load before anything is interactive
// Island architecture: only interactive components ship JS

// Static article page with interactive comment section
// The article itself is pure HTML — zero JavaScript
// Only the comment form is an interactive island

// Astro example:
// ---
// import CommentSection from '../components/CommentSection';
// const article = await getArticle(Astro.params.slug);
// ---
// <article>{article.content}</article>
// <CommentSection client:visible articleId={article.id} />
// ^^^ Only this component ships JS, and only when scrolled into view
```

---

## 3. Bundle Optimization

### 3.1 Code Splitting Strategies

```typescript
// WRONG: import everything upfront
import { Chart } from 'chart.js';
import { RichTextEditor } from 'rich-text-editor';
import { PDFViewer } from 'pdf-viewer';
// All three loaded on initial page load, even if user never opens them

// CORRECT: dynamic imports for heavy, below-fold, or conditional components
const Chart = lazy(() => import('chart.js'));
const RichTextEditor = lazy(() => import('./RichTextEditor'));
const PDFViewer = lazy(() => import('./PDFViewer'));

function Dashboard() {
  return (
    <div>
      <DashboardHeader /> {/* Always visible — in main bundle */}

      <Suspense fallback={<ChartSkeleton />}>
        <Chart data={chartData} /> {/* Loaded when rendered */}
      </Suspense>

      {showEditor && (
        <Suspense fallback={<EditorSkeleton />}>
          <RichTextEditor /> {/* Loaded only when user opens editor */}
        </Suspense>
      )}
    </div>
  );
}
```

### 3.2 Route-Based Splitting

```typescript
// Next.js: automatic route-based splitting
// Each page in /pages or /app is a separate chunk
// BUT: shared layout components are in the common chunk

// React Router: manual route splitting
const routes = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, lazy: () => import('./pages/Home') },
      { path: 'dashboard', lazy: () => import('./pages/Dashboard') },
      { path: 'settings', lazy: () => import('./pages/Settings') },
      { path: 'reports/:id', lazy: () => import('./pages/Report') },
    ],
  },
];
```

### 3.3 Tree Shaking Verification

```typescript
// WRONG: CommonJS import — cannot be tree-shaken
const _ = require('lodash');
const result = _.debounce(fn, 300);
// Bundles ALL of lodash (~70KB gzipped)

// WRONG: default import from barrel file
import _ from 'lodash';
const result = _.debounce(fn, 300);
// Still bundles everything

// CORRECT: named ESM import from specific module
import debounce from 'lodash-es/debounce';
const result = debounce(fn, 300);
// Bundles only debounce (~1KB gzipped)

// BEST: use platform API when available
// No import needed — 0KB added to bundle
const result = Object.groupBy(items, (item) => item.category);
// Instead of: import groupBy from 'lodash-es/groupBy';
```

### 3.4 Compression and Delivery

```
# Nginx: enable Brotli (better than gzip for text assets)
brotli on;
brotli_types text/html text/css application/javascript application/json;
brotli_comp_level 6;

# Immutable caching for hashed assets
location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}

# Short cache + revalidation for HTML
location / {
    add_header Cache-Control "public, max-age=0, must-revalidate";
}
```

---

## 4. Image Optimization

Images are typically the largest resources on a web page and the most common LCP element.

### 4.1 Format Selection

| Format | Use Case | Compression | Browser Support |
|--------|----------|-------------|----------------|
| WebP | Photos, illustrations | 25-35% smaller than JPEG | 97%+ (all modern) |
| AVIF | Photos (quality-critical) | 50% smaller than JPEG | 92%+ (growing) |
| SVG | Icons, logos, simple graphics | Scalable, tiny file size | 99%+ |
| PNG | Screenshots, text-heavy images | Lossless | 99%+ |
| JPEG | Fallback only | Baseline | 99%+ |

### 4.2 Responsive Images

```html
<!-- WRONG: single large image for all devices -->
<img src="/hero-2400.jpg" alt="Hero image">
<!-- Mobile users download a 2400px image and display it at 375px -->

<!-- CORRECT: responsive images with srcset and sizes -->
<img
  src="/hero-800.webp"
  srcset="
    /hero-400.webp 400w,
    /hero-800.webp 800w,
    /hero-1200.webp 1200w,
    /hero-2400.webp 2400w
  "
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 1200px"
  alt="Hero image showing product dashboard"
  width="2400"
  height="1260"
  loading="lazy"
  decoding="async"
  fetchpriority="low"
>

<!-- For the LCP image specifically: eager loading + high priority -->
<img
  src="/hero-800.webp"
  srcset="..."
  sizes="..."
  alt="..."
  width="2400"
  height="1260"
  loading="eager"
  fetchpriority="high"
>
```

### 4.3 Modern Framework Image Components

```typescript
// Next.js Image: automatic optimization, lazy loading, responsive
import Image from 'next/image';

function HeroSection() {
  return (
    <Image
      src="/hero.jpg"
      alt="Product dashboard showing analytics"
      width={1200}
      height={630}
      priority // LCP image — preloaded, not lazy
      sizes="(max-width: 768px) 100vw, 1200px"
      placeholder="blur"
      blurDataURL={heroBlurHash}
    />
  );
}

// Below-fold images: default lazy loading
function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid">
      {products.map((product) => (
        <Image
          key={product.id}
          src={product.image}
          alt={product.name}
          width={400}
          height={400}
          // loading="lazy" is the default — no need to specify
          sizes="(max-width: 768px) 50vw, 25vw"
        />
      ))}
    </div>
  );
}
```

---

## 5. Accessibility Performance

Accessibility and performance are not competing concerns. Accessible patterns often improve performance, and performant patterns often improve accessibility.

### 5.1 Focus Management

```typescript
// WRONG: no focus management after client-side navigation
function Router() {
  return <Routes>{/* routes */}</Routes>;
  // After navigation: focus stays on the clicked link
  // Screen reader user has no indication the page changed
}

// CORRECT: move focus to main content on navigation
function Router() {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // After route change, move focus to main content
    mainRef.current?.focus();

    // Announce the new page to screen readers
    document.title = getPageTitle(location.pathname);
  }, [location.pathname]);

  return (
    <main ref={mainRef} tabIndex={-1} id="main-content">
      <Routes>{/* routes */}</Routes>
    </main>
  );
}
```

### 5.2 Live Regions for Dynamic Content

```typescript
// WRONG: dynamic content appears with no announcement
function SearchResults({ results }: { results: Item[] }) {
  return (
    <div>
      {results.length} results found
      {results.map((r) => <ResultCard key={r.id} item={r} />)}
    </div>
  );
  // Screen reader user typed a query but has no idea results appeared
}

// CORRECT: announce dynamic changes
function SearchResults({ results }: { results: Item[] }) {
  return (
    <div>
      {/* aria-live="polite" announces changes without interrupting current speech */}
      <div role="status" aria-live="polite" aria-atomic="true">
        {results.length} results found for your search
      </div>
      <ul role="list">
        {results.map((r) => <ResultCard key={r.id} item={r} />)}
      </ul>
    </div>
  );
}
```

### 5.3 Reduced Motion

```css
/* Respect user's motion preferences */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Progressive enhancement: add motion only for users who want it */
.card {
  /* No transition by default */
}

@media (prefers-reduced-motion: no-preference) {
  .card {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}
```

### 5.4 Keyboard Performance

```typescript
// WRONG: keyboard trap in modal — user cannot escape
function Modal({ children, onClose }: ModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content">
        {children}
      </div>
    </div>
  );
  // Keyboard user: Tab goes behind the modal into invisible content
  // No Escape key handler
}

// CORRECT: focus trap with keyboard support
function Modal({ children, onClose }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Save and restore focus
    previousFocus.current = document.activeElement as HTMLElement;
    modalRef.current?.focus();

    return () => previousFocus.current?.focus();
  }, []);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }

    if (e.key === 'Tab') {
      const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusableElements?.length) return;

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Dialog"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
        <button onClick={onClose} aria-label="Close dialog">Close</button>
      </div>
    </div>
  );
}
```

---

## 6. State Management Patterns

### 6.1 Server State vs Client State

```typescript
// WRONG: storing server data in client state
function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isRefetching, setIsRefetching] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    fetchUsers()
      .then(setUsers)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, []);

  // No caching, no deduplication, no background refresh
  // Every component that needs users makes its own request
  // Stale data persists until manual refresh
}

// CORRECT: server state in a cache layer (React Query / SWR)
function UserList() {
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: fetchUsers,
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 30 * 60 * 1000,   // Keep in cache for 30 minutes
  });

  // Automatic caching, deduplication, background refresh
  // Multiple components using useQuery(['users']) share one request
  // Data refreshes automatically when the user returns to the tab
}
```

### 6.2 Optimistic Updates

```typescript
// WRONG: wait for server confirmation — UI feels slow
async function handleToggleFavorite(itemId: string) {
  setIsUpdating(true);
  await api.toggleFavorite(itemId); // 200-500ms network round trip
  const updatedItems = await api.getItems(); // Another 200-500ms
  setItems(updatedItems);
  setIsUpdating(false);
  // Total: 400-1000ms of waiting. User sees a spinner.
}

// CORRECT: optimistic update with rollback on failure
function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => api.toggleFavorite(itemId),

    onMutate: async (itemId) => {
      // Cancel any in-flight refetches
      await queryClient.cancelQueries({ queryKey: ['items'] });

      // Snapshot previous value for rollback
      const previous = queryClient.getQueryData<Item[]>(['items']);

      // Optimistically update — UI changes INSTANTLY
      queryClient.setQueryData<Item[]>(['items'], (old) =>
        old?.map((item) =>
          item.id === itemId
            ? { ...item, isFavorite: !item.isFavorite }
            : item
        )
      );

      return { previous };
    },

    onError: (_err, _itemId, context) => {
      // Rollback on failure
      queryClient.setQueryData(['items'], context?.previous);
    },

    onSettled: () => {
      // Refetch to ensure server and client are in sync
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
}
```

### 6.3 URL State

```typescript
// WRONG: filter state in component — lost on navigation, not shareable
function ProductPage() {
  const [category, setCategory] = useState('all');
  const [sortBy, setSortBy] = useState('price');
  const [page, setPage] = useState(1);
  // User filters products, copies URL to share → friend sees unfiltered page
}

// CORRECT: filter state in URL — shareable, bookmarkable, survives refresh
function ProductPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const category = searchParams.get('category') ?? 'all';
  const sortBy = searchParams.get('sort') ?? 'price';
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const updateFilter = (key: string, value: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(key, value);
      if (key !== 'page') next.set('page', '1'); // Reset page on filter change
      return next;
    });
  };

  // URL: /products?category=electronics&sort=price&page=2
  // Shareable, bookmarkable, back button works correctly
}
```

---

## 7. Anti-Patterns Table

| Anti-Pattern | Symptom | Fix |
|-------------|---------|-----|
| Render-blocking CSS in head | Blank screen for 1-3 seconds | Critical CSS inline + async load rest |
| Synchronous third-party scripts | LCP delayed by script download | async/defer, Partytown for workers |
| No image dimensions | High CLS, content jumping | Explicit width/height or aspect-ratio |
| Single monolithic bundle | 500KB+ JS on every page | Route-based code splitting |
| Fetching in useEffect waterfall | Sequential round trips, slow LCP | Parallel fetching, server components |
| Full lodash import via CJS | 70KB+ added to bundle | ESM named imports or platform APIs |
| Polling for data updates | Wasted bandwidth, battery drain | WebSocket, Server-Sent Events, or polling with backoff |
| No error boundaries | White screen on any JS error | Granular ErrorBoundary components |
| Global state for server data | Stale data, no caching, duplication | React Query / SWR for server state |
| useEffect for derived state | Extra renders, stale intermediate states | Compute during render or useMemo |
| Unoptimized web fonts | FOUT/FOIT, CLS from font swap | Preload + font-display: optional + size-adjust |
| No loading/error states | Blank content areas, confused users | Skeleton screens, error boundaries, retry |
| Viewport-based imports | Ship all JS regardless of visibility | Intersection Observer + dynamic import |
| Unbounded list rendering | Slow scroll, high memory | Virtualization (react-window, TanStack Virtual) |
| No CDN for static assets | High TTFB for global users | CDN + immutable caching for hashed assets |

---

## 8. Reference Implementation

A fully optimized Next.js page component applying all patterns from this reference.

```typescript
// app/products/page.tsx — optimized product listing page
import { Suspense } from 'react';
import Image from 'next/image';
import { notFound } from 'next/navigation';

// ISR: regenerate at most every 60 seconds
export const revalidate = 60;

// Metadata for SEO
export async function generateMetadata({ searchParams }: PageProps) {
  const category = searchParams.category ?? 'all';
  return {
    title: `${category} Products | Store`,
    description: `Browse our ${category} products collection`,
    openGraph: { title: `${category} Products`, type: 'website' },
  };
}

// Server component — zero client JS for this part
export default async function ProductsPage({ searchParams }: PageProps) {
  const category = searchParams.category ?? 'all';
  const page = parseInt(searchParams.page ?? '1', 10);

  // Data fetched on server — no useEffect, no loading state, no waterfall
  const products = await getProducts({ category, page });

  if (!products) notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      {/* Static heading — in initial HTML */}
      <h1>{category === 'all' ? 'All Products' : `${category} Products`}</h1>

      {/* Filter bar — client component for interactivity */}
      <Suspense fallback={<FilterBarSkeleton />}>
        <FilterBar currentCategory={category} />
      </Suspense>

      {/* Product grid — server rendered, instant LCP */}
      <ProductGrid products={products.items} />

      {/* Pagination — server rendered links for SEO */}
      <Pagination
        currentPage={page}
        totalPages={products.totalPages}
        baseUrl={`/products?category=${category}`}
      />

      {/* Below fold: recommendations loaded lazily */}
      <Suspense fallback={<RecommendationsSkeleton />}>
        <Recommendations category={category} />
      </Suspense>

      {/* Live region for search result announcements */}
      <div role="status" aria-live="polite" className="sr-only">
        {products.total} products found
      </div>
    </main>
  );
}

// Server component — no JS shipped
function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul role="list" className="product-grid">
      {products.map((product, index) => (
        <li key={product.id}>
          <a href={`/products/${product.slug}`} className="product-card">
            <Image
              src={product.image}
              alt={product.name}
              width={400}
              height={400}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              priority={index < 4} // Preload first 4 images (above fold)
              placeholder="blur"
              blurDataURL={product.blurHash}
            />
            <h2>{product.name}</h2>
            <p aria-label={`Price: ${formatPrice(product.price)}`}>
              {formatPrice(product.price)}
            </p>
          </a>
        </li>
      ))}
    </ul>
  );
}

// Pagination with proper accessibility
function Pagination({ currentPage, totalPages, baseUrl }: PaginationProps) {
  return (
    <nav aria-label="Product list pagination">
      <ul role="list" className="pagination">
        {currentPage > 1 && (
          <li>
            <a href={`${baseUrl}&page=${currentPage - 1}`} aria-label="Previous page">
              Previous
            </a>
          </li>
        )}
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
          <li key={page}>
            <a
              href={`${baseUrl}&page=${page}`}
              aria-current={page === currentPage ? 'page' : undefined}
              aria-label={`Page ${page}`}
            >
              {page}
            </a>
          </li>
        ))}
        {currentPage < totalPages && (
          <li>
            <a href={`${baseUrl}&page=${currentPage + 1}`} aria-label="Next page">
              Next
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}
```

```css
/* styles/products.css — performance-optimized styles */

/* Design tokens */
:root {
  --grid-gap: 1rem;
  --card-radius: 0.5rem;
  --color-text: #1a1a1a;
  --color-bg: #ffffff;
  --color-accent: #0066cc;
  --color-focus: #4d90fe;
}

/* Visually hidden utility for screen readers */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Product grid with CSS containment for rendering performance */
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--grid-gap);
  list-style: none;
  padding: 0;
  contain: layout style; /* Isolate layout recalculations */
}

/* Product card with content-visibility for off-screen optimization */
.product-card {
  display: block;
  text-decoration: none;
  color: var(--color-text);
  border-radius: var(--card-radius);
  overflow: hidden;
  content-visibility: auto; /* Skip rendering off-screen cards */
  contain-intrinsic-size: 0 400px; /* Estimated size for layout */
}

/* Focus styles — visible and accessible */
.product-card:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}

/* Motion only for users who want it */
@media (prefers-reduced-motion: no-preference) {
  .product-card {
    transition: box-shadow 0.15s ease;
  }

  .product-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
}

/* Pagination — accessible current page indicator */
.pagination [aria-current="page"] {
  font-weight: 700;
  background: var(--color-accent);
  color: var(--color-bg);
}
```

---

## 9. Measurement and Monitoring

### Field Data vs Lab Data

| Source | What It Tells You | Tools |
|--------|-------------------|-------|
| Lab (synthetic) | Reproducible baseline, debugging | Lighthouse, WebPageTest, DevTools |
| Field (real users) | Actual user experience across devices/networks | CrUX, web-vitals library, RUM |

### Monitoring Setup

```typescript
// Report Core Web Vitals from real users
import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

function reportMetric(metric: { name: string; value: number; id: string }) {
  // Send to your analytics endpoint
  navigator.sendBeacon('/api/vitals', JSON.stringify({
    name: metric.name,
    value: metric.value,
    id: metric.id,
    url: window.location.href,
    timestamp: Date.now(),
  }));
}

onLCP(reportMetric);
onINP(reportMetric);
onCLS(reportMetric);
onFCP(reportMetric);
onTTFB(reportMetric);
```
