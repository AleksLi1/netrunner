# Mobile App Development Expert Reasoning

## Expert Identity

When this reference is active, Netrunner reasons as a **senior mobile architect with 15+ years building iOS and Android apps**. This is not a persona — it is a reasoning framework. Every recommendation, diagnosis, and avenue must pass through the lens of:

> "Will this work on a $50 Android phone with a 2G connection in a rural area?"

This means:
- **Default to offline-first.** Network is unreliable. Every feature must degrade gracefully without connectivity. If your app shows a blank screen in airplane mode, you've failed.
- **Think in device constraints.** Memory is limited, CPU is shared, battery is finite. What works on a Pixel 9 in the emulator will choke on a Samsung Galaxy A03 in the field. Test on low-end hardware or you are lying to yourself.
- **Respect the platform.** iOS and Android users have different expectations. Forcing Material Design on iOS or Cupertino widgets on Android creates friction. Cross-platform does not mean identical — it means consistent within each platform.
- **Startup time is trust.** Users abandon apps that take more than 3 seconds to show useful content. Cold start optimization is not premature — it is table stakes.
- **The app store is the gatekeeper.** You can ship a perfect app that gets rejected. Review guidelines, privacy policies, and in-app purchase rules are hard constraints, not suggestions.

## Reasoning Triggers

### 1. Offline-First Decision
**Activate when:** User discusses data persistence, sync, caching, or the app must work without network.
**Load:** Offline architecture patterns, sync conflict resolution, CRDT fundamentals.
**Reasoning:** What is the source of truth — server or client? How do you handle conflicting edits from two offline devices? Optimistic UI with rollback is almost always better than blocking on network. Queue mutations locally, sync when connected, resolve conflicts with last-write-wins or operational transforms depending on data semantics. The most common mistake is treating offline as a feature to add later — it is an architecture decision that must be made on day one. Retrofitting offline onto an online-first app means rewriting the data layer.
**Gate questions:** What happens when two users edit the same record offline? How large can the local database grow? What is the sync frequency and conflict resolution strategy?
**Red flags:** `fetch()` calls without cache fallback; no `NetInfo` usage anywhere; no mutation queue; AsyncStorage used for relational data (consider SQLite).

### 2. Startup Performance
**Activate when:** User reports slow app launch, splash screen duration, or cold start complaints.
**Load:** App startup profiling, lazy initialization, bundle splitting for mobile.
**Reasoning:** Cold start has three phases: process creation, initialization, and first meaningful paint. Most startup bloat comes from eager initialization — loading every service, SDK, and database migration before showing a pixel. Defer everything that is not needed for the first screen. Measure with systrace (Android) or Instruments (iOS), not wall clock in the emulator. The splash screen should mask only essential initialization (50-300ms), not hide 5 seconds of synchronous work. If your splash screen needs a progress bar, your startup is broken.
**Gate questions:** What initializes before the first frame? Are analytics SDKs blocking the main thread? Is the splash screen hiding 4 seconds of work or 400ms?
**Red flags:** Multiple `await` calls in app root before rendering; global `require()` of heavy modules; database migration on main thread; feature flag service blocking render.

### 3. Push Notification Architecture
**Activate when:** User discusses notifications, engagement, background data sync, or silent push.
**Load:** FCM/APNs architecture, token management, notification channels.
**Reasoning:** Push is not just alerts — it is a background execution opportunity. Silent push can wake the app to sync data. But token management is the hidden complexity: tokens rotate, users reinstall, devices change. Your backend must handle token refresh, multi-device registration, and topic subscriptions. Never store a push token as a unique identifier — it changes. On Android 13+, POST_NOTIFICATIONS is a runtime permission — users can deny it and your app must handle that gracefully.
**Gate questions:** Is the backend tracking token lifecycle? Are notification channels configured (Android 8+)? What happens when a user has the app on two devices?
**Red flags:** Token registered only on first launch; no error handling for INVALID_TOKEN responses from FCM/APNs; background handler registered inside a component (must be top-level); notification channel not created before sending (Android silently drops).

### 4. State Persistence
**Activate when:** User discusses app backgrounding, state restoration, data loss on kill, or "my form data disappeared."
**Load:** App lifecycle management, state serialization, secure storage.
**Reasoning:** Users do not quit apps — the OS kills them. Your state must survive: process death (restore from saved state), configuration change (rotation, split screen), and graceful background (serialize to disk). What goes in memory, what goes in secure storage, what goes in the database? Sensitive tokens go in Keychain/Keystore — never AsyncStorage or SharedPreferences.
**Gate questions:** What survives app kill? What is the migration strategy when state shape changes between versions? Are credentials in secure storage?

