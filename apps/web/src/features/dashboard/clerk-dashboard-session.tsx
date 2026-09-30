'use client';

import { RedirectToSignIn, useAuth, useClerk } from '@clerk/nextjs';
import { useMemo, useState } from 'react';
import { DashboardTenantContext } from './dashboard-tenant-context';
import type { SessionTokenSource } from './tenant-context';

export function ClerkDashboardSession({
  apiBaseUrl,
  requestTimeoutMillis,
  centerKey,
  centerReturnUrl,
  supportEmail,
  children,
}: {
  apiBaseUrl: string;
  requestTimeoutMillis?: number;
  centerKey?: string | undefined;
  centerReturnUrl?: string | undefined;
  supportEmail?: string | undefined;
  children?: React.ReactNode;
}) {
  const { getToken, isLoaded, isSignedIn, sessionId } = useAuth();
  const { signOut } = useClerk();
  const [sessionExpired, setSessionExpired] = useState(false);
  const session = useMemo<SessionTokenSource>(
    () => ({
      configured: true,
      getToken: () => (sessionId ? getToken() : Promise.resolve(null)),
      logout: signOut,
    }),
    [getToken, sessionId, signOut],
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

  if (!isSignedIn || sessionExpired) {
    return (
      <RedirectToSignIn
        {...(centerReturnUrl
          ? { signInForceRedirectUrl: centerReturnUrl }
          : {})}
      />
    );
  }

  return (
    <DashboardTenantContext
      apiBaseUrl={apiBaseUrl}
      requestTimeoutMillis={requestTimeoutMillis}
      session={session}
      centerKey={centerKey}
      supportEmail={supportEmail}
      onSessionExpired={centerKey ? () => setSessionExpired(true) : undefined}
    >
      {children}
    </DashboardTenantContext>
  );
}
