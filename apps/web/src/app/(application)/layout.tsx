import { ClerkProvider } from '@clerk/nextjs';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  applicationRedirectOrigins,
  classifyApplicationHost,
  clerkSatelliteOptions,
  readApplicationHostConfig,
} from '@/lib/application-hosts';
import { dmSans } from '../fonts';
import '../globals.css';

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default async function ApplicationLayout({
  children,
}: {
  children: ReactNode;
}) {
  const requestHeaders = await headers();
  const hostConfig = readApplicationHostConfig();
  const surface = classifyApplicationHost(
    requestHeaders.get('host'),
    hostConfig,
  );
  if (surface.kind === 'unknown') notFound();
  const applicationReturnUrl =
    surface.kind === 'center'
      ? `${surface.origin}/dashboard`
      : (requestHeaders.get('x-dive-platform-return') ??
        requestHeaders.get('x-dive-center-return'));
  const allowedRedirectOrigins = applicationRedirectOrigins(
    hostConfig,
    applicationReturnUrl ?? undefined,
  );
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {clerkPublishableKey ? (
          <ClerkProvider
            publishableKey={clerkPublishableKey}
            signInUrl={`${hostConfig.authenticationOrigin}/sign-in`}
            signInForceRedirectUrl={
              applicationReturnUrl ??
              `${hostConfig.authenticationOrigin}/dashboard`
            }
            allowedRedirectOrigins={allowedRedirectOrigins}
            {...clerkSatelliteOptions(surface, hostConfig)}
          >
            {children}
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
