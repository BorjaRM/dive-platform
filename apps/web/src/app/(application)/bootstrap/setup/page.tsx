import type { Metadata } from 'next';
import { BootstrapSetup } from '../../../../features/bootstrap/bootstrap-setup';
import { readApplicationHostConfig } from '../../../../lib/application-hosts';

export const metadata: Metadata = {
  title: 'Set up your operation | BlueCurrent',
  robots: { index: false, follow: false },
};

export default function BootstrapSetupPage() {
  const hostConfig = readApplicationHostConfig();
  return (
    <BootstrapSetup
      clerkConfigured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
      apiBaseUrl="/api/dashboard"
      centerAppBaseDomain={hostConfig.centerAppBaseDomain}
      centerAppBaseOrigin={hostConfig.centerAppBaseOrigin}
      timeZones={Intl.supportedValuesOf('timeZone')}
    />
  );
}
