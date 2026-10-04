import 'server-only';
import {
  classifyApplicationHost,
  readApplicationHostConfig,
} from './application-hosts';
import { parseBootstrapInvitationState } from './bootstrap-invitation-state';

type Environment = Readonly<Record<string, string | undefined>>;
type BffDependencies = Readonly<{
  environment?: Environment;
  fetch?: typeof fetch;
}>;

const uuid =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const center = `/v1/centers/${uuid}`;
const operations = [
  { method: 'GET', path: /^\/v1\/me\/operators$/, scope: 'identity' },
  { method: 'POST', path: /^\/v1\/me\/tenant-contexts$/, scope: 'identity' },
  { method: 'DELETE', path: /^\/v1\/me\/tenant-contexts$/, scope: 'identity' },
  { method: 'POST', path: /^\/v1\/me\/tenant-bootstrap$/, scope: 'identity' },
  {
    method: 'POST',
    path: /^\/v1\/me\/center-entry-contexts$/,
    scope: 'bootstrap',
  },
  { method: 'GET', path: /^\/v1\/centers$/, scope: 'center' },
  { method: 'GET', path: new RegExp(`^${center}$`), scope: 'center' },
  {
    method: 'GET',
    path: new RegExp(`^${center}/dashboard-capabilities$`),
    scope: 'center',
    body: 'none',
  },
  {
    method: 'PATCH',
    path: new RegExp(`^${center}/entry-status$`),
    scope: 'center',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/catalog-settings$`),
    scope: 'center',
  },
  {
    method: 'PUT',
    path: new RegExp(`^${center}/catalog-settings$`),
    scope: 'center',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/activities$`),
    scope: 'center',
    query: ['page', 'pageSize', 'status'],
  },
  {
    method: 'POST',
    path: new RegExp(`^${center}/activities$`),
    scope: 'center',
  },
  {
    method: 'PATCH',
    path: new RegExp(`^${center}/activities/${uuid}/(?:publish|disable)$`),
    scope: 'center',
    body: 'none',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/activities/${uuid}$`),
    scope: 'center',
  },
  {
    method: 'PUT',
    path: new RegExp(`^${center}/activities/${uuid}$`),
    scope: 'center',
  },
  {
    method: 'PATCH',
    path: new RegExp(`^${center}/channels/${uuid}$`),
    scope: 'center',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/activities/${uuid}/slots$`),
    scope: 'center',
    query: ['page', 'pageSize', 'status', 'from', 'to'],
  },
  {
    method: 'POST',
    path: new RegExp(`^${center}/activities/${uuid}/slots$`),
    scope: 'center',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/calendar/slots$`),
    scope: 'center',
    query: ['from', 'to', 'activityId', 'slotStatus', 'page', 'pageSize'],
    cacheControl: 'private, no-store',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/slots/${uuid}/bookings$`),
    scope: 'center',
    query: ['bookingStatus', 'page', 'pageSize'],
    cacheControl: 'private, no-store',
  },
  {
    method: 'GET',
    path: new RegExp(`^${center}/bookings/${uuid}/contact$`),
    scope: 'center',
    cacheControl: 'private, no-store',
  },
  {
    method: 'PATCH',
    path: new RegExp(`^${center}/slots/${uuid}/(?:close|cancel)$`),
    scope: 'center',
    body: 'none',
  },
] as const;

type Operation = Readonly<{
  method: string;
  path: RegExp;
  scope: 'identity' | 'bootstrap' | 'center' | 'platform';
  query?: readonly string[];
  body?: 'none';
  cacheControl?: 'private, no-store';
}>;

const platformInvitationOperations: readonly Operation[] = [
  {
    method: 'POST',
    path: /^\/v1\/platform\/bootstrap-invitations$/,
    scope: 'platform',
  },
  {
    method: 'GET',
    path: new RegExp(`^/v1/platform/bootstrap-invitations/${uuid}$`),
    scope: 'platform',
  },
  {
    method: 'POST',
    path: new RegExp(
      `^/v1/platform/bootstrap-invitations/${uuid}/(?:reissue|revoke)$`,
    ),
    scope: 'platform',
  },
];

