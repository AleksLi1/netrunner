# Workflow: Build Mobile App

<purpose>
End-to-end mobile app development from architecture to app store submission.
6 mandatory phases in strict order. Each phase has a gate that must pass before proceeding.
Covers React Native, Flutter, and native (Swift/Kotlin) projects.
</purpose>

<inputs>
- App concept and requirements from user (via run.md BUILD classification with mobile domain)
- `.planning/CONTEXT.md` — project context, constraints, prior work
- Target platforms (iOS, Android, or both)
- Framework choice (React Native, Flutter, native)
</inputs>

<prerequisites>
- Mobile domain detected (2+ signal keywords in CONTEXT.md)
- References loaded: mobile-reasoning.md, mobile-code-patterns.md, mobile-architecture.md
- Overlay loaded: overlays/mobile.md
</prerequisites>

<phase_enforcement>

## Phase Order (NON-NEGOTIABLE)

```
PHASE_ORDER = [
    "ARCHITECTURE",    # Phase 1: Platform decision, project structure, core dependencies
    "CORE_FEATURES",   # Phase 2: Business logic, state management, core screens
    "OFFLINE_SYNC",    # Phase 3: Offline-first data layer, mutation queue, sync engine
    "NAVIGATION_UX",   # Phase 4: Navigation architecture, deep links, accessibility
    "PERFORMANCE",     # Phase 5: Startup optimization, list rendering, memory, battery
    "APP_STORE"        # Phase 6: Store metadata, privacy compliance, submission
]

# NON-NEGOTIABLE: phases cannot be skipped or reordered.
# The ONLY exception: going BACKWARD (e.g., from PERFORMANCE back to CORE_FEATURES).
# Forward skipping is NEVER allowed.
```

### Skip Prevention Logic

Before entering any phase N, verify:
1. All phases 1 through N-1 have status COMPLETE in STATE.md
2. All gates for phases 1 through N-1 have PASS status
3. No CRITICAL violations remain unresolved from prior phases

If any check fails, HALT and report which prerequisite is missing.

</phase_enforcement>

<procedure>

## Phase 1: ARCHITECTURE & SETUP

**Goal:** Make and validate the platform decision, establish project structure, and configure the development environment.

### 1.1 Platform Decision Framework

The framework choice depends on organizational constraints, not technical preference:

| Factor | React Native | Flutter | Native (Swift/Kotlin) |
|--------|-------------|---------|----------------------|
| **Team composition** | JS/TS developers | Dart-tolerant or new team | iOS + Android specialists |
| **Shared business logic** | 80-95% code sharing | 80-95% code sharing | 0-30% (via KMP) |
| **Platform feel** | Near-native with effort | Custom rendering (consistent, not native) | True native |
| **Deep OS integration** | Possible via native modules | Possible via platform channels | Native — no bridge overhead |
| **OTA updates** | CodePush / Expo Updates | Shorebird (newer) | Store-only updates |
| **Hiring pool** | Large (JS ecosystem) | Growing (Dart niche) | Platform-specific |

**Decision rule:** If the user cannot articulate why they need native, default to cross-platform. If they need deep OS integration on more than 3 features, consider native for that platform.

### 1.2 Project Structure Validation

For React Native:
```
src/
  components/     # Shared UI components
  screens/        # Screen components (one per route)
  navigation/     # Navigation config, deep link mapping
  hooks/          # Custom hooks (useAuth, useOffline, useAppState)
  services/       # API client, sync engine, push notification handler
  storage/        # Local storage layer (AsyncStorage/MMKV wrappers)
  utils/          # Pure utility functions
  types/          # TypeScript type definitions
  constants/      # App-wide constants, config
ios/              # Native iOS project
android/          # Native Android project
```

### 1.3 Core Dependency Audit

