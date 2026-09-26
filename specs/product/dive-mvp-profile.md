# Product profile — Dive centers (MVP)

- **Status:** Ready to start
- **Version:** 0.6
- **Reference market:** Spain
- **Repository:** `BorjaRM/dive-platform`
- **Package name:** `dive-center-platform`
- **Solution slug:** `dive-platform`

## 1) Source of truth

GitHub `specs/` is the only normative source for behavior, architecture, security, data, tests, and delivery contracts.

Notion holds context, navigation, and visible status. It must not keep a second editable copy of a SPEC, ADR, or requirement list.

If Notion and GitHub disagree, GitHub wins and the Notion page is stale until corrected.

Automation, if added, is GitHub → Notion metadata only.


## 1.1) Versions

Each `specs/` artifact has its own version. The Notion product index must show the version of `TRACE-DIVE-MVP-001`, not a Notion-only map version.

## 1.2) Baseline location

The reusable baseline stays in `specs/foundation/` of this repository. It is not extracted to a separate repo for now. Divergence from those files still requires an ADR.

## 2) Adoption rule

This product adopts by reference:

- `specs/foundation/multitenancy-architecture.md`
- `specs/foundation/iam-baseline.md`
- `specs/foundation/security-privacy-baseline.md`
- `specs/foundation/operations-quality-recovery.md`
- `specs/foundation/sdd-specs-traceability.md`

Dive-specific configuration lives in:

- `specs/multitenancy/adoption-profile.md`
- `specs/architecture/adrs/ADR-DIVE-001.md`
- `specs/architecture/adrs/ADR-DIVE-002.md`
- `specs/architecture/adrs/ADR-DIVE-003.md`
- `specs/booking/SPEC-DIVE-BOOKING-001.md`
- `specs/iam/SPEC-DIVE-IAM-001.md`

Any future divergence from the baseline requires an ADR with justification, risk, owner, and review date. Unresolved contradiction blocks implementation.

## 3) Product hypotheses

- Problem: centers handle availability and bookings across phone, email, forms, and messaging.
- Value: publish availability, accept online bookings, keep one calendar including manual bookings.
- Tenant: dive operator (company) owning activities, availability, bookings, and data.
- Operational scope: center/base.
- Channels: embedded widget, hosted public page, internal dashboard.
- Customer identity: no account in MVP; public flow + limited secure links.
- Data region: EU unless an ADR plus jurisdiction profile says otherwise.

## 4) MVP decision

- Configure activities and slots
- Online booking from widget or hosted page
- Simple internal calendar and manual bookings
- Secure cancellation
- Idempotent confirmations via outbox without overselling
- Spanish and English

## 5) Explicitly out of scope

- Trip operations: check-in, manifest, departure/return, incidents
- Certifications, eligibility, emergency contacts, medical data
- Payments, deposits, invoicing, refunds
- Multi-provider marketplace / OTA
- Offline mode / sync
- Equipment, boats, and combined-resource capacity

Those topics remain in Deferred artifacts (`SPEC-DIVE-OPS-001`, `SPIKE-DIVE-002`) and must not enter booking implementation.

## 6) Walking skeleton

Minimum technical increment:

```text
Create tenant and center
  → create an activity and schedule it
  → query public availability
  → book
  → see the booking in the authorized dashboard
  → emit confirmation in the outbox
```

Target product skeleton before pilot:

```text
Sign in
  → configure center and activity
  → publish a slot
  → book from hosted page or widget
  → confirmation
  → calendar
  → manual booking
  → cancellation
  → audit + outbox
```

## 7) Gates

### Ready to start implementation (synthetic data)

- This profile, ADR-DIVE-001, ADR-DIVE-002, SPEC-DIVE-BOOKING-001, and SPEC-DIVE-IAM-001 are Ready to start
- Numbered requirements exist in GitHub
- Notion pages are indexes, not second contracts

### Before staging with synthetic data is “done”

- Repository installs with documented commands
- PostgreSQL 18 migrations from zero
- MT-SPIKE-001 evidence
- SPIKE-DIVE-001 evidence

### Before real personal data or pilot

- SPIKE-DIVE-003 evidence
- Privacy review for contact, communications, consent, retention, and rights
- SPEC and ADR applicable artifacts Accepted or an explicit exception
- No production copy in non-prod

CI and Docker Compose now exist as development and test infrastructure. They remain outside the gates of this documentation increment. Hosting and production deployment automation do not exist yet and must not be documented as existing.

Provenance: `Documented` — current implementation in `.github/workflows/ci.yml`, `infra/docker/postgres/docker-compose.yml`, `.env.example`, and the root `package.json`; gate meaning unchanged from version 0.5.

## 8) Privacy boundary for the booking MVP

Allowed: booker name, email, optional phone, optional participant name/email, booking operational data, audit metadata.

Forbidden until a later decision: medical answers, diagnoses, document images, emergency contacts as a product feature, certification evidence.

A dated local legal/privacy review is required before using real personal data. `SPIKE-DIVE-002` does not satisfy that gate; it belongs to the deferred operations evolution.
