# API

## Clerk configuration

`NODE_ENV` is required and must be one of `development`, `test`, `staging`, `preview`, or `production`. Production startup rejects synthetic placeholders, weak dashboard HMAC secrets, and non-HTTPS origins. Non-production profiles may use the synthetic values in `.env.example` for local testing only.

The approved topology is one API process for dashboard authentication and Clerk webhooks. The Nest module therefore creates one `ClerkIdentityAdapter` and aliases it as both `IDENTITY_PROVIDER` and `IDENTITY_WEBHOOK_VERIFIER`; these are two ports backed by one configuration boundary, not separate deployables. Startup fails closed when any required value is missing or invalid, so the process cannot serve either path with partial identity configuration:

- `CLERK_SECRET_KEY`: Clerk Backend API secret used by `verifyToken` and the Backend API client. It must use Clerk's `sk_test_` or `sk_live_` format.
- `CLERK_WEBHOOK_SIGNING_SECRET`: endpoint signing secret used by `verifyWebhook`. It must use Clerk's `whsec_` format.
- `CLERK_ISSUER`: exact expected `iss` claim as a canonical HTTPS origin. Wildcards, credentials, paths, queries, and fragments are rejected.
- `CLERK_AUTHORIZED_PARTIES`: comma-separated canonical origins or a JSON string array. Empty entries, wildcard entries, credentials, paths, queries, fragments, and trailing slashes are rejected.
- `CLERK_REQUEST_TIMEOUT_MS`: positive environment-owned deadline for identity-provider operations. Production values require operational approval.

`.env.example` contains synthetic placeholders only. Never commit real Clerk secrets.

For every protected dashboard request, the adapter calls official `@clerk/backend@3.20.1` `verifyToken`, without fetching session or user status. It accepts only the standard Clerk session-token profile: valid signature, expiry and temporal claims, exact configured issuer, `sid` and `sub`, an `azp` accepted through the SDK's `authorizedParties`, and no `aud` claim. Tokens carrying `aud` are rejected whether the claim is a string or array. Previously issued JWTs can remain valid after external revocation, blocking or deletion until expiry; local membership, permission, application-scope and tenant-context checks still deny independently. The owning policy and activation gates are in [IAM](../../specs/iam/SPEC-DIVE-IAM-001.md#dashboard-jwt-validity-boundary).

Onboarding completion calls `resolveVerifiedIdentity` through the existing identity provider to fetch verified email addresses for the authenticated principal. This lookup verifies user/identity agreement, not session or blocking state; unavailable or unmatched email verification does not complete bootstrap. The ordinary invitation-response persistence command still requires a trusted principal carrying verified addresses, but no ordinary invitation-response API use case is connected yet. The same explicit lookup is available for that future consumer; it is not part of authentication or invitation creation.

Invalid JWT credentials remain a generic 401; verifier/key timeout or other operational failure is a generic 503 and is logged separately without provider details. Signing-key retrieval can still require network access. The adapter's dependency port receives an `AbortSignal`, but Clerk 3.20.1 does not expose signal or custom-fetch support for these APIs, so the caller-visible deadline does not claim cancellation of the SDK's underlying HTTP attempt.

Ordinary dashboard authentication binds by `issuer + subject` and may return no provider-verified email addresses. Invitation acceptance is stricter: it requires at least one provider-verified address and an exact match to the invitation target.

Clerk's optional experimental `fva` claim is kept inside the adapter. Valid factor ages map to provider-neutral assurance. When `fva` is absent, ordinary MVP dashboard authentication returns `single_factor` with `verifiedAt: null`; no MFA requirement or factor timestamp is fabricated. Exact future step-up use of Clerk's experimental claim remains an open Phase 4 question under `ADR-DIVE-006`.

## Clerk webhook

Configure Clerk to send webhooks to `POST /v1/webhooks/clerk`. Nest raw-body capture is enabled and the route passes the original bytes and request headers to official `verifyWebhook` before creating a provider-neutral event.

