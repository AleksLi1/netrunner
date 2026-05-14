# Web/Frontend Code Scan Patterns

## Purpose

This reference is the **active scanning catalog** for `nr-web-auditor`. Each pattern is a concrete, grep-able rule with a defined severity, a wrong/correct pair, a data-flow check, and a fix recommendation.

Unlike `web-code-patterns.md` (which is teaching prose for the reasoning layer), this file is operational: the auditor runs each grep against the codebase, then performs a context check on each hit to decide whether it is a real violation.

**Stack assumptions:** Primarily React/Next.js/Vue/Svelte (TS/JS, JSX/TSX). Patterns are framework-agnostic where possible; framework-specific patterns are noted.

**Severity scale:**
- **CRITICAL** — definite production-affecting bug (a11y blocker, security hole, data loss, hydration crash)
- **WARNING** — likely problem requiring manual verification (perf regression, render cascade, bundle bloat)
- **INFO** — code smell or maintenance risk (style, missing seed, unused export)

**False-positive guard:** Every match must pass a context check (read 10 lines around the match) before being classified. Patterns inside comments, test files, or annotated `// NR-SAFE: [reason]` lines are downgraded or skipped.

---

## Pattern 1: Image without explicit dimensions (CLS)

**Why it matters:** Images that load asynchronously without reserved dimensions cause Cumulative Layout Shift. CLS > 0.1 fails Core Web Vitals.

**Grep:**
```bash
grep -n -E "<img\s+[^>]*src=" --include="*.{tsx,jsx,html,vue,svelte}"
```
For each `<img>` match, check if `width=` AND `height=` (or `aspect-ratio`/inline style) are present.

**WRONG:**
```jsx
<img src="/hero.jpg" alt="Hero" />
<img src={user.avatar} alt={user.name} className="rounded" />
```

**CORRECT:**
```jsx
<img src="/hero.jpg" alt="Hero" width={1200} height={630} />
<Image src="/hero.jpg" alt="Hero" width={1200} height={630} /> {/* Next.js */}
<img src={user.avatar} alt={user.name} width={48} height={48} className="rounded" />
```

**Severity:** WARNING (CRITICAL if image is above-the-fold and LCP-eligible)

**Fix:** Add `width` and `height` attributes matching the intrinsic aspect ratio. Use `<Image>` from `next/image` for automatic responsive handling.

---

## Pattern 2: `dangerouslySetInnerHTML` with user-controlled input (XSS)

**Why it matters:** Setting innerHTML with unsanitized input is the canonical XSS vector. A user-controlled string passed here can run arbitrary script.

**Grep:**
```bash
grep -nE "dangerouslySetInnerHTML|v-html|@html|{@html" --include="*.{tsx,jsx,vue,svelte}"
```
Trace the source: is the input a literal, a sanitized output (DOMPurify, sanitize-html), or user-controlled?

**WRONG:**
```jsx
<div dangerouslySetInnerHTML={{ __html: comment.body }} />
<div dangerouslySetInnerHTML={{ __html: req.query.message }} />
```

**CORRECT:**
```jsx
import DOMPurify from 'isomorphic-dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.body) }} />

// Better: render as text if no HTML needed
<div>{comment.body}</div>

// Better: render with markdown component that sanitizes by default
<Markdown>{comment.body}</Markdown>
```

**Severity:** CRITICAL (immediate XSS) → WARNING if input is server-rendered from a trusted source

**Fix:** Sanitize with DOMPurify or render as text. If markdown, use a library that escapes HTML by default.

---

## Pattern 3: `target="_blank"` without `rel="noopener noreferrer"` (tabnabbing)

**Why it matters:** Without `rel="noopener"`, the opened tab can access `window.opener` and redirect the original page (reverse tabnabbing). `noreferrer` additionally prevents `Referer` leak.

**Grep:**
```bash
grep -nE 'target=["'\'']_blank["'\'']' --include="*.{tsx,jsx,html,vue,svelte}"
```
For each match, check if `rel=` is present on the same element with `noopener`.

**WRONG:**
```jsx
<a href={externalUrl} target="_blank">Visit</a>
```

