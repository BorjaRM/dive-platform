# SPEC-DIVE-IAM-001 — Roles, permissions, and scopes

- **Status:** Ready to start
- **Scope:** dashboard authorization and minimal public capabilities for the MVP.

## Principles

- Default deny
- Authorization decision = identity + tenant + center + permission + resource + state
- Global identity with tenant-scoped memberships
- Public booking users do not get internal roles; they get limited capabilities via secure tokens

## Initial roles (MVP)

Tenant-wide:
- Tenant Owner
- Tenant Admin
- Operations Lead
- Auditor/Compliance (read-only)

Center-scoped:
- Center Manager
- Reception / Booking Manager
- External collaborator (disabled in first pilot)

## Baseline permissions

- `center.read`
- `booking_service.create/read/update/publish`
- `availability.read/manage`
- `booking.create/read/update/confirm/cancel`
- `calendar.read`
- `customer_contact.read` (purpose-limited)
- `audit.*` (operational/security/export are separate capabilities)

## Key rules

- Clerk is the MVP identity provider, but only through our façade/adapter
- Revocation SLA (ordinary): max 5 minutes
- MFA not mandatory in MVP, but model must support future step-up
- Platform support: read-only in MVP; write actions disabled until step-up/MFA is available