The explicit identity inventory is `user.created`, `user.updated`, `user.deleted`, `session.created`, `session.ended`, `session.removed`, and `session.revoked`. All are synchronization signals only. Verified session-ending events revoke local handles; JWT validity and current local authorization remain request-time checks without live provider-status queries. A resolved `user.deleted` event is recorded, audited per associated tenant, and emits `iam.identity.provider_deletion_recorded.v1`, but it never disables an external identity or membership. Verified unknown events are recorded as ignored or unresolved and never create identities, memberships, roles, or scopes.

Duplicate, ignored, unresolved, and applied verified events return `200 {"received":true}`. Invalid signatures, missing signed headers, and invalid envelopes return a non-disclosing `400`. Persistence failures return a non-disclosing `503` so the provider can retry. Logs contain only safe action, reason, and correlation metadata; never log the body, signature, address, or bearer token.

The local verifier contract tests execute the real Clerk SDK against RS256 fixtures signed with generated local keys and the documented `jwtKey` option, including expired/not-yet-valid tokens and acceptance followed by expiry of a frozen token. Ordinary authentication performs no session/user fetch; explicit email lookup is tested with mocked provider responses. No Clerk sandbox or production validation is claimed by these tests.

## OpenAPI

Swagger is disabled by default and cannot be enabled in production or when BFF admission is configured. Framework documentation routes do not receive an implicit admission exception. Tests may generate the OpenAPI document without exposing HTTP documentation handlers.

### Local documentation viewer

```bash
# From the repository root, start the viewer and open the browser on macOS:
pnpm swagger
# Choose another port, or use 0 to select an available port:
pnpm swagger 3003

# Start only the viewer, without opening the browser:
pnpm --filter @dive-center/api swagger:local
# If port 3002 is occupied, choose another port:
pnpm --filter @dive-center/api swagger:local 3003
```

Open `http://127.0.0.1:3002/docs`, or the URL printed by the command. Port `0`
selects an available port automatically. Stop the viewer with Ctrl+C.

The command builds the API and its workspace dependencies, then generates OpenAPI
from the controllers discovered through `AppModule`'s static module imports.
It uses a documentation-only dependency graph with inert dependency mocks; it
does not initialize business services, connect to PostgreSQL or Clerk, load local
secrets, or start the API. Dynamic module imports fail explicitly rather than
silently omitting their controllers. Restart the command after controller/DTO
changes to regenerate the document.

The separate Swagger UI process binds only to IPv4 loopback (`127.0.0.1`). It serves
documentation at `/docs` and the generated document at `/docs-json`, not business
handlers. **Try it out** is disabled; do not enter service credentials into the
browser. Business requests continue through the existing BFF. Keep
`API_SWAGGER_ENABLED` unset or `false` for the API; this viewer does not change API
admission or deployment configuration.

## BFF admission

The approved contract and pending activation gates live in [SPEC-DIVE-IAM-DASHBOARD-001](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md). `IamModule` registers global admission through `APP_GUARD`; unclassified or conflicting operations are denied. The root greeting is no longer registered. The code-owned exception inventory lives in [http-admission.ts](src/common/auth/http-admission.ts); exceptions preserve their owning identity, platform, public-channel or provider-signature checks.

`BFF_SERVICE_CREDENTIAL_VERIFIERS` is required: a non-empty JSON array of objects containing only `version` and `sha256`. Versions are unique, non-empty ASCII letters/digits/underscore/hyphen; `sha256` is the 64-character lowercase hexadecimal SHA-256 digest of the raw 32-byte secret. The API stores only verifiers. Supply distinct server-side secrets per environment; never use `.env.example` placeholders or test fixtures in a deployed environment.

Center-data requests require the independent `X-BFF-Service-Credential: <version>.<base64url-secret>`, `Authorization: Bearer <Clerk token>`, `X-BFF-Center-Origin` and session-bound `X-Tenant-Context`. Only the permitted server BFF constructs the service credential and canonical center association. The API re-resolves mapping ownership and carries one authorized scope into the owning use case; lists and resource operations stay limited to that center, including retained disabled mappings. Service-authentication rejection has code `bff_service_authentication_failed`, distinct from the user's Clerk-session failure. The BFF must not turn it into user logout.