**CORRECT:**
```jsx
<a href={externalUrl} target="_blank" rel="noopener noreferrer">Visit</a>
```

**Severity:** WARNING

**Fix:** Add `rel="noopener noreferrer"` to every `target="_blank"` link.

---

## Pattern 4: `<div>` / `<span>` as button (a11y, semantic HTML)

**Why it matters:** A `<div onClick={...}>` is not keyboard-focusable, not announced as interactive by screen readers, and has no native disabled/loading states. ARIA can patch this but never matches native semantics.

**Grep:**
```bash
grep -nE "<div[^>]*onClick=|<span[^>]*onClick=" --include="*.{tsx,jsx}"
```
For each match, check whether the element has `role="button"` AND `tabIndex={0}` AND `onKeyDown` — even then, prefer a real `<button>`.

**WRONG:**
```jsx
<div onClick={handleSubmit}>Submit</div>
<span onClick={() => setOpen(true)} className="cursor-pointer">Open</span>
```

**CORRECT:**
```jsx
<button type="button" onClick={handleSubmit}>Submit</button>
<button type="button" onClick={() => setOpen(true)}>Open</button>
```

**Severity:** CRITICAL (a11y blocker — keyboard users cannot operate)

**Fix:** Replace with `<button type="button">`. Style the button to look the same (`appearance: none; background: none; padding: 0;` etc.).

---

## Pattern 5: `<input>` without label association

**Why it matters:** Screen readers cannot announce the purpose of an unlabeled input. Voice control software cannot target it. Placeholder is not a label.

**Grep:**
```bash
grep -nE "<input[^>]*>" --include="*.{tsx,jsx,html,vue,svelte}"
```
For each `<input>` (excluding `type="hidden"`, `type="submit"`, `type="button"`), check whether:
- An adjacent `<label htmlFor=...>` references the input's `id`, OR
- The input is wrapped in `<label>`, OR
- `aria-label=` or `aria-labelledby=` is set

**WRONG:**
```jsx
<input type="text" placeholder="Email" />
<input type="search" name="q" />
```

**CORRECT:**
```jsx
<label htmlFor="email">Email</label>
<input id="email" type="email" name="email" />

<label>Search<input type="search" name="q" /></label>

<input type="search" name="q" aria-label="Search" />
```

**Severity:** CRITICAL (WCAG 2.1 SC 1.3.1 / 3.3.2 failure)

**Fix:** Add an associated `<label>` or `aria-label`.

---

## Pattern 6: Color as the only state indicator

**Why it matters:** ~5% of users have color vision deficiency. A red error message without an icon or text marker is invisible to them. WCAG 2.1 SC 1.4.1.

**Grep:**
```bash
grep -nE "(color|className).*?(red|error|danger|success|green|warning)" --include="*.{tsx,jsx,vue,svelte}"
```
Heuristic — flag for review when an element changes color based on state without a paired text/icon change. Manual verification required (high false positive rate from raw grep).

**WRONG:**
```jsx
{error && <span className="text-red-500">{message}</span>}
<span style={{ color: 'red' }}>Failed</span>
```

**CORRECT:**
```jsx
{error && (
  <span className="text-red-500" role="alert">
    <ErrorIcon aria-hidden="true" /> Error: {message}
  </span>
)}

<span style={{ color: 'red' }}>
  <span aria-hidden="true">✗</span> Failed
</span>
```

**Severity:** WARNING

**Fix:** Pair color changes with text labels or icons. Use `role="alert"` for live error messages.

---

## Pattern 7: Modal without focus trap or restoration

**Why it matters:** Without a focus trap, keyboard users can Tab out of a modal into the dimmed-but-still-active background. Without focus restoration, focus jumps to the top of the page after close.

**Grep:**
```bash
grep -nE "Modal|Dialog|Drawer|Popover|Sheet" --include="*.{tsx,jsx,vue,svelte}"
```
For each component declaration, check imports for:
- `@radix-ui/react-dialog`, `react-aria-modal`, `@headlessui/react`, `react-focus-lock`, or
- Native `<dialog>` element, or
- Custom `useFocusTrap`/`FocusTrap` hook

