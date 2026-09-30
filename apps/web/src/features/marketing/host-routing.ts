import type { PublicProductConfig } from './public-config';

export type ProductHostDecision =
  | { kind: 'serve' }
  | { kind: 'redirect'; location: string }
  | { kind: 'not-found' };

export function classifyProductHost(
  requestHost: string,
  config: PublicProductConfig,
): ProductHostDecision {
  const normalizedRequestHost = requestHost.toLowerCase();
  const canonicalHost = config.canonicalOrigin.host.toLowerCase();
  const wwwHost =
    `www.${config.canonicalOrigin.hostname}${config.canonicalOrigin.port ? `:${config.canonicalOrigin.port}` : ''}`.toLowerCase();

  if (normalizedRequestHost === canonicalHost) {
    return { kind: 'serve' };
  }

  if (normalizedRequestHost === wwwHost) {
    return {
      kind: 'redirect',
      location: config.canonicalOrigin.origin,
    };
  }

  return { kind: 'not-found' };
}
