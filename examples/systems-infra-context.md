# Netrunner Context — CloudDeploy Platform

## Project Goal
Build a self-service deployment platform that lets dev teams deploy containerized services with zero-downtime rolling updates, automated rollback, and observability. Target: 99.9% uptime SLA, deploy in <5 minutes.

## Current State
| Metric | Current | Target |
|--------|---------|--------|
| Uptime (30-day) | 99.7% | 99.9% |
| Deploy time | 12min | <5min |
| Rollback time | 8min | <2min |
| Teams onboarded | 3/12 | 12 |
| Services managed | 8 | 50+ |
| Alert noise ratio | 40% false | <10% |

## Hard Constraints
| Constraint | Why | Cost of Violation |
|------------|-----|-------------------|
| AWS only | Company mandate, existing contracts | Contract renegotiation |
| Kubernetes 1.28+ | Platform standard | Cluster rebuild |
| No downtime during deploy | SLA requirement | Revenue loss, SLA breach |
| SOC2 compliance | Customer requirement | Lost enterprise deals |
| Budget: $15K/month infra | Finance approved | Project cancellation |

## Diagnostic State
**Active hypothesis:** Deploy time is 12min because each service rebuild pulls all dependencies from scratch (no layer caching). Rolling update waits for full health check cycle (3 attempts x 30s) even when service is healthy in 10s.
**Evidence for:** Build logs show 8min in dependency install; health check logs show service healthy at 10s but rollout waits full 90s
**Evidence against:** Some services have legitimately slow startup (JVM apps take 45s)
**Confidence:** High — both issues are directly measurable
**Open questions:** Can we use different health check timeouts per service type?

## What Has Been Tried
| Approach | Outcome | Confidence | Failure Mode | Phase | Date |
|----------|---------|------------|--------------|-------|------|
| Multi-stage Docker builds | Reduced image size 60% but build time unchanged | High | Layer caching not effective without BuildKit | Phase 2 | 2024-03-01 |
| Parallel health checks | Failed — K8s doesn't support parallel readiness | High | API limitation | Phase 3 | 2024-03-10 |
| Pre-built base images | Reduced build time from 8min to 3min | High | N/A — successful | Phase 3 | 2024-03-12 |
| Canary deployments | Worked but doubled resource usage during deploy | Medium | Cost constraint — exceeds budget at scale | Phase 4 | 2024-03-20 |

## Domain Knowledge
- EKS with managed node groups (Graviton for cost)
- ArgoCD for GitOps deployment
- Prometheus + Grafana for observability
- Istio service mesh (considering removal — adds latency)
- GitHub Actions for CI, ArgoCD for CD
- Average service: 256MB RAM, 0.5 CPU

## Decision Log
| Phase | Decision | Reasoning | Outcome |
|-------|----------|-----------|---------|
| Phase 1 | ArgoCD over Flux | Better UI, team familiarity, Helm support | Successful |
| Phase 2 | Keep Istio for now | Provides mTLS needed for SOC2, despite latency | Under review |
| Phase 3 | Pre-built base images | Direct fix for dependency install bottleneck | Successful — 5min saved |
| Phase 4 | Blue-green over canary | Canary exceeds cost constraint at scale | In progress |

## Update Log
| Date | Phase | Change |
|------|-------|--------|
| 2024-02-25 | Phase 1 | Platform scaffolded with EKS + ArgoCD |
| 2024-03-01 | Phase 2 | Multi-stage builds saved size but not time |
| 2024-03-12 | Phase 3 | Pre-built base images cut build time to 3min |
| 2024-03-20 | Phase 4 | Canary abandoned due to cost — switching to blue-green |