If a Modal-like component is found without one of the above, flag it.

**WRONG:**
```jsx
function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50">
      <div className="modal">{children}</div>
    </div>
  );
}
```

**CORRECT (Radix):**
```jsx
import * as Dialog from '@radix-ui/react-dialog';
function MyModal({ open, onOpenChange, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content>{children}</Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

**CORRECT (native dialog):**
```jsx
<dialog ref={dialogRef} onClose={onClose}>
  {children}
</dialog>
// dialogRef.current.showModal()  — traps focus natively
```

**Severity:** CRITICAL (a11y blocker)

**Fix:** Use a library with built-in focus trap + restoration, or native `<dialog>` with `showModal()`.

---

## Pattern 8: Derived state stored alongside source state (sync bug)

**Why it matters:** Storing `filteredItems` when you have `items` and `filter` creates a synchronization bug. The two can drift, and `useEffect` chains to keep them in sync are an anti-pattern.

**Grep:**
```bash
grep -nE "useEffect\(.*set[A-Z]" --include="*.{tsx,jsx}" -A 5
```
Look for `useEffect` blocks whose only purpose is to call `setX` based on other state values.

**WRONG:**
```jsx
const [items, setItems] = useState([]);
const [filter, setFilter] = useState('');
const [filteredItems, setFilteredItems] = useState([]);

useEffect(() => {
  setFilteredItems(items.filter(i => i.name.includes(filter)));
}, [items, filter]);
```

**CORRECT:**
```jsx
const [items, setItems] = useState([]);
const [filter, setFilter] = useState('');
const filteredItems = useMemo(
  () => items.filter(i => i.name.includes(filter)),
  [items, filter]
);
```

**Severity:** WARNING

**Fix:** Compute derived values during render (or via `useMemo` if expensive). Never store them.

---

## Pattern 9: `Math.random()` / `Date.now()` / `new Date()` during render (hydration)

**Why it matters:** SSR renders these on the server with one value; client hydration produces a different value, causing a hydration mismatch error and React tearing down the tree.

**Grep:**
```bash
grep -nE "Math\.random\(\)|Date\.now\(\)|new Date\(\)" --include="*.{tsx,jsx,vue,svelte}"
```
Check if the call is inside a component body (not inside `useEffect`, `onClick`, or other deferred contexts).

**WRONG:**
```jsx
function Item({ name }) {
  const id = Math.random();        // different server vs client
  const now = Date.now();          // server time != client time
  return <div data-id={id}>{name} as of {now}</div>;
}
```

**CORRECT:**
```jsx
import { useId, useEffect, useState } from 'react';
function Item({ name }) {
  const id = useId();              // stable across server/client
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);
  return <div data-id={id}>{name}{now !== null && ` as of ${now}`}</div>;
}
```

**Severity:** CRITICAL (hydration error tears down the tree)

**Fix:** Use `useId()` for stable IDs. Move time-dependent values into `useEffect`.

---

## Pattern 10: `typeof window !== 'undefined'` guard during render (hydration)

**Why it matters:** Branching on `typeof window` during render means the server renders one tree and the client renders another. React 18+ explicitly errors on this.

**Grep:**
```bash
grep -nE "typeof window\s*!==?\s*['\"]undefined['\"]|typeof document" --include="*.{tsx,jsx,vue,svelte}"
```
Check if the guard is inside a component body or a module-level constant used in JSX.

**WRONG:**
```jsx
function Counter() {
  const initial = typeof window !== 'undefined' ? Number(localStorage.getItem('c') ?? 0) : 0;
  const [count, setCount] = useState(initial);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**CORRECT:**
```jsx
function Counter() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(Number(localStorage.getItem('c') ?? 0));
  }, []);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**Severity:** CRITICAL (hydration mismatch)

**Fix:** Initialize state synchronously to a deterministic value, then hydrate from browser APIs in `useEffect`.

---

## Pattern 11: Barrel imports from heavy libraries (bundle bloat)

**Why it matters:** `import { debounce } from 'lodash'` pulls the entire lodash bundle (~70KB gzip) unless tree-shaking is correctly configured. Many libraries publish CJS entry points that don't tree-shake.

**Grep:**
```bash
grep -nE "from ['\"](lodash|moment|date-fns|@mui/material|@mantine/core|antd)['\"]" --include="*.{ts,tsx,js,jsx}"
```

**WRONG:**
```jsx
import { debounce, throttle } from 'lodash';          // entire lodash
import moment from 'moment';                          // ~70KB gzip
import { Button, Card } from '@mui/material';         // OK if /modern build, often not
```

**CORRECT:**
```jsx
import debounce from 'lodash/debounce';               // single function
import throttle from 'lodash/throttle';
// OR
import { debounce, throttle } from 'lodash-es';       // ES modules, tree-shakes

// Replace moment with platform Intl or date-fns
new Intl.DateTimeFormat('en-US').format(date);

import Button from '@mui/material/Button';            // deep import
import Card from '@mui/material/Card';
```

**Severity:** WARNING (per-occurrence is small, cumulative is large)

**Fix:** Deep-import, use ES-modules build, or replace with platform API. Verify with `npx vite-bundle-visualizer` or `webpack-bundle-analyzer`.

---

## Pattern 12: Duplicate dependencies (bundle bloat, version skew)

**Why it matters:** Two installed versions of the same library double the bundle and can cause runtime bugs when types disagree.

**Grep (run on `package-lock.json` or `yarn.lock`):**
```bash
# pnpm/yarn
grep -E "^\s+(react|react-dom|lodash|moment|date-fns|@types/react)" package-lock.json | sort -u
# Or:
npm ls react react-dom lodash moment 2>&1 | grep -E "deduped|^[├└]"
```
Flag if the same package appears at multiple resolved versions.

**Severity:** WARNING

**Fix:** Add a `resolutions` (yarn/pnpm) or `overrides` (npm) entry pinning to one version. Run `npm dedupe` or `pnpm dedupe`.

---

## Pattern 13: Route bundles loaded eagerly (no code splitting)

**Why it matters:** Importing all routes statically means every page download includes every other page's code. First-route bundle should be <80KB compressed for fast LCP.

**Grep:**
```bash
grep -rE "import \w+ from ['\"]\.\.?/(routes|pages|views)/" --include="*.{tsx,jsx}"
```
If the importer is a router config file (`routes.tsx`, `App.tsx`), and the imports are static, flag.

**WRONG:**
```jsx
import Home from './routes/Home';
import Dashboard from './routes/Dashboard';
import Settings from './routes/Settings';
import Admin from './routes/Admin';        // 200KB ChartLibrary inside

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/admin', element: <Admin /> },
]);
```

**CORRECT:**
```jsx
import { lazy, Suspense } from 'react';
const Home = lazy(() => import('./routes/Home'));
const Dashboard = lazy(() => import('./routes/Dashboard'));
const Admin = lazy(() => import('./routes/Admin'));

