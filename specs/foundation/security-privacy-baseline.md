# Security, privacy, and multi-jurisdiction compliance (baseline)

## Security baseline (high level)

- MFA for privileged access
- Strict validation, parameterized queries, secure headers, explicit CORS, rate limiting
- Secrets out of code and logs
- Signed webhooks with anti-replay + idempotency
- Append-only audit trails for sensitive actions
- SAST, dependency scanning, SBOM, secret detection

## Privacy baseline (high level)

- Data minimization and purpose limitation
- Inventory of processing activities and vendors
- Retention + deletion/anonymization plan for originals and derived data
- Data subject rights processes
- Breach response procedure and evidence

## No-go before real data / pilot

No pilot with real personal data without: proven isolation, privileged MFA/step-up path (or a documented exception), vendor agreements, retention decisions, restorable backups, incident process.