function problem(status: number, code: string): Response {
  return Response.json(
    { status, code, title: code },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/problem+json',
      },
    },
  );
}

function bodyLimit(value: string | undefined, defaultBytes: number): number {
  const bytes = value === undefined ? defaultBytes : Number(value);
  if (!Number.isSafeInteger(bytes) || bytes <= 0)
    throw new Error('Invalid BFF body limit');
  return bytes;
}

function configuration(environment: Environment) {
  const upstream = environment.BFF_API_ORIGIN;
  const credential = environment.BFF_SERVICE_CREDENTIAL;
  const timeoutMillis = Number(environment.BFF_REQUEST_TIMEOUT_MS);
  if (
    !upstream ||
    !credential ||
    !Number.isSafeInteger(timeoutMillis) ||
    timeoutMillis <= 0 ||
    timeoutMillis > 2_147_483_647
  ) {
    throw new Error('Invalid BFF configuration');
  }
  const url = new URL(upstream);
  const localHttp =
    environment.NODE_ENV !== 'production' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.origin !== upstream ||
    url.username ||
    url.password ||
    (url.protocol !== 'https:' && !localHttp)
  ) {
    throw new Error('Invalid BFF configuration');
  }
  const match = credential.match(/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/);
  if (!match || match[0] !== credential || !match[2])
    throw new Error('Invalid BFF configuration');
  const secret = Buffer.from(match[2], 'base64url');
  if (secret.length !== 32 || secret.toString('base64url') !== match[2])
    throw new Error('Invalid BFF configuration');
  return {
    upstream,
    credential,
    timeoutMillis,
    requestMaxBytes: bodyLimit(
      environment.BFF_MAX_REQUEST_BODY_BYTES,
      1_048_576,
    ),
    responseMaxBytes: bodyLimit(
      environment.BFF_MAX_RESPONSE_BODY_BYTES,
      8_388_608,
    ),
    hosts: readApplicationHostConfig({ ...environment }),
  };
}

class BodyLimitError extends Error {
  constructor(readonly source: 'request' | 'upstream') {
    super('BFF body limit exceeded');
  }
}

async function readLimitedText(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  signal: AbortSignal,
  source: 'request' | 'upstream',
): Promise<string> {
  if (body === null) return '';
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const fragments: string[] = [];
  let bytesRead = 0;
  const cancel = (reason: unknown) => {
    void reader.cancel(reason).catch(() => undefined);
  };
  const abortReading = () => cancel(signal.reason);
  signal.addEventListener('abort', abortReading, { once: true });
  if (signal.aborted) abortReading();
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (value.byteLength === 0) continue;
      bytesRead += value.byteLength;
      if (bytesRead > maximumBytes) throw new BodyLimitError(source);
      fragments.push(decoder.decode(value, { stream: true }));
    }
    fragments.push(decoder.decode());
    return fragments.join('');
  } catch (error) {
    if (!signal.aborted) cancel(error);
    throw error;
  } finally {
    signal.removeEventListener('abort', abortReading);
    reader.releaseLock();
  }
}

function containsServiceCredential(
  value: unknown,
  credential: string,
): boolean {
  const secret = credential.split('.')[1] ?? credential;
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current === 'string') {
      if (current.includes(credential) || current.includes(secret)) return true;
    } else if (Array.isArray(current)) {
      for (const entry of current) pending.push(entry);
    } else if (current !== null && typeof current === 'object') {
      for (const [key, entry] of Object.entries(current)) {
        if (key.includes(credential) || key.includes(secret)) return true;
        pending.push(entry);
      }
    }
  }
  return false;
}

export async function handleDashboardBff(
  request: Request,
  pathSegments: readonly string[],
  dependencies: BffDependencies = {},
): Promise<Response> {
  return handleBff(request, pathSegments, dependencies, operations);
}

export async function handlePlatformInvitationBff(
  request: Request,
  pathSegments: readonly string[],
  dependencies: BffDependencies = {},
): Promise<Response> {
  return handleBff(
    request,
    pathSegments,
    dependencies,
    platformInvitationOperations,
  );
}

