'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useMemo } from 'react';
import { DashboardTenantContext } from './dashboard-tenant-context';
import type { SessionTokenSource } from './tenant-context';

export function ClerkDashboardSession({ apiBaseUrl }: { apiBaseUrl: string }) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const session = useMemo<SessionTokenSource>(
    () => ({
      configured: true,
      getToken,
      logout: signOut,
    }),
    [getToken, signOut],
  );

  return <DashboardTenantContext apiBaseUrl={apiBaseUrl} session={session} />;
}
