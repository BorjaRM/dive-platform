import type { Metadata } from 'next';
import { BootstrapSetup } from '@/features/bootstrap/bootstrap-setup';

export const metadata: Metadata = {
  title: 'Set up your operation | BlueCurrent',
  robots: { index: false, follow: false },
};

export default function BootstrapSetupPage() {
  return (
    <BootstrapSetup
      clerkConfigured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
      apiBaseUrl={process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? ''}
    />
  );
}
