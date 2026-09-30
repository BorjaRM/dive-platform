# Dive Center Web

The dashboard tenant-context starter lives at `/dashboard`.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the publishable key for the Clerk
instance used by the web app. Keep the secret key and webhook signing secret
server-only; the API reads those from its own environment.

## Dashboard authentication seam

The dashboard accepts an explicit `NEXT_PUBLIC_DASHBOARD_API_URL` and keeps the identity-provider boundary provider-neutral. Clerk is the configured browser provider for this app: `ClerkDashboardSession` supplies a `SessionTokenSource` with `getToken()` and `logout()` to `DashboardTenantContext` without coupling the dashboard orchestration to Clerk.

The opaque tenant context is read and written through `sessionStorage` only. The API boundary sends it as `X-Tenant-Context` alongside the provider session bearer token. TanStack Query owns interactive server state, while query keys do not contain either credential. The dashboard removes its affected query cache when context changes, a context is denied, or the user logs out.

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

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard) to see the dashboard starter. Without the API URL or Clerk publishable key, the page renders an explicit authentication/configuration state.

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
