# Web Development Code Patterns

## When to Load This Reference

Load when ANY of these signals appear in the task context:
- React/Vue/Angular component code being written or debugged
- Performance optimization of frontend code
- Accessibility fixes or audit
- State management refactoring
- SSR/hydration issues
- CSS architecture problems
- Memory leak investigation
- Core Web Vitals improvement

## How to Use This Reference

Each pattern follows this structure:
1. **Risk description** — what goes wrong and why it matters
2. **WRONG** code block — the buggy pattern with inline comments explaining the bug
3. **CORRECT** code block — the fixed pattern with inline comments explaining the fix
4. **Why this matters** — the real-world consequence
5. **Diagnostic question** — a self-check to detect this pattern in code review

---

## Pattern 1: useEffect Missing Dependencies

Stale closures and infinite re-render loops from incorrect dependency arrays.

**WRONG — stale closure from missing dependency:**
```typescript
function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<Item[]>([]);

  useEffect(() => {
    // BUG: query is captured at mount time and never updated
    // This effect runs once but uses a stale query value
    fetchResults(query).then(setResults);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <ResultsList items={results} />;
}
```

**WRONG — infinite loop from unstable dependency:**
```typescript
function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);

  // BUG: options object is recreated every render → new reference → effect re-runs
  const options = { includeAvatar: true, includePosts: true };

  useEffect(() => {
    fetchUser(userId, options).then(setUser);
  }, [userId, options]); // options changes every render → infinite loop

  return <Profile user={user} />;
}
```

**CORRECT — stable dependencies and proper cleanup:**
```typescript
function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<Item[]>([]);

  useEffect(() => {
    // AbortController prevents race conditions when query changes rapidly
    const controller = new AbortController();

    fetchResults(query, { signal: controller.signal })
      .then(setResults)
      .catch((err) => {
        if (err.name !== 'AbortError') throw err;
      });

    return () => controller.abort(); // cleanup on unmount or query change
  }, [query]); // query is the only dependency — correct and complete

  return <ResultsList items={results} />;
}

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);

  // Stable reference: useMemo with actual dependencies
  const options = useMemo(
    () => ({ includeAvatar: true, includePosts: true }),
    [] // truly static — empty deps is correct here
  );

  useEffect(() => {
    fetchUser(userId, options).then(setUser);
  }, [userId, options]); // stable reference — no infinite loop

  return <Profile user={user} />;
}
```

**Why this matters:** Stale closures cause the UI to show outdated data — users see search results for a previous query. Infinite loops cause the browser tab to freeze and flood the server with requests. Both are silent in development and catastrophic in production.

**Diagnostic question:** "For every value used inside this useEffect, is it either in the dependency array or guaranteed stable (setState, dispatch, ref)? For every value in the dependency array, is its reference stable across renders?"

---

## Pattern 2: key={index} on Dynamic Lists

Reconciliation bugs when using array index as React key on lists that can be reordered, filtered, or have items added/removed.

**WRONG — index key on dynamic list:**
```typescript
function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((todo, index) => (
        // BUG: when items are reordered or deleted, React matches by index
        // Item at index 0 keeps the DOM state of whatever was previously at index 0
        // This causes: wrong checkbox states, input values in wrong rows, animation glitches
        <li key={index}>
          <input type="checkbox" />
          <span>{todo.text}</span>
        </li>
      ))}
    </ul>
  );
}
```

**CORRECT — stable unique key:**
```typescript
function TodoList({ todos }: { todos: Todo[] }) {
  return (
    <ul>
      {todos.map((todo) => (
        // Each item has a stable identity that follows it through reorders/deletions
        // React correctly preserves DOM state for each logical item
        <li key={todo.id}>
          <input type="checkbox" />
          <span>{todo.text}</span>
        </li>
      ))}
    </ul>
  );
}
```

**Why this matters:** When a user deletes the second item in a list, React with index keys thinks the second item is now what was the third item, the third is now the fourth, and so on. Every item after the deletion gets the wrong DOM state. Checked checkboxes appear on wrong items. Input values shift. Animations fire on the wrong elements. This is one of the most common React bugs and one of the hardest to debug because it only manifests with specific user interactions.

**Diagnostic question:** "Can items in this list be added, removed, reordered, or filtered? If yes, does each item have a stable, unique identifier that is not its array index?"

