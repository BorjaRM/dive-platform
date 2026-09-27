# SEC-04 Production configuration hardening

## Scope

The API configuration boundary rejects synthetic production origins and weak
or placeholder dashboard HMAC secrets. Local development and test profiles may
continue to use the synthetic values from `.env.example`.

## Implemented controls

- `NODE_ENV` is required and restricted to the documented runtime profiles.
- Production dashboard origins must be exact HTTPS origins without credentials,
  paths, wildcards, or known synthetic markers.
- Production dashboard HMAC secrets must be at least 32 UTF-8 bytes, contain at
  least 16 unique characters, and not be a repeated short pattern or a known
  synthetic value.
- Invalid configuration fails closed with setting-specific errors that do not
  include the secret or origin value.
- The Clerk issuer is restricted to an exact HTTPS origin and production
  synthetic values are rejected.

## Executable evidence

Focused command:

```text
pnpm --filter @dive-center/api exec vitest run \
  src/common/tenant-context/tenant-context.crypto.spec.ts \
  src/common/config/environment.spec.ts
```

The tests are also included in the current API security/configuration batch:
5 files, 29 tests passed locally. The cases cover local HTTP allowance,
production HTTPS enforcement, wildcard and synthetic-origin rejection, strong
production secrets, repeated/low-diversity secrets, and non-disclosure of
configuration values in errors.

Additional implementation checks:

- `apps/api/src/common/tenant-context/tenant-context.crypto.ts`
- `apps/api/src/common/config/environment.ts`
- `apps/api/src/common/auth/clerk.config.ts`
- `apps/api/src/common/tenant-context/tenant-context.crypto.spec.ts`
- `apps/api/src/common/config/environment.spec.ts`

## Known gaps

- No production deployment or secret-manager validation was performed.
- Production secret strength is a deterministic configuration guard, not an
  entropy measurement or a replacement for secret-manager policy.
- The configured values in `.env.example` remain synthetic local examples and
  are not production approvals.
