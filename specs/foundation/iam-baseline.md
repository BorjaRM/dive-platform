# Identity and authorization (baseline)

- Identity is global.
- Access is tenant-scoped with roles/permissions/scopes.
- Backend derives tenant context from session + internal assignments, never from client-provided tenant IDs.
- Privileged support access is temporary, minimal, justified, and audited.
- Each product defines: tenant entity, roles, permissions per module, invitation/offboarding rules.