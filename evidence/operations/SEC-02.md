# SEC-02 HTTP hardening

## Implemented controls

- `helmet` is applied by the API bootstrap before routes are served.
- Swagger is opt-in through `API_SWAGGER_ENABLED` and is rejected when enabled
  in production. It is disabled when the variable is absent.
- `API_RATE_LIMIT_WINDOW_MS` and `API_RATE_LIMIT_MAX` are required in staging,
  preview, and production. The configured limiter is applied by IP and has no
  silent deployed-environment defaults.
- The existing exact-origin CORS policy and correlation-header exposure remain
  in the bootstrap.

## Executable evidence

```text
pnpm --filter @dive-center/api exec vitest run src/common/security/http-hardening.spec.ts src/common/tenant-context/tenant-context.crypto.spec.ts src/common/config/environment.spec.ts src/catalog/catalog.validation.spec.ts src/app/openapi.spec.ts
pnpm --filter @dive-center/api typecheck
```

Observed locally: 5 test files, 29 tests passed, and the API typecheck passed.
The focused tests cover secure headers, a configured 429 response, fail-closed
rate-limit configuration, Swagger opt-in, and the real `/docs-json` route.

## Open normative decision

The security baseline also requires limits by identity and tenant. The current
bootstrap intentionally does not derive either key from client-controlled
headers: authenticated identity and authorized tenant context are resolved
inside guards and application services. A normative decision is still needed
for the authorized enforcement boundary, key semantics, shared-store
requirements, and approved budgets before those dimensions can be added. This
remediation does not claim that identity- and tenant-scoped limiting is closed.
