import { createCatalogApi } from './catalog-api';

export const TENANT_CONTEXT_STORAGE_KEY = 'dive.dashboard.tenant-context';

export const DASHBOARD_QUERY_KEYS = {
  root: ['dashboard'] as const,
  operators: ['dashboard', 'operators'] as const,
  centers: ['dashboard', 'centers'] as const,
};

export type Operator = {
  operatorRef: string;
  displayName: string;
};

export type Center = {
  id: string;
  name: string;
};

export type SessionTokenSource = {
  configured?: boolean;
  getToken: (signal?: AbortSignal) => Promise<string | null>;
  logout?: () => Promise<void>;
};

export type TenantContextStorage = {
  read: () => string | null;
  write: (handle: string) => void;
  clear: () => void;
};

export function createTenantContextStorage(
  storage: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>,
): TenantContextStorage {
  return {
    read: () => storage.getItem(TENANT_CONTEXT_STORAGE_KEY),
    write: (handle) => storage.setItem(TENANT_CONTEXT_STORAGE_KEY, handle),
    clear: () => storage.removeItem(TENANT_CONTEXT_STORAGE_KEY),
  };
}

export function createBrowserTenantContextStorage(): TenantContextStorage {
  return createTenantContextStorage(window.sessionStorage);
}

export type DashboardApiErrorKind =
  | 'session-expired'
  | 'forbidden'
  | 'unavailable'
  | 'unknown';

export type DashboardProblemDetails = Readonly<{
  code?: string;
  detail?: string;
}>;

export class DashboardApiError extends Error {
  constructor(
    readonly status: number,
    readonly kind: DashboardApiErrorKind,
    readonly problem?: DashboardProblemDetails,
  ) {
    super('Dashboard request failed');
    this.name = 'DashboardApiError';
  }
}

type DashboardApiOptions = {
  baseUrl: string;
  session: SessionTokenSource;
  requestTimeoutMillis?: number | undefined;
};

export function dashboardRequestTimeoutFromEnvironment(
  value: string | undefined,
) {
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error('Invalid NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS');
  }
  return timeout;
}

export type DashboardRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  context?: string;
  body?: unknown;
  signal?: AbortSignal | undefined;
};

export type DashboardRequest = <Value>(
  path: string,
  options?: DashboardRequestOptions,
) => Promise<Value>;

async function readDashboardProblemDetails(
  response: Response,
  signal: AbortSignal,
) {
  if (
    !response.headers
      .get('content-type')
      ?.toLowerCase()
      .includes('application/problem+json')
  ) {
    return undefined;
  }
  try {
    const body: unknown = await response.clone().json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return undefined;
    }
    const problem = body as Record<string, unknown>;
    return {
      ...(typeof problem.code === 'string' ? { code: problem.code } : {}),
      ...(typeof problem.detail === 'string' ? { detail: problem.detail } : {}),
    } satisfies DashboardProblemDetails;
  } catch {
    if (signal.aborted) throw signal.reason;
    return undefined;
  }
}

export function createDashboardApi({
  baseUrl,
  session,
  requestTimeoutMillis,
}: DashboardApiOptions) {
  if (
    requestTimeoutMillis !== undefined &&
    (!Number.isSafeInteger(requestTimeoutMillis) || requestTimeoutMillis <= 0)
  ) {
    throw new Error('Invalid dashboard request timeout');
  }

  async function request<T>(
    path: string,
    options: DashboardRequestOptions = {},
  ) {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abortFromCaller, { once: true });
    if (options.signal?.aborted) abortFromCaller();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline =
      requestTimeoutMillis === undefined
        ? undefined
        : new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              const error = new DashboardApiError(0, 'unavailable');
              reject(error);
              controller.abort(error);
            }, requestTimeoutMillis);
          });
    const signal = controller.signal;
    const cleanup = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abortFromCaller);
    };

    const bounded = <Value>(operation: Promise<Value>) =>
      deadline === undefined ? operation : Promise.race([operation, deadline]);

    let token: string | null;
    try {
      token = await bounded(session.getToken(signal));
    } catch (error) {
      cleanup();
      if (error instanceof DashboardApiError) throw error;
      if (options.signal?.aborted) throw error;
      throw new DashboardApiError(401, 'session-expired');
    }
    if (!token) {
      cleanup();
      throw new DashboardApiError(401, 'session-expired');
    }

    const headers = new Headers({
      Authorization: `Bearer ${token}`,
    });
    if (options.context) headers.set('X-Tenant-Context', options.context);
    if (options.body !== undefined)
      headers.set('Content-Type', 'application/json');

    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      cache: 'no-store',
    };
    if (options.body !== undefined)
      requestInit.body = JSON.stringify(options.body);

    try {
      const response = await bounded(
        fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
          ...requestInit,
          signal,
        }),
      );

      if (!response.ok) {
        const kind =
          response.status === 401
            ? 'session-expired'
            : response.status === 403
              ? 'forbidden'
              : response.status >= 500
                ? 'unavailable'
                : 'unknown';
        throw new DashboardApiError(
          response.status,
          kind,
          await bounded(readDashboardProblemDetails(response, signal)),
        );
      }

      if (response.status === 204) return undefined as T;
      return (await bounded(response.json())) as T;
    } finally {
      cleanup();
    }
  }

  return {
    listOperators: (signal?: AbortSignal) =>
      request<{ operators: Operator[] }>('/v1/me/operators', { signal }),
    issueTenantContext: (operatorRef?: string) =>
      request<{ tenantContext: string }>('/v1/me/tenant-contexts', {
        method: 'POST',
        body: operatorRef === undefined ? {} : { operatorRef },
      }),
    issueCenterEntryContext: (centerRef: string, signal?: AbortSignal) =>
      request<{ tenantContext: string; center: { centerId: string } }>(
        '/v1/me/center-entry-contexts',
        {
          method: 'POST',
          body: { centerRef },
          signal,
        },
      ),
    getCenter: (context: string, centerId: string, signal?: AbortSignal) =>
      request<Center>(`/v1/centers/${encodeURIComponent(centerId)}`, {
        context,
        signal,
      }),
    revokeTenantContext: (context: string) =>
      request<void>('/v1/me/tenant-contexts', {
        method: 'DELETE',
        context,
      }),
    listCenters: (context: string, signal?: AbortSignal) =>
      request<Center[]>('/v1/centers', { context, signal }),
    ...createCatalogApi({ request }),
  };
}

export type DashboardApi = ReturnType<typeof createDashboardApi>;
