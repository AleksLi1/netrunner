# Netrunner Context — TaskBoard UI

## Project Goal
Build a React-based task management dashboard with drag-and-drop boards, real-time collaboration, and responsive design. Target: Production-ready SPA with <2s LCP on mobile.

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| Components built | 8/15 | 15 |
| Test coverage | 62% | 80% |
| LCP (mobile) | 3.1s | <2s |
| Lighthouse Performance | 68 | 90+ |
| Accessibility score | 74 | 95+ |
| Bundle size | 380KB | <250KB |

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| React 18+ only | Team standard, existing components | Rewrite all shared components |
| No external state management | Team decision, React context sufficient | Architecture rework |
| WCAG AA compliance | Legal requirement | Accessibility lawsuit risk |
| Mobile-first responsive | 60% of users on mobile | Revenue loss |
| TypeScript strict mode | Team standard | Type safety regression |

## Diagnostic State
**Active hypothesis:** LCP is high due to main bundle including all board components (no code splitting). The drag-and-drop library adds 120KB that's loaded regardless of view.
**Evidence for:** Bundle analyzer shows react-beautiful-dnd is 28% of bundle; removing it drops LCP to 2.2s in simulation
**Evidence against:** Server response time is also 400ms (could be a factor)
**Confidence:** Medium — need to implement code splitting before concluding
**Open questions:** Will code splitting alone hit the <2s target, or do we also need server optimization?

## What Has Been Tried
| Approach | Outcome | Confidence | Failure Mode | Phase | Date |
|----------|---------|------------|--------------|-------|------|
| Image optimization | Saved 40KB, LCP improved 200ms | High | N/A - successful | Phase 2 | 2024-02-10 |
| Lazy loading below-fold | Improved initial load by 300ms | High | N/A - successful | Phase 2 | 2024-02-11 |
| Tree shaking lodash | Saved 60KB bundle size | High | N/A - successful | Phase 3 | 2024-02-15 |
| Virtual scrolling for task lists | Improved rendering but broke keyboard nav | Medium | Accessibility regression | Phase 3 | 2024-02-16 |

## Domain Knowledge
- React Server Components not viable (client-heavy drag-and-drop)
- @dnd-kit is lighter alternative to react-beautiful-dnd (40KB vs 120KB)
- Radix UI for accessible primitives (team already uses)
- Tailwind CSS for styling (project standard)
- Vitest + Testing Library for tests

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|
| Phase 1 | Use Vite over CRA | Faster builds, better tree shaking | Successful — 60% faster builds |
| Phase 2 | Mobile-first approach | 60% mobile users, easier to scale up than down | Successful |
| Phase 3 | Keep react-beautiful-dnd for now | Switching mid-project is risky; optimize bundle first | Pending — reassessing after code splitting |
| Phase 3 | Revert virtual scrolling | Broke keyboard navigation, violates WCAG AA constraint | Correct — a11y constraint takes priority |

## Update Log
| Date | Phase | Change |
|------|-------|--------|
| 2024-02-08 | Phase 1 | Project scaffolded with Vite + React 18 + TypeScript |
| 2024-02-11 | Phase 2 | Image optimization + lazy loading saved 500ms LCP |
| 2024-02-16 | Phase 3 | Virtual scrolling reverted — accessibility constraint violation |
| 2024-02-16 | Phase 3 | Tree shaking successful, but bundle still over target |
