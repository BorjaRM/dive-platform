export const TENANT_CONTEXT_STORAGE_KEY = 'dive.dashboard.tenant-context';

export const DASHBOARD_QUERY_KEYS = {
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
  getToken: () => Promise<string | null>;
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

export type DashboardApiErrorKind = 'session-expired' | 'forbidden' | 'unknown';

export class DashboardApiError extends Error {
  constructor(
    readonly status: number,
    readonly kind: DashboardApiErrorKind,
  ) {
    super('Dashboard request failed');
    this.name = 'DashboardApiError';
  }
}

type DashboardApiOptions = {
  baseUrl: string;
  session: SessionTokenSource;
};

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  context?: string;
  body?: unknown;
};

export function createDashboardApi({ baseUrl, session }: DashboardApiOptions) {
  async function request<T>(path: string, options: RequestOptions = {}) {
    let token: string | null;
    try {
      token = await session.getToken();
    } catch {
      throw new DashboardApiError(401, 'session-expired');
    }
    if (!token) throw new DashboardApiError(401, 'session-expired');

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

    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}${path}`,
      requestInit,
    );

    if (!response.ok) {
      const kind =
        response.status === 401
          ? 'session-expired'
          : response.status === 403
            ? 'forbidden'
            : 'unknown';
      throw new DashboardApiError(response.status, kind);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return {
    listOperators: () => request<{ operators: Operator[] }>('/v1/me/operators'),
    issueTenantContext: (operatorRef?: string) =>
      request<{ tenantContext: string }>('/v1/me/tenant-contexts', {
        method: 'POST',
        body: operatorRef === undefined ? {} : { operatorRef },
      }),
    revokeTenantContext: (context: string) =>
      request<void>('/v1/me/tenant-contexts', {
        method: 'DELETE',
        context,
      }),
    listCenters: (context: string) =>
      request<Center[]>('/v1/centers', { context }),
  };
}