---

## Pattern 3: Direct DOM Mutation in React

Bypassing the virtual DOM with direct DOM manipulation, causing React's internal state to diverge from the actual DOM.

**WRONG — direct DOM mutation:**
```typescript
function Highlighter({ text, searchTerm }: { text: string; searchTerm: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // BUG: directly mutating innerHTML bypasses React's reconciliation
      // React thinks the DOM contains {text} but it actually contains highlighted HTML
      // Next render will cause React to crash or produce corrupted output
      const highlighted = text.replace(
        new RegExp(searchTerm, 'gi'),
        '<mark>$&</mark>'
      );
      containerRef.current.innerHTML = highlighted;
    }
  }, [text, searchTerm]);

  return <div ref={containerRef}>{text}</div>;
}
```

**CORRECT — React-managed rendering:**
```typescript
function Highlighter({ text, searchTerm }: { text: string; searchTerm: string }) {
  // Compute highlighted segments as React elements, not raw HTML
  const segments = useMemo(() => {
    if (!searchTerm) return [{ text, highlight: false }];

    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return text.split(regex).map((segment, i) => ({
      text: segment,
      highlight: regex.test(segment),
    }));
  }, [text, searchTerm]);

  return (
    <div>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark key={i}>{seg.text}</mark>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  );
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

**Why this matters:** When React re-renders, it compares its virtual DOM against the actual DOM. If you have mutated the DOM directly, React's assumptions are wrong. This causes hydration errors in SSR, corrupted rendering, and memory leaks from orphaned event listeners. The DOM is React's territory — mutations must go through React's rendering pipeline.

**Diagnostic question:** "Does any code use innerHTML, appendChild, removeChild, insertBefore, or other DOM mutation APIs on elements managed by React? If so, can it be rewritten as a React render?"

---

## Pattern 4: Fetch in Render Path

Waterfall requests and race conditions from fetching data inside the render cycle without proper coordination.

**WRONG — fetch in component body causing waterfall:**
```typescript
function UserDashboard({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  // BUG: These effects run sequentially because posts depends on user render
  useEffect(() => {
    fetchUser(userId).then(setUser);
  }, [userId]);

  // This component only renders when user is loaded...
  if (!user) return <Spinner />;

  // ...so UserPosts mounts late, creating a request waterfall
  // Total time = fetchUser + fetchPosts + fetchComments (sequential)
  return (
    <div>
      <UserHeader user={user} />
      <UserPosts userId={userId} onLoad={setPosts} />
      <UserComments userId={userId} onLoad={setComments} />
    </div>
  );
}
```

**CORRECT — parallel fetching with proper loading states:**
```typescript
function UserDashboard({ userId }: { userId: string }) {
  const [data, setData] = useState<{
    user: User | null;
    posts: Post[];
    comments: Comment[];
  }>({ user: null, posts: [], comments: [] });
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');

    // Parallel fetching — total time = max(fetchUser, fetchPosts, fetchComments)
    Promise.all([
      fetchUser(userId, { signal: controller.signal }),
      fetchPosts(userId, { signal: controller.signal }),
      fetchComments(userId, { signal: controller.signal }),
    ])
      .then(([user, posts, comments]) => {
        setData({ user, posts, comments });
        setStatus('ready');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setStatus('error');
      });

    return () => controller.abort();
  }, [userId]);

  if (status === 'loading') return <DashboardSkeleton />;
  if (status === 'error') return <ErrorBanner retry={() => setStatus('loading')} />;

  return (
    <div>
      <UserHeader user={data.user!} />
      <PostList posts={data.posts} />
      <CommentList comments={data.comments} />
    </div>
  );
}
```

**Why this matters:** Request waterfalls are the number one cause of slow page loads in SPAs. Each sequential fetch adds a full round-trip to the total loading time. On a 200ms latency connection, three sequential fetches add 600ms. Parallel fetches add only 200ms. This is the difference between a snappy app and a sluggish one.

**Diagnostic question:** "Are there data fetches that could run in parallel but are instead serialized by component render order? Does the component tree create implicit waterfall dependencies?"

---

## Pattern 5: Missing Error Boundary

An unhandled error in any component crashes the entire React application — the white screen of death.

**WRONG — no error boundary, entire app crashes:**
```typescript
function App() {
  return (
    // If UserProfile throws (bad API data, undefined property access),
    // the ENTIRE app unmounts — user sees a blank white page
    // No way to recover without a full page reload
    <div>
      <Header />
      <Sidebar />
      <UserProfile userId={currentUserId} />
      <Footer />
    </div>
  );
}
```

**CORRECT — granular error boundaries with recovery:**
```typescript
class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Report to error monitoring service (Sentry, Datadog, etc.)
    reportError(error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function App() {
  return (
    <div>
      <Header />
      <Sidebar />
      {/* Only UserProfile fails — rest of app remains functional */}
      <ErrorBoundary
        fallback={
          <div role="alert">
            <p>Failed to load profile.</p>
            <button onClick={() => window.location.reload()}>Retry</button>
          </div>
        }
      >
        <UserProfile userId={currentUserId} />
      </ErrorBoundary>
      <Footer />
    </div>
  );
}
```

**Why this matters:** In production, a single `TypeError: Cannot read property of undefined` in a deeply nested component will crash the entire application if there is no error boundary. Users see a blank white page and have no idea what happened. Error boundaries isolate failures to the component subtree where they occur, keeping the rest of the application functional and giving users a recovery path.

**Diagnostic question:** "If this component throws an error, what is the blast radius? Does only this component fail, or does it take down the entire page? Is there an error boundary wrapping it with a meaningful fallback?"

---

## Pattern 6: CSS Specificity Wars

Escalating specificity with !important chains and overly specific selectors, making styles impossible to override predictably.

**WRONG — specificity escalation:**
```css
/* Developer A writes a card style */
.card .card-header .title {
  color: #333;
  font-size: 18px;
}

/* Developer B needs a different color in a modal context */
.modal .card .card-header .title {
  color: #fff; /* Works... for now */
}

/* Developer C needs to override in a specific page */
#dashboard .modal .card .card-header .title {
  color: #0066cc; /* ID selector to "win" */
}

