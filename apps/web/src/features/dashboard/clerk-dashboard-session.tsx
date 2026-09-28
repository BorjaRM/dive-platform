'use client';

import { RedirectToSignIn, useAuth, useClerk } from '@clerk/nextjs';
import { useMemo } from 'react';
import { DashboardTenantContext } from './dashboard-tenant-context';
import type { SessionTokenSource } from './tenant-context';

export function ClerkDashboardSession({
  apiBaseUrl,
  requestTimeoutMillis,
}: {
  apiBaseUrl: string;
  requestTimeoutMillis?: number;
}) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const session = useMemo<SessionTokenSource>(
    () => ({
      configured: true,
      getToken: () => getToken(),
      logout: signOut,
    }),
    [getToken, signOut],
  );

  if (!isLoaded) {
    return (
      <main className="dashboard-page">
        <section className="status-panel" role="status">
          <span className="status-line" aria-hidden="true" />
          <div>
            <h1>Checking your session</h1>
            <p>Preparing the secure dashboard sign-in boundary.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!isSignedIn) {
    return <RedirectToSignIn />;
  }

  return (
    <DashboardTenantContext
      apiBaseUrl={apiBaseUrl}
      requestTimeoutMillis={requestTimeoutMillis}
      session={session}
    />
  );
}
