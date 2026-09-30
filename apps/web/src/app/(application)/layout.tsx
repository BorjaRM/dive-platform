import { ClerkProvider } from '@clerk/nextjs';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  classifyApplicationHost,
  readApplicationHostConfig,
} from '@/lib/application-hosts';
import { geistMono, geistSans } from '../fonts';
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
  const centerReturnUrl =
    surface.kind === 'center'
      ? `${surface.origin}/dashboard`
      : requestHeaders.get('x-dive-center-return');
  const allowedRedirectOrigins = [hostConfig.authenticationOrigin];
  if (centerReturnUrl)
    allowedRedirectOrigins.push(new URL(centerReturnUrl).origin);
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {clerkPublishableKey ? (
          <ClerkProvider
            publishableKey={clerkPublishableKey}
            signInUrl={`${hostConfig.authenticationOrigin}/sign-in`}
            signInForceRedirectUrl={
              centerReturnUrl ?? `${hostConfig.authenticationOrigin}/dashboard`
            }
            allowedRedirectOrigins={allowedRedirectOrigins}
            {...(surface.kind === 'center'
              ? {
                  isSatellite: true,
                  domain: new URL(surface.origin).hostname,
                  satelliteAutoSync: true,
                }
              : {})}
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
