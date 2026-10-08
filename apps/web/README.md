# Dive Center Web

The center dashboard lives at `/dashboard`; platform invitation administration
uses the authentication host.

## Center dashboard

**Documented -- Implementation navigation:** the current
[dashboard home](src/features/dashboard/dashboard-home.tsx),
[catalog panel](src/features/dashboard/catalog-panel.tsx) and
[calendar](src/features/dashboard/dashboard-calendar.tsx) use the shared
dashboard context and same-origin BFF. Their contracts remain in
[Catalog](../../specs/booking/SPEC-DIVE-BOOKING-CATALOG-001.md#activity-editing),
`DIVE-BOOK-REQ-050..051`, `053`, `056`,
[Scheduling](../../specs/booking/SPEC-DIVE-BOOKING-SCHEDULING-001.md#calendar-phase-two-read-scope),
`DIVE-BOOK-REQ-021`, `029`, `043`, `049`, and
[IAM dashboard](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md), `DIVE-IAM-REQ-030..032`.
These links describe implementation surfaces, not approval of deployment or
completion of the broader catalog/scheduling model.

- `/dashboard` shows upcoming sessions and capability-dependent navigation and
	actions for the resolved center.
- `/dashboard/activities` lists activities; `/dashboard/activities/new` creates
	one; `/dashboard/activities/:activityId/edit` exposes detail, translation/common
	editing and the existing slot commands. The
	[activity editor](src/features/dashboard/catalog-activity-edit.tsx) retains the
	ETag returned by the API and sends it with `If-Match`. A failed save preserves
	the draft; reloading current content is an explicit action.
- `/dashboard/calendar` uses the center-aggregated overlap read rather than
	loading each activity's catalog slots. Events show server-observed occupancy;
	the selected execution opens a paginated booking list with its own status
	filter. Contact is fetched only through an explicit action and kept in local
	component state, not query cache or browser storage. The
	[booking detail owner](src/features/dashboard/calendar-bookings.tsx) cancels
	outstanding contact requests when the detail unmounts.

The [calendar navigation owner](src/features/dashboard/calendar-navigation.ts)
recovers `calendarView`, `calendarDate`, `activity` and `slotStatus` from the URL.
The date is center-local; invalid navigation is normalized without dropping
unrelated URL keys. A valid inaccessible activity remains selected and produces
the resource error rather than broadening the read. Period navigation, regained
focus and the Refresh command update observations without polling. Remaining
capacity can be unavailable; displayed occupancy is not a booking guarantee.

Executable coverage lives in
[calendar tests](src/features/dashboard/dashboard-calendar.test.tsx),
[calendar data/navigation tests](src/features/dashboard/calendar-data.test.ts),
[catalog tests](src/features/dashboard/catalog-panel.test.tsx) and
[BFF tests](src/lib/dashboard-bff.test.ts). Tests and a production build are not
browser, zoom, real-Clerk or deployment verification.

## Platform bootstrap invitations

**Documented:** the product owner authorized the bounded local console implementation
on 2026-10-01. It supports emission and safe state lookup under
[SPEC-DIVE-ONBOARDING-ADMIN-001](../../specs/onboarding/SPEC-DIVE-ONBOARDING-ADMIN-001.md),
`DIVE-ONB-REQ-005`, `039`, `040`; it does not activate production delivery.

Open `/platform/invitations` on the configured `AUTHENTICATION_ORIGIN`, not a
center host. Clerk sign-in returns to this page. The console uses the existing
server-side BFF configuration and two enumerated same-origin operations under
`/api/platform/invitations`: POST emission and GET by invitation UUID. The dashboard
transport does not expose platform commands. No tenant handle or service credential
is forwarded for these pre-tenant commands; the API checks the authenticated
principal's current platform capabilities in PostgreSQL.

Capability assignment remains an operational action, not a console feature. From
a restricted connection with the `dive_platform_admin` role, the existing command
can enable each required capability for a verified Clerk issuer and subject:

```sql
SELECT onboarding_app.set_platform_capability(
	:'issuer', :'subject', 'bootstrap_invitation.issue', true
);
SELECT onboarding_app.set_platform_capability(
	:'issuer', :'subject', 'bootstrap_invitation.read', true
);
```

Use `false` in the same commands to withdraw a capability. Do not expose the
administrative connection to Next.js, the API runtime, or the browser. No
capabilities are assigned by visiting the page or from tenant roles.

Initial emission requires an email and accepts an optional reason; reissue and
revoke require a non-empty reason. The console preserves the payload and
idempotency key for manual retries while the same session component remains
mounted; an uncertain result does not start a fresh operation. This state is
not persisted across reloads, navigation or sign-out, so those actions can lose
an unresolved request. A timeout or cancellation does not undo a committed
invitation. Lookup uses an invitation ID and manual refresh, without polling.
Delivery processing is separate from invitation state and does not confirm inbox
receipt. Tickets, invitation links and raw provider errors are not displayed.

MFA, listing and bulk sends are outside this increment; reissue and revoke are
available in the console.
`BOOTSTRAP_INVITATION_WRITES_ENABLED` and `BOOTSTRAP_INVITATION_DELIVERY_ENABLED`
remain API/worker controls; the page never enables them. The current Render
blueprint sets both controls to `true` for the controlled worker rollout. Real
Clerk continuity, ingress and provider delivery still require sandbox/deployment
verification; an enabled deployment flag is configuration, not evidence that
those checks passed. The console tests and the real Next/API/PostgreSQL harness
use synthetic identities and do not establish those deployment checks.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the publishable key for the Clerk
instance used by the web app. Keep the secret key and webhook signing secret
server-only; the API reads those from its own environment.

## Dashboard authentication seam

The dashboard sends enumerated operations to the same-origin `/api/dashboard` BFF; the client rejects a direct API base URL. Clerk is the configured browser provider for this app: `ClerkDashboardSession` supplies a `SessionTokenSource` with `getToken()` and `logout()` to `DashboardTenantContext` without coupling the dashboard orchestration to Clerk. Bootstrap setup also uses this same-origin transport, preserving its own pre-tenant admission contract.

The opaque tenant context is read and written through `sessionStorage` only. The API boundary sends it as `X-Tenant-Context` alongside the provider session bearer token. TanStack Query owns interactive server state. The dashboard removes its affected query cache when context changes, a context is denied, or the user logs out.

## Server-side BFF configuration

The owning contract is [SPEC-DIVE-IAM-DASHBOARD-001](../../specs/iam/SPEC-DIVE-IAM-DASHBOARD-001.md), `DIVE-IAM-REQ-030..032`. Supply these values only to the Next.js server deployment, not through `NEXT_PUBLIC_*`:

- `BFF_API_ORIGIN`: fixed canonical API origin without a path, query or credentials. HTTPS is required; loopback HTTP is accepted only outside production for local tests/development.
- `BFF_SERVICE_CREDENTIAL`: `<version>.<secret>` with a 32-byte canonical base64url secret. The API receives only the matching version/SHA-256 verifier configuration, independently of Clerk.
- `BFF_REQUEST_TIMEOUT_MS`: explicit positive server-side deadline. The sample value is for local synthetic work, not a session TTL or production performance budget.
- `BFF_MAX_REQUEST_BODY_BYTES`: optional positive safe integer, default `1048576` (1 MiB).
- `BFF_MAX_RESPONSE_BODY_BYTES`: optional positive safe integer, default `8388608` (8 MiB).
- Existing `AUTHENTICATION_ORIGIN`, `CENTER_APP_BASE_DOMAIN` and optional local `CENTER_APP_BASE_ORIGIN` define the canonical host namespace. The API re-resolves trusted registry ownership; host parsing is not product authorization.

**Documented -- Maintenance configuration:** the product owner delegated selection
of generous, configurable body limits in the BFF security-review chat on
2026-10-01. The defaults above describe the current
[transport implementation](src/lib/dashboard-bff.ts), not a measured performance
budget or a change to the endpoint contracts.

Both dashboard and platform invitation operations count consumed body bytes while
reading the stream, independently of `Content-Length`. The exact limit is accepted;
an excess cancels reading. An oversized request returns `413` with
`request_body_too_large` before forwarding; an oversized upstream response aborts
the upstream request and returns a generic `502` with `bff_upstream_unavailable`.
UTF-8 decoding preserves characters split across stream fragments, and the existing
deadline and caller cancellation remain active during reading. Invalid configured
limits fail closed with `503` and `bff_configuration_unavailable`.

These are transport guardrails, not permission to send payloads rejected by an
endpoint or deployment provider. Raising them increases potential memory use;
body size alone does not bound parsed JSON memory, concurrent requests or
framework buffering. No capacity measurement is claimed. A rejected oversized
response does not imply that an upstream mutation was rolled back. Ingress/TLS,
header sanitization and alternate-host verification remain separate deployment
checks.

The server-only transport discards caller-provided service/scope headers, cookies and arbitrary upstream metadata. Only enumerated methods, paths and query parameters are accepted. Browser mutations require their original matching Origin; bootstrap also checks `centerRef`. Upstream redirects are never followed, private responses are `no-store`, response headers are restricted, and service authentication failure is mapped to unavailable rather than user logout. Cancellation propagates; there is no automatic mutation retry or claim that a timeout rolled back a write.

Forwarded host information is not application authority. Deployments still need a verified ingress/TLS and header-sanitization contract; local handler tests do not establish that proof. Unknown/disabled mappings reject new bootstrap in API. An already issued handle is preserved and revalidated through the BFF-associated center list; the dashboard route does not use an active-entry CORS probe as per-operation authorization. Root/login entry probes remain separate.

Next.js may construct an internal handler URL and add `X-Forwarded-Host`. The BFF derives association from the configured canonical `Host`, not that internal URL or forwarded metadata. A contradictory forwarded host is rejected; an identical value is ignored as authority. This framework compatibility check does not verify a deployed proxy's sanitization or TLS configuration.

`apps/api/test/bff-next.e2e-spec.ts` runs actual Next.js, the API AppModule and dedicated PostgreSQL with deterministic identity, without a browser. The existing `pnpm test:integration`/CI integration command includes it. It also reports a warmed local direct-API/BFF comparison without timing thresholds; those results are not production or real-Clerk measurements.

Provision/rotate secrets separately by environment. Removing a verifier from configuration does not establish effective revocation until every reachable API instance/alias rejects it; suspend affected traffic if that cannot be assured. Do not activate API enforcement independently of ready BFF/consumers, and never roll back to direct unscoped center-data access. Browser, real Clerk, ingress, rollout/revocation and performance verification remain explicit activation gates; unit/DOM/build results do not replace them.

## Local center origins

The local center-entry configuration uses the same active mapping and
authorization flow as deployed centers. Configure the following overrides in
the root `.env.local`, shared by web and API through `pnpm dev`:

```dotenv
NODE_ENV=development
AUTHENTICATION_ORIGIN=http://localhost:3000
CENTER_APP_BASE_DOMAIN=app.localhost
CENTER_APP_BASE_ORIGIN=http://app.localhost:3000
```

`CENTER_APP_BASE_ORIGIN` is optional. Without it, the base origin remains
`https://<CENTER_APP_BASE_DOMAIN>`. A local HTTP origin is accepted only in
development, with a `.localhost` hostname matching the configured base domain.
The configured port is matched exactly; mismatched protocols, ports and domains
are rejected. Deployed center origins remain HTTPS without a non-default port.

Center hosts are Clerk satellites only in this local setup, because
`localhost` and `*.app.localhost` do not share a cookie domain. Deployed
environments must place `AUTHENTICATION_ORIGIN` and `CENTER_APP_BASE_DOMAIN`
under the same root domain, which uses Clerk's shared subdomain session;
otherwise the host configuration is rejected outside development. See
[ADR-DIVE-017](../../specs/architecture/adrs/ADR-DIVE-017.md#clerk-satellite-configuration).

After bootstrap, the allocated `centerKey` determines the destination, for
example `http://test-center.app.localhost:3000/dashboard` or
`http://ocean-north.app.localhost:3000/dashboard`. Neither key is hardcoded or
created by this configuration. Unknown or inactive mappings still fail closed;
center origins are not added to the static CORS allowlist. Restart `pnpm dev`
after changing the root environment, because running processes retain their
existing environment.

Clerk also validates the session token's authorized party independently of
CORS. Add each real local center origin to the existing exact
`CLERK_AUTHORIZED_PARTIES` configuration before using its authenticated
dashboard, keeping the authentication origin in the list. For example, if those
center keys exist:

```dotenv
CLERK_AUTHORIZED_PARTIES=http://localhost:3000,http://test-center.app.localhost:3000,http://ocean-north.app.localhost:3000
```

This list does not register a center or grant membership. A different allocated
key needs its own exact origin; wildcards remain rejected. Without that entry,
Clerk tokens issued for the center origin are rejected with `401` even when its
mapping and CORS are valid.

Browser resolution of `.localhost` and Clerk session continuity across these
hosts require browser verification; unit tests do not establish that proof.

## Frontend state conventions

These conventions are proposed implementation guidance and do not replace the
state ownership boundaries in `ADR-DIVE-009`.

### React Hook Form - Form state

**[Proposed]** Use React Hook Form to manage form inputs, real-time
validation, and dirty state (whether the user has modified a field). Always
combine it with Zod to define the validation schema.

### Zustand - Complex flow state

**[Proposed]** Use Zustand for multi-step business flows that need to persist
state between screens. The clearest example is the Returns Wizard:

1. Item selection
2. Reason
3. Shipping method

The store lives inside the feature at
`features/[feature]/stores/use[Feature]Store.ts`. The store must remain
encapsulated within that feature: if the feature is deleted, its store is
deleted with it.

## Styling ownership

The current implementation separates styling from feature behavior so the
components can be redesigned without rewriting their flows:

- [Global styles](src/app/globals.css) contain the Tailwind import, base styles
	and semantic tokens for colors, typography, spacing and control dimensions.
	Tailwind is already available for local layout utilities; there is no
	wholesale utility-class migration.
- Feature CSS Modules own their layouts and area-specific token overrides:
	marketing, dashboard, catalog and bootstrap. CSS Module composition reuses
	shared rules without restoring global feature selectors.
- [Native controls](src/components/ui/controls.tsx) provide `Button`, `Input`,
	`Select`, `Badge` and `Notice`. Their explicit variants and shared
	[control styles](src/components/ui/controls.module.css) centralize hover,
	focus, disabled and invalid states. Native attributes, events and refs remain
	available; arbitrary `className` and `style` overrides are not part of the API.
- [Access styles](src/components/ui/access.module.css) own the visual shell
	shared by sign-in and invitations; bootstrap-specific form styles stay in
	the bootstrap feature. Domain status-to-badge mapping stays in catalog.

These primitives are local to this web app. `packages/ui` has no demonstrated
cross-app consumer for them. This organization is not a visual redesign.

### Units and responsive

Spacing tokens use a 4-point scale in `rem`; `--space-2` is `0.5rem` and
`--space-4` is `1rem`. These correspond to 8px and 16px only with a 16px root;
the app does not force that root size. Layout spacing generally uses 8-point
steps, with 4-point half steps for compact controls. Area-specific control
padding references the same scale. Borders, outlines and decorative geometry
remain separate from spacing; the marketing visual's 3px icon margin aligns
its fixed 3px border rather than defining a layout step.

[Shared typography roles](src/components/ui/primitives.module.css) provide
label, helper-text and section-heading styles using semantic tokens. Layout
margins stay with their consumers. Text sizes use stable `rem` values within
each responsive mode, not viewport interpolation.

Narrow layouts are the base. Catalog and dashboard use named container queries
for available content width; bootstrap adapts its heading to its panel width.
Access and marketing use page-level media queries. Thresholds live with their
owning CSS Modules and use literal `rem` conditions, not CSS variables.

The approved engineering policy lives in
[Copilot instructions](../../.github/copilot-instructions.md#units-spacing-and-responsive).
DOM tests and the production build do not establish visual or zoom coverage.

### Browser compatibility

`composes` is CSS Modules build-time syntax, not a browser CSS property. Next.js
resolves composition into class names and ordinary CSS; browsers do not need
native `composes` support. See the
[CSS Modules composition guide](https://github.com/css-modules/css-modules/blob/master/docs/composition.md).
VS Code CSS Custom Data only describes this syntax to the editor; it adds no
runtime transformation, fallback or polyfill.

Compatibility depends on the emitted CSS and the framework/runtime baseline.
Current styles use container queries, CSS custom properties and `color-mix()`,
which have their own browser support requirements. Without container-query
support, the query rules are ignored and the base narrow layout remains,
provided the remaining CSS and runtime are supported. This is not a guarantee
of compatibility with all older browsers.

**Open question (2026-09-30):** the product owner has not selected a supported
browser/version matrix in this chat. Legacy targets, required fallbacks and
compatibility checks remain decisions to confirm, not an implied commitment.
A successful build or DOM test alone does not establish browser compatibility.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Use the configured authentication and authorized center origins described above.
Center data uses the same-origin BFF, not a browser-configured direct API URL.
Missing Clerk or BFF configuration renders an explicit unavailable state or
returns the corresponding transport error.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Focused checks

```bash
pnpm --filter @dive-center/web test
pnpm --filter @dive-center/web typecheck
```
