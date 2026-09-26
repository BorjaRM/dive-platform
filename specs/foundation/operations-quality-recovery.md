# Operations, quality, and recovery (baseline)

- **Status:** Ready to start
- **Version:** 0.2

## SLO framework

Each SLO declares indicator, population, window, exclusions, objective, error budget, and response. Starting defaults:

| Area | Starting default |
|---|---|
| Availability | Internal objective ≥ 99.5% |
| API | p95 < 500 ms on common operations, excluding third parties |
| Web | LCP p75 < 2.5 s on primary views |
| Global recovery | RPO ≤ 15 min and RTO ≤ 4 h, cost-dependent |
| Accessibility | WCAG 2.2 AA target |
| Compatibility | Latest two stable versions of major browsers |

The product profile adds critical operations, expected load, and its own objectives.

## Observability

- Structured logs with correlation ID, tenant, and module, without unnecessary PII
- Safely aggregated metrics with controlled cardinality
- Traces for API, database, jobs, and providers
- Alerts on errors, latency, saturation, queues, outbox, isolation, and third parties
- Dashboards and runbooks for critical product operations

## Backups and recovery

- Encrypted backups, PITR, and periodic full restorations
- Measured RPO/RTO
- Logical tenant recovery via isolated restore, validated extraction, reconciliation, idempotent replay, and audit
- Explicit inclusion of files, events, indexes, caches, and derived stores
- Do not promise independent tenant recovery until rehearsed

## Deployment

- HTTPS, secret management, reproducible infrastructure, portability
- Standard exportable PostgreSQL
- EU region by default for primary data; another region needs a jurisdiction profile and ADR
- Major, topology, or region changes need an explicit decision

CI, Docker, and hosting automation are implementation work. They are not implied by this baseline until they exist in the repository.

## Common operational tests

- Isolation with at least two tenants
- Connection saturation and pooling
- Outbox/worker failure, retry, and idempotency
- Identity-provider and critical-vendor degradation
- Rate limiting by IP, identity, and tenant
- Global restore and logical tenant rehearsal
- Export and deletion without cross-tenant data
- Uneven load / noisy neighbor
