# Security, privacy, and multi-jurisdiction compliance (baseline)

- **Status:** Ready to start
- **Version:** 0.2

This baseline does not replace legal advice.

## Security baseline

- MFA for privileged access
- Short-lived tokens, revocation, and session termination
- Strict validation, parameterized queries, CSRF when applicable, secure headers
- Explicit CORS and rate limiting by IP, identity, and tenant
- TLS, managed encryption at rest, secrets outside code and logs
- Non-production environments without raw production copies
- Signed webhooks with timestamp, anti-replay, and idempotency
- Append-only audit for permissions, support, exports, payments, and sensitive changes
- SAST, dependency scanning, secret detection, SBOM, and patching policy
- Threat model per module aligned with OWASP ASVS

## Privacy baseline

- Privacy by design, minimization, and purpose limitation
- Inventory of processing activities, data categories, actors, and vendors
- Legal basis and information texts per processing
- Rights: export, rectification, objection, restriction, erasure
- Retention, blocking, anonymization, and deletion of originals and derived data
- DPA, subprocessors, locations, transfers, and exit plan
- Breach procedure, evidence, and periodic review
- Specific assessment before special-category, children’s, biometric, or other high-risk data

## Regulatory hierarchy

1. Spain baseline for provider and product
2. GDPR and other applicable or adopted EU law
3. Local profile for the country of operation, activity, residence, or processing
4. Sector and international norms
5. Contracts and standards (certifiers, insurers, partners, vendors)

Operating outside Spain/EU requires a jurisdiction profile, conflict analysis, and local legal validation before a pilot.

## Jurisdiction matrix

Record establishment, place of service, data-subject residence, data locations, sector licences, consumer/contract rules, tax/payments, conflicts, and legal evidence.

## Vendor profile

Each vendor records purpose, data, role, locations, subprocessors, transfer mechanism, retention, rights, export, deletion, incidents, continuity, and exit.

## No-go before real data / pilot

No pilot with real personal data without proven isolation, privileged MFA or a documented exception, essential contracts, vendor inventory, basic rights flows, retention decisions, restorable backups, incident process, and assessment of high-risk data.
