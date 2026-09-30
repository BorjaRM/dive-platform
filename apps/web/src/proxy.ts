import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { classifyProductHost } from './features/marketing/host-routing';
import type { PublicProductConfig } from './features/marketing/public-config';
import { readPublicProductConfig } from './features/marketing/public-config';

const publicProductPaths = ['/', '/robots.txt', '/sitemap.xml'];

export function proxy(request: NextRequest) {
  if (!publicProductPaths.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

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
  matcher: ['/', '/robots.txt', '/sitemap.xml'],
};
