# Production database access

**Status:** Proposed operational checklist. This document records deployment
gates; it is not evidence that a production environment satisfies them.

## Purpose

Keep PostgreSQL administrative credentials out of application runtime and make
privileged access deliberate, temporary, and auditable. A PostgreSQL
superuser can bypass grants and RLS, so controls inside a table cannot protect
data from that role.

## Enforced in the repository

**Documented:**

- The API reads `APP_DATABASE_URL` and rejects migration roles, superusers,
  `BYPASSRLS`, database or relation owners, role/database creators, and roles
  with database or application-schema `CREATE` privileges. See
  `packages/database/src/runtime-role.ts` and
  `apps/api/src/common/database/database.module.ts`.
- `dive_app` and `dive_migration` are created with `NOSUPERUSER`, `NOCREATEDB`,
  `NOCREATEROLE`, and `NOBYPASSRLS`. See
  `packages/database/src/bootstrap-roles.ts`.
- Product migrations use `MIGRATION_DATABASE_URL`; administrative credentials
  are used only to bootstrap roles in the synthetic local and CI harness.
- `iam_app.identity_tenants` is an internal cross-tenant directory populated by
  a controlled trigger. `dive_app` has no direct table privileges; reviewed
  command functions owned by `dive_migration` are its access boundary.

## Production gate

**Proposed:** complete and record every applicable item in the deployment PR or
release record before production traffic is enabled.

### Credentials and identities

- [ ] The API and every process opening the runtime pool receive only
  `APP_DATABASE_URL` for `dive_app`.
- [ ] The migration job receives only `MIGRATION_DATABASE_URL` for
  `dive_migration`; the API and worker secret scopes cannot read it.
- [ ] `SPIKE_ADMIN_DATABASE_URL`, `SPIKE_APP_DATABASE_URL`, synthetic passwords,
  and the provider/master credential are absent from runtime configuration.
- [ ] Role bootstrap runs as a separate controlled administrative action. Its
  credential is removed from the job after use.
- [ ] Administrative access uses named human or workload identities. Shared
  long-lived credentials are disabled where the provider permits it.
- [ ] Break-glass access requires MFA, explicit approval, time-limited access,
  credential rotation after use, and an auditable record.
- [ ] For self-managed PostgreSQL, remote login as the built-in `postgres` role
  is disabled after bootstrap. For managed PostgreSQL, the provider's master
  role receives the same break-glass treatment.

### Network and transport

- [ ] PostgreSQL is not publicly reachable; ingress is restricted to approved
  application and deployment networks.
- [ ] TLS certificate verification is enabled for application, migration, and
  administrative connections.
- [ ] Runtime and migration service identities have separate secret-manager and
  deployment permissions.

### Verification and detection

- [ ] A deployed API instance starts successfully as `dive_app`; startup with
  the production migration or administrative credential is verified to fail.
- [ ] Effective role attributes and object grants are checked after bootstrap
  and after every role or migration change.
- [ ] Database/provider audit logs identify administrative connections and
  changes to roles, grants, schemas, RLS policies, triggers, and
  `SECURITY DEFINER` functions.
- [ ] Alerts cover successful superuser or `BYPASSRLS` connections outside an
  approved administrative window.
- [ ] Administrative and migration credentials have documented owners and a
  tested rotation procedure.

## Incident response

**Proposed:** if an administrative credential reaches a runtime environment or
may have been used without approval, revoke or rotate it, stop the affected
workload, review database and provider audit logs, verify roles/grants/policies,
and treat data confidentiality and integrity as potentially affected. Repository
tests cannot prove these provider and deployment controls; production evidence
must come from the deployment platform and its audit trail.