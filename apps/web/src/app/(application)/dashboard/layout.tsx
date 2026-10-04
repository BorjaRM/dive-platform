import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { ClerkDashboardSession } from '@/features/dashboard/clerk-dashboard-session';
import { DashboardProviders } from '@/features/dashboard/dashboard-providers';
import { DashboardTenantContext } from '@/features/dashboard/dashboard-tenant-context';
import {
  DASHBOARD_BFF_BASE_PATH,
  dashboardRequestTimeoutFromEnvironment,
} from '@/features/dashboard/tenant-context';
import {
  classifyApplicationHost,
  readApplicationHostConfig,
} from '@/lib/application-hosts';

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const surface = classifyApplicationHost(
    (await headers()).get('host'),
    readApplicationHostConfig(),
  );
  const props = {
    apiBaseUrl: DASHBOARD_BFF_BASE_PATH,
    requestTimeoutMillis: dashboardRequestTimeoutFromEnvironment(
      process.env.NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS,
    ),
    centerKey: surface.kind === 'center' ? surface.centerKey : undefined,
    supportEmail: process.env.PUBLIC_PRODUCT_CONTACT_EMAIL,
  };
  return (
    <DashboardProviders>
      {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
        <ClerkDashboardSession
          {...props}
          centerReturnUrl={
            surface.kind === 'center'
              ? `${surface.origin}/dashboard`
              : undefined
          }
        >
          {children}
        </ClerkDashboardSession>
      ) : (
        <DashboardTenantContext {...props}>{children}</DashboardTenantContext>
      )}
    </DashboardProviders>
  );
}
