# Netrunner Context — TaskSync Mobile

## Project Goal
Build a cross-platform task management app with offline-first sync, push notifications, and deep linking. React Native (Expo managed workflow) targeting iOS 15+ and Android API 26+. Target: smooth experience on low-end Android devices with intermittent 3G connectivity.

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| Screens built | 6/10 | 10 |
| Test coverage | 55% | 80% |
| Cold start (Pixel 4a) | 2.8s | <2s |
| FPS (task list scroll) | 48fps | 60fps |
| Crash-free rate | 98.2% | >99.5% |
| App size (Android AAB) | 38MB | <50MB |
| Offline coverage | 3/10 screens | 10/10 |

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| React Native + Expo | Team expertise, OTA update capability | Rewrite from scratch |
| Offline-first for all data | Primary users in low-connectivity areas | App unusable for target audience |
| WCAG AA accessibility | Legal requirement (government contract) | Contract loss |
| iOS 15+ / Android API 26+ | Market coverage vs maintenance cost | Support burden |
| No Redux | Team decision — Zustand for simplicity | State management rework |

## Diagnostic State
**Active hypothesis:** FPS jank on task list is caused by non-memoized renderItem and missing getItemLayout on the main FlatList. Each task card re-renders on every scroll frame because the parent component state changes trigger full list re-render.
**Evidence for:** React DevTools shows 60+ re-renders per second on TaskCard during scroll; removing inline function from renderItem improves to 55fps in dev build.
**Evidence against:** Could also be bridge traffic from scroll-position-dependent header animation (uses Animated.event without useNativeDriver).
**Confidence:** Medium

## What Has Been Tried
| Approach | Result | Impl. Confidence | Notes | Phase | Date |
|----------|--------|------------------|-------|-------|------|
| Basic FlatList for task list | Works but janky at 200+ items | High | No optimization props set | Phase 2 | 2026-03-10 |
| AsyncStorage for offline cache | Works for read-only data | High | No mutation queue yet | Phase 3 | 2026-03-14 |
| React Navigation v6 with deep links | Partial — custom scheme only | High | Universal links not configured | Phase 4 | 2026-03-17 |
| Push via Expo Notifications | Token registration works | Medium | No silent push, no background sync | Phase 2 | 2026-03-12 |
| Zustand for global state | Clean, 3 stores (auth, tasks, ui) | High | Works well for this scale | Phase 2 | 2026-03-11 |
| Image caching with expo-image | LRU cache with 100MB limit | High | Replaced default Image component | Phase 2 | 2026-03-13 |

## Domain Knowledge
- Expo SDK 50 with New Architecture enabled
- Hermes engine active (pre-compiled bytecode)
- expo-image replaces RN Image (built-in caching, blurhash placeholders)
- react-native-reanimated v3 available but not yet integrated for scroll animations
- SQLite (expo-sqlite) planned for offline sync — more robust than AsyncStorage for relational data
- Push token refresh handled via expo-notifications registerForPushNotificationsAsync on every app launch

## Decision Log
| Decision | Rationale | Date |
|----------|-----------|------|
| Expo managed (not bare) | OTA updates critical for remote users, team unfamiliar with native builds | 2026-03-08 |
| Zustand over Redux | 3 simple stores, no middleware needed, team prefers hooks API | 2026-03-09 |
| SQLite for offline sync | Relational task data with tags/projects, AsyncStorage insufficient for queries | 2026-03-15 |
| expo-image over FastImage | First-party Expo support, built-in blurhash, no native linking | 2026-03-13 |

## Mobile Architecture
- **Framework:** React Native (Expo managed, SDK 50)
- **Min OS version:** iOS 15 / Android API 26
- **Target devices:** Phones only (tablet layout deferred)
- **State management:** Zustand (3 stores: auth, tasks, ui)
- **Navigation:** React Navigation v6 with expo-router
- **Offline strategy:** Cache-first reads + mutation queue (in progress)
- **Push provider:** Expo Notifications (FCM + APNs)
