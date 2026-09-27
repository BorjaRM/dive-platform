# Dive Center Web

The dashboard tenant-context starter lives at `/dashboard`.

Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to the publishable key for the Clerk
instance used by the web app. Keep the secret key and webhook signing secret
server-only; the API reads those from its own environment.

## Dashboard authentication seam

The dashboard accepts an explicit `NEXT_PUBLIC_DASHBOARD_API_URL` and keeps the identity-provider boundary provider-neutral. Clerk is the configured browser provider for this app: `ClerkDashboardSession` supplies a `SessionTokenSource` with `getToken()` and `logout()` to `DashboardTenantContext` without coupling the dashboard orchestration to Clerk.

The opaque tenant context is read and written through `sessionStorage` only. The API boundary sends it as `X-Tenant-Context` alongside the provider session bearer token. TanStack Query owns interactive server state, while query keys do not contain either credential. The dashboard removes its affected query cache when context changes, a context is denied, or the user logs out.

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
