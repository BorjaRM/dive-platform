import { ClerkDashboardSession } from '@/features/dashboard/clerk-dashboard-session';
import { DashboardTenantContext } from '@/features/dashboard/dashboard-tenant-context';

export default function DashboardPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? '';

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return <ClerkDashboardSession apiBaseUrl={apiBaseUrl} />;
  }

  return <DashboardTenantContext apiBaseUrl={apiBaseUrl} />;
}
