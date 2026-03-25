# Netrunner Context — TaskFlow API

## Project Goal
Build a task management REST API with user authentication, team collaboration, and real-time notifications. Target: production-ready with <100ms p95 latency.

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| Endpoints implemented | 12/18 | 18 |
| Test coverage | 78% | 90% |
| p95 latency | 145ms | <100ms |
| Auth flows complete | 3/4 | 4 |

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| PostgreSQL only | Team expertise, existing infra | Migration cost, retraining |
| JWT auth | Client requirements | Contract violation |
| No breaking API changes | Existing mobile client | App store rejection |
| Node.js 20+ | Deployment target | Infrastructure rebuild |

## Diagnostic State
**Active hypothesis:** p95 latency is high due to N+1 queries in the task listing endpoint, compounded by missing database indexes on the assignments table.
**Evidence for:** EXPLAIN ANALYZE shows sequential scan on assignments; removing eager loading drops latency to 80ms
**Evidence against:** Some latency may come from JWT validation middleware (15ms overhead measured)
**Confidence:** Medium — need to profile the full request pipeline
**Open questions:** Is the JWT middleware latency acceptable, or should we cache validated tokens?

## What Has Been Tried
| Approach | Outcome | Confidence | Failure Mode | Phase | Date |
|----------|---------|------------|--------------|-------|------|
| Redis caching for task lists | Improved read latency but cache invalidation complex | Medium | Stale data issues with team updates | Phase 3 | 2024-01-15 |
| Denormalized task view table | Failed — write amplification too high | High | 5x slower writes on task updates | Phase 3 | 2024-01-16 |
| Composite index on (user_id, status, created_at) | Successful — 60% query improvement | High | N/A | Phase 4 | 2024-01-20 |

## Domain Knowledge
- PostgreSQL full-text search sufficient for current scale (<100K tasks)
- WebSocket preferred over SSE for real-time (bidirectional needed for typing indicators)
- Rate limiting at 100 req/s per user is sufficient for current client behavior

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|
| Phase 1 | Use Express over Fastify | Team familiarity, middleware ecosystem | Successful — faster development |
| Phase 2 | JWT with refresh tokens | Client requirement + security best practice | Successful |
| Phase 3 | Skip Redis caching | Cache invalidation complexity outweighs latency gain at current scale | Correct — indexes solved the problem |
| Phase 4 | Composite indexes over denormalization | Denormalization failed (write amplification), indexes give 60% improvement | In progress |

## Update Log
| Date | Phase | Change |
|------|-------|--------|
| 2024-01-10 | Phase 1 | Initial project setup, Express + TypeScript |
| 2024-01-15 | Phase 3 | Redis caching abandoned — cache invalidation too complex |
| 2024-01-16 | Phase 3 | Denormalized view abandoned — write amplification |
| 2024-01-20 | Phase 4 | Composite indexes successful, hypothesis updated |