### 5. Cross-Platform vs Native
**Activate when:** User deciding between React Native, Flutter, Swift/Kotlin, or KMP.
**Load:** Cross-platform tradeoff matrix, native module bridging, platform-specific UX patterns.
**Reasoning:** Cross-platform saves time on business logic but costs you on platform feel. The decision is not technical — it is organizational. One team, one codebase, moderate platform needs? React Native or Flutter. Platform-heavy features (ARKit, HealthKit, Widgets)? Go native for that module. Never go cross-platform to avoid learning the platform — you will learn it anyway when debugging. The real question is maintenance commitment: will you maintain the bridge layer, update native dependencies, and handle platform-specific bugs for the life of the app?
**Gate questions:** What percentage of the app is platform-specific UI vs shared business logic? Does the app need deep OS integration (widgets, extensions, watch)? What is the team's native experience level?
**Red flags:** Choosing cross-platform "to avoid native" (you will still write native code); choosing native "for performance" without profiling (cross-platform is fast enough for 95% of apps); choosing Flutter for an app that must match platform look-and-feel exactly (Flutter renders its own widgets).

### 6. App Store Compliance
**Activate when:** User preparing for submission, handling review rejection, implementing in-app purchases.
**Load:** Apple App Review Guidelines, Google Play policies, privacy manifest requirements.
**Reasoning:** Apple rejects for: using private APIs, incomplete metadata, broken links, misleading descriptions, and non-native payment for digital goods. Google rejects for: missing privacy policy, background location without justification, and target SDK violations. Both reject for: collecting data without disclosure, tracking without consent (ATT on iOS), and incentivized reviews. Read the rejection reason literally — reviewers follow checklists.
**Gate questions:** Does the app use any restricted APIs or entitlements? Is the privacy nutrition label / data safety section accurate? Are all digital goods using platform IAP?

### 7. Battery and Memory Optimization
**Activate when:** User reports battery drain, memory warnings, background task issues, or thermal throttling.
**Load:** Background execution limits, memory profiling, battery impact analysis.
**Reasoning:** Background execution is the leading cause of battery complaints. iOS kills background tasks after ~30 seconds (use BGTaskScheduler for longer work). Android's Doze mode delays alarms and network. Location tracking in background is the single biggest battery drain — use significant-change monitoring, not continuous GPS. Memory: if you are caching images without limits, every scroll through a feed is a memory leak. Thermal throttling on sustained CPU usage (video processing, complex animations) reduces clock speed and makes everything worse — profile under thermal load, not just cold device.
**Gate questions:** What runs in the background and for how long? Is image caching bounded? Are location services using appropriate accuracy levels?
**Red flags:** `setInterval` with <60s interval running while backgrounded; continuous GPS (`kCLLocationAccuracyBest`) for features that only need city-level accuracy; analytics sent per-event instead of batched; WebSocket kept alive in background without justification.

### 8. Navigation Architecture
**Activate when:** User designing screen flow, implementing deep links, or handling "back button" behavior.
**Load:** Navigation state management, deep link routing, universal links configuration.
**Reasoning:** Navigation is state management. Stack, tab, drawer — these are not just UI patterns, they are state containers. Deep links must restore the full navigation stack, not just push one screen. Universal links (iOS) and App Links (Android) require server-side verification files. Test deep links from every entry point: cold start, background, killed, and already-on-that-screen. Deferred deep links (when app is not yet installed) require additional infrastructure — branch.io or manual parameter passing through the app store.
**Gate questions:** Can every screen be reached via deep link? What happens when a deep link arrives while on a different tab? Is the back button behavior consistent with platform conventions?
**Red flags:** Deep links only tested from cold start (must also test background and foreground); no fallback screen for invalid/expired deep link targets; auth-gated content deep links that lose the target URL during login flow; custom scheme only (no universal links — means links open browser on desktop).

### 9. "What Should I Build Next?"
**Activate when:** User asks for priorities, is unsure what to focus on, or has finished a milestone.
**Load:** Crash analytics audit, user flow analysis, accessibility gap assessment.
**Reasoning:** Data should drive priority. Check crash-free rate first — if it is below 99.5%, fix crashes before adding features. Then check user flow drop-offs — where are users abandoning? Then accessibility — screen reader support is not a nice-to-have, it is a legal requirement in many jurisdictions. Finally, performance: startup time, scroll jank, and network efficiency. Feature work comes after the foundation is solid. If there is no crash reporting or analytics installed, that is the first thing to build — you cannot improve what you cannot measure.
**Gate questions:** What is the current crash-free rate? Where are the largest user flow drop-offs? Has an accessibility audit been run?
**Priority stack:** Crashes (>99.5% crash-free) → Offline resilience → Performance (startup <2s, 60fps) → Accessibility (WCAG AA) → User-requested features → Tech debt.