Verify every dependency against:
- **Maintained?** Last commit within 6 months, open issues triaged
- **Compatible?** Works with current RN/Flutter version and New Architecture (RN) / Impeller (Flutter)
- **Size impact?** Bundle size contribution justified by functionality
- **Native?** Does it require native linking? Does it support both platforms?

### 1.4 Development Environment

- Physical device available for each target platform (not just emulator)
- Debug build configured with: Flipper/React DevTools (RN), DevTools (Flutter), Instruments/Profiler (native)
- Environment configuration per build variant: development, staging, production
- CI pipeline producing test builds for both platforms

### 1.5 Outputs

- `.planning/ARCHITECTURE.md` — platform decision rationale, project structure, dependency list
- `.planning/DEVICE_MATRIX.md` — target devices, minimum OS versions, test device inventory
- Working project skeleton that builds and runs on both platforms
- CI pipeline producing debug builds

### Gate: PROJECT STRUCTURE REVIEW

```
Task(
  subagent_type="nr-verifier",
  description="Validate mobile project architecture",
  prompt="Review the mobile project setup:

  Check:
  1. Project builds successfully on both target platforms
  2. TypeScript/Dart strict mode enabled
  3. All dependencies are maintained and compatible
  4. Environment configuration exists for dev/staging/prod
  5. Physical test device available for at least one platform
  6. Navigation structure defined with route types
  7. No hardcoded API URLs or secrets in source

  PASS if all checks pass. FAIL with specific issues otherwise."
)
```

---

## Phase 2: CORE FEATURES

**Goal:** Implement business logic, state management, and primary screens with proper error handling.

### 2.1 State Management Setup

Choose state management proportional to complexity:

```
COMPLEXITY_LADDER = [
    "React.useState + Context",       # 1-3 shared state values
    "Zustand / Riverpod / Provider",   # Multiple stores, async state
    "Redux Toolkit / Bloc",            # Complex state machines, middleware
]

# Rule: Start with the simplest. Upgrade only when the current approach
# creates measurable problems (prop drilling >3 levels, stale state bugs).
```

### 2.2 Screen State Machine

Every screen MUST handle four states:

```typescript
type ScreenState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string; retry: () => void }
  | { status: 'empty'; message: string };

// Plus offline variant for data-dependent screens:
type OfflineScreenState<T> = ScreenState<T>
  | { status: 'offline_cached'; data: T; staleSince: number }
  | { status: 'offline_empty'; message: string };
```

### 2.3 API Layer

```typescript
// Typed API client with error normalization
class ApiClient {
  async request<T>(config: RequestConfig): Promise<ApiResult<T>> {
    const isOnline = (await NetInfo.fetch()).isConnected;
    if (!isOnline) {
      return { ok: false, error: 'offline', offline: true };
    }

    try {
      const response = await fetch(config.url, {
        method: config.method,
        headers: { ...this.defaultHeaders, ...config.headers },
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: AbortSignal.timeout(config.timeout ?? 10000),
      });

      if (!response.ok) {
        return { ok: false, error: `HTTP ${response.status}`, status: response.status };
      }

      const data = await response.json();
      return { ok: true, data };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { ok: false, error: 'timeout' };
      }
      return { ok: false, error: error.message };
    }
  }
}
```

### 2.4 Outputs

- Core screens implemented with loading/error/empty/success states
- State management configured and shared state accessible
- API layer with error normalization and timeout handling
- Unit tests for business logic (target: 80% coverage on non-UI code)

### Gate: FEATURE COMPLETENESS

```
Task(
  subagent_type="nr-verifier",
  description="Verify core feature implementation",
  prompt="Review core feature implementation:

  Check:
  1. Every screen handles loading, error, empty, and success states
  2. No unhandled promise rejections in API calls
  3. State management is consistent (no mix of patterns)
  4. Unit test coverage >80% on business logic
  5. No hardcoded strings (i18n-ready or constants file)
  6. TypeScript strict — no 'any' types in business logic

  PASS if all checks pass. FAIL with specific screen/component issues."
)
```