/* Developer D gives up */
.card-title {
  color: red !important; /* Nuclear option — now nothing can override this */
}

/* Developer E needs to override the !important */
.card-title.special {
  color: blue !important; /* !important arms race begins */
}
```

**CORRECT — flat specificity with design tokens:**
```css
/* Design tokens as CSS custom properties */
:root {
  --color-text-primary: #333;
  --color-text-inverse: #fff;
  --color-text-accent: #0066cc;
  --font-size-heading: 18px;
}

/* Single-class selectors — flat specificity graph */
.card-title {
  color: var(--color-text-primary);
  font-size: var(--font-size-heading);
}

/* Variants use modifier classes at the same specificity level */
.card-title--inverse {
  color: var(--color-text-inverse);
}

.card-title--accent {
  color: var(--color-text-accent);
}

/* Context-specific overrides use custom properties, not specificity */
.modal {
  --color-text-primary: #fff;
  /* All children using var(--color-text-primary) automatically update */
}
```

**Why this matters:** Specificity wars are technical debt that compounds. Each override increases the minimum specificity needed for the next override. Eventually, every style needs `!important`, and `!important` needs to be overridden by more-specific `!important`. The CSS becomes unpredictable — developers cannot determine what styles will apply without running the code. Custom properties and flat specificity solve this by making the cascade work for you instead of against you.

**Diagnostic question:** "Can I predict what styles apply to this element by reading the CSS, or do I need to open DevTools and check? Are there `!important` declarations that were added to override other styles?"

---

## Pattern 7: Uncontrolled to Controlled Input

Switching between controlled and uncontrolled input modes causes React warnings and lost user input.

**WRONG — uncontrolled to controlled switch:**
```typescript
function SearchInput() {
  // BUG: value starts as undefined (uncontrolled), then becomes a string (controlled)
  // React warns: "A component is changing an uncontrolled input to be controlled"
  const [value, setValue] = useState<string | undefined>(undefined);

  useEffect(() => {
    // When saved search loads, value switches from undefined to string
    loadSavedSearch().then((saved) => setValue(saved));
  }, []);

  return (
    // When value is undefined, React treats this as uncontrolled
    // When value becomes a string, React switches to controlled mode
    // This transition can lose user input typed during the loading period
    <input value={value} onChange={(e) => setValue(e.target.value)} />
  );
}
```

**CORRECT — always controlled with explicit initial value:**
```typescript
function SearchInput() {
  // Always a string — always controlled. Empty string is a valid controlled value.
  const [value, setValue] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    loadSavedSearch().then((saved) => {
      // Only set saved value if user hasn't typed anything yet
      if (!isLoaded) {
        setValue(saved ?? '');
        setIsLoaded(true);
      }
    });
  }, [isLoaded]);

  return (
    <input
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        setIsLoaded(true); // User has taken control
      }}
      placeholder="Search..."
    />
  );
}
```

**Why this matters:** The controlled/uncontrolled switch causes subtle bugs: user input can be silently overwritten when async data arrives, React's internal tracking gets confused leading to characters being dropped during fast typing, and the React warning itself indicates that the component is in an undefined state. Always initialize controlled inputs with a defined value (empty string, not undefined or null).

**Diagnostic question:** "Is the input's value prop ever undefined or null? Does the value change from undefined to a string at any point during the component lifecycle?"

---

## Pattern 8: Missing Accessible Labels

Screen readers cannot identify interactive elements without proper labels, making the interface unusable for assistive technology users.

**WRONG — no accessible labels:**
```typescript
function IconToolbar() {
  return (
    <div className="toolbar">
      {/* Screen reader announces: "button" — no indication of what it does */}
      <button onClick={onSave}>
        <SaveIcon />
      </button>

      {/* Screen reader announces: "textbox" — no indication of what to enter */}
      <input type="text" placeholder="Search..." />

      {/* Screen reader cannot identify this as interactive */}
      <div className="toggle" onClick={onToggle}>
        <ToggleIcon />
      </div>

      {/* Image with no alt text — screen reader announces the filename */}
      <img src="/avatar-john.png" />
    </div>
  );
}
```

**CORRECT — proper accessible labels:**
```typescript
function IconToolbar() {
  return (
    <div className="toolbar" role="toolbar" aria-label="Document actions">
      {/* Screen reader announces: "Save document, button" */}
      <button onClick={onSave} aria-label="Save document">
        <SaveIcon aria-hidden="true" />
      </button>

      {/* Screen reader announces: "Search documents, edit text" */}
      <label>
        <span className="sr-only">Search documents</span>
        <input type="search" placeholder="Search..." />
      </label>

      {/* Proper interactive element with state announcement */}
      <button
        onClick={onToggle}
        aria-pressed={isActive}
        aria-label="Toggle sidebar"
      >
        <ToggleIcon aria-hidden="true" />
      </button>

      {/* Meaningful alt text describing the image's purpose */}
      <img src="/avatar-john.png" alt="John Smith's profile photo" />
    </div>
  );
}

