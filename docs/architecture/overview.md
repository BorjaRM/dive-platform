# Architecture overview (non-normative)

This document provides a **high-level overview**. For normative decisions, see:

- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/foundation/multitenancy-architecture.md`

## High-level topology

- **Web** (Next.js): dashboard + hosted public booking page + embedded widget (iframe)
- **API** (NestJS): modular monolith
- **Worker**: outbox processing + async tasks
- **Database**: PostgreSQL (shared DB/schema, defense-in-depth with RLS)

## Core design principles

- Tenant context is explicit and server-authorized end-to-end
- Outbox for reliable, idempotent side effects (emails, notifications)
- Vendor-neutral observability via OpenTelemetry