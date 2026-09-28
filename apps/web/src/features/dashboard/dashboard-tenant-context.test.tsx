import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDashboardContext } from './dashboard-context';
import { DashboardTenantContext } from './dashboard-tenant-context';
import {
  createTenantContextStorage,
  DASHBOARD_QUERY_KEYS,
  type SessionTokenSource,
} from './tenant-context';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderDashboard(
  session: SessionTokenSource,
  storage = createTenantContextStorage(memoryStorage()),
  requestTimeoutMillis?: number,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardTenantContext
        apiBaseUrl="https://api.example.test"
        requestTimeoutMillis={requestTimeoutMillis}
        session={session}
        storage={storage}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

function renderDashboardWithoutInjectedStorage(session: SessionTokenSource) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DashboardTenantContext
        apiBaseUrl="https://api.example.test"
        session={session}
      />
    </QueryClientProvider>,
  );
  return queryClient;
}

function DashboardContextProbe() {
  const {
    apiBaseUrl,
    authorizedCenters,
    invalidateDashboardCache,
    isReady,
    sessionState,
    tenantContext,
  } = useDashboardContext();

  return (
    <div>
      <output data-testid="dashboard-context-value">
        {JSON.stringify({
          apiBaseUrl,
          authorizedCenters,
          isReady,
          sessionState,
          tenantContext,
        })}
      </output>
      <button type="button" onClick={invalidateDashboardCache}>
        Invalidate dashboard cache
      </button>
    </div>
  );
}