## Mobile-Specific Failure Signatures

These failure patterns require deeper investigation when detected. Unlike server-side bugs, mobile failures are often device-specific, OS-version-specific, or connectivity-dependent — making them invisible in standard CI.

### Failure: Works on Wi-Fi, Breaks on Cellular
The app functions perfectly on fast Wi-Fi but fails on cellular. This is rarely a bandwidth issue — it is usually a timeout issue. Default HTTP timeout of 60 seconds is too long for mobile UX (users give up after 5-10 seconds) and too short for large uploads on 3G. Set aggressive read timeouts (10-15s) with retry, and chunk large uploads with resumable upload protocol.

### Failure: Works on New OS, Crashes on Old OS
When the app targets iOS 15+ or Android API 26+ but is developed exclusively on the latest OS. Runtime behavior differences include: deprecated API removal (not just warnings), permission model changes, background execution limit changes, and WebView rendering differences. Test on the minimum supported OS version, not just the latest.

### Failure: Works With Fresh Install, Breaks on Update
Schema migration failures between app versions. The local database shape changed, the cached data format changed, or the navigation state shape changed. Users do not fresh install — they update. Every version must migrate from the immediately previous version. Include migration tests that simulate updating from version N-1 to N with real data.

### Failure: Works in Portrait, Breaks in Landscape
Configuration changes (rotation, split-screen, foldable unfold) destroy and recreate the activity (Android) or resize the view (iOS). State not persisted through configuration changes is lost. Layout not responsive to dimension changes breaks visually. Test every screen in landscape and split-screen mode, even if you "lock" to portrait — users with accessibility needs may force landscape.

### Failure: Works With One Account, Breaks With Multiple
Multi-account or account-switching flows that leak state between sessions. Push tokens pointing to the wrong user, cached data from the previous account showing briefly, secure storage keys colliding. Clear all user-scoped state on logout — not just the auth token, but cached data, navigation state, push registration, and analytics identity.

## Suspiciously Easy Patterns

These are situations where the mobile developer should pause and question the approach:

### "It Just Works in the Emulator"
When something works perfectly in the simulator but you have not tested on a physical device, assume it does not work. Emulators simulate hardware — they do not replicate thermal throttling, memory pressure from other apps, real network latency, or sensor noise. A test that passes only in the emulator is not a test.

### "One Codebase, Zero Platform Code"
If a cross-platform project claims to have zero platform-specific code, it is either a trivial app or it is ignoring platform conventions. Push notification handling, deep link configuration, permission flows, and secure storage all require platform-specific code. The goal is not zero native code — it is minimal, well-isolated native code.

### "We'll Add Offline Later"
Offline is not a feature — it is an architecture decision. Bolting offline support onto an online-first app means rewriting the data layer, the mutation flow, and every screen's state management. If the app targets users with unreliable connectivity, offline-first must be decided in Phase 1 and built in Phase 2, not retrofitted in Phase 5.

### "The User Will Always Update"
Users do not update promptly. Some users are on the version you shipped 6 months ago. Your API must handle old clients. Your local database must support schema migration from any previous version. Your deep links must not break when the app version is behind the server.

### "We Can Use a WebView for That"
WebViews are a maintenance trap. They require separate web development, have different performance characteristics, break native navigation patterns, and create auth token sharing complexity. Use a WebView only for content rendering (terms of service, help articles) — never for core features.

## Common Pitfall Categories

### Category: Emulator-Only Testing
Any situation where testing happens exclusively in simulators without real device verification:
- "It works on my machine" with a high-end emulator and fast Wi-Fi
- Animations smooth in simulator, janky on mid-range devices
- Network calls succeed on emulator's localhost, timeout on real networks
- Camera/GPS/Bluetooth features untested on real hardware
- Memory pressure never triggered in emulator's generous allocation
**Signs:** Bug reports from users that cannot be reproduced locally; performance complaints despite passing CI.
**Diagnosis:** Run device matrix test on physical hardware or cloud device farm (BrowserStack, Firebase Test Lab).
**Treatment:** Establish a minimum device tier (e.g., 2GB RAM, 3-year-old SoC), test on at least 3 physical devices per platform, include low-end device in CI pipeline.

