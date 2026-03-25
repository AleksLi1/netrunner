# Example: /nr Interaction on a Mobile App Project

<!--
  This example demonstrates how Netrunner's mobile persona activates and reasons
  when a user invokes /nr on a React Native project. It shows:
  - Mobile persona activation from context signals
  - Offline-first reasoning in avenue generation
  - Device-constraint awareness in diagnosis
  - Expert-level performance debugging
  - Pre-generation gate enforcement (offline, low-end device, platform differences)
-->

## Setup

The user has a `.planning/CONTEXT.md` with the mobile-app-context structure:
- Cross-platform task management app (React Native / Expo)
- FPS jank on task list (48fps, target 60fps)
- 6/10 screens built, only 3/10 have offline support
- Active hypothesis: non-memoized renderItem + missing getItemLayout
- Push notifications partially working (no silent push)

## User Query

```
/nr "Task list scrolling is janky on my Pixel 4a — around 48fps. I think it's the renderItem not being memoized. Should I just wrap it in React.memo?"
```

## Netrunner Response

### Step 0 — Context loaded, mobile persona activated

Context signals detected: React Native, Expo, FlatList, FPS, offline, push notifications, Android, iOS, task list, Zustand → **Mobile persona active.**

*Loaded references/mobile-reasoning.md — applying "The list is slow" reasoning trigger.*
*Loaded references/mobile-code-patterns.md — Pattern 3 (Unthrottled Bridge Calls), Pattern 6 (FlatList Without keyExtractor).*

### Step 1 — Classification

**Shape:** OPTIMIZE:REFINEMENT
**Subtype:** PERFORMANCE (rendering pipeline — list scrolling)
**Domain:** Mobile App Development

### Step 2 — Diagnostic questions

[Inferred from context — /nr --ask to force questions]

Context has active hypothesis with evidence, 6 tried approaches, clear metrics → **MODERATE context, asking 1 question.**

> Is the header animation (scroll-position-dependent) using `useNativeDriver: true` or Reanimated's `useAnimatedStyle`? The context mentions "Animated.event without useNativeDriver" as a possible contributor — if that animation crosses the bridge on every frame, memoizing renderItem alone will not reach 60fps.

### Step 3 — Diagnosis and response

```
QUERY (reframed): User reports 48fps on FlatList scroll, suspects non-memoized renderItem.
  Hypothesis is partially correct but likely insufficient — memoization fixes re-renders
  but bridge traffic from scroll-driven animation is a separate bottleneck.

METRICS IN SCOPE: FPS (48 → 60 target), re-renders per second (60+ current)
CONSTRAINTS ACTIVE: React Native + Expo | Zustand state | react-native-reanimated available
EVIDENCE FOR HYPOTHESIS: React DevTools confirms 60+ re-renders/sec, removing inline function improves to 55fps
EVIDENCE AGAINST: Animated.event without useNativeDriver also present — scroll animation crosses bridge
```

**AVENUE 1** — Memoize renderItem + add FlatList performance props
- **Mechanism:** `React.memo` on TaskCard prevents re-render when props haven't changed. `getItemLayout` eliminates async measurement. `windowSize={5}` and `maxToRenderPerBatch={10}` reduce off-screen rendering.
- **Expected gain:** 48fps → 52-55fps (matches the 55fps seen when removing inline function)
- **Risk:** Low — additive optimization, no architectural change
- **Verification:** Profile FPS on Pixel 4a after change with Flipper performance monitor
- **Effort:** 30 minutes

**AVENUE 2** — Migrate scroll animation to Reanimated worklets (UI thread)
- **Mechanism:** Replace `Animated.event` with `useAnimatedScrollHandler` from react-native-reanimated. This runs the animation calculation on the UI thread, eliminating bridge crossing on every scroll frame. This is the difference between 60 bridge messages/second and zero.
- **Expected gain:** Combined with Avenue 1: 48fps → 58-60fps
- **Risk:** Medium — Reanimated v3 API differs from Animated; need to rewrite header animation
- **Verification:** Profile bridge message count before/after with Flipper. Target: zero bridge messages during scroll.
- **Effort:** 2-3 hours

**AVENUE 3** — Audit the full rendering pipeline (if Avenues 1+2 don't reach 60fps)
- **Mechanism:** Check: Is `keyExtractor` using stable IDs (not array index)? Are there inline styles creating new objects per render? Is Zustand's `useStore` selecting the minimal slice (not entire store)? Is `removeClippedSubviews={true}` set?
- **Expected gain:** Marginal (2-5fps) but eliminates remaining jank sources
- **Risk:** Low — diagnostic, then targeted fixes
- **Verification:** Flipper React DevTools re-render highlighting — no TaskCard should re-render unless its data changes
- **Effort:** 1-2 hours

**PRE-GENERATION GATE CHECK:**
- Offline case: Does FlatList optimization affect offline behavior? No — rendering optimization is independent of data source. PASS.
- Low-end device: Pixel 4a IS a mid-range device — this is the right test target. PASS.
- Platform difference: `removeClippedSubviews` behaves differently on iOS (can cause blank cells in some cases) — test on both platforms. NOTED.

**RECOMMENDED ORDER:** Avenue 1 first (quick win, validates hypothesis), then Avenue 2 (addresses the bridge bottleneck the context flagged), then Avenue 3 only if needed.

**CONTEXT UPDATE:**
```
## What Has Been Tried — New Entry
| FlatList memoization + perf props | [PENDING] | — | Avenue 1 from jank investigation | Phase 5 | 2026-03-25 |
```

---

*Note: This response demonstrates the mobile persona in action:*
- *Device-constraint awareness — the Pixel 4a is accepted as a valid mid-range test device, not dismissed*
- *Bridge bottleneck diagnosis — identifies that memoization alone is insufficient because the scroll animation crosses the bridge*
- *Platform difference flagging — notes `removeClippedSubviews` behaves differently on iOS*
- *Layered approach — quick win first, architectural fix second, deep audit third*
- *Pre-generation gate — checks offline impact, device tier appropriateness, and platform differences before recommending*
- *Reference activation — cites specific code patterns (Pattern 3: Unthrottled Bridge Calls) rather than generic advice*
