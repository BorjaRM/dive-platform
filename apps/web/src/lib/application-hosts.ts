export type ApplicationHostConfig = Readonly<{
  authenticationOrigin: string;
  centerAppBaseDomain: string;
  centerAppBaseOrigin?: string;
}>;

export type ApplicationSurface =
  | { kind: 'authentication'; origin: string }
  | { kind: 'center'; origin: string; centerKey: string }
  | { kind: 'unknown' };

const dnsName =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const centerLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function parseCenterBaseOrigin(
  value: string,
  baseDomain: string,
  allowLocalHttp: boolean,
): URL {
  if (!URL.canParse(value)) throw new Error('Invalid CENTER_APP_BASE_ORIGIN');
  const origin = new URL(value);
  const localHttp =
    allowLocalHttp &&
    origin.protocol === 'http:' &&
    origin.hostname.endsWith('.localhost');
  if (
    origin.origin !== value ||
    origin.hostname !== baseDomain ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (!localHttp && (origin.protocol !== 'https:' || origin.port !== ''))
  ) {
    throw new Error('Invalid CENTER_APP_BASE_ORIGIN');
  }
  return origin;
}

export function readApplicationHostConfig(
  environment: Record<string, string | undefined> = process.env,
): ApplicationHostConfig {
  const centerAppBaseDomain = environment.CENTER_APP_BASE_DOMAIN?.trim();
  const authenticationOrigin = environment.AUTHENTICATION_ORIGIN?.trim();
  if (!centerAppBaseDomain || !dnsName.test(centerAppBaseDomain)) {
    throw new Error('Invalid CENTER_APP_BASE_DOMAIN');
  }
  const centerAppBaseOrigin = environment.CENTER_APP_BASE_ORIGIN?.trim();
  if (centerAppBaseOrigin !== undefined) {
    parseCenterBaseOrigin(
      centerAppBaseOrigin,
      centerAppBaseDomain,
      environment.NODE_ENV === 'development',
    );
  }
  if (!authenticationOrigin) throw new Error('Missing AUTHENTICATION_ORIGIN');
  const origin = new URL(authenticationOrigin);
  if (
    origin.origin !== authenticationOrigin ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    (origin.protocol !== 'https:' &&
      !(
        environment.NODE_ENV !== 'production' &&
        origin.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(origin.hostname)
      )) ||
    origin.hostname.endsWith(`.${centerAppBaseDomain}`)
  ) {
    throw new Error('Invalid AUTHENTICATION_ORIGIN');
  }
  return {
    authenticationOrigin,
    centerAppBaseDomain,
    ...(centerAppBaseOrigin ? { centerAppBaseOrigin } : {}),
  };
}

export function classifyApplicationHost(
  host: string | null,
  config: ApplicationHostConfig,
): ApplicationSurface {
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) return { kind: 'unknown' };
  const authentication = new URL(config.authenticationOrigin);
  if (host.toLowerCase() === authentication.host)
    return { kind: 'authentication', origin: authentication.origin };
  const baseOrigin = new URL(
    config.centerAppBaseOrigin ?? `https://${config.centerAppBaseDomain}`,
  );
  if (!URL.canParse(`${baseOrigin.protocol}//${host}`))
    return { kind: 'unknown' };
  const url = new URL(`${baseOrigin.protocol}//${host}`);
  const suffix = `.${config.centerAppBaseDomain}`;
  if (
    host.toLowerCase() !== url.host ||
    url.port !== baseOrigin.port ||
    !url.hostname.endsWith(suffix)
  )
    return { kind: 'unknown' };
  const centerKey = url.hostname.slice(0, -suffix.length);
  if (!centerLabel.test(centerKey)) return { kind: 'unknown' };
  return { kind: 'center', centerKey, origin: url.origin };
}

export function centerDashboardUrl(
  centerKey: string,
  centerAppBaseDomain: string,
  centerAppBaseOrigin = `https://${centerAppBaseDomain}`,
) {
  if (!centerLabel.test(centerKey) || !dnsName.test(centerAppBaseDomain))
    throw new Error('Invalid center application URL');
  const destination = parseCenterBaseOrigin(
    centerAppBaseOrigin,
    centerAppBaseDomain,
    true,
  );
  destination.hostname = `${centerKey}.${centerAppBaseDomain}`;
  destination.pathname = '/dashboard';
  return destination.toString();
}

export async function isActiveCenterOrigin(
  origin: string,
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (!apiBaseUrl)
    throw new CenterOriginUnavailableError(
      new Error('Missing dashboard API URL'),
    );
  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/$/, '')}/v1/me/center-entry-contexts`,
      {
        method: 'OPTIONS',
        cache: 'no-store',
        ...(signal ? { signal } : {}),
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization,content-type',
        },
      },
    );
    if (response.status >= 500 || response.status === 429) {
      throw new CenterOriginUnavailableError(
        new Error(`Origin resolver returned HTTP ${response.status}`),
      );
    }
    return (
      response.ok &&
      response.headers.get('Access-Control-Allow-Origin') === origin
    );
  } catch (error) {
    if (error instanceof CenterOriginUnavailableError) throw error;
    throw new CenterOriginUnavailableError(error);
  }
}

export class CenterOriginUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Center origin verification unavailable', { cause });
    this.name = 'CenterOriginUnavailableError';
  }
}

export async function validatedCenterReturnUrl(
  value: string | undefined,
  config: ApplicationHostConfig,
  apiBaseUrl: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const surface = classifyApplicationHost(url.host, config);
  const invalidQuery =
    Array.from(url.searchParams.entries()).some(
      ([name, parameter]) =>
        name !== '__clerk_synced' || !['false', 'true'].includes(parameter),
    ) || url.searchParams.getAll('__clerk_synced').length > 1;
  if (
    surface.kind !== 'center' ||
    url.origin !== surface.origin ||
    url.username ||
    url.password ||
    invalidQuery ||
    url.hash ||
    url.pathname !== '/dashboard'
  )
    return null;
  return (await isActiveCenterOrigin(url.origin, apiBaseUrl, signal))
    ? url.toString()
    : null;
}
