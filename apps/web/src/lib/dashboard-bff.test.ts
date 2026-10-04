import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  handleDashboardBff,
  handlePlatformInvitationBff,
} from './dashboard-bff';

const centerId = 'aaaaaaaa-0001-4001-8001-000000000001';
const origin = 'https://alpha.app.example.test';
const credential = `test.${Buffer.alloc(32, 7).toString('base64url')}`;
const environment = {
  NODE_ENV: 'test',
  AUTHENTICATION_ORIGIN: 'https://auth.example.test',
  CENTER_APP_BASE_DOMAIN: 'app.example.test',
  BFF_API_ORIGIN: 'https://api.example.test',
  BFF_SERVICE_CREDENTIAL: credential,
  BFF_REQUEST_TIMEOUT_MS: '1000',
};

function incoming(
  path = `/v1/centers/${centerId}`,
  options: RequestInit & { duplex?: 'half' } = {},
) {
  return new Request(`${origin}/api/dashboard${path}`, {
    ...options,
    headers: {
      host: new URL(origin).host,
      authorization: 'Bearer user-token',
      'x-tenant-context': 'ctx_handle',
      ...Object.fromEntries(new Headers(options.headers)),
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe('calendar read BFF inventory (DIVE-BOOK-REQ-043; DIVE-IAM-REQ-030..032)', () => {
  const resourceId = 'bbbbbbbb-0002-4002-8002-000000000001';
  const reads = [
    [
      `/v1/centers/${centerId}/calendar/slots`,
      '?from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z&slotStatus=Closed&page=1&pageSize=20',
    ],
    [
      `/v1/centers/${centerId}/slots/${resourceId}/bookings`,
      '?bookingStatus=Pending&page=2&pageSize=20',
    ],
    [`/v1/centers/${centerId}/bookings/${resourceId}/contact`, ''],
  ] as const;

  it.each(reads)(
    'forwards the enumerated read %s using trusted center credentials',
    async (path, query) => {
      const upstream = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ items: [] }));
      const response = await handleDashboardBff(
        incoming(`${path}${query}`),
        path.slice(1).split('/'),
        { environment, fetch: upstream },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(String(upstream.mock.calls[0]?.[0])).toBe(
        `${environment.BFF_API_ORIGIN}${path}${query}`,
      );
      const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
      expect(headers.get('x-bff-service-credential')).toBe(credential);
      expect(headers.get('x-bff-center-origin')).toBe(origin);
      expect(headers.get('x-tenant-context')).toBe('ctx_handle');
    },
  );

  it.each(reads)(
    'rejects arbitrary queries, repeated pagination, missing context and unsupported methods for %s',
    async (path) => {
      const upstream = vi.fn<typeof fetch>();
      for (const input of [
        incoming(`${path}?email=private%40example.test`),
        incoming(`${path}?page=1&page=2`),
        incoming(path, { headers: { 'x-tenant-context': '' } }),
        incoming(path, { method: 'POST', headers: { origin } }),
        incoming(path, { headers: { host: 'auth.example.test' } }),
      ]) {
        const response = await handleDashboardBff(
          input,
          path.slice(1).split('/'),
          { environment, fetch: upstream },
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
      expect(upstream).not.toHaveBeenCalled();
    },
  );
});

describe('dashboard capabilities BFF transport (DIVE-IAM-REQ-030..032)', () => {
  const path = ['v1', 'centers', centerId, 'dashboard-capabilities'];

  it('forwards only trusted service scope and does not cache the permission projection', async () => {
    const capabilities = {
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: false,
      canScheduleSession: false,
    };
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(capabilities));
    const response = await handleDashboardBff(
      incoming(`/${path.join('/')}`, {
        headers: {
          'x-bff-service-credential': 'forged',
          'x-bff-center-origin': 'https://other.app.example.test',
        },
      }),
      path,
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(capabilities);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get('x-bff-service-credential')).toBe(credential);
    expect(headers.get('x-bff-center-origin')).toBe(origin);
    expect(headers.get('x-tenant-context')).toBe('ctx_handle');
    expect(upstream.mock.calls[0]?.[1]?.cache).toBe('no-store');
  });

  it('rejects missing context, unsupported methods and caller-selected capability queries', async () => {
    const upstream = vi.fn<typeof fetch>();
    for (const request of [
      incoming(`/${path.join('/')}`, { headers: { 'x-tenant-context': '' } }),
      incoming(`/${path.join('/')}`, { method: 'POST', headers: { origin } }),
      incoming(`/${path.join('/')}?canCreateActivity=true`),
    ]) {
      const response = await handleDashboardBff(request, path, {
        environment,
        fetch: upstream,
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('BFF body resource limits', () => {
  const path = ['v1', 'centers', centerId, 'activities'];
  const mutation = {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
  };

  it('accepts the generous default request and response boundaries', async () => {
    const requestBody = JSON.stringify({ value: 'x'.repeat(1_048_576 - 12) });
    const responseBody = JSON.stringify({ value: 'x'.repeat(8_388_608 - 12) });
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(responseBody, {
        headers: { 'content-type': 'application/json' },
      }),
    );
    const response = await handleDashboardBff(
      incoming(`/${path.join('/')}`, { ...mutation, body: requestBody }),
      path,
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(200);
    expect(upstream.mock.calls[0]?.[1]?.body).toBe(requestBody);
    expect(await response.text()).toBe(responseBody);
  });

  it('rejects a request one byte beyond the default without calling upstream', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming(`/${path.join('/')}`, {
        ...mutation,
        body: JSON.stringify({ value: 'x'.repeat(1_048_576 - 11) }),
      }),
      path,
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: 'request_body_too_large',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects a response one byte beyond the default and aborts upstream', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ value: 'x'.repeat(8_388_608 - 11) })),
      );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'bff_upstream_unavailable',
    });
    expect(upstream.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(upstream).toHaveBeenCalledOnce();
  });

  it('preserves UTF-8 split between fragments exactly at configured byte limits', async () => {
    const payload = JSON.stringify({ value: 'é' });
    const encoded = new TextEncoder().encode(payload);
    const stream = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoded.subarray(0, 11));
          controller.enqueue(encoded.subarray(11));
          controller.close();
        },
      });
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream()));
    const request = incoming(`/${path.join('/')}`, {
      ...mutation,
      body: stream(),
      duplex: 'half',
    });
    expect(request.headers.has('content-length')).toBe(false);
    const response = await handleDashboardBff(request, path, {
      environment: {
        ...environment,
        BFF_MAX_REQUEST_BODY_BYTES: String(encoded.byteLength),
        BFF_MAX_RESPONSE_BODY_BYTES: String(encoded.byteLength),
      },
      fetch: upstream,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(payload);
    expect(upstream.mock.calls[0]?.[1]?.body).toBe(payload);
  });

  it('cancels an oversized fragmented request despite a misleading Content-Length', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('Cancellation failed'));
    const bytes = new TextEncoder().encode(JSON.stringify({ value: 'é' }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 11));
        controller.enqueue(bytes.subarray(11));
      },
      cancel,
    });
    const upstream = vi.fn<typeof fetch>();
    const request = incoming(`/${path.join('/')}`, {
      ...mutation,
      headers: { ...mutation.headers, 'content-length': '1' },
      body,
      duplex: 'half',
    });
    const response = await handleDashboardBff(request, path, {
      environment: {
        ...environment,
        BFF_MAX_REQUEST_BODY_BYTES: String(bytes.byteLength - 1),
      },
      fetch: upstream,
    });
    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('cancels an oversized fragmented response without Content-Length', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('Cancellation failed'));
    const bytes = new TextEncoder().encode(JSON.stringify({ value: 'é' }));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.subarray(0, 11));
        controller.enqueue(bytes.subarray(11));
      },
      cancel,
    });
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body));
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      {
        environment: {
          ...environment,
          BFF_MAX_RESPONSE_BODY_BYTES: String(bytes.byteLength - 1),
        },
        fetch: upstream,
      },
    );
    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(upstream.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('cancels a pending response read on deadline even when cancellation never settles', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => undefined));
    const body = new ReadableStream<Uint8Array>({ cancel });
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(body));
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      {
        environment: { ...environment, BFF_REQUEST_TIMEOUT_MS: '5' },
        fetch: upstream,
      },
    );
    expect(response.status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
    expect(upstream.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(body.locked).toBe(false);
  });

  it('cancels a pending request read when the caller aborts without starting upstream work', async () => {
    const controller = new AbortController();
    const reason = new Error('Caller cancelled body read');
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start() {
        setTimeout(() => controller.abort(reason), 0);
      },
      cancel,
    });
    const upstream = vi.fn<typeof fetch>();
    await expect(
      handleDashboardBff(
        incoming(`/${path.join('/')}`, {
          ...mutation,
          body,
          duplex: 'half',
          signal: controller.signal,
        }),
        path,
        { environment, fetch: upstream },
      ),
    ).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('applies the same request and response limits to platform invitations', async () => {
    const authOrigin = environment.AUTHENTICATION_ORIGIN;
    const platformPath = ['v1', 'platform', 'bootstrap-invitations'];
    const request = new Request(`${authOrigin}/api/platform/invitations`, {
      method: 'POST',
      headers: {
        host: new URL(authOrigin).host,
        origin: authOrigin,
        authorization: 'Bearer platform-token',
        'content-type': 'application/json',
        'idempotency-key': 'issue-1',
      },
      body: JSON.stringify({
        destinationEmail: 'owner@example.test',
        reason: 'Onboarding',
      }),
    });
    const upstream = vi.fn<typeof fetch>();
    const denied = await handlePlatformInvitationBff(request, platformPath, {
      environment: { ...environment, BFF_MAX_REQUEST_BODY_BYTES: '1' },
      fetch: upstream,
    });
    expect(denied.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
    const payload = JSON.stringify({
      invitationId: centerId,
      status: 'issued',
      deliveryStatus: 'pending',
    });
    for (const [limit, status] of [
      [payload.length, 200],
      [payload.length - 1, 502],
    ]) {
      upstream.mockResolvedValueOnce(new Response(payload));
      const response = await handlePlatformInvitationBff(
        new Request(`${authOrigin}/api/platform/invitations/${centerId}`, {
          headers: {
            host: new URL(authOrigin).host,
            authorization: 'Bearer platform-token',
          },
        }),
        [...platformPath, centerId],
        {
          environment: {
            ...environment,
            BFF_MAX_RESPONSE_BODY_BYTES: String(limit),
          },
          fetch: upstream,
        },
      );
      expect(response.status).toBe(status);
    }
  });

  it.each(['BFF_MAX_REQUEST_BODY_BYTES', 'BFF_MAX_RESPONSE_BODY_BYTES'])(
    'rejects invalid %s configuration before upstream execution',
    async (setting) => {
      for (const value of ['', '0', '-1', '1.5', 'NaN', '9007199254740992']) {
        const upstream = vi.fn<typeof fetch>();
        const response = await handleDashboardBff(
          incoming(),
          ['v1', 'centers', centerId],
          {
            environment: { ...environment, [setting]: value },
            fetch: upstream,
          },
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          code: 'bff_configuration_unavailable',
        });
        expect(upstream).not.toHaveBeenCalled();
      }
    },
  );
});

