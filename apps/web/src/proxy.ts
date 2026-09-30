import { clerkMiddleware } from '@clerk/nextjs/server';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { dashboardRequestTimeoutFromEnvironment } from './features/dashboard/tenant-context';
import { classifyProductHost } from './features/marketing/host-routing';
import type { PublicProductConfig } from './features/marketing/public-config';
import { readPublicProductConfig } from './features/marketing/public-config';
import {
  CenterOriginUnavailableError,
  classifyApplicationHost,
  isActiveCenterOrigin,
  readApplicationHostConfig,
  validatedCenterReturnUrl,
} from './lib/application-hosts';

const publicProductPaths = ['/', '/robots.txt', '/sitemap.xml'];

export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  try {
    return await routeRequest(request, event);
  } catch (error) {
    if (!(error instanceof CenterOriginUnavailableError)) throw error;
    console.error('Center origin verification unavailable', {
      origin: request.nextUrl.origin,
      cause: error.cause,
    });
    return new NextResponse('Application unavailable', { status: 503 });
  }
}

async function routeRequest(request: NextRequest, event?: NextFetchEvent) {
  const path = request.nextUrl.pathname;
  const isApplicationPath = ['/dashboard', '/bootstrap', '/sign-in'].some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (isApplicationPath || path === '/') {
    let applicationConfig:
      | ReturnType<typeof readApplicationHostConfig>
      | undefined;
    try {
      applicationConfig = readApplicationHostConfig();
    } catch {
      if (isApplicationPath) return new NextResponse(null, { status: 500 });
    }
    if (applicationConfig) {
      const surface = classifyApplicationHost(
        request.nextUrl.host,
        applicationConfig,
      );
      if (surface.kind === 'unknown') {
        if (isApplicationPath) return new NextResponse(null, { status: 404 });
      } else {
        const apiBaseUrl = process.env.NEXT_PUBLIC_DASHBOARD_API_URL ?? '';
        const originCheckSignal = () =>
          AbortSignal.timeout(
            dashboardRequestTimeoutFromEnvironment(
              process.env.NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS,
            ),
          );
        if (request.nextUrl.origin !== surface.origin)
          return new NextResponse(null, { status: 404 });
        if (surface.kind === 'center') {
          if (
            !(await isActiveCenterOrigin(
              surface.origin,
              apiBaseUrl,
              originCheckSignal(),
            ))
          )
            return new NextResponse(null, { status: 404 });
          if (path.startsWith('/bootstrap'))
            return new NextResponse(null, { status: 404 });
          if (path.startsWith('/sign-in')) {
            const signIn = new URL(
              '/sign-in',
              applicationConfig.authenticationOrigin,
            );
            signIn.searchParams.set(
              'redirect_url',
              `${surface.origin}/dashboard`,
            );
            return NextResponse.redirect(signIn);
          }
        }
        if (path === '/')
          return NextResponse.redirect(`${surface.origin}/dashboard`);
        const forwardedHeaders = new Headers(request.headers);
        forwardedHeaders.delete('x-dive-center-return');
        const returnUrl =
          surface.kind === 'authentication' && path.startsWith('/sign-in')
            ? await validatedCenterReturnUrl(
                request.nextUrl.searchParams.get('redirect_url') ?? undefined,
                applicationConfig,
                apiBaseUrl,
                originCheckSignal(),
              )
            : null;
        if (returnUrl) forwardedHeaders.set('x-dive-center-return', returnUrl);
        const next = () =>
          NextResponse.next({ request: { headers: forwardedHeaders } });
        if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return next();
        const response = await clerkMiddleware(next, {
          signInUrl: `${applicationConfig.authenticationOrigin}/sign-in`,
          ...(surface.kind === 'center'
            ? { isSatellite: true, domain: new URL(surface.origin).hostname }
            : {}),
        })(request, event as NextFetchEvent);
        return response || next();
      }
    }
  }
  if (!publicProductPaths.includes(path)) return NextResponse.next();

  let config: PublicProductConfig;
  try {
    config = readPublicProductConfig();
  } catch {
    return new NextResponse(null, { status: 500 });
  }

  const decision = classifyProductHost(request.nextUrl.host, config);

  if (decision.kind === 'serve') {
    return NextResponse.next();
  }

  if (decision.kind === 'redirect') {
    const destination = new URL(request.url);
    destination.protocol = config.canonicalOrigin.protocol;
    destination.host = config.canonicalOrigin.host;
    return NextResponse.redirect(destination, 308);
  }

  return new NextResponse(null, { status: 404 });
}

export const config = {
  matcher: [
    '/',
    '/robots.txt',
    '/sitemap.xml',
    '/dashboard/:path*',
    '/bootstrap/:path*',
    '/sign-in/:path*',
  ],
};
