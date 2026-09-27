# OBS-01 OpenTelemetry boundary and request correlation

## Scope

The API now depends on `@dive-center/observability` instead of importing
`@nestjs/observe`. The package exposes the OpenTelemetry API behind a small
HTTP observation boundary and owns the asynchronous correlation context.

Each HTTP request accepts a valid UUID correlation ID or generates one,
returns it in `X-Correlation-ID`, and makes it available to authentication,
IAM, webhook, catalog audit, and outbox paths. Resource UUID generation in
catalog activity and slot creation remains independent.

## Executable evidence

```text
pnpm --filter @dive-center/observability test
pnpm --filter @dive-center/observability build
pnpm --filter @dive-center/api exec vitest run src/common/observability/correlation-id.middleware.spec.ts src/iam/iam.error-handling.spec.ts src/app/openapi.spec.ts
pnpm --filter @dive-center/observability typecheck
pnpm --filter @dive-center/api typecheck
```

The focused tests pass, including valid and invalid incoming IDs, async
context propagation, response-header propagation, and the OpenTelemetry
observation lifecycle.
