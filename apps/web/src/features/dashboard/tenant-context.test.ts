import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserTenantContextStorage,
  createDashboardApi,
  createTenantContextStorage,
  DASHBOARD_QUERY_KEYS,
  DashboardApiError,
  TENANT_CONTEXT_STORAGE_KEY,
} from './tenant-context';

class SignalBoundBodyResponse extends Response {
  readonly bodyReadStarted: Promise<void>;
  bodyAborted = false;
  bodyAbortReason: unknown;
  private readonly markBodyReadStarted: () => void;
  private abortBody: (() => void) | undefined;
  private resolveBody: ((value: unknown) => void) | undefined;
  private bodySettled = false;

  constructor(
    private readonly requestSignal: AbortSignal,
    private readonly responseBody: unknown = { operators: [] },
    status = 200,
    contentType = 'application/json',
  ) {
    super(null, {
      status,
      headers: { 'Content-Type': contentType },
    });
    let markBodyReadStarted: (() => void) | undefined;
    this.bodyReadStarted = new Promise((resolve) => {
      markBodyReadStarted = resolve;
    });
    if (markBodyReadStarted === undefined) {
      throw new Error('Failed to create body-read signal');
    }
    this.markBodyReadStarted = markBodyReadStarted;
  }

  override clone(): Response {
    return this;
  }

  override json(): Promise<unknown> {
    this.markBodyReadStarted();
    return new Promise((resolve, reject) => {
      this.resolveBody = resolve;
      this.abortBody = () => {
        if (this.bodySettled) return;
        this.bodySettled = true;
        this.bodyAborted = true;
        this.bodyAbortReason = this.requestSignal.reason;
        reject(this.bodyAbortReason);
      };
      if (this.requestSignal.aborted) this.abortBody();
      else
        this.requestSignal.addEventListener('abort', this.abortBody, {
          once: true,
        });
    });
  }

