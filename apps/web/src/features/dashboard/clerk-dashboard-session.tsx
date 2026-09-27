'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
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
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const session = useMemo<SessionTokenSource>(
    () => ({
      configured: true,
      getToken: () => getToken(),
      logout: signOut,
    }),
    [getToken, signOut],
  );

  return (
    <DashboardTenantContext
      apiBaseUrl={apiBaseUrl}
      requestTimeoutMillis={requestTimeoutMillis}
      session={session}
    />
  );
}