describe('activity editing BFF transport', () => {
  const activityId = 'bbbbbbbb-0001-4001-8001-000000000001';
  const path = ['v1', 'centers', centerId, 'activities', activityId];
  const etag = `"activity-${activityId}-r9007199254740993"`;

  it('admits scoped detail and forwards the exact revision for grouped PUT', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ id: activityId }, { headers: { ETag: etag } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 204, headers: { ETag: etag } }),
      );
    const detail = await handleDashboardBff(
      incoming(`/${path.join('/')}`),
      path,
      { environment, fetch: upstream },
    );
    expect(detail.status).toBe(200);
    expect(detail.headers.get('etag')).toBe(etag);
    const saved = await handleDashboardBff(
      incoming(`/${path.join('/')}`, {
        method: 'PUT',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          'If-Match': etag,
        },
        body: JSON.stringify({
          group: 'common',
          values: { defaultCapacity: null },
        }),
      }),
      path,
      { environment, fetch: upstream },
    );
    expect(saved.status).toBe(204);
    expect(saved.headers.get('etag')).toBe(etag);
    const headers = new Headers(upstream.mock.calls[1]?.[1]?.headers);
    expect(headers.get('if-match')).toBe(etag);
    expect(headers.get('x-tenant-context')).toBe('ctx_handle');
    expect(headers.get('x-bff-center-origin')).toBe(origin);
  });

  it('rejects editing without center context or with an unrelated origin', async () => {
    const upstream = vi.fn<typeof fetch>();
    for (const headers of [
      { Origin: origin, 'x-tenant-context': '' },
      {
        Origin: 'https://other.app.example.test',
        'x-tenant-context': 'ctx_handle',
      },
    ]) {
      const response = await handleDashboardBff(
        incoming(`/${path.join('/')}`, {
          method: 'PUT',
          headers,
          body: '{}',
        }),
        path,
        { environment, fetch: upstream },
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('DIVE-ONB-REQ-005,039,040 platform invitation transport', () => {
  const path = ['v1', 'platform', 'bootstrap-invitations'];
  const authOrigin = environment.AUTHENTICATION_ORIGIN;

  function issue(headers: Record<string, string> = {}) {
    return new Request(`${authOrigin}/api/platform/invitations`, {
      method: 'POST',
      headers: {
        host: new URL(authOrigin).host,
        origin: authOrigin,
        authorization: 'Bearer operator-token',
        'content-type': 'application/json',
        'idempotency-key': 'operation-1',
        ...headers,
      },
      body: JSON.stringify({
        destinationEmail: 'owner@example.test',
        reason: 'Onboarding',
      }),
    });
  }

  it('forwards only identity, original Origin and idempotency, without tenant or service authority', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          invitationId: centerId,
          status: 'issued',
          deliveryStatus: 'pending',
        },
        { status: 201 },
      ),
    );
    const response = await handlePlatformInvitationBff(
      issue({
        cookie: 'session=private',
        'x-tenant-context': 'spoofed',
        'x-bff-service-credential': 'spoofed',
        'x-bff-center-origin': origin,
      }),
      path,
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(201);
    expect(upstream.mock.calls[0]?.[0]).toBe(
      'https://api.example.test/v1/platform/bootstrap-invitations',
    );
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer operator-token');
    expect(headers.get('origin')).toBe(authOrigin);
    expect(headers.get('idempotency-key')).toBe('operation-1');
    for (const name of [
      'cookie',
      'x-tenant-context',
      'x-bff-service-credential',
      'x-bff-center-origin',
    ])
      expect(headers.has(name)).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    [{ host: new URL(origin).host }, 403],
    [{ host: 'unknown.example.test' }, 403],
    [{ origin: 'https://evil.example.test' }, 403],
    [{ origin: '' }, 403],
    [{ authorization: '' }, 401],
    [{ authorization: 'Basic cookie' }, 401],
    [{ 'idempotency-key': '' }, 422],
    [{ 'x-forwarded-host': 'evil.example.test' }, 403],
  ])('rejects invalid platform admission %#', async (headers, expected) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handlePlatformInvitationBff(issue(headers), path, {
      environment,
      fetch: upstream,
    });
    expect(response.status).toBe(expected);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('reads by UUID without Origin or a tenant handle', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        invitationId: centerId,
        status: 'issued',
        deliveryStatus: 'pending',
        ticket: 'private-ticket',
        url: 'https://private.test',
      }),
    );
    const response = await handlePlatformInvitationBff(
      new Request(`${authOrigin}/api/platform/invitations/${centerId}`, {
        headers: {
          host: new URL(authOrigin).host,
          authorization: 'Bearer operator-token',
        },
      }),
      [...path, centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      invitationId: centerId,
      status: 'issued',
      deliveryStatus: 'pending',
    });
  });

  it('sanitizes errors while preserving Retry-After', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { code: 'rate_limited', detail: 'private-ticket' },
          { status: 429, headers: { 'Retry-After': '30' } },
        ),
      );
    const response = await handlePlatformInvitationBff(issue(), path, {
      environment,
      fetch: upstream,
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(await response.text()).not.toContain('private-ticket');
  });

  it('rejects invalid success state without exposing credentials', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ticket: 'private-ticket' }));
    const response = await handlePlatformInvitationBff(issue(), path, {
      environment,
      fetch: upstream,
    });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('private-ticket');
  });

  it.each([
    ['GET', []],
    ['GET', ['invalid']],
    ['POST', [centerId, 'reissue']],
    ['POST', [centerId, 'revoke']],
    ['DELETE', [centerId]],
    ['HEAD', [centerId]],
  ])('rejects nonenumerated operation %s %#', async (method, suffix) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handlePlatformInvitationBff(
      new Request(`${authOrigin}/api/platform/invitations`, { method }),
      [...path, ...suffix],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('DIVE-IAM-REQ-030..032 dashboard BFF transport', () => {
  it.each([
    `activities/${centerId}/publish`,
    `activities/${centerId}/disable`,
    `slots/${centerId}/close`,
    `slots/${centerId}/cancel`,
  ])('forwards bodyless command %s without requiring JSON', async (command) => {
    const path = `/v1/centers/${centerId}/${command}`;
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const response = await handleDashboardBff(
      incoming(path, { method: 'PATCH', headers: { origin } }),
      path.slice(1).split('/'),
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(204);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(
      new Headers(upstream.mock.calls[0]?.[1]?.headers).has('content-type'),
    ).toBe(false);
  });

  it('rejects a body on a bodyless command before upstream execution', async () => {
    const path = `/v1/centers/${centerId}/slots/${centerId}/close`;
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming(path, {
        method: 'PATCH',
        headers: { origin, 'content-type': 'application/json' },
        body: '{}',
      }),
      path.slice(1).split('/'),
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['nested-value', 'object-key', 'raw-secret'])(
    'suppresses JSON-escaped credentials in %s',
    async (placement) => {
      const value =
        placement === 'raw-secret' ? credential.split('.')[1] : credential;
      const payload =
        placement === 'object-key'
          ? { [credential]: 'private' }
          : { detail: [{ secret: value }] };
      const escaped = JSON.stringify(payload).replace(
        /[A-Za-z0-9_.-]/g,
        (character) =>
          `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
      );
      expect(escaped).not.toContain(credential);
      const upstream = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(escaped, {
          headers: { 'content-type': 'application/json' },
        }),
      );
      const response = await handleDashboardBff(
        incoming(),
        ['v1', 'centers', centerId],
        { environment, fetch: upstream },
      );
      expect(response.status).toBe(502);
      expect(await response.text()).not.toContain(credential);
    },
  );

  it('cancels the body and aborts upstream when rejecting a redirect', async () => {
    const cancel = vi.fn();
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(new ReadableStream({ cancel }), { status: 302 }),
      );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('preserves a safe redirect rejection when stream cancellation fails', async () => {
    const cancel = vi
      .fn()
      .mockRejectedValue(new Error('Upstream cancellation failed'));
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(new ReadableStream({ cancel }), { status: 307 }),
      );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'bff_upstream_unavailable',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects a deadline outside the Node timer range before upstream execution', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      {
        environment: { ...environment, BFF_REQUEST_TIMEOUT_MS: '2147483648' },
        fetch: upstream,
      },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'bff_configuration_unavailable',
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('builds only server-owned headers and never forwards caller credentials or cookies', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: centerId }));
    const response = await handleDashboardBff(
      incoming(undefined, {
        headers: {
          'x-bff-service-credential': 'attacker',
          'x-bff-center-origin': 'https://bravo.app.example.test',
          cookie: 'session=private',
        },
      }),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(200);
    const firstCall = upstream.mock.calls[0];
    if (!firstCall) throw new Error('Expected upstream request');
    const [url, init] = firstCall;
    expect(url).toBe(`https://api.example.test/v1/centers/${centerId}`);
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'manual' });
    const headers = new Headers(init?.headers);
    expect(headers.get('x-bff-service-credential')).toBe(credential);
    expect(headers.get('x-bff-center-origin')).toBe(origin);
    expect(headers.get('authorization')).toBe('Bearer user-token');
    expect(headers.get('x-tenant-context')).toBe('ctx_handle');
    expect(headers.has('cookie')).toBe(false);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).not.toContain(credential);
  });

  it.each([
    ['HEAD', `/v1/centers/${centerId}`],
    ['OPTIONS', `/v1/centers/${centerId}`],
    ['GET', '/v1/platform/bootstrap-invitations'],
    ['GET', '/https://evil.example.test'],
  ])('denies nonenumerated operation %s %s', async (method, path) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming(path, { method }),
      path.slice(1).split('/'),
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    { 'x-forwarded-host': 'bravo.app.example.test' },
    { forwarded: 'host=bravo.app.example.test' },
    { host: 'evil.example.test' },
  ])('rejects untrusted ingress metadata %#', async (headers) => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming(undefined, { headers }),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('uses canonical Host rather than Next internal URL or matching framework forwarded metadata', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: centerId }));
    const request = new Request(
      'http://127.0.0.1:3000/api/dashboard/v1/centers',
      {
        headers: {
          host: new URL(origin).host,
          'x-forwarded-host': new URL(origin).host,
          authorization: 'Bearer user-token',
          'x-tenant-context': 'ctx_handle',
        },
      },
    );
    const response = await handleDashboardBff(request, ['v1', 'centers'], {
      environment,
      fetch: upstream,
    });
    expect(response.status).toBe(200);
    expect(
      new Headers(upstream.mock.calls[0]?.[1]?.headers).get(
        'x-bff-center-origin',
      ),
    ).toBe(origin);
  });

  it.each([undefined, 'https://bravo.app.example.test'])(
    'requires original matching Origin on bootstrap %#',
    async (requestedOrigin) => {
      const upstream = vi.fn<typeof fetch>();
      const response = await handleDashboardBff(
        incoming('/v1/me/center-entry-contexts', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(requestedOrigin ? { origin: requestedOrigin } : {}),
          },
          body: JSON.stringify({ centerRef: 'alpha' }),
        }),
        ['v1', 'me', 'center-entry-contexts'],
        { environment, fetch: upstream },
      );
      expect(response.status).toBe(403);
      expect(upstream).not.toHaveBeenCalled();
    },
  );

  it('allows bootstrap without a prior handle and forwards the validated original Origin', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { tenantContext: 'ctx_new', center: { centerId } },
          { status: 201 },
        ),
      );
    const request = incoming('/v1/me/center-entry-contexts', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ centerRef: 'alpha' }),
    });
    request.headers.delete('x-tenant-context');
    const response = await handleDashboardBff(
      request,
      ['v1', 'me', 'center-entry-contexts'],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(201);
    const headers = new Headers(upstream.mock.calls[0]?.[1]?.headers);
    expect(headers.get('origin')).toBe(origin);
    expect(headers.has('x-tenant-context')).toBe(false);
  });

  it('rejects bootstrap selector disagreement before upstream execution', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming('/v1/me/center-entry-contexts', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({ centerRef: 'bravo' }),
      }),
      ['v1', 'me', 'center-entry-contexts'],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects arbitrary and repeated query parameters', async () => {
    for (const query of ['url=https://evil.example.test', 'page=1&page=2']) {
      const upstream = vi.fn<typeof fetch>();
      const path = `/v1/centers/${centerId}/activities`;
      const response = await handleDashboardBff(
        incoming(`${path}?${query}`),
        path.slice(1).split('/'),
        { environment, fetch: upstream },
      );
      expect(response.status).toBe(400);
      expect(upstream).not.toHaveBeenCalled();
    }
  });

  it.each([302, 307, 308])(
    'refuses upstream redirect %s without exposing destination headers',
    async (status) => {
      const upstream = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(null, {
          status,
          headers: {
            location: 'https://evil.example.test',
            'set-cookie': 'secret=value',
          },
        }),
      );
      const response = await handleDashboardBff(
        incoming(),
        ['v1', 'centers', centerId],
        { environment, fetch: upstream },
      );
      expect(response.status).toBe(502);
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(upstream).toHaveBeenCalledTimes(1);
    },
  );

  it('does not turn service rejection into user-session expiry', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { code: 'bff_service_authentication_failed' },
          { status: 401 },
        ),
      );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: 'bff_service_unavailable',
    });
  });

  it('preserves genuine user-session rejection', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { statusCode: 401, message: 'Unauthenticated' },
          { status: 401 },
        ),
      );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(401);
  });

  it('suppresses echoed service secrets and response headers', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { secret: credential },
        {
          headers: {
            'x-bff-service-credential': credential,
            'set-cookie': 'private=true',
          },
        },
      ),
    );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(credential);
    expect(response.headers.has('x-bff-service-credential')).toBe(false);
  });

  it('does not expose the raw secret through otherwise permitted response headers', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        { id: centerId },
        {
          headers: { 'x-correlation-id': credential.split('.')[1] as string },
        },
      ),
    );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('x-correlation-id')).toBe(false);
  });

  it('does not forward arbitrary parameters from an upstream JSON content type', async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: centerId }), {
        headers: {
          'content-type': `application/json; credential=${credential}`,
        },
      }),
    );
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      { environment, fetch: upstream },
    );
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(JSON.stringify([...response.headers])).not.toContain(credential);
  });

  it('rejects a decoded noncanonical path before upstream execution', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming('/v1/me/operators%0A'),
      ['v1', 'me', 'operators\n'],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('preserves 204 without a body', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 204 }));
    const request = incoming(`/v1/centers/${centerId}/catalog-settings`, {
      method: 'PUT',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ defaultActivityLocale: 'es' }),
    });
    const response = await handleDashboardBff(
      request,
      ['v1', 'centers', centerId, 'catalog-settings'],
      { environment, fetch: upstream },
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('propagates caller cancellation to upstream without retry', async () => {
    const controller = new AbortController();
    let upstreamSignal: AbortSignal | null | undefined;
    const upstream = vi.fn<typeof fetch>((_url, init) => {
      upstreamSignal = init?.signal;
      controller.abort(new Error('caller cancelled'));
      return new Promise<Response>(() => undefined);
    });
    await expect(
      handleDashboardBff(
        incoming(undefined, { signal: controller.signal }),
        ['v1', 'centers', centerId],
        { environment, fetch: upstream },
      ),
    ).rejects.toThrow('caller cancelled');
    expect(upstreamSignal?.aborted).toBe(true);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('does not start upstream work for a request already cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already cancelled'));
    const upstream = vi.fn<typeof fetch>();
    await expect(
      handleDashboardBff(
        incoming(undefined, { method: 'PUT', signal: controller.signal }),
        ['v1', 'centers', centerId, 'catalog-settings'],
        { environment, fetch: upstream },
      ),
    ).rejects.toThrow('already cancelled');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('bounds an upstream that ignores cancellation without retry', async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockImplementation(() => new Promise<Response>(() => undefined));
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      {
        environment: { ...environment, BFF_REQUEST_TIMEOUT_MS: '5' },
        fetch: upstream,
      },
    );
    expect(response.status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('returns a redacted unavailable response for missing configuration', async () => {
    const upstream = vi.fn<typeof fetch>();
    const response = await handleDashboardBff(
      incoming(),
      ['v1', 'centers', centerId],
      {
        environment: { ...environment, BFF_SERVICE_CREDENTIAL: undefined },
        fetch: upstream,
      },
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(credential);
    expect(upstream).not.toHaveBeenCalled();
  });
});
