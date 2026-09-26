# Identity and authorization (baseline)

- **Status:** Ready to start
- **Version:** 0.2

## Purpose

Define the reusable IAM model. Products supply tenant entity, roles, and module permissions. This baseline does not name dive-specific roles.

## Common model

- **Identity:** globally authenticated principal.
- **External identity:** bound by `issuer + subject`. Email is not a stable identifier.
- **Tenant:** ownership and administration boundary chosen by the product.
- **Access:** relationship between identity and tenant with status, roles, permissions, and scopes.
- **Operational scope:** internal subdivision (location, center, resource). It never replaces the tenant.
- **Domain actor:** product-specific profile (customer, instructor, member).

## Responsibilities

Identity provider: credentials, recovery, MFA, passkeys, sessions, tokens, revocation.

Platform: internal identity, tenants, memberships, roles, permissions, scopes, access states, and business authorization.

External SDKs are wrapped. An `ExternalIdentity` table allows provider migration.

## Authorization rules

- Default deny and least privilege
- Atomic, stable permission names
- Assignments scoped to `tenant`, `operational_unit`, `resource`, or `self`
- Backend derives tenant and scope from a valid session and internal assignments
- Authorization is evaluated in use cases, not only in routes or UI
- Client-supplied permissions are never source of truth
- Each module defines a role × permission × scope × condition matrix

## Privileged support

- Temporary, time-bounded elevation
- Mandatory reason and ticket/reference
- Approval when risk requires it
- Minimum access and explicit tenant
- Reinforced audit of actor, purpose, resources, result, and expiry
- After-the-fact review for sensitive operations

## What each product defines

- Tenant entity and internal scopes
- Actor and role catalog
- Permissions and conditions per module
- Whether identities may belong to multiple tenants
- Relationship between identity and domain profiles
- End-user channel capabilities
- Invitation, offboarding, revocation, and support rules