---

## Phase 3: OFFLINE & SYNC

**Goal:** Implement offline-first data layer so the app is usable without network.

### 3.1 Offline Strategy Selection

| Data Type | Strategy | Implementation |
|-----------|----------|---------------|
| **Read-only reference data** | Cache with TTL | Fetch on first load, serve from cache, refresh in background |
| **User-generated content** | Sync engine with queue | Local writes, queue mutations, sync when online |
| **Real-time collaborative** | CRDT or OT | Local changes, merge on sync, automatic conflict resolution |
| **Sensitive data** | Encrypted local store | Keychain/Keystore for tokens, encrypted DB for PII |

### 3.2 Cache-First Data Loading

```typescript
async function loadWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<CacheResult<T>> {
  // Step 1: Return cached data immediately
  const cached = await storage.get<T>(key);
  if (cached) {
    // Return cache instantly, refresh in background
    refreshInBackground(key, fetcher);
    return { data: cached.data, stale: isStale(cached.timestamp), source: 'cache' };
  }

  // Step 2: No cache — try network
  try {
    const data = await fetcher();
    await storage.set(key, data);
    return { data, stale: false, source: 'network' };
  } catch {
    return { data: null, stale: false, source: 'none' };
  }
}
```

### 3.3 Mutation Queue

Implement persistent mutation queue per `references/mobile-architecture.md` Section 2 (Mutation Queue). Requirements:
- Mutations persist across app kills (stored in AsyncStorage/MMKV)
- Retry with exponential backoff (max 5 retries)
- Dead letter queue for permanently failed mutations
- Optimistic UI update with rollback on failure

### 3.4 Airplane Mode Walkthrough

Test EVERY screen and action in airplane mode:
- [ ] App launches and shows cached content (or meaningful empty state)
- [ ] Navigation works between all screens
- [ ] Forms can be filled and submitted (queued for sync)
- [ ] User sees offline indicator
- [ ] Previously viewed content is available
- [ ] No white screens, no infinite spinners, no cryptic errors
- [ ] When connectivity returns, queued mutations sync automatically

### 3.5 Outputs

- Offline data layer with cache-first reads
- Mutation queue with persistence and retry
- Sync engine with conflict detection
- Airplane mode walkthrough report (all screens documented)

### Gate: OFFLINE TEST PASS

```
Task(
  subagent_type="nr-verifier",
  description="Verify offline-first implementation",
  prompt="Test the app in airplane mode:

  Check:
  1. App launches and shows content (cached or meaningful empty state)
  2. All navigation works without network
  3. Forms/inputs work offline — mutations are queued
  4. Offline indicator is visible
  5. When network returns, queued mutations sync
  6. No white screens, infinite spinners, or unhandled errors
  7. Cache has size limits (not unbounded growth)

  PASS only if ALL offline checks pass. This is non-negotiable."
)
```

---

## Phase 4: NAVIGATION & UX

**Goal:** Implement full navigation architecture with deep links, accessibility, and platform-appropriate UX.

### 4.1 Navigation Structure

Map every screen to a route with typed parameters:

```typescript
type RootStackParamList = {
  Home: undefined;
  ProductDetail: { productId: string };
  Category: { slug: string; title: string };
  Cart: undefined;
  Checkout: { step?: number };
  Settings: undefined;
  NotFound: undefined;
};
```

### 4.2 Deep Link Coverage

Every screen MUST be reachable via deep link. Test from all entry states:

| Entry State | Test Method | Expected Behavior |
|-------------|-------------|-------------------|
| Cold start (killed) | `adb shell am start -a VIEW -d "myapp://product/123"` | Navigate to product after splash |
| Background | Tap link while app is backgrounded | Navigate to product, preserve back stack |
| Foreground | Receive push notification with deep link | In-app navigation to product |
| Not installed | Universal link on web | App store redirect (deferred deep link) |
| Logged out | Deep link to authenticated content | Save URL, redirect to login, then navigate after auth |