/* Visually hidden but accessible to screen readers */
const srOnlyStyles = `
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
`;
```

**Why this matters:** 15% of the global population has some form of disability. Screen reader users navigate by hearing labels — an unlabeled button is equivalent to a button with no visible text for sighted users. It is not just a compliance issue (WCAG 2.1 Level A requires labels on all interactive elements). It is a usability issue that excludes real people from using your application.

**Diagnostic question:** "If I turned off the screen and navigated this page with a screen reader, would I know what every button does, what every input expects, and what every image shows?"

---

## Pattern 9: Memory Leak in Event Listeners

Adding event listeners or subscriptions in components without cleaning them up on unmount causes memory leaks that degrade performance over time.

**WRONG — event listener without cleanup:**
```typescript
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    // BUG: new listener added on every mount, never removed
    // If this component mounts/unmounts repeatedly (route changes),
    // listeners accumulate and each one calls setScrollY on every scroll
    window.addEventListener('scroll', () => {
      setScrollY(window.scrollY);
    });
  }, []);

  // Also common: setInterval without cleanup
  useEffect(() => {
    // BUG: interval runs forever even after component unmounts
    // Calls setScrollY on an unmounted component → React warning + memory leak
    setInterval(() => {
      fetchLatestData().then(setData);
    }, 5000);
  }, []);

  return <div>Scroll position: {scrollY}</div>;
}
```

**CORRECT — cleanup on unmount:**
```typescript
function ScrollTracker() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    // Named function so the same reference is used for add and remove
    const handleScroll = () => setScrollY(window.scrollY);

    window.addEventListener('scroll', handleScroll, { passive: true });

    // Cleanup: remove the exact same listener on unmount
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return <div>Scroll position: {scrollY}</div>;
}

