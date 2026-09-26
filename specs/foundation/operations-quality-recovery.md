# Operations, quality, and recovery (baseline)

- SLO framework (indicator, population, window, exclusions, objective, error budget)
- Observability: structured logs, metrics, traces; avoid PII; include safe tenant identifiers where needed
- Encrypted backups + tested restores
- Logical tenant recovery is a separate capability from global restore
- Operational testing: isolation, outbox/idempotency, provider degradation, rate limiting