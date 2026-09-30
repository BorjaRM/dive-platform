import { headers } from 'next/headers';
import { CatalogPanel } from '@/features/dashboard/catalog-panel';
import { ClerkDashboardSession } from '@/features/dashboard/clerk-dashboard-session';
import { DashboardTenantContext } from '@/features/dashboard/dashboard-tenant-context';
import { dashboardRequestTimeoutFromEnvironment } from '@/features/dashboard/tenant-context';
import {
  classifyApplicationHost,
  readApplicationHostConfig,
} from '@/lib/application-hosts';

export default async function DashboardPage() {
  const surface = classifyApplicationHost(
    (await headers()).get('host'),
    readApplicationHostConfig(),
  );
  const centerKey = surface.kind === 'center' ? surface.centerKey : undefined;
  const centerReturnUrl =
    surface.kind === 'center' ? `${surface.origin}/dashboard` : undefined;
  const supportEmail = process.env.PUBLIC_PRODUCT_CONTACT_EMAIL;
  const apiBaseUrl = process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? '';
  const requestTimeoutMillis = dashboardRequestTimeoutFromEnvironment(
    process.env.NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS,
  );

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <ClerkDashboardSession
        apiBaseUrl={apiBaseUrl}
        requestTimeoutMillis={requestTimeoutMillis}
        centerKey={centerKey}
        centerReturnUrl={centerReturnUrl}
        supportEmail={supportEmail}
      >
        <CatalogPanel />
      </ClerkDashboardSession>
    );
  }

  return (
    <DashboardTenantContext
      apiBaseUrl={apiBaseUrl}
      requestTimeoutMillis={requestTimeoutMillis}
      centerKey={centerKey}
      supportEmail={supportEmail}
    >
      <CatalogPanel />
    </DashboardTenantContext>
  );
}