### 4.3 Accessibility Audit

Every interactive element MUST have:
- `accessibilityLabel` — what it is ("Buy Running Shoes for $59.99")
- `accessibilityRole` — what type it is ("button", "header", "link")
- `accessibilityHint` — what it does ("Double tap to add to cart") — for non-obvious actions

Run VoiceOver (iOS) or TalkBack (Android) through every screen. Document any element that:
- Has no label (screen reader says "button" with no context)
- Has a generic label ("button 3")
- Cannot be reached via focus navigation
- Has incorrect role (link announced as text)

### 4.4 Outputs

- Complete navigation structure with typed routes
- Deep link configuration covering all screens
- Universal Links / App Links server-side files configured
- Accessibility audit report with all issues resolved
- Platform-specific UX adjustments (back button, gestures, haptics)

### Gate: DEEP LINK + ACCESSIBILITY

```
Task(
  subagent_type="nr-verifier",
  description="Verify navigation, deep links, and accessibility",
  prompt="Audit navigation and accessibility:

  Check:
  1. Every screen reachable via deep link
  2. Deep links work from cold start, background, and foreground
  3. Auth-gated deep links redirect to login then continue
  4. NotFound/fallback screen handles unknown routes
  5. Every interactive element has accessibilityLabel + accessibilityRole
  6. Screen reader (VoiceOver/TalkBack) can navigate all screens
  7. Focus order is logical (top-to-bottom, left-to-right)
  8. Back button behavior matches platform conventions

  PASS if all checks pass."
)
```

---

## Phase 5: PERFORMANCE OPTIMIZATION

**Goal:** Achieve production-quality performance — fast startup, smooth scrolling, stable memory, minimal battery drain.

### 5.1 Startup Optimization

Target: Cold start to first meaningful paint < 2 seconds on mid-range device.

```
Profiling steps:
1. Measure current cold start time on physical mid-range device
2. Identify initialization bottleneck (systrace / Instruments)
3. Defer non-critical initialization (analytics, feature flags, preloads)
4. Enable Hermes (React Native) — pre-compiled bytecode, faster parse
5. Lazy-load heavy screens (React.lazy / deferred routing)
6. Pre-cache critical data during splash screen
7. Re-measure after each optimization
```

### 5.2 List Rendering

Target: 60fps sustained scrolling through 1000+ items.

Verify all lists use:
- FlatList/RecyclerView (NOT ScrollView for dynamic data)
- Stable `keyExtractor` (NOT array index)
- `getItemLayout` for fixed-height items
- Memoized `renderItem` with `React.memo`
- `windowSize` and `maxToRenderPerBatch` tuned
- `removeClippedSubviews={true}` on Android

### 5.3 Memory Stability

Target: Memory stable after 5 minutes of continuous use (no monotonic climb).

```
Test protocol:
1. Open memory profiler on physical device
2. Navigate through all screens in sequence
3. Scroll through longest list (500+ items) twice
4. Background the app, foreground it
5. Repeat navigation sequence
6. Memory at minute 5 should be within 10% of minute 1
```

### 5.4 Battery Audit

Review all background execution:
- [ ] No `setInterval` running when app is backgrounded
- [ ] Location tracking uses significant-change (not continuous)
- [ ] Analytics batched, not sent per event
- [ ] WebSocket disconnects on background, reconnects on foreground
- [ ] Background fetch interval >= 15 minutes
- [ ] Image cache has size limit and eviction policy

### 5.5 Outputs

- Performance profile report (startup time, FPS, memory usage)
- Optimized FlatList/list configurations
- Background execution audit (all intervals/timers reviewed)
- Before/after metrics on mid-range device

### Gate: PERFORMANCE TARGETS

