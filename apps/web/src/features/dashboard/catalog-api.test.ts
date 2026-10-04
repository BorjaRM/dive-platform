import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardApi } from './tenant-context';

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('dashboard catalog API boundary', () => {
  it('reads typed center capabilities through the same-origin BFF (DIVE-IAM-REQ-030..032)', async () => {
    const capabilities = {
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: false,
      canScheduleSession: true,
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(capabilities));
    const api = createDashboardApi({
      baseUrl: '/api/dashboard',
      session: { getToken: async () => 'token' },
    });
    await expect(
      api.getDashboardCapabilities('ctx_private', 'center/alpha'),
    ).resolves.toEqual(capabilities);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/dashboard/v1/centers/center%2Falpha/dashboard-capabilities',
    );
    const init = fetchMock.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).get('X-Tenant-Context')).toBe(
      'ctx_private',
    );
    expect(init?.cache).toBe('no-store');
  });

  it.each([
    null,
    {},
    {
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: 'true',
      canScheduleSession: true,
    },
  ])(
    'rejects malformed capability responses without granting permissions %#',
    async (capabilities) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        jsonResponse(capabilities),
      );
      const api = createDashboardApi({
        baseUrl: '/api/dashboard',
        session: { getToken: async () => 'token' },
      });
      await expect(
        api.getDashboardCapabilities('ctx_private', 'center-a'),
      ).rejects.toThrow('Dashboard permissions are unavailable.');
    },
  );

  it('reads the exact revision and sends it on grouped saves through the BFF', async () => {
    const etag = '"activity-alpha-r9007199254740993"';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'alpha' }), {
          headers: { 'Content-Type': 'application/json', ETag: etag },
        }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 204, headers: { ETag: etag } }),
      );
    const api = createDashboardApi({
      baseUrl: '/api/dashboard',
      session: { getToken: async () => 'token' },
    });
    const detail = await api.getActivity(
      'ctx_alpha',
      'center/alpha',
      'activity/alpha',
    );
    expect(detail.etag).toBe(etag);
    await expect(
      api.updateActivity(
        'ctx_alpha',
        'center/alpha',
        'activity/alpha',
        { group: 'common', values: { defaultCapacity: null } },
        detail.etag,
      ),
    ).resolves.toBe(etag);
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe(
      '/api/dashboard/v1/centers/center%2Falpha/activities/activity%2Falpha',
    );
    expect(new Headers(init?.headers).get('If-Match')).toBe(etag);
    expect(new Headers(init?.headers).get('X-Tenant-Context')).toBe(
      'ctx_alpha',
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      group: 'common',
      values: { defaultCapacity: null },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads and selects explicit center language without additional authority fields (DIVE-BOOK-REQ-009, 050)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ defaultActivityLocale: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createDashboardApi({
      baseUrl: '/api/dashboard',
      session: { getToken: async () => 'session-secret' },
    });
    await expect(
      api.getCatalogSettings('ctx_secret', 'center/alpha'),
    ).resolves.toEqual({ defaultActivityLocale: null });
    await expect(
      api.selectCatalogLanguage('ctx_secret', 'center/alpha', 'en'),
    ).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/dashboard/v1/centers/center%2Falpha/catalog-settings',
    );
    const init = fetchMock.mock.calls[1]?.[1];
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(String(init?.body))).toEqual({
      defaultActivityLocale: 'en',
    });
    expect(new Headers(init?.headers).get('X-Tenant-Context')).toBe(
      'ctx_secret',
    );
  });

  it('builds scoped activity list requests with typed pagination and credentials', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ items: [], page: 2, pageSize: 50, hasNext: true }),
      );
    const api = createDashboardApi({
      baseUrl: '/api/dashboard/',
      session: { getToken: async () => 'session-secret' },
    });

    await expect(
      api.listActivities('ctx_secret', 'center/alpha', {
        page: 2,
        pageSize: 50,
        status: 'Published',
      }),
    ).resolves.toMatchObject({ page: 2, pageSize: 50, hasNext: true });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe(
      '/api/dashboard/v1/centers/center%2Falpha/activities?page=2&pageSize=50&status=Published',
    );
    expect(url).not.toContain('ctx_secret');
    expect(url).not.toContain('session-secret');
    expect(headers.get('Authorization')).toBe('Bearer session-secret');
    expect(headers.get('X-Tenant-Context')).toBe('ctx_secret');
  });

  it('sends only catalog fields and handles successful 204 commands', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: 'activity-alpha',
            status: 'Draft',
            name: { es: 'Buceo' },
            createdAt: '2026-09-27T10:00:00Z',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: 'slot-alpha',
            activityId: 'activity-alpha',
            status: 'Available',
            startsAt: '2026-10-01T10:00:00Z',
            durationMinutes: 60,
            capacity: 8,
            createdAt: '2026-09-27T10:00:00Z',
          },
          201,
        ),
      )
      .mockResolvedValue(new Response(null, { status: 204 }));
    const api = createDashboardApi({
      baseUrl: '/api/dashboard',
      session: { getToken: async () => 'session-secret' },
    });

    await api.createActivity('ctx_secret', 'center-alpha', {
      name: { es: 'Buceo' },
      description: { en: 'Diving' },
      defaultCapacity: 8,
      tenantId: 'tenant-secret',
      centerId: 'center-other',
      status: 'Published',
    } as never);
    await api.createSlot('ctx_secret', 'center-alpha', 'activity-alpha', {
      startsAt: '2026-10-01T10:00:00Z',
      durationMinutes: 60,
      capacity: 8,
      tenantId: 'tenant-secret',
      centerId: 'center-other',
      status: 'Closed',
      end: '2026-10-01T11:00:00Z',
      remainingSeats: 0,
    } as never);
    await expect(
      api.publishActivity('ctx_secret', 'center-alpha', 'activity-alpha'),
    ).resolves.toBeUndefined();
    await expect(
      api.closeSlot('ctx_secret', 'center-alpha', 'slot-alpha'),
    ).resolves.toBeUndefined();
    await expect(
      api.disableActivity('ctx_secret', 'center-alpha', 'activity-alpha'),
    ).resolves.toBeUndefined();
    await expect(
      api.cancelSlot('ctx_secret', 'center-alpha', 'slot-alpha'),
    ).resolves.toBeUndefined();

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      name: { es: 'Buceo' },
      description: { en: 'Diving' },
      defaultCapacity: 8,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      startsAt: '2026-10-01T10:00:00Z',
      durationMinutes: 60,
      capacity: 8,
    });
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('PATCH');
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      '/api/dashboard/v1/centers/center-alpha/activities/activity-alpha/publish',
    );
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      '/api/dashboard/v1/centers/center-alpha/slots/slot-alpha/close',
    );
    expect(fetchMock.mock.calls[4]?.[0]).toBe(
      '/api/dashboard/v1/centers/center-alpha/activities/activity-alpha/disable',
    );
    expect(fetchMock.mock.calls[5]?.[0]).toBe(
      '/api/dashboard/v1/centers/center-alpha/slots/slot-alpha/cancel',
    );
  });

  it('preserves catalog problem code and detail without exposing arbitrary response bodies', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'validation_error',
          detail: 'Invalid pagination bounds',
          secret: 'must not cross the boundary',
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/problem+json' },
        },
      ),
    );
    const api = createDashboardApi({
      baseUrl: '/api/dashboard',
      session: { getToken: async () => 'session-secret' },
    });

    await expect(
      api.listSlots('ctx_secret', 'center-alpha', 'activity-alpha', {
        page: 0,
        pageSize: 20,
        status: 'Available',
        from: '2026-10-01T00:00:00Z',
        to: '2026-10-31T23:59:59Z',
      }),
    ).rejects.toMatchObject({
      status: 422,
      problem: {
        code: 'validation_error',
        detail: 'Invalid pagination bounds',
      },
      message: 'Dashboard request failed',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      '/api/dashboard/v1/centers/center-alpha/activities/activity-alpha/slots?page=0&pageSize=20&status=Available&from=2026-10-01T00%3A00%3A00Z&to=2026-10-31T23%3A59%3A59Z',
    );
  });

  it('propagates caller aborts to the authenticated catalog request', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (_input, init) => {
        return new Promise((_resolve, reject) => {
          const abort = () =>
            reject(new DOMException('The operation was aborted', 'AbortError'));
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener('abort', abort, { once: true });
        });
      });
    const api = createDashboardApi({
      baseUrl: '/api/dashboard',
      session: { getToken: async () => 'session-secret' },
    });
    const controller = new AbortController();
    const request = api.listActivities(
      'ctx_secret',
      'center-alpha',
      {},
      controller.signal,
    );
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