describe('authenticated dashboard tenant-context flow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('loads operators, issues a selected context, and sends both credentials to data requests (DIVE-IAM-REQ-030..031)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/me/operators')) {
          return jsonResponse({
            operators: [
              { operatorRef: 'op_alpha', displayName: 'Alpha Divers' },
              { operatorRef: 'op_beta', displayName: 'Beta Divers' },
            ],
          });
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'POST') {
          return jsonResponse({ tenantContext: 'ctx_alpha' });
        }
        if (url.endsWith('/v1/centers')) {
          return jsonResponse([{ id: 'center-alpha', name: 'Harbor Base' }]);
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });
    const session: SessionTokenSource = {
      configured: true,
      getToken: async () => 'session-alpha',
    };

    renderDashboard(session);

    expect(await screen.findByText('Alpha Divers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Alpha Divers/i }));

    expect(await screen.findByText('Harbor Base')).toBeInTheDocument();
    const issueCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith('/v1/me/tenant-contexts') &&
        (init?.method ?? 'GET') === 'POST',
    );
    expect(issueCall).toBeDefined();
    expect(JSON.parse(String(issueCall?.[1]?.body))).toEqual({
      operatorRef: 'op_alpha',
    });
    const centersCall = fetchMock.mock.calls.find(([input]) =>
      String(input).endsWith('/v1/centers'),
    );
    expect(centersCall).toBeDefined();
    const centersHeaders = new Headers(centersCall?.[1]?.headers);
    expect(centersHeaders.get('Authorization')).toBe('Bearer session-alpha');
    expect(centersHeaders.get('X-Tenant-Context')).toBe('ctx_alpha');
    expect(String(centersCall?.[0])).not.toContain('session-alpha');
    expect(String(centersCall?.[0])).not.toContain('ctx_alpha');

    fetchMock.mockRestore();
  });

  it('does not leave the initial session probe pending past its deadline', async () => {
    const session: SessionTokenSource = {
      configured: true,
      getToken: (signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new Error('aborted')),
            { once: true },
          );
        }),
    };

    renderDashboard(session, undefined, 10);

    expect(
      await screen.findByText('Sign-in is managed by the host application'),
    ).toBeInTheDocument();
  });

  it('revokes the active context before switching and removes the previous cache (DIVE-IAM-REQ-022, ADR-DIVE-009)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_alpha');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/centers')) {
          const context = new Headers(init?.headers).get('X-Tenant-Context');
          return jsonResponse(
            context === 'ctx_alpha'
              ? [{ id: 'center-alpha', name: 'Alpha Base' }]
              : [{ id: 'center-beta', name: 'Beta Base' }],
          );
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        if (url.endsWith('/v1/me/operators')) {
          return jsonResponse({
            operators: [
              { operatorRef: 'op_alpha', displayName: 'Alpha Divers' },
              { operatorRef: 'op_beta', displayName: 'Beta Divers' },
            ],
          });
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'POST') {
          return jsonResponse({ tenantContext: 'ctx_beta' });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });
    const queryClient = renderDashboard(
      { configured: true, getToken: async () => 'session-switch' },
      storage,
    );

    expect(await screen.findByText('Alpha Base')).toBeInTheDocument();
    queryClient.setQueryData(DASHBOARD_QUERY_KEYS.centers, [
      { id: 'old-center', name: 'Old Tenant Data' },
    ]);
    queryClient.setQueryData(['dashboard', 'catalog', 'activities'], {
      items: [{ id: 'old-activity' }],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change workspace' }));
    expect(await screen.findByText('Beta Divers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Beta Divers/i }));
    expect(await screen.findByText('Beta Base')).toBeInTheDocument();
    expect(screen.queryByText('Old Tenant Data')).not.toBeInTheDocument();
    expect(
      queryClient.getQueryData(['dashboard', 'catalog', 'activities']),
    ).toBeUndefined();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBe(
      'ctx_beta',
    );
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input).endsWith('/v1/me/tenant-contexts') &&
          (init?.method ?? 'GET') === 'DELETE',
      ),
    ).toBe(true);

    fetchMock.mockRestore();
  });

  it('automatically issues a context for the only active operator (DIVE-IAM-REQ-031)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/me/operators')) {
          return jsonResponse({
            operators: [
              { operatorRef: 'op_only', displayName: 'Only Operator' },
            ],
          });
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'POST') {
          return jsonResponse({ tenantContext: 'ctx_only' });
        }
        if (url.endsWith('/v1/centers')) {
          return jsonResponse([{ id: 'center-only', name: 'Single Base' }]);
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });

    renderDashboard({ configured: true, getToken: async () => 'session-only' });

    expect(await screen.findByText('Single Base')).toBeInTheDocument();
    const issueCalls = fetchMock.mock.calls.filter(
      ([input, init]) =>
        String(input).endsWith('/v1/me/tenant-contexts') &&
        (init?.method ?? 'GET') === 'POST',
    );
    expect(issueCalls).toHaveLength(1);
    expect(JSON.parse(String(issueCalls[0]?.[1]?.body))).toEqual({});

    fetchMock.mockRestore();
  });

  it('shows a cleanup warning when workspace revocation fails', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_alpha');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/centers')) {
          return jsonResponse([{ id: 'center-alpha', name: 'Alpha Base' }]);
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'DELETE') {
          return new Response('cleanup unavailable', { status: 500 });
        }
        if (url.endsWith('/v1/me/operators')) {
          return jsonResponse({
            operators: [
              { operatorRef: 'op_alpha', displayName: 'Alpha Divers' },
              { operatorRef: 'op_beta', displayName: 'Beta Divers' },
            ],
          });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });

    renderDashboard(
      { configured: true, getToken: async () => 'session-alpha' },
      storage,
    );

    expect(await screen.findByText('Alpha Base')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change workspace' }));
    expect(
      await screen.findByText('Previous workspace cleanup needs attention'),
    ).toBeInTheDocument();
    expect(await screen.findByText('Alpha Divers')).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it('reports host logout cleanup failure after clearing local context (DIVE-IAM-REQ-022)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_alpha');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/centers')) {
          return jsonResponse([{ id: 'center-alpha', name: 'Alpha Base' }]);
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'DELETE') {
          return new Response('cleanup unavailable', { status: 500 });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });

    renderDashboard(
      {
        configured: true,
        getToken: async () => 'session-alpha',
        logout: vi.fn().mockRejectedValue(new Error('host logout failed')),
      },
      storage,
    );

    expect(await screen.findByText('Alpha Base')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(
      await screen.findByRole('heading', {
        level: 2,
        name: 'Dashboard context cleared',
      }),
    ).toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();

    fetchMock.mockRestore();
  });

  it('recovers when automatic context issuance reports session expiry (DIVE-IAM-REQ-022)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/me/operators')) {
          return jsonResponse({
            operators: [
              { operatorRef: 'op_only', displayName: 'Only Operator' },
            ],
          });
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'POST') {
          return new Response('expired', { status: 401 });
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });

    renderDashboard({ configured: true, getToken: async () => 'session-only' });

    expect(
      await screen.findByText('Your session is no longer available'),
    ).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it('removes cached dashboard data when the operator context changes and on logout (DIVE-IAM-REQ-022, ADR-DIVE-009)', async () => {
    const rawStorage = memoryStorage();
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        if (url.endsWith('/v1/me/operators')) {
          return jsonResponse({
            operators: [
              { operatorRef: 'op_alpha', displayName: 'Alpha Divers' },
              { operatorRef: 'op_beta', displayName: 'Beta Divers' },
            ],
          });
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'POST') {
          return jsonResponse({ tenantContext: 'ctx_beta' });
        }
        if (url.endsWith('/v1/me/tenant-contexts') && method === 'DELETE') {
          return new Response(null, { status: 204 });
        }
        if (url.endsWith('/v1/centers')) {
          return jsonResponse([{ id: 'center-beta', name: 'Beta Base' }]);
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      });
    const queryClient = renderDashboard(
      { configured: true, getToken: async () => 'session-beta' },
      storage,
    );
    queryClient.setQueryData(DASHBOARD_QUERY_KEYS.centers, [
      { id: 'old-center', name: 'Old Tenant Data' },
    ]);

    expect(await screen.findByText('Alpha Divers')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Beta Divers/i }));
    expect(await screen.findByText('Beta Base')).toBeInTheDocument();
    expect(screen.queryByText('Old Tenant Data')).not.toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBe(
      'ctx_beta',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(
      await screen.findByText('You are signed out of this dashboard'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        queryClient.getQueryData(DASHBOARD_QUERY_KEYS.centers),
      ).toBeUndefined();
    });
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();

    fetchMock.mockRestore();
  });

  it('preserves a forbidden context until the user chooses operator recovery (DIVE-IAM-REQ-030..031)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_revoked');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/v1/centers')) {
          return new Response('membership missing in another tenant', {
            status: 403,
          });
        }
        return jsonResponse({
          operators: [
            { operatorRef: 'op_alpha', displayName: 'Alpha Divers' },
            { operatorRef: 'op_beta', displayName: 'Beta Divers' },
          ],
        });
      });

    const queryClient = renderDashboard(
      { configured: true, getToken: async () => 'session-revoked' },
      storage,
    );
    queryClient.setQueryData(DASHBOARD_QUERY_KEYS.centers, [
      { id: 'old-center', name: 'Old Tenant Data' },
    ]);

    expect(
      await screen.findByText('Access to this workspace was denied'),
    ).toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBe(
      'ctx_revoked',
    );
    await waitFor(() => {
      expect(
        queryClient.getQueryData(DASHBOARD_QUERY_KEYS.centers),
      ).toBeUndefined();
    });
    expect(
      screen.queryByText('membership missing in another tenant'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Choose operator' }));
    await waitFor(() => {
      expect(screen.getByText('Alpha Divers')).toBeInTheDocument();
    });
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();

    fetchMock.mockRestore();
  });

  it('renders a recoverable session-expired state when the provider has no token (DIVE-IAM-REQ-022)', async () => {
    renderDashboard({ configured: true, getToken: async () => null });

    expect(
      await screen.findByText('Your session is no longer available'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Check session again' }),
    ).toBeInTheDocument();
  });

  it('renders a recoverable session-expired state when the token source rejects (DIVE-IAM-REQ-022)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_rejected');
    const storage = createTenantContextStorage(rawStorage);

    renderDashboard(
      {
        configured: true,
        getToken: async () => {
          throw new Error('session provider unavailable');
        },
      },
      storage,
    );

    expect(
      await screen.findByText('Your session is no longer available'),
    ).toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();
  });

  it('clears the context when the token source rejects during a data request (DIVE-IAM-REQ-022)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_request_rejected');
    const storage = createTenantContextStorage(rawStorage);
    let tokenCalls = 0;

    renderDashboard(
      {
        configured: true,
        getToken: async () => {
          tokenCalls += 1;
          if (tokenCalls === 1) return 'session-request';
          throw new Error('session provider unavailable');
        },
      },
      storage,
    );

    expect(
      await screen.findByText('Your session is no longer available'),
    ).toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();
  });

  it('clears the persisted context when a request reports session expiry (DIVE-IAM-REQ-022)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_expiring');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('expired', { status: 401 }));

    renderDashboard(
      { configured: true, getToken: async () => 'session-expiring' },
      storage,
    );

    expect(
      await screen.findByText('Your session is no longer available'),
    ).toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();

    fetchMock.mockRestore();
  });

  it('renders the explicit configuration and unavailable-session states', async () => {
    const configuredQueryClient = new QueryClient();
    render(
      <QueryClientProvider client={configuredQueryClient}>
        <DashboardTenantContext
          session={{ configured: true, getToken: async () => 'session' }}
        />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Authentication seam required' }),
    ).toBeInTheDocument();
    cleanup();

    const unavailableQueryClient = new QueryClient();
    render(
      <QueryClientProvider client={unavailableQueryClient}>
        <DashboardTenantContext
          apiBaseUrl="https://api.example.test"
          session={{ configured: false, getToken: async () => null }}
        />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('Sign-in is managed by the host application'),
    ).toBeInTheDocument();
  });

  it('retries an expired session and resumes operator loading (DIVE-IAM-REQ-022)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        if (
          String(input).endsWith('/v1/me/tenant-contexts') &&
          init?.method === 'POST'
        ) {
          return jsonResponse({ tenantContext: 'ctx_recovered' });
        }
        return jsonResponse({
          operators: [
            { operatorRef: 'op_recovered', displayName: 'Recovered Operator' },
            { operatorRef: 'op_other', displayName: 'Other Operator' },
          ],
        });
      });
    let tokenCalls = 0;
    const session: SessionTokenSource = {
      configured: true,
      getToken: async () => {
        tokenCalls += 1;
        return tokenCalls === 1 ? null : 'session-recovered';
      },
    };

    renderDashboard(session);

    expect(
      await screen.findByText('Your session is no longer available'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check session again' }),
    );

    expect(await screen.findByText('Recovered Operator')).toBeInTheDocument();
    expect(tokenCalls).toBe(3);
    fetchMock.mockRestore();
  });

  it('clears context and cache when the session source changes (DIVE-IAM-REQ-022)', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_first');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.endsWith('/v1/centers')) {
          return jsonResponse([{ id: 'center-first', name: 'First Base' }]);
        }
        return jsonResponse({
          operators: [
            { operatorRef: 'op_second', displayName: 'Second Operator' },
            { operatorRef: 'op_other', displayName: 'Other Operator' },
          ],
        });
      });
    const firstSession: SessionTokenSource = {
      configured: true,
      getToken: async () => 'session-first',
    };
    const secondSession: SessionTokenSource = {
      configured: true,
      getToken: async () => 'session-second',
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rendered = render(
      <QueryClientProvider client={queryClient}>
        <DashboardTenantContext
          apiBaseUrl="https://api.example.test"
          session={firstSession}
          storage={storage}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('First Base')).toBeInTheDocument();
    queryClient.setQueryData(DASHBOARD_QUERY_KEYS.centers, [
      { id: 'stale-center', name: 'Stale First Tenant Data' },
    ]);
    rendered.rerender(
      <QueryClientProvider client={queryClient}>
        <DashboardTenantContext
          apiBaseUrl="https://api.example.test"
          session={secondSession}
          storage={storage}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Second Operator')).toBeInTheDocument();
    expect(
      screen.queryByText('Stale First Tenant Data'),
    ).not.toBeInTheDocument();
    expect(rawStorage.getItem('dive.dashboard.tenant-context')).toBeNull();
    fetchMock.mockRestore();
  });

  it('reports unknown operator and center failures without exposing response details', async () => {
    const operatorsFetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('internal details', { status: 500 }));

    renderDashboard({ configured: true, getToken: async () => 'session' });

    expect(
      await screen.findByText('Operators could not be loaded'),
    ).toBeInTheDocument();
    expect(screen.queryByText('internal details')).not.toBeInTheDocument();
    operatorsFetchMock.mockRestore();
    cleanup();

    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_unknown');
    const centersFetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('internal center details', { status: 500 }),
      );

    renderDashboard(
      { configured: true, getToken: async () => 'session' },
      createTenantContextStorage(rawStorage),
    );

    expect(
      await screen.findByText('Centers could not be loaded'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('internal center details'),
    ).not.toBeInTheDocument();
    centersFetchMock.mockRestore();
  });

  it('uses browser sessionStorage when no storage adapter is injected', async () => {
    window.sessionStorage.setItem(
      'dive.dashboard.tenant-context',
      'ctx_browser_component',
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () =>
        jsonResponse([{ id: 'center-browser', name: 'Browser Base' }]),
      );

    renderDashboardWithoutInjectedStorage({
      configured: true,
      getToken: async () => 'session-browser',
    });

    expect(await screen.findByText('Browser Base')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(
      await screen.findByText('You are signed out of this dashboard'),
    ).toBeInTheDocument();
    expect(
      window.sessionStorage.getItem('dive.dashboard.tenant-context'),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it('exposes the authenticated boundary to descendant screens and clears all dashboard cache', async () => {
    const rawStorage = memoryStorage();
    rawStorage.setItem('dive.dashboard.tenant-context', 'ctx_alpha');
    const storage = createTenantContextStorage(rawStorage);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse([{ id: 'center-alpha', name: 'Harbor Base' }]),
      );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <DashboardTenantContext
          apiBaseUrl="https://api.example.test"
          session={{ configured: true, getToken: async () => 'session-alpha' }}
          storage={storage}
        >
          <DashboardContextProbe />
        </DashboardTenantContext>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Harbor Base')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-context-value')).toHaveTextContent(
      JSON.stringify({
        apiBaseUrl: 'https://api.example.test',
        authorizedCenters: [{ id: 'center-alpha', name: 'Harbor Base' }],
        isReady: true,
        sessionState: 'available',
        tenantContext: 'ctx_alpha',
      }),
    );
    queryClient.setQueryData(['dashboard', 'catalog', 'activities'], {
      items: [{ id: 'activity-alpha' }],
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Invalidate dashboard cache' }),
    );
    await waitFor(() => {
      expect(
        queryClient.getQueryData(['dashboard', 'catalog', 'activities']),
      ).toBeUndefined();
    });

    fetchMock.mockRestore();
  });
});
