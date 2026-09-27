# REL-02 Identity provider deadlines and failure taxonomy

## Scope

The API identity adapter now requires the environment-owned
`CLERK_REQUEST_TIMEOUT_MS` value. The dashboard page requires
`NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS`. Values in `.env.example` are
synthetic local examples marked `Proposed`; they are not production approvals
or SLOs.

Invalid credentials remain fail-closed and map to HTTP 401. Provider timeout,
network, and other operational failures are classified internally and map to a
generic HTTP 503 without exposing provider details. The web client propagates
TanStack Query cancellation and bounds token/fetch waits.

## Executable evidence

Focused commands:

```text
pnpm --filter @dive-center/identity typecheck && pnpm --filter @dive-center/identity exec vitest run src/clerk.spec.ts src/clerk-webhook.spec.ts
pnpm --filter @dive-center/api exec vitest run src/common/auth/clerk.config.spec.ts src/iam/iam.error-handling.spec.ts
pnpm --filter @dive-center/web typecheck && pnpm --filter @dive-center/web exec vitest run src/features/dashboard/tenant-context.test.ts src/features/dashboard/dashboard-tenant-context.test.tsx src/features/dashboard/clerk-dashboard-session.test.tsx
```

Observed locally: identity `39/39` tests, API `34/34` tests, and web `24/24`
tests passed; both identity and web typechecks also passed. The focused suites
cover a never-resolving provider, abort signal propagation, 401 versus 503
classification, and response-body non-disclosure.

## Known gaps

- `CLERK_REQUEST_TIMEOUT_MS` and `NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS`
  require operational approval per environment.
- Clerk Backend SDK 3.20.1 does not expose `AbortSignal` or a custom fetch
  transport for the used APIs. The adapter proves a bounded caller-visible
  deadline and passes a signal to its dependency port, but the default SDK
  transport may continue its underlying HTTP attempt after the caller receives
  the operational failure.
- No production, CI, browser, load, or external Clerk outage evidence is
  claimed.