  releaseBodyForCleanup() {
    if (this.bodySettled) return;
    this.bodySettled = true;
    if (this.abortBody !== undefined) {
      this.requestSignal.removeEventListener('abort', this.abortBody);
    }
    this.resolveBody?.(this.responseBody);
  }
}

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

  it('ignores malformed Problem Details without changing the error classification', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{', {
        status: 401,
        headers: { 'Content-Type': 'application/problem+json' },
      }),
    );
    const api = createDashboardApi({
      baseUrl: 'https://api.example.test',
      session: { getToken: async () => 'session-secret' },
    });

    await expect(api.listOperators()).rejects.toMatchObject({
      kind: 'session-expired',
      problem: undefined,
      status: 401,
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

  it('keeps the configured deadline active while the response body is pending (F8)', async () => {
    vi.useFakeTimers();
    let bodyResponse: SignalBoundBodyResponse | undefined;
    let request: Promise<unknown> | undefined;
    const responseCreated = new Promise<SignalBoundBodyResponse>((resolve) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.signal === undefined || init.signal === null) {
          throw new Error('Expected fetch to receive a signal');
        }
        bodyResponse = new SignalBoundBodyResponse(init.signal);
        resolve(bodyResponse);
        return bodyResponse;
      });
    });

    try {
      const api = createDashboardApi({
        baseUrl: 'https://api.example.test',
        requestTimeoutMillis: 10,
        session: { getToken: async () => 'session-secret' },
      });
      request = api.listOperators();
      const response = await responseCreated;
      await response.bodyReadStarted;
      const guardedRequest = Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'Dashboard request remained pending after its deadline',
                ),
              ),
            20,
          );
        }),
      ]);
      const guardedResult = guardedRequest.catch((reason: unknown) => reason);

      await vi.advanceTimersByTimeAsync(20);

      const error = await guardedResult;
      expect(error).toBeInstanceOf(DashboardApiError);
      expect(error).toMatchObject({ status: 0, kind: 'unavailable' });
      expect(error).toBe(response.bodyAbortReason);
      expect(response.bodyAborted).toBe(true);
    } finally {
      bodyResponse?.releaseBodyForCleanup();
      await request?.catch(() => undefined);
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('keeps caller cancellation attached while the response body is pending (F8)', async () => {
    vi.useFakeTimers();
    let bodyResponse: SignalBoundBodyResponse | undefined;
    let request: Promise<unknown> | undefined;
    const responseCreated = new Promise<SignalBoundBodyResponse>((resolve) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.signal === undefined || init.signal === null) {
          throw new Error('Expected fetch to receive a signal');
        }
        bodyResponse = new SignalBoundBodyResponse(init.signal);
        resolve(bodyResponse);
        return bodyResponse;
      });
    });

    try {
      const api = createDashboardApi({
        baseUrl: 'https://api.example.test',
        session: { getToken: async () => 'session-secret' },
      });
      const caller = new AbortController();
      request = api.listOperators(caller.signal);
      const response = await responseCreated;
      await response.bodyReadStarted;
      const guardedRequest = Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'Dashboard request remained pending after caller abort',
                ),
              ),
            1,
          );
        }),
      ]);
      const guardedResult = guardedRequest.catch((reason: unknown) => reason);
      const abortReason = new DOMException(
        'Caller cancelled dashboard request',
        'AbortError',
      );

      caller.abort(abortReason);
      await vi.advanceTimersByTimeAsync(1);

      const error = await guardedResult;
      expect(error).toBe(abortReason);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(response.bodyAborted).toBe(true);
    } finally {
      bodyResponse?.releaseBodyForCleanup();
      await request?.catch(() => undefined);
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('preserves caller cancellation while a Problem Details body is pending (F8)', async () => {
    vi.useFakeTimers();
    let bodyResponse: SignalBoundBodyResponse | undefined;
    let request: Promise<unknown> | undefined;
    const responseCreated = new Promise<SignalBoundBodyResponse>((resolve) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.signal === undefined || init.signal === null) {
          throw new Error('Expected fetch to receive a signal');
        }
        bodyResponse = new SignalBoundBodyResponse(
          init.signal,
          { code: 'unauthenticated' },
          401,
          'application/problem+json',
        );
        resolve(bodyResponse);
        return bodyResponse;
      });
    });

    try {
      const api = createDashboardApi({
        baseUrl: 'https://api.example.test',
        session: { getToken: async () => 'session-secret' },
      });
      const caller = new AbortController();
      request = api.listOperators(caller.signal);
      const response = await responseCreated;
      await response.bodyReadStarted;
      const guardedRequest = Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'Dashboard request remained pending after caller abort',
                ),
              ),
            1,
          );
        }),
      ]);
      const guardedResult = guardedRequest.catch((reason: unknown) => reason);
      const abortReason = new DOMException(
        'Caller cancelled dashboard request',
        'AbortError',
      );

      caller.abort(abortReason);
      await vi.advanceTimersByTimeAsync(1);

      const error = await guardedResult;
      expect(error).toBe(abortReason);
      expect(response.bodyAborted).toBe(true);
    } finally {
      bodyResponse?.releaseBodyForCleanup();
      await request?.catch(() => undefined);
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('preserves the configured timeout while a Problem Details body is pending (F8)', async () => {
    vi.useFakeTimers();
    let bodyResponse: SignalBoundBodyResponse | undefined;
    let request: Promise<unknown> | undefined;
    const responseCreated = new Promise<SignalBoundBodyResponse>((resolve) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
        if (init?.signal === undefined || init.signal === null) {
          throw new Error('Expected fetch to receive a signal');
        }
        bodyResponse = new SignalBoundBodyResponse(
          init.signal,
          { code: 'unauthenticated' },
          401,
          'application/problem+json',
        );
        resolve(bodyResponse);
        return bodyResponse;
      });
    });

    try {
      const api = createDashboardApi({
        baseUrl: 'https://api.example.test',
        requestTimeoutMillis: 10,
        session: { getToken: async () => 'session-secret' },
      });
      request = api.listOperators();
      const response = await responseCreated;
      await response.bodyReadStarted;
      const guardedRequest = Promise.race([
        request,
        new Promise<never>((_resolve, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  'Dashboard request remained pending after its deadline',
                ),
              ),
            20,
          );
        }),
      ]);
      const guardedResult = guardedRequest.catch((reason: unknown) => reason);

      await vi.advanceTimersByTimeAsync(20);

      const error = await guardedResult;
      expect(error).toBeInstanceOf(DashboardApiError);
      expect(error).toMatchObject({ status: 0, kind: 'unavailable' });
      expect(response.bodyAborted).toBe(true);
    } finally {
      bodyResponse?.releaseBodyForCleanup();
      await request?.catch(() => undefined);
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
