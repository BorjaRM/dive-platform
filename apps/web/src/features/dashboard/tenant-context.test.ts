import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserTenantContextStorage,
  createDashboardApi,
  createTenantContextStorage,
  DASHBOARD_QUERY_KEYS,
  TENANT_CONTEXT_STORAGE_KEY,
} from './tenant-context';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('dashboard tenant-context boundary', () => {
  it('persists the opaque handle only through the session storage contract (DIVE-IAM-REQ-030)', () => {
    const storage = memoryStorage();
    const contextStorage = createTenantContextStorage(storage);

    contextStorage.write('ctx_opaque');

    expect(storage.getItem(TENANT_CONTEXT_STORAGE_KEY)).toBe('ctx_opaque');
    expect(contextStorage.read()).toBe('ctx_opaque');
    contextStorage.clear();
    expect(contextStorage.read()).toBeNull();
  });

  it('uses browser sessionStorage and never localStorage for the handle (ADR-DIVE-008)', () => {
    window.sessionStorage.removeItem(TENANT_CONTEXT_STORAGE_KEY);
    window.localStorage.removeItem(TENANT_CONTEXT_STORAGE_KEY);
    const contextStorage = createBrowserTenantContextStorage();

    contextStorage.write('ctx_browser');

    expect(window.sessionStorage.getItem(TENANT_CONTEXT_STORAGE_KEY)).toBe(
      'ctx_browser',
    );
    expect(window.localStorage.getItem(TENANT_CONTEXT_STORAGE_KEY)).toBeNull();
    contextStorage.clear();
  });

  it('sends the bearer token and context handle without putting secrets in the URL (DIVE-IAM-REQ-029..030)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'center-a', name: 'Harbor' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const api = createDashboardApi({
      baseUrl: 'https://api.example.test/',
      session: { getToken: async () => 'session-secret' },
    });

    await api.listCenters('ctx_secret');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(url).toBe('https://api.example.test/v1/centers');
    expect(url).not.toContain('session-secret');
    expect(url).not.toContain('ctx_secret');
    expect(headers.get('Authorization')).toBe('Bearer session-secret');
    expect(headers.get('X-Tenant-Context')).toBe('ctx_secret');
    expect(DASHBOARD_QUERY_KEYS.centers).not.toContain('ctx_secret');

    fetchMock.mockRestore();
  });

  it('classifies session and forbidden failures without exposing the response body (DIVE-IAM-REQ-024)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response('sensitive server detail', { status: 401 }),
      )
      .mockResolvedValueOnce(
        new Response('sensitive server detail', { status: 403 }),
      );
    const api = createDashboardApi({
      baseUrl: 'https://api.example.test',
      session: { getToken: async () => 'session-secret' },
    });

    await expect(api.listOperators()).rejects.toMatchObject({
      kind: 'session-expired',
      status: 401,
      message: 'Dashboard request failed',
    });
    await expect(api.listCenters('ctx_secret')).rejects.toMatchObject({
      kind: 'forbidden',
      status: 403,
      message: 'Dashboard request failed',
    });

    fetchMock.mockRestore();
  });

  it('aborts and classifies a request that exceeds its configured deadline', async () => {
    let aborted = false;
    const api = createDashboardApi({
      baseUrl: 'https://api.example.test',
      requestTimeoutMillis: 10,
      session: {
        getToken: (signal) =>
          new Promise((_resolve, reject) => {
            signal?.addEventListener(
              'abort',
              () => {
                aborted = true;
                reject(new Error('aborted'));
              },
              { once: true },
            );
          }),
      },
    });

    await expect(api.listOperators()).rejects.toMatchObject({
      kind: 'unavailable',
      status: 0,
    });
    expect(aborted).toBe(true);
  });
});