async function handleBff(
  request: Request,
  pathSegments: readonly string[],
  dependencies: BffDependencies,
  allowedOperations: readonly Operation[],
): Promise<Response> {
  if (request.signal.aborted) throw request.signal.reason;
  const path = `/${pathSegments.join('/')}`;
  if (
    pathSegments.some((segment) => !segment || /[^A-Za-z0-9_-]/.test(segment))
  )
    return problem(404, 'resource_not_found');
  const operation = allowedOperations.find(
    (candidate) =>
      candidate.method === request.method && candidate.path.test(path),
  );
  if (!operation) return problem(404, 'resource_not_found');

  let config: ReturnType<typeof configuration>;
  try {
    config = configuration(dependencies.environment ?? process.env);
  } catch {
    return problem(503, 'bff_configuration_unavailable');
  }

  const url = new URL(request.url);
  const host = request.headers.get('host');
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (
    request.headers.has('forwarded') ||
    (forwardedHost !== null && forwardedHost !== host)
  )
    return problem(403, 'permission_denied');
  const surface = classifyApplicationHost(host, config.hosts);
  if (surface.kind === 'unknown') return problem(403, 'permission_denied');
  if (operation.scope === 'platform' && surface.kind !== 'authentication')
    return problem(403, 'permission_denied');
  if (
    (operation.scope === 'center' || operation.scope === 'bootstrap') &&
    surface.kind !== 'center'
  )
    return problem(403, 'permission_denied');
  const isMutation = request.method !== 'GET';
  const origin = request.headers.get('origin');
  if (isMutation && origin !== surface.origin)
    return problem(403, 'permission_denied');

  const allowedQuery = operation.query ?? [];
  for (const name of url.searchParams.keys()) {
    if (
      !allowedQuery.includes(name) ||
      url.searchParams.getAll(name).length !== 1
    )
      return problem(400, 'validation_error');
  }
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [^\s,]+$/.test(authorization))
    return problem(401, 'unauthenticated');
  const headers = new Headers({ Authorization: authorization });
  if (
    request.method === 'PUT' &&
    new RegExp(`^${center}/activities/${uuid}$`).test(path)
  ) {
    const ifMatch = request.headers.get('if-match');
    if (ifMatch !== null) headers.set('If-Match', ifMatch);
  }
  const handle = request.headers.get('x-tenant-context');
  if (operation.scope === 'center' && !handle)
    return problem(403, 'permission_denied');
  if (handle && operation.scope !== 'platform')
    headers.set('X-Tenant-Context', handle);
  if (operation.scope === 'platform' && isMutation) {
    const key = request.headers.get('idempotency-key')?.trim();
    if (!key) return problem(422, 'validation_error');
    headers.set('Idempotency-Key', key);
  }
  if (operation.scope !== 'identity' && surface.kind === 'center') {
    headers.set('X-BFF-Service-Credential', config.credential);
    headers.set('X-BFF-Center-Origin', surface.origin);
  }
  if (isMutation && origin) headers.set('Origin', origin);

  const controller = new AbortController();
  let rejectDeadline: (reason: unknown) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const abortFromCaller = () => {
    controller.abort(request.signal.reason);
    rejectDeadline(request.signal.reason);
  };
  request.signal.addEventListener('abort', abortFromCaller, { once: true });
  if (request.signal.aborted) abortFromCaller();
  const timeout = setTimeout(() => {
    const error = new Error('BFF upstream deadline');
    controller.abort(error);
    rejectDeadline(error);
  }, config.timeoutMillis);
  const bounded = <Value>(pending: Promise<Value>) =>
    Promise.race([pending, deadline]);

  try {
    let body: string | undefined;
    if (
      operation.body === 'none' &&
      (
        await bounded(
          readLimitedText(
            request.body,
            config.requestMaxBytes,
            controller.signal,
            'request',
          ),
        )
      ).length > 0
    )
      return problem(400, 'validation_error');
    if (
      isMutation &&
      request.method !== 'DELETE' &&
      operation.body !== 'none'
    ) {
      if (
        request.headers.get('content-type')?.split(';')[0]?.trim() !==
        'application/json'
      )
        return problem(415, 'validation_error');
      body = await bounded(
        readLimitedText(
          request.body,
          config.requestMaxBytes,
          controller.signal,
          'request',
        ),
      );
      let input: unknown;
      try {
        input = JSON.parse(body);
      } catch {
        return problem(400, 'malformed_json');
      }
      if (operation.scope === 'bootstrap') {
        if (
          surface.kind !== 'center' ||
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          Object.keys(input).length !== 1 ||
          (input as { centerRef?: unknown }).centerRef !== surface.centerKey
        )
          return problem(403, 'permission_denied');
      }
      headers.set('Content-Type', 'application/json');
    }
    const upstreamResponse = await bounded(
      (dependencies.fetch ?? fetch)(`${config.upstream}${path}${url.search}`, {
        method: request.method,
        headers,
        ...(body !== undefined ? { body } : {}),
        signal: controller.signal,
        cache: 'no-store',
        redirect: 'manual',
      }),
    );
    if (upstreamResponse.status >= 300 && upstreamResponse.status < 400) {
      controller.abort(new Error('BFF upstream redirect rejected'));
      await bounded(upstreamResponse.body?.cancel() ?? Promise.resolve()).catch(
        () => undefined,
      );
      return problem(502, 'bff_upstream_unavailable');
    }
    const responseBody =
      upstreamResponse.status === 204
        ? null
        : await bounded(
            readLimitedText(
              upstreamResponse.body,
              config.responseMaxBytes,
              controller.signal,
              'upstream',
            ),
          );
    if (containsServiceCredential(responseBody, config.credential))
      return problem(502, 'bff_upstream_unavailable');
    let payload: unknown;
    if (responseBody) {
      try {
        payload = JSON.parse(responseBody);
      } catch {
        return problem(502, 'bff_upstream_unavailable');
      }
    }
    if (containsServiceCredential(payload, config.credential))
      return problem(502, 'bff_upstream_unavailable');
    if (
      upstreamResponse.status === 401 &&
      payload &&
      typeof payload === 'object' &&
      (payload as { code?: unknown }).code ===
        'bff_service_authentication_failed'
    )
      return problem(502, 'bff_service_unavailable');
    const responseHeaders = new Headers({
      'Cache-Control': operation.cacheControl ?? 'no-store',
    });
    const mediaType = upstreamResponse.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim()
      .toLowerCase();
    if (
      responseBody &&
      (mediaType === 'application/json' ||
        mediaType === 'application/problem+json')
    )
      responseHeaders.set('Content-Type', mediaType);
    for (const name of ['retry-after', 'x-correlation-id', 'etag']) {
      const value = upstreamResponse.headers.get(name);
      if (
        value &&
        !value.includes(config.credential) &&
        !value.includes(config.credential.split('.')[1] ?? config.credential)
      )
        responseHeaders.set(name, value);
    }
    if (operation.scope === 'platform') {
      if (upstreamResponse.ok) {
        const state = parseBootstrapInvitationState(payload);
        if (!state) return problem(502, 'bff_upstream_unavailable');
        return Response.json(state, {
          status: upstreamResponse.status,
          headers: responseHeaders,
        });
      }
      const safeCodes = [
        'unauthenticated',
        'permission_denied',
        'invitation_unavailable',
        'idempotency_conflict',
        'validation_error',
        'rate_limited',
        'feature_unavailable',
      ];
      const upstreamCode =
        payload && typeof payload === 'object'
          ? (payload as { code?: unknown }).code
          : null;
      const code =
        safeCodes.find((candidate) => candidate === upstreamCode) ??
        'invitation_request_failed';
      return Response.json(
        { status: upstreamResponse.status, code, title: code },
        {
          status: upstreamResponse.status,
          headers: responseHeaders,
        },
      );
    }
    return new Response(responseBody, {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (request.signal.aborted) throw request.signal.reason;
    if (error instanceof BodyLimitError) {
      controller.abort(error);
      if (error.source === 'request')
        return problem(413, 'request_body_too_large');
      return problem(502, 'bff_upstream_unavailable');
    }
    return problem(503, 'bff_upstream_unavailable');
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener('abort', abortFromCaller);
  }
}
