import type { Metadata } from 'next';
import { BootstrapSetup } from '@/features/bootstrap/bootstrap-setup';
import { readApplicationHostConfig } from '@/lib/application-hosts';

export const metadata: Metadata = {
  title: 'Set up your operation | BlueCurrent',
  robots: { index: false, follow: false },
};

export default function BootstrapSetupPage() {
  const hostConfig = readApplicationHostConfig();
  return (
    <BootstrapSetup
      clerkConfigured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
      apiBaseUrl={process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? ''}
      centerAppBaseDomain={hostConfig.centerAppBaseDomain}
      centerAppBaseOrigin={hostConfig.centerAppBaseOrigin}
    />
  );
}