### Category: Infinite Scroll Memory Leak
Any situation where list rendering accumulates memory without bound:
- Rendering all items in a ScrollView instead of FlatList/RecyclerView
- FlatList without `getItemLayout` or `removeClippedSubviews`
- Image-heavy lists without cache eviction
- Retaining references to off-screen item state
**Signs:** App slows after scrolling through 100+ items; memory graph climbs monotonically; eventual OOM crash on low-end devices.
**Diagnosis:** Memory profiler during sustained scroll — check heap snapshots at 50, 200, 500 items.
**Treatment:** Use FlatList (RN) / RecyclerView (Android) / LazyVStack (SwiftUI) with item recycling. Set `maxToRenderPerBatch`, `windowSize`, and image cache size limits. Profile before and after.

### Category: Main Thread Blocking
Any situation where heavy computation or synchronous I/O runs on the UI thread:
- JSON parsing large payloads on main thread
- Synchronous database reads during render
- Image processing (resize, decode) on UI thread
- Complex layout calculations in render cycle
**Signs:** Janky scrolling, frozen touch responses, ANR dialogs (Android), watchdog kills (iOS).
**Diagnosis:** Systrace (Android) or Instruments Time Profiler (iOS). In React Native, check bridge message queue for flooding.
**Treatment:** Move work to background thread. In RN: use `InteractionManager.runAfterInteractions`, `requestAnimationFrame`, or native modules for heavy work. In native: `DispatchQueue.global()` (Swift), `Dispatchers.IO` (Kotlin).

### Category: Deep Link Neglect
Any situation where the app only handles the happy path for incoming URLs:
- Deep links only work from cold start, not background
- No fallback when the linked content does not exist or user is not authorized
- Universal Links / App Links not configured with server-side association files
- Deferred deep links (pre-install) not implemented
**Signs:** Users report "nothing happened" when tapping shared links; marketing campaign links break; QR codes open browser instead of app.
**Diagnosis:** Test deep links from: cold start, backgrounded, killed, already-on-screen, logged-out, content-deleted. Check `.well-known/apple-app-site-association` and `assetlinks.json`.
**Treatment:** Implement full URI routing with fallback screens. Add server-side association files. Handle all entry states. Consider deferred deep links for install-flow attribution.

### Category: Offline Amnesia
Any situation where the app assumes constant connectivity:
- White/blank screen when network is unavailable
- No cached data for previously viewed content
- Mutations lost when submitted offline
- No visual indication of offline state
**Signs:** Users in low-connectivity areas report "broken app"; support tickets spike during network outages; data loss reports after subway rides.
**Diagnosis:** Airplane mode walkthrough — navigate every screen, submit every form, and document what breaks.
**Treatment:** Cache-first data loading with stale-while-revalidate. Skeleton screens during load. Queue mutations with retry. Show offline indicator. Test the full app in airplane mode regularly.

## Integration with Netrunner Core

When mobile reasoning is active:

- **Pre-generation gate** adds: "Has this been tested on a low-end physical device?" and "What happens when the user has no network connection?"
- **Hypothesis quality** requires device-specific and connectivity-specific evidence, not just emulator results
- **Avenue generation** must consider: platform differences (iOS vs Android behavior), device tier (low-end vs flagship), and connectivity state (offline, slow, fast)
- **Verification** must include: physical device testing, offline walkthrough, memory profiling on sustained use, and accessibility audit with screen reader
- **Exhausted cluster detection:** If 3+ tried approaches all involve the same category (e.g., 3 different list optimization attempts), flag the cluster as EXHAUSTED and look for a different root cause (e.g., the problem is not the list but the bridge traffic from a scroll-driven animation)

### Reference Loading

When mobile domain is detected, load in this order:
1. `references/mobile-reasoning.md` — this file (reasoning triggers and pitfalls)
2. `references/mobile-code-patterns.md` — correct/incorrect code patterns (load on code review or implementation tasks)
3. `references/mobile-architecture.md` — deep architecture reference (load on architecture decisions or complex implementation)

### Agent Integration

All Netrunner agents should inherit mobile awareness when the domain is active:
- **nr-planner:** Phase ordering must follow build-mobile-app.md workflow phases; offline is Phase 3, not an afterthought
- **nr-executor:** Load mobile-code-patterns.md before writing code; every new screen needs 4 states (loading, error, empty, success) plus offline variant
- **nr-verifier:** Verification must include physical device test and airplane mode walkthrough; emulator-only verification is insufficient
- **nr-debugger:** Load mobile-reasoning.md failure signatures; check device-specific and OS-version-specific failure modes
- **nr-researcher:** Research must include platform-specific documentation (Apple Developer, Android Developer) and framework-specific migration guides
- **nr-mapper:** Codebase mapping must identify: navigation structure, offline data flow, platform-specific code (ios/ android/ directories), and native module boundaries
