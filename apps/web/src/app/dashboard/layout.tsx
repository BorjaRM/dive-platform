import type { ReactNode } from 'react';
import { DashboardProviders } from '@/features/dashboard/dashboard-providers';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardProviders>{children}</DashboardProviders>;
}