const router = createBrowserRouter([
  { path: '/', element: <Suspense fallback={<Spinner/>}><Home /></Suspense> },
  { path: '/admin', element: <Suspense fallback={<Spinner/>}><Admin /></Suspense> },
]);
```

**Severity:** WARNING

**Fix:** Wrap route components in `lazy()` with `Suspense`. Verify with bundle analyzer that each route is a separate chunk.

---

## Pattern 14: useEffect chain (cascading renders)

**Why it matters:** An `useEffect` that calls `setState` triggers another render, which can fire another `useEffect`, ad nauseam. This pattern produces stuttering UI and is almost always replaceable with derived state or an event handler.

**Grep:**
```bash
grep -nE "useEffect\(" --include="*.{tsx,jsx}" -A 8
```
Flag when the effect body calls `setX` AND the dependency array includes another piece of state managed in the same component.

**WRONG:**
```jsx
const [items, setItems] = useState([]);
const [total, setTotal] = useState(0);
const [tax, setTax] = useState(0);
const [grand, setGrand] = useState(0);

useEffect(() => { setTotal(items.reduce((s, i) => s + i.price, 0)); }, [items]);
useEffect(() => { setTax(total * 0.1); }, [total]);
useEffect(() => { setGrand(total + tax); }, [total, tax]);
```

**CORRECT:**
```jsx
const [items, setItems] = useState([]);
const total = items.reduce((s, i) => s + i.price, 0);
const tax = total * 0.1;
const grand = total + tax;
```

**Severity:** WARNING

**Fix:** Compute derived values during render. Reserve `useEffect` for side effects (DOM/network/timers), not for state synchronization.

---

## Pattern 15: Object/array literal as prop (memo defeat)

**Why it matters:** A new object on every render bypasses `React.memo` and any `useMemo` dependency check, defeating memoization.

**Grep:**
```bash
grep -nE "<[A-Z]\w+\s+\w+=\{\[|<[A-Z]\w+\s+\w+=\{\{" --include="*.{tsx,jsx}"
```
Flag when the prop is an inline `{...}` or `[...]` literal AND the component is wrapped in `React.memo`.

**WRONG:**
```jsx
<MemoizedList items={data} filters={{ tag: 'a', active: true }} onItemClick={i => doThing(i)} />
```

**CORRECT:**
```jsx
const filters = useMemo(() => ({ tag: 'a', active: true }), []);
const onItemClick = useCallback(i => doThing(i), []);
<MemoizedList items={data} filters={filters} onItemClick={onItemClick} />
```

**Severity:** INFO (only matters if the child is expensive AND memoized)

**Fix:** Memoize the literal or accept the re-render. Don't blindly memoize cheap children.

---

## Pattern 16: Layout read after write (forced reflow)

**Why it matters:** Reading `offsetHeight`/`getBoundingClientRect` after writing to the DOM forces the browser to synchronously recompute layout, producing long tasks during animations.

**Grep:**
```bash
grep -nE "\.(offsetWidth|offsetHeight|offsetLeft|offsetTop|clientWidth|clientHeight|scrollHeight|scrollTop|getBoundingClientRect)" --include="*.{ts,tsx,js,jsx}"
```
For each match, check the surrounding 5 lines for `style.X =`, `.classList.`, `appendChild`, `removeChild` — a write followed by a read in the same synchronous block triggers reflow.

**WRONG:**
```js
for (const el of elements) {
  el.style.width = el.parentNode.offsetWidth + 'px';   // write → read → write → read
}
```

**CORRECT:**
```js
const widths = elements.map(el => el.parentNode.offsetWidth);   // all reads
elements.forEach((el, i) => { el.style.width = widths[i] + 'px'; });   // all writes
// OR use requestAnimationFrame to batch
```

**Severity:** WARNING

**Fix:** Batch reads, then writes. Use `requestAnimationFrame` for animation loops. Use CSS `transform`/`opacity` for animation (compositor-only).

---

## Pattern 17: Animating layout-affecting properties

**Why it matters:** Animating `width`, `height`, `top`, `left`, `margin` triggers layout on every frame, producing jank on low-end devices. `transform` and `opacity` run on the compositor.

**Grep:**
```bash
grep -nE "transition.*?(width|height|top|left|right|bottom|margin|padding)|animate.*?(width|height|top|left)" --include="*.{css,scss,tsx,jsx,vue,svelte}"
```

**WRONG:**
```css
.sidebar { transition: width 200ms ease; }
.sidebar.open { width: 300px; }
```

**CORRECT:**
```css
.sidebar {
  transform: translateX(-300px);
  transition: transform 200ms ease;
  width: 300px;
}
.sidebar.open { transform: translateX(0); }
```

**Severity:** WARNING

**Fix:** Use `transform: translate()` / `scale()` and `opacity`. Use `will-change` sparingly to hint the compositor.

---

## Pattern 18: Missing key on rendered list (or using index)

**Why it matters:** `key={i}` makes React mis-attribute state when items are reordered or removed. Stateful children (inputs, animations) attach to the wrong data. Missing key triggers a warning and slows reconciliation.

**Grep:**
```bash
grep -nE "\.map\(\(?\w+,?\s*\w*\)?\s*=>" --include="*.{tsx,jsx}" -A 3
```
For each `.map(...)` returning JSX, check that the returned element has a `key=` AND the key is not the iteration index.

**WRONG:**
```jsx
{items.map((item, i) => <Row data={item} />)}                  // missing key — React warns
{items.map((item, i) => <Row key={i} data={item} />)}          // index — stale state on reorder
```

**CORRECT:**
```jsx
{items.map(item => <Row key={item.id} data={item} />)}
```

**Severity:** WARNING (CRITICAL when list items contain stateful inputs)

**Fix:** Use a stable, unique id from the data. If none exists, generate one once (e.g., `crypto.randomUUID()` when items are created).

---

## Pattern 19: Web font without `font-display: swap` (FOIT)

**Why it matters:** Default `font-display: auto` blocks text rendering until the font loads, causing Flash of Invisible Text and inflating LCP. `swap` shows fallback immediately and swaps when the web font arrives.

**Grep:**
```bash
grep -nE "@font-face" --include="*.{css,scss}" -A 5
grep -nE "<link[^>]*google.*fonts" --include="*.{html,tsx,jsx}"
```
For each `@font-face`, check for `font-display:`. For Google Fonts links, check for `&display=swap`.

**WRONG:**
```css
@font-face {
  font-family: 'Brand';
  src: url('/fonts/brand.woff2') format('woff2');
}
```
```html
<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">
```

**CORRECT:**
```css
@font-face {
  font-family: 'Brand';
  src: url('/fonts/brand.woff2') format('woff2');
  font-display: swap;
}
```
```html
<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">
```

**Severity:** WARNING

**Fix:** Add `font-display: swap` (or `optional` for non-essential decorative fonts). Preload critical fonts: `<link rel="preload" href="/fonts/brand.woff2" as="font" type="font/woff2" crossorigin>`.

---

## Pattern 20: Hardcoded secret in client code

**Why it matters:** Anything in `src/` that runs in the browser is publicly visible. API keys, JWT secrets, DB credentials shipped to the client are leaked.

**Grep:**
```bash
grep -nrE "(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*['\"][a-zA-Z0-9_\-]{16,}['\"]" --include="*.{ts,tsx,js,jsx}"
grep -nrE "sk_(test|live)_[a-zA-Z0-9]{24,}" --include="*.{ts,tsx,js,jsx}"   # Stripe secret keys
grep -nrE "AKIA[0-9A-Z]{16}" --include="*.{ts,tsx,js,jsx}"                   # AWS access keys
```

**WRONG:**
```jsx
const stripe = new Stripe('sk_live_<YOUR_SECRET_KEY>');
const api = axios.create({ baseURL: 'https://api.x.com', headers: { 'X-API-Key': 'abc123def456...' } });
```

**CORRECT:**
```jsx
// Public env var (publishable key only — never secret keys client-side)
const stripe = new Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// API key flows through server route, never client
fetch('/api/proxy/x', { method: 'POST', body: JSON.stringify(data) });
```

**Severity:** CRITICAL (secret exposure)

**Fix:** Move all secret-bearing calls to server-side API routes. Client only holds publishable/public keys.

---

## Pattern 21: Missing skip-link / landmark structure

**Why it matters:** Keyboard users must Tab through every link to reach main content. A skip-link bypasses navigation. Missing `<main>` / `<nav>` landmarks degrade screen reader navigation.

**Grep:**
```bash
grep -lE "<main|<nav|<header|<footer" --include="*.{tsx,jsx,html,vue,svelte}"
grep -rlE "skip.?to.?content|skip.?to.?main" --include="*.{tsx,jsx,html,vue,svelte}"
```
For root layout files, check that `<main>` exists AND a skip-link is present.

**WRONG:**
```jsx
function Layout({ children }) {
  return <div>{children}</div>;
}
```

**CORRECT:**
```jsx
function Layout({ children }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only">Skip to main content</a>
      <header><nav>...</nav></header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer>...</footer>
    </>
  );
}
```

**Severity:** WARNING

**Fix:** Add semantic landmarks (`<main>`, `<nav>`, `<header>`, `<footer>`) and a visible-on-focus skip-link.

---

## Pattern 22: Heading hierarchy skip (a11y)

**Why it matters:** Screen reader users navigate by headings. Skipping levels (h1 → h3) breaks the document outline. Multiple h1s on a page confuse screen readers.

**Grep:**
```bash
grep -nE "<h[1-6]" --include="*.{tsx,jsx,html,vue,svelte}"
```
Static heuristic — for each file, list all headings in order. Flag if levels skip (h1 → h3 with no h2) or if multiple h1s appear without a sectioning element.

**WRONG:**
```jsx
<h1>Dashboard</h1>
<h3>Recent activity</h3>           {/* skipped h2 */}
<h2>Stats</h2>                     {/* out of order */}
```

**CORRECT:**
```jsx
<h1>Dashboard</h1>
<h2>Recent activity</h2>
<h2>Stats</h2>
<h3>Last 7 days</h3>
```

**Severity:** WARNING

**Fix:** Use sequential heading levels. Use CSS to control visual size, not heading level.

---

## Pattern 23: Insufficient color contrast

**Why it matters:** WCAG 2.1 SC 1.4.3 requires 4.5:1 for body text, 3:1 for large text. Low contrast fails legal compliance and is unreadable in bright environments.

**Grep:**
```bash
# Surface candidate text/background pairings — static analysis is approximate
grep -nE "color:\s*#[0-9a-fA-F]{3,6}|background.*?#[0-9a-fA-F]{3,6}" --include="*.{css,scss,tsx,jsx}"
```
Static analysis is insufficient. Recommend running `axe-core` or `pa11y` in CI for accurate detection.

**WRONG:**
```css
.muted { color: #999; background: white; }   /* 2.85:1 — fails */
```

**CORRECT:**
```css
.muted { color: #767676; background: white; }   /* 4.54:1 — passes */
```

**Severity:** WARNING (CRITICAL if it's body text)

**Fix:** Use a contrast checker (axe DevTools, Chrome DevTools color picker). Adjust colors until contrast meets 4.5:1.

---

## Pattern 24: `useState` for server data (cache miss, stale data)

**Why it matters:** Storing fetched data in `useState` and refetching on mount means every navigation refetches. No deduplication, no background revalidation, no optimistic updates.

**Grep:**
```bash
grep -nE "useEffect\(.*fetch\(|useEffect\(.*axios\.|useEffect\(.*\.get\(" --include="*.{tsx,jsx}" -A 5
```
For each match, check whether the component uses a query library (`@tanstack/react-query`, `swr`, `@apollo/client`, `urql`).

**WRONG:**
```jsx
function Profile({ id }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    fetch(`/api/users/${id}`).then(r => r.json()).then(setUser)
      .catch(setError).finally(() => setLoading(false));
  }, [id]);
  // ... duplicate everywhere this user is needed
}
```

**CORRECT:**
```jsx
import { useQuery } from '@tanstack/react-query';
function Profile({ id }) {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then(r => r.json()),
  });
}
```

**Severity:** WARNING

**Fix:** Use React Query / SWR / Apollo / urql. Get deduplication, caching, background refresh, and SSR support for free.

---

## Pattern 25: Inline event handler creating closure each render

**Why it matters:** When passed to a memoized child, an inline handler creates a new function each render, defeating memoization. For non-memoized children it's harmless; for memoized lists it's a real perf cost.

**Grep:**
```bash
grep -nE "on[A-Z]\w+=\{?\s*\([^)]*\)\s*=>" --include="*.{tsx,jsx}"
```

**WRONG:**
```jsx
const Row = React.memo(function Row({ item, onDelete }) { /* ... */ });
{items.map(item => (
  <Row key={item.id} item={item} onDelete={() => deleteItem(item.id)} />
))}
```

**CORRECT:**
```jsx
const Row = React.memo(function Row({ item, onDelete }) {
  return <button onClick={() => onDelete(item.id)}>Delete {item.name}</button>;
});
function List({ items }) {
  const onDelete = useCallback((id) => deleteItem(id), []);
  return items.map(item => <Row key={item.id} item={item} onDelete={onDelete} />);
}
```

**Severity:** INFO

**Fix:** Push the closure inside the memoized child so it owns the per-item identity. Or `useCallback` the handler upstream.

---

## Pattern 26: `console.log` shipped to production

**Why it matters:** Logs in production leak sensitive data (user IDs, tokens, internal state) to anyone with DevTools. They also slow execution in tight loops.

**Grep:**
```bash
grep -nE "console\.(log|debug|info)\(" --include="*.{ts,tsx,js,jsx}"
```
Exclude server-only files (`pages/api/`, `app/api/`, `server/`).

**WRONG:**
```jsx
function checkout(user, cart) {
  console.log('User:', user, 'Cart:', cart, 'Token:', sessionToken);
  // ...
}
```

**CORRECT:**
```jsx
import { logger } from '@/lib/log';   // wraps console.* and is stripped in prod build
function checkout(user, cart) {
  logger.debug('Checkout', { userId: user.id, cartSize: cart.length });
}
```
Or configure `babel-plugin-transform-remove-console` / `terser` `drop_console` in the production build.

**Severity:** INFO (CRITICAL if sensitive data is logged)

**Fix:** Use a logger wrapper. Strip console statements in production via build config.

---

## Pattern Summary Table

| # | Pattern | Mode | Severity |
|---|---------|------|----------|
| 1 | Image without dimensions | PERFORMANCE_AUDIT | WARNING |
| 2 | `dangerouslySetInnerHTML` with user input | SECURITY_AUDIT | CRITICAL |
| 3 | `target=_blank` without `rel=noopener` | SECURITY_AUDIT | WARNING |
| 4 | `<div>` as button | ACCESSIBILITY_AUDIT | CRITICAL |
| 5 | `<input>` without label | ACCESSIBILITY_AUDIT | CRITICAL |
| 6 | Color-only state indicator | ACCESSIBILITY_AUDIT | WARNING |
| 7 | Modal without focus trap | ACCESSIBILITY_AUDIT | CRITICAL |
| 8 | Stored derived state | RENDER_AUDIT | WARNING |
| 9 | `Math.random()` / `Date.now()` in render | HYDRATION_AUDIT | CRITICAL |
| 10 | `typeof window` guard in render | HYDRATION_AUDIT | CRITICAL |
| 11 | Barrel imports from heavy libs | BUNDLE_AUDIT | WARNING |
| 12 | Duplicate dependencies | BUNDLE_AUDIT | WARNING |
| 13 | Eager route bundles | BUNDLE_AUDIT | WARNING |
| 14 | useEffect chain | RENDER_AUDIT | WARNING |
| 15 | Inline object/array prop on memo | RENDER_AUDIT | INFO |
| 16 | Layout read after write | PERFORMANCE_AUDIT | WARNING |
| 17 | Animating layout properties | PERFORMANCE_AUDIT | WARNING |
| 18 | Missing/index key on list | RENDER_AUDIT | WARNING |
| 19 | Web font without `font-display: swap` | PERFORMANCE_AUDIT | WARNING |
| 20 | Hardcoded secret in client | SECURITY_AUDIT | CRITICAL |
| 21 | Missing skip-link / landmarks | ACCESSIBILITY_AUDIT | WARNING |
| 22 | Heading hierarchy skip | ACCESSIBILITY_AUDIT | WARNING |
| 23 | Insufficient color contrast | ACCESSIBILITY_AUDIT | WARNING |
| 24 | `useState` for server data | RENDER_AUDIT | WARNING |
| 25 | Inline handler on memoized child | RENDER_AUDIT | INFO |
| 26 | `console.log` in production | SECURITY_AUDIT | INFO |

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
| 0-49 | FAIL_SEVERE | Comprehensive a11y/perf/security review required |

## NR-SAFE Annotations

Mark intentional exceptions with `// NR-SAFE: [reason]` on the same line or the line above. The auditor downgrades the finding to INFO and records the exemption.

```jsx
// NR-SAFE: trusted markdown source from CMS, sanitized server-side
<div dangerouslySetInnerHTML={{ __html: post.bodyHtml }} />
```

## Integration with nr-web-auditor

This file is loaded by `agents/nr-web-auditor.md`. The auditor runs each grep pattern, performs the context check from Step 3 (false-positive guard), classifies severity, and writes the structured report to `.planning/audit/AUDIT-WEB-{MODE}-{timestamp}.md`.