Center bootstrap remains `POST /v1/me/center-entry-contexts` without a prior handle. It still requires service and Clerk authentication, exact original Origin/association/body agreement, an active mapping and the owning permission checks. No other operation inherits this exception. HEAD receives no implicit GET exemption; CORS preflight is not permission to execute a business operation.

Rotation accepts both configured verifier versions only during a planned transition. Retired versions are rejected; compromised versions have no grace overlap. Effective revocation still requires checking every reachable instance/alias or suspending affected traffic while stale instances are removed. Unit/HTTP tests do not prove deployment revocation, ingress sanitization or real Clerk continuity. Deploy the API restriction together with the BFF and migrated consumers; do not activate it independently with direct-API clients or roll back to unscoped access.

## Catalog editing and booking reads

**Documented -- Implementation entry points:** the
[catalog controller](src/catalog/catalog.controller.ts) exposes activity detail
and content editing through `GET` and `PUT /v1/centers/:centerId/activities/:activityId`.
The selected edit contract remains in
[Catalog](../../specs/booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-editing),
`DIVE-BOOK-REQ-050..051`, `053`, `056`, and
[ADR-DIVE-014](../../specs/architecture/adrs/ADR-DIVE-014.md). The
[activity service](src/catalog/activities/activity-catalog.service.ts) owns
ETag/`If-Match` checks and revision updates within the existing authorized tenant
transaction. Content changes append `booking.activity.updated` audit records,
without creating a content-update outbox event. The bounded edit is not a full
implementation of the broader commercial model.

**Documented -- Read implementation:**
[BookingReadController](src/booking/reads/booking-read.controller.ts) registers
the following center-data operations, also enumerated by the
[web BFF](../web/src/lib/dashboard-bff.ts):

```text
GET /v1/centers/:centerId/calendar/slots
GET /v1/centers/:centerId/slots/:slotId/bookings
GET /v1/centers/:centerId/bookings/:bookingId/contact
```

The owners are
[Scheduling](../../specs/booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-read-scope),
`DIVE-BOOK-REQ-021`, `029`, `043`, `049`, and
[IAM read permissions/audit](../../specs/iam/SPEC-DIVE-IAM-001.md#calendar-phase-two-read-permissions),
`DIVE-IAM-REQ-015`, `025`, `028`, alongside `DIVE-IAM-REQ-030..032` application
admission. Use the [DTOs](src/booking/reads/booking-read.dto.ts) and
[query validation](src/booking/reads/booking-read.validation.ts) for the current
transport projection rather than treating this README as a second contract.

[BookingReadService](src/booking/reads/booking-read.service.ts) reuses the
authorized tenant unit of work and commits the required audit before returning
data. [Read persistence](src/booking/reads/booking-read.persistence.ts) computes
each calendar page and its observation in one SQL statement. The API emits
`private, no-store`; operational booking pages exclude contact fields. Read
requests do not advance booking lifecycle or enqueue events. Unknown blocked-seat
authority is represented by nullable remaining capacity, not invented zeroes.

Coverage entry points are
[PostgreSQL read tests](test/booking-read.e2e-spec.ts),
[read validation tests](src/booking/reads/booking-read.validation.spec.ts),
[OpenAPI tests](src/app/openapi.spec.ts) and
[global admission discovery](src/iam/application-admission.composition.spec.ts).
The PostgreSQL tests use the synthetic harness in
[the local setup](../../infra/docker/postgres/README.md); they do not validate
production ingress, real Clerk continuity or rollout.

## Local commands

```bash
pnpm --filter @dive-center/api test
pnpm --filter @dive-center/api test:e2e
pnpm --filter @dive-center/api typecheck
```

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

The API uses the vendor-neutral OpenTelemetry API through
`@dive-center/observability`. Every HTTP response includes `X-Correlation-ID`;
an incoming valid UUID is preserved and an ID is generated when it is absent or
invalid. The same request context is available to security logs, IAM, webhooks,
and catalog audit/outbox mutations.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