function PollingComponent() {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let isActive = true; // Guard against setting state after unmount

    const intervalId = setInterval(async () => {
      const result = await fetchLatestData();
      if (isActive) setData(result); // Only update if still mounted
    }, 5000);

    return () => {
      isActive = false;
      clearInterval(intervalId); // Stop polling on unmount
    };
  }, []);

  return <DataDisplay data={data} />;
}
```

**Why this matters:** Memory leaks from event listeners are cumulative. Each navigation in an SPA that mounts and unmounts components without cleanup adds another orphaned listener. After 50 navigations, there are 50 scroll listeners firing on every scroll event, 50 intervals polling the server, and 50 stale closures holding references to unmounted component state. The application gets progressively slower until the tab crashes or the user gives up.

**Diagnostic question:** "Does every addEventListener have a corresponding removeEventListener in a cleanup function? Does every setInterval have a corresponding clearInterval? Does every subscription have an unsubscribe?"

---

## Pattern 10: Blocking Main Thread

Long-running JavaScript tasks block the main thread, causing poor Interaction to Next Paint (INP) scores and unresponsive UI.

**WRONG — expensive computation blocking interaction:**
```typescript
function ProductList({ products }: { products: Product[] }) {
  // BUG: sorting and filtering 10,000 products on every render
  // This takes 50-200ms, blocking the main thread
  // User clicks a filter → UI freezes → bad INP score
  const filtered = products
    .filter((p) => matchesAllFilters(p, activeFilters))
    .sort((a, b) => complexSortComparison(a, b))
    .map((p) => enrichWithComputedFields(p));

  return (
    <div>
      {filtered.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
```

**CORRECT — deferred computation with responsive UI:**
```typescript
function ProductList({ products }: { products: Product[] }) {
  const [filtered, setFiltered] = useState<Product[]>([]);

  // useDeferredValue lets React interrupt the computation for user interactions
  const deferredFilters = useDeferredValue(activeFilters);
  const isStale = deferredFilters !== activeFilters;

  // Memoize expensive computation — only recompute when inputs actually change
  const result = useMemo(() => {
    return products
      .filter((p) => matchesAllFilters(p, deferredFilters))
      .sort((a, b) => complexSortComparison(a, b))
      .map((p) => enrichWithComputedFields(p));
  }, [products, deferredFilters]);

  return (
    <div style={{ opacity: isStale ? 0.7 : 1 }}>
      {result.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

// For truly heavy computations, use a Web Worker
const filterWorker = new Worker(new URL('./filter-worker.ts', import.meta.url));

function HeavyProductList({ products }: { products: Product[] }) {
  const [filtered, setFiltered] = useState<Product[]>([]);

  useEffect(() => {
    // Off-main-thread computation — UI stays responsive
    filterWorker.postMessage({ products, filters: activeFilters });
    filterWorker.onmessage = (e) => setFiltered(e.data);
  }, [products, activeFilters]);

  return (
    <div>
      {filtered.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}
```

**Why this matters:** The browser's main thread handles rendering, event handling, and JavaScript execution on a single thread. A 100ms computation means 100ms where the user cannot interact with the page — clicks, keystrokes, and scrolls are all queued. Google measures this as INP (Interaction to Next Paint), and a score above 200ms is rated "poor." Users perceive anything above 50ms as sluggish.

**Diagnostic question:** "Are there any synchronous computations in the render path that process more than 1,000 items or take more than 16ms? Could they be deferred, memoized, or moved to a Web Worker?"

---

## Pattern 11: Layout Shift from Dynamic Content

Images without dimensions, dynamically injected content, and font swaps cause Cumulative Layout Shift (CLS), where page elements jump around as the page loads.

**WRONG — content causes layout shifts:**
```typescript
function ArticlePage({ article }: { article: Article }) {
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    loadAd('banner').then(setAd);
  }, []);

  return (
    <article>
      <h1>{article.title}</h1>

      {/* BUG: image has no dimensions — browser cannot reserve space
          When the image loads, it pushes all content below it down */}
      <img src={article.heroImage} />

      {/* BUG: ad injected after initial render pushes content down
          User is reading the article and suddenly the text jumps */}
      {ad && <div className="ad-banner">{ad.content}</div>}

      <p>{article.body}</p>
    </article>
  );
}
```

```css
/* BUG: font-display: swap causes text to reflow when custom font loads */
@font-face {
  font-family: 'BrandFont';
  src: url('/fonts/brand.woff2') format('woff2');
  font-display: swap; /* Text renders in fallback, then jumps when font loads */
}
```

**CORRECT — reserved space and stable layout:**
```typescript
function ArticlePage({ article }: { article: Article }) {
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    loadAd('banner').then(setAd);
  }, []);

  return (
    <article>
      <h1>{article.title}</h1>

      {/* Explicit dimensions let the browser reserve space before image loads */}
      <img
        src={article.heroImage}
        alt={article.heroAlt}
        width={1200}
        height={630}
        loading="lazy"
        decoding="async"
        style={{ aspectRatio: '1200 / 630', width: '100%', height: 'auto' }}
      />

      {/* Ad slot always present — same size whether filled or not */}
      <div className="ad-slot" style={{ minHeight: '90px' }}>
        {ad ? <AdBanner ad={ad} /> : null}
      </div>

      <p>{article.body}</p>
    </article>
  );
}
```

```css
/* Preload the font and use font-display: optional to avoid layout shift */
/* In HTML <head>: <link rel="preload" href="/fonts/brand.woff2" as="font" crossorigin> */
@font-face {
  font-family: 'BrandFont';
  src: url('/fonts/brand.woff2') format('woff2');
  font-display: optional; /* Use font only if already cached — no layout shift */
}

/* Use size-adjust to match fallback font metrics */
@font-face {
  font-family: 'BrandFont-Fallback';
  src: local('Arial');
  size-adjust: 97.5%;
  ascent-override: 103%;
  descent-override: 28%;
  line-gap-override: 0%;
}

body {
  font-family: 'BrandFont', 'BrandFont-Fallback', sans-serif;
}
```

**Why this matters:** CLS is one of Google's Core Web Vitals and directly affects search ranking. But more importantly, layout shifts are infuriating for users. The user clicks a link, the page shifts, and they accidentally click an ad. The user starts reading an article and the text jumps down as an image loads above it. These are the kinds of experiences that make users distrust your site.

**Diagnostic question:** "Does every image and embed have explicit width/height or aspect-ratio? Is there any content that gets injected after initial render without space being reserved for it?"

---

## Pattern 12: Hydration Mismatch

Server and client render different content, causing React to either warn, silently produce incorrect output, or crash during hydration.

**WRONG — non-deterministic render:**
```typescript
function WelcomeBanner() {
  // BUG: Date.now() returns different values on server and client
  // Server renders "Good morning" at 10:00 server time
  // Client hydrates at 14:00 user time — sees "Good afternoon"
  // React: "Text content does not match server-rendered HTML"
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : 'Good afternoon';

  return <h1>{greeting}</h1>;
}

function RandomFeature() {
  // BUG: Math.random() produces different values on server and client
  // Server renders variant A, client expects variant B
  const showNewFeature = Math.random() > 0.5;

  return showNewFeature ? <NewFeature /> : <OldFeature />;
}

function ResponsiveNav() {
  // BUG: window is undefined on server, exists on client
  // This renders desktop nav on server, but mobile nav on mobile client
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return isMobile ? <MobileNav /> : <DesktopNav />;
}
```

**CORRECT — deterministic server render, client-side enhancement:**
```typescript
function WelcomeBanner() {
  // Start with a deterministic value that matches on both server and client
  const [greeting, setGreeting] = useState('Welcome');

  // Update to time-based greeting only on client, after hydration
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : 'Good afternoon');
  }, []);

  return <h1>{greeting}</h1>;
}

function RandomFeature() {
  // Feature flag determined server-side, passed as prop or cookie
  // Both server and client see the same value
  const showNewFeature = useFeatureFlag('new-feature-2024');

  return showNewFeature ? <NewFeature /> : <OldFeature />;
}

function ResponsiveNav() {
  // Render both, use CSS to show/hide — both exist in server HTML
  // No hydration mismatch because both are rendered
  return (
    <>
      <DesktopNav className="hidden-mobile" aria-hidden={isMobileViewport} />
      <MobileNav className="hidden-desktop" aria-hidden={!isMobileViewport} />
    </>
  );
}

// Alternatively, use a client-only approach with consistent server render
function ResponsiveNavAlt() {
  const [isMobile, setIsMobile] = useState(false); // Server: false. Client: false initially.

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isMobile ? <MobileNav /> : <DesktopNav />;
}
```

**Why this matters:** Hydration mismatches break the contract between server-rendered HTML and client-side React. In the best case, React logs a warning and patches the DOM (which causes a flash of incorrect content). In the worst case, React throws an error and falls back to full client-side rendering, negating all SSR performance benefits. For SSR/SSG applications, ensuring hydration determinism is a correctness requirement, not an optimization.

**Diagnostic question:** "Does this component render differently based on runtime environment (server vs client), current time, random values, or browser APIs? If so, is the initial render deterministic and are dynamic values deferred to useEffect?"

---

## 3. Critical Safety Rules

### Rule 1: Always Clean Up Side Effects
```typescript
// EVERY useEffect with a subscription, listener, timer, or fetch
// MUST return a cleanup function
useEffect(() => {
  const handler = () => { /* ... */ };
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler); // MANDATORY
}, []);
```

### Rule 2: Never Trust External Input in innerHTML
```typescript
// WRONG: XSS vulnerability
element.innerHTML = userProvidedHTML;

