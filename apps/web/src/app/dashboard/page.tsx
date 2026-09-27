import { ClerkDashboardSession } from '@/features/dashboard/clerk-dashboard-session';
import { DashboardTenantContext } from '@/features/dashboard/dashboard-tenant-context';
import { dashboardRequestTimeoutFromEnvironment } from '@/features/dashboard/tenant-context';

export default function DashboardPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? '';
  const requestTimeoutMillis = dashboardRequestTimeoutFromEnvironment(
    process.env.NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS,
  );

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <ClerkDashboardSession
        apiBaseUrl={apiBaseUrl}
        requestTimeoutMillis={requestTimeoutMillis}
      />
    );
  }

  return (
    <DashboardTenantContext
      apiBaseUrl={apiBaseUrl}
      requestTimeoutMillis={requestTimeoutMillis}
    />
  );
}
