import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PlatformInvitations } from '@/features/platform/platform-invitations';
import {
  classifyApplicationHost,
  readApplicationHostConfig,
} from '@/lib/application-hosts';

export const metadata: Metadata = {
  title: 'Bootstrap invitations | BlueCurrent',
  robots: { index: false, follow: false },
};

export default async function PlatformInvitationsPage() {
  const config = readApplicationHostConfig();
  const surface = classifyApplicationHost(
    (await headers()).get('host'),
    config,
  );
  if (surface.kind !== 'authentication') notFound();
  return (
    <PlatformInvitations
      clerkConfigured={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)}
      returnUrl={`${config.authenticationOrigin}/platform/invitations`}
      requestTimeoutMillis={Number(process.env.BFF_REQUEST_TIMEOUT_MS)}
    />
  );
}