// CORRECT: use textContent for text, DOMPurify for HTML
element.textContent = userProvidedText;
// or
element.innerHTML = DOMPurify.sanitize(userProvidedHTML);
```

### Rule 3: Validate Props at Boundaries
```typescript
// Component receiving external data should validate
interface UserCardProps {
  user: {
    name: string;
    avatarUrl: string;
  };
}

function UserCard({ user }: UserCardProps) {
  // Defensive: external data may not match the type
  if (!user?.name) return <FallbackCard />;
  return <div>{user.name}</div>;
}
```

### Rule 4: Use Semantic HTML Before ARIA
```typescript
// WRONG: reinventing the wheel
<div role="button" tabIndex={0} onClick={onClick} onKeyDown={handleKeyDown}>

// CORRECT: use the platform
<button onClick={onClick}>
```

### Rule 5: Images Must Have Alt Text
```typescript
// Decorative images: empty alt
<img src="/divider.svg" alt="" aria-hidden="true" />

// Informative images: descriptive alt
<img src="/chart.png" alt="Revenue growth chart showing 40% increase Q1-Q4 2024" />

// Never skip alt entirely — screen readers will read the filename
```

### Rule 6: Focus Management on Route Changes
```typescript
// After client-side navigation, move focus to main content
useEffect(() => {
  const mainContent = document.getElementById('main-content');
  mainContent?.focus();
}, [pathname]);
```

## 4. Anti-Pattern Summary Table

| # | Anti-Pattern | Symptom | Fix |
|---|-------------|---------|-----|
| 1 | Stale closure in useEffect | UI shows outdated data | Add all dependencies to array |
| 2 | key={index} on dynamic list | Wrong state after reorder/delete | Use stable unique ID |
| 3 | Direct DOM mutation in React | Hydration crash, corrupted render | Render through React |
| 4 | Sequential fetch waterfall | Slow page load, high LCP | Parallel fetch with Promise.all |
| 5 | No error boundary | White screen of death | Wrap with ErrorBoundary |
| 6 | Specificity escalation / !important | Unpredictable styles | Flat specificity, CSS variables |
| 7 | Uncontrolled-to-controlled switch | Lost input, React warning | Always initialize with string |
| 8 | Missing accessible labels | Unusable for screen readers | aria-label, semantic HTML, sr-only |
| 9 | Event listener without cleanup | Memory leak, degrading perf | Return cleanup from useEffect |
| 10 | Expensive sync computation | Frozen UI, poor INP | useMemo, useDeferredValue, Worker |
| 11 | Dynamic content without reserved space | CLS, content jumping | Explicit dimensions, placeholder |
| 12 | Non-deterministic SSR render | Hydration error, flash | Deterministic initial, defer dynamic |