```
Task(
  subagent_type="nr-verifier",
  description="Verify performance targets on physical device",
  prompt="Measure performance on mid-range physical device:

  Check:
  1. Cold start to first meaningful paint < 2 seconds
  2. List scrolling maintains 60fps (no frame drops in profile)
  3. Memory stable after 5 minutes of use (no monotonic climb)
  4. No background timers/intervals running when backgrounded
  5. App size < 50MB (or justified if larger)
  6. No synchronous I/O on main thread

  PASS if all targets met on physical device. Emulator results do not count."
)
```

---

## Phase 6: APP STORE PREPARATION

**Goal:** Prepare all store metadata, privacy compliance, and submission materials for successful first review.

### 6.1 Pre-Submission Checklist

**iOS:**
- [ ] App Store Connect metadata complete (title, subtitle, keywords, description)
- [ ] Screenshots for required device sizes (6.7", 6.5", 5.5" — plus iPad if universal)
- [ ] App Privacy (nutrition label) accurately reflects data collection
- [ ] App Tracking Transparency prompt (if any tracking)
- [ ] Info.plist has usage descriptions for all permissions
- [ ] No private API usage
- [ ] In-app purchases use StoreKit (not custom payment for digital goods)
- [ ] Review notes explain any non-obvious functionality or test account credentials

**Android:**
- [ ] Play Console listing complete (title, short/full description, graphics)
- [ ] Data Safety section accurately reflects data collection
- [ ] Target SDK meets Play Store requirement (currently API 34+)
- [ ] AAB format (not APK) for Play Store
- [ ] Content rating questionnaire completed
- [ ] Privacy policy URL provided
- [ ] Permissions declared with justification

### 6.2 Privacy Compliance

```
For each data type collected, document:
| Data Type | Collected? | Purpose | Shared? | Retention |
|-----------|-----------|---------|---------|-----------|
| Name/Email | Yes | Account | No | Until deletion |
| Location | Yes (coarse) | Local content | No | Session only |
| Analytics | Yes | Improvement | Yes (Firebase) | 14 months |
| Crash logs | Yes | Stability | Yes (Crashlytics) | 90 days |
| Device ID | No | — | — | — |
```

### 6.3 TestFlight / Internal Testing

Before store submission:
1. Distribute beta to 5+ testers via TestFlight (iOS) / Internal Testing (Android)
2. Collect feedback on: crashes, UX confusion, missing features, performance
3. Monitor crash-free rate — must be >99.5% before public submission
4. Fix all critical and high-severity issues
5. Run through store review guidelines checklist one final time

### 6.4 Outputs

- Store listings complete for all target platforms
- Privacy policy published and linked
- Privacy nutrition label / data safety section accurate
- Beta testing report with >99.5% crash-free rate
- Screenshots and app previews for required device sizes

### Gate: STORE CHECKLIST COMPLETE

```
Task(
  subagent_type="nr-verifier",
  description="Final pre-submission review",
  prompt="Review app store submission readiness:

  Check:
  1. All store metadata fields complete (no placeholders)
  2. Privacy policy URL accessible and accurate
  3. Privacy labels/data safety match actual data collection
  4. All permission usage descriptions are specific (not generic)
  5. Crash-free rate >99.5% over beta testing period
  6. No test/debug code in release build (no console.log, no debug flags)
  7. App icons and splash screen present for all required sizes
  8. Deep links work with universal links / app links in production config

  PASS if ready for first submission. FAIL with specific blockers."
)
```

</procedure>

## Workflow Completion

When all 6 phases pass their gates:

1. Update `.planning/STATE.md` with final status for all phases
2. Update `.planning/CONTEXT.md` with the completed workflow record
3. Generate a summary: what was built, key decisions made, known limitations, and maintenance recommendations
4. The app is ready for store submission — but remind the user: "First submission often gets review feedback. This is normal. Read the rejection reason literally and address exactly what is cited."
