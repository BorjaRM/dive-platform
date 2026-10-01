import { randomUUID } from 'node:crypto';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { Pool } from 'pg';
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
} from 'playwright';
import { clerkIdentityConfigFromEnvironment } from '../src/common/auth/clerk.config.js';
import { TenantContextCrypto } from '../src/common/tenant-context/tenant-context.crypto.js';
import {
  assertClerkSessionCannotMintToken,
  completeClerkSignIn,
} from './clerk.browser-session.js';
import {
  canonicalHttpsOrigin,
  requiredEnvironment,
  sandboxDatabaseUrl,
} from './clerk.sandbox-config.js';

function loadConfiguration() {
  if (process.env.DIVE_REAL_CLERK_BFF_E2E !== '1')
    throw new Error(
      'Refusing real BFF sandbox execution without DIVE_REAL_CLERK_BFF_E2E=1',
    );
  const clerk = clerkIdentityConfigFromEnvironment(process.env);
  const publishableKey = requiredEnvironment(
    'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  );
  if (
    !clerk.secretKey.startsWith('sk_test_') ||
    !publishableKey.startsWith('pk_test_')
  )
    throw new Error('BFF sandbox requires Clerk Development keys');
  const authenticationOrigin = canonicalHttpsOrigin('AUTHENTICATION_ORIGIN');
  const apiOrigin = canonicalHttpsOrigin('BFF_API_ORIGIN');
  const origins = [
    canonicalHttpsOrigin('DIVE_BFF_SANDBOX_CENTER_A_ORIGIN'),
    canonicalHttpsOrigin('DIVE_BFF_SANDBOX_CENTER_B_ORIGIN'),
  ];
  const baseDomain = requiredEnvironment('CENTER_APP_BASE_DOMAIN');
  const centerKeys = origins.map((origin) => {
    const url = new URL(origin);
    const suffix = `.${baseDomain}`;
    const key = url.hostname.slice(0, -suffix.length);
    if (
      !url.hostname.endsWith(suffix) ||
      url.port ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(key)
    )
      throw new Error(
        'Sandbox centers must use distinct canonical center hosts',
      );
    return key;
  });
  if (new Set([authenticationOrigin, apiOrigin, ...origins]).size !== 4)
    throw new Error(
      'Sandbox authentication, API and center origins must be distinct',
    );
  if (
    [authenticationOrigin, ...origins].some(
      (origin) => !clerk.authorizedParties.includes(origin),
    )
  )
    throw new Error(
      'Sandbox authentication and both centers must be approved Clerk parties',
    );
  return {
    clerk,
    publishableKey,
    authenticationOrigin,
    apiOrigin,
    origins,
    centerKeys,
    adminDatabaseUrl: sandboxDatabaseUrl(
      'SPIKE_ADMIN_DATABASE_URL',
      'postgres',
    ),
    userId: requiredEnvironment('DIVE_CLERK_SANDBOX_USER_ID'),
    password: requiredEnvironment('DIVE_CLERK_SANDBOX_USER_PASSWORD'),
  };
}

describe('real browser / Next BFF / Clerk / PostgreSQL (DIVE-IAM-REQ-030..032)', () => {
  let config: ReturnType<typeof loadConfiguration>;
  let admin: Pool | undefined;
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let clerk: ReturnType<typeof createClerkClient> | undefined;
  const pendingSessions = new Set<string>();
  let completedScenarios = 0;
  let fixtureCreated = false;
  const tenantId = randomUUID();
  const foreignTenantId = randomUUID();
  const foreignCenterId = randomUUID();
  const identityId = randomUUID();
  const centerIds = [randomUUID(), randomUUID()];
  const observations: { path: string; status: number }[] = [];
  const violations = new Set<string>();

  async function snapshot() {
    if (!admin) throw new Error('Missing sandbox database');
    return (
      await admin.query(
        `SELECT jsonb_build_object(
        'settings', (SELECT jsonb_agg(to_jsonb(settings) ORDER BY center_id) FROM booking_app.catalog_settings settings WHERE tenant_id = ANY($1::uuid[])),
        'audit', (SELECT jsonb_agg(to_jsonb(audit) ORDER BY id) FROM iam_app.audit_records audit WHERE tenant_id = ANY($1::uuid[])),
        'outbox', (SELECT jsonb_agg(to_jsonb(outbox) ORDER BY id) FROM iam_app.outbox_events outbox WHERE tenant_id = ANY($1::uuid[]))
      ) AS state`,
        [[tenantId, foreignTenantId]],
      )
    ).rows;
  }

  async function operation<Payload = unknown>(
    page: Page,
    path: string,
    handle: string,
    method = 'GET',
    body?: unknown,
  ) {
    const result = await page.evaluate(
      async (input) => {
        const runtime = globalThis as unknown as {
          Clerk?: { session?: { getToken(): Promise<string | null> } };
        };
        const bearer = await runtime.Clerk?.session?.getToken();
        if (!bearer) throw new Error('Missing real browser session');
        const response = await fetch(`/api/dashboard${input.path}`, {
          method: input.method,
          headers: {
            authorization: `Bearer ${bearer}`,
            'x-tenant-context': input.handle,
            ...(input.body !== undefined
              ? { 'content-type': 'application/json' }
              : {}),
          },
          ...(input.body !== undefined
            ? { body: JSON.stringify(input.body) }
            : {}),
          cache: 'no-store',
        });
        return {
          status: response.status,
          body: response.status === 204 ? null : await response.json(),
        };
      },
      { path, handle, method, body },
    );
    return result as { status: number; body: Payload | null };
  }

  async function enterCenter(page: Page, origin: string) {
    const bootstrap = page.waitForResponse(
      (response) =>
        response.url() ===
          `${origin}/api/dashboard/v1/me/center-entry-contexts` &&
        response.request().method() === 'POST',
    );
    await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' });
    const response = await bootstrap;
    expect(response.status()).toBe(201);
    const payload = (await response.json()) as {
      tenantContext: string;
      center: { centerId: string };
    };
    expect(payload.tenantContext.startsWith('ctx_')).toBe(true);
    return payload;
  }

  async function signInAtCenter(page: Page, origin: string) {
    if (!clerk) throw new Error('Sandbox Clerk not prepared');
    page.setDefaultTimeout(60_000);
    await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL(
      (url) =>
        url.origin === config.authenticationOrigin &&
        url.pathname.startsWith('/sign-in'),
    );
    await page.waitForFunction(
      () =>
        typeof (
          globalThis as unknown as { Clerk?: { publishableKey?: string } }
        ).Clerk?.publishableKey === 'string',
    );
    const runtimeKeyMatches = await page.evaluate(
      (expected) =>
        (globalThis as unknown as { Clerk: { publishableKey: string } }).Clerk
          .publishableKey === expected,
      config.publishableKey,
    );
    expect(runtimeKeyMatches).toBe(true);
    const user = await clerk.users.getUser(config.userId);
    const email = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress;
    if (!email) throw new Error('Missing technical user email');
    const bootstrapped = page.waitForResponse(
      (response) =>
        response.url() ===
          `${origin}/api/dashboard/v1/me/center-entry-contexts` &&
        response.request().method() === 'POST',
    );
    const session = await completeClerkSignIn(page, {
      email,
      password: config.password,
      onSessionCreated: (sessionId) => pendingSessions.add(sessionId),
    });
    await page.waitForURL(`${origin}/dashboard`);
    const bootstrap = await bootstrapped;
    expect(bootstrap.status()).toBe(201);
    const entry = (await bootstrap.json()) as {
      tenantContext: string;
      center: { centerId: string };
    };
    return { session, entry };
  }

  beforeAll(async () => {
    config = loadConfiguration();
    clerk = createClerkClient({ secretKey: config.clerk.secretKey });
    const user = await clerk.users.getUser(config.userId);
    if (
      !user.emailAddresses.some(
        (address) => address.id === user.primaryEmailAddressId,
      )
    )
      throw new Error('Technical sandbox user needs a primary email');
    admin = new Pool({ connectionString: config.adminDatabaseUrl });
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "INSERT INTO iam_app.tenants(id,name) VALUES ($1,'BFF Clerk sandbox'),($2,'Foreign BFF sandbox')",
        [tenantId, foreignTenantId],
      );
      await client.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
        identityId,
      ]);
      await client.query(
        'INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,$2,$3)',
        [identityId, config.clerk.issuer, config.userId],
      );
      for (const [index, centerId] of centerIds.entries()) {
        await client.query(
          "INSERT INTO iam_app.centers(id,tenant_id,name,time_zone) VALUES ($1,$2,$3,'Europe/Madrid')",
          [centerId, tenantId, `BFF sandbox ${index + 1}`],
        );
        await client.query(
          'INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id) VALUES ($1,$2,$3)',
          [config.centerKeys[index], tenantId, centerId],
        );
      }
      await client.query(
        "INSERT INTO iam_app.centers(id,tenant_id,name,time_zone) VALUES ($1,$2,'Foreign sandbox center','Europe/Madrid')",
        [foreignCenterId, foreignTenantId],
      );
      await client.query(
        "INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids) VALUES ($1,$2,$3,'active',ARRAY['tenant_owner'],NULL)",
        [randomUUID(), tenantId, identityId],
      );
      await client.query('COMMIT');
      fixtureCreated = true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    browser = await chromium.launch();
    context = await browser.newContext();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (!['fetch', 'xhr'].includes(request.resourceType())) return;
      if (url.pathname.startsWith('/v1/'))
        violations.add('direct-product-api-request');
      if (url.pathname.startsWith('/api/dashboard/')) {
        if (!config.origins.includes(url.origin))
          violations.add('unexpected-bff-origin');
        if ('x-bff-service-credential' in request.headers())
          violations.add('browser-service-credential');
      }
    });
    context.on('response', (response) => {
      const url = new URL(response.url());
      if (url.pathname.startsWith('/api/dashboard/'))
        observations.push({ path: url.pathname, status: response.status() });
    });
  });

  async function deleteFixtures() {
    if (!fixtureCreated || !admin) return;
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      for (const table of [
        'booking_app.catalog_settings',
        'iam_app.tenant_contexts',
        'iam_app.audit_records',
        'iam_app.outbox_events',
        'iam_app.memberships',
        'iam_app.center_entries',
        'iam_app.centers',
      ])
        await client.query(
          `DELETE FROM ${table} WHERE tenant_id = ANY($1::uuid[])`,
          [[tenantId, foreignTenantId]],
        );
      await client.query(
        'DELETE FROM iam_app.identity_tenants WHERE identity_id = $1',
        [identityId],
      );
      await client.query(
        'DELETE FROM iam_app.external_identities WHERE identity_id = $1',
        [identityId],
      );
      await client.query('DELETE FROM iam_app.identities WHERE id = $1', [
        identityId,
      ]);
      await client.query(
        'DELETE FROM iam_app.tenants WHERE id = ANY($1::uuid[])',
        [[tenantId, foreignTenantId]],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    for (const cleanup of [
      ...[...pendingSessions].map((createdSessionId) => async () => {
        if (!clerk) throw new Error('Missing Clerk session cleanup provider');
        const session = await clerk.sessions.getSession(createdSessionId);
        if (session.status !== 'revoked')
          await clerk.sessions.revokeSession(createdSessionId);
      }),
      () => context?.close(),
      () => browser?.close(),
      deleteFixtures,
      () => admin?.end(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'BFF sandbox cleanup failed');
    if (completedScenarios === 2)
      console.info(
        JSON.stringify({
          harness: 'bff-clerk-sandbox',
          observations,
          result: 'passed',
          gaps: [
            'natural expiry',
            'TLS/ingress deployment proof',
            'service credential rotation',
          ],
        }),
      );
  });

  it('enforces A/B and foreign-tenant scope, retains disabled-entry handles and logs out (DIVE-IAM-REQ-030..032)', async () => {
    if (!context || !clerk || !admin) throw new Error('Sandbox not prepared');
    const page = await context.newPage();
    const originA = config.origins[0] as string;
    const originB = config.origins[1] as string;
    const { session, entry: first } = await signInAtCenter(page, originA);
    expect(first.center.centerId).toBe(centerIds[0]);
    const list = await operation<{ id: string }[]>(
      page,
      '/v1/centers',
      first.tenantContext,
    );
    expect(list.status).toBe(200);
    expect(list.body?.map((center) => center.id)).toEqual([centerIds[0]]);
    const before = await snapshot();
    for (const requestedCenterId of [centerIds[1], foreignCenterId]) {
      expect(
        (
          await operation(
            page,
            `/v1/centers/${requestedCenterId}`,
            first.tenantContext,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await operation(
            page,
            `/v1/centers/${requestedCenterId}/catalog-settings`,
            first.tenantContext,
            'PUT',
            { defaultActivityLocale: 'es' },
          )
        ).status,
      ).toBe(404);
    }
    expect(await snapshot()).toEqual(before);
    expect(
      (
        await operation(
          page,
          `/v1/centers/${centerIds[0]}/catalog-settings`,
          first.tenantContext,
          'PUT',
          { defaultActivityLocale: 'es' },
        )
      ).status,
    ).toBe(204);
    const settings = await admin.query(
      'SELECT default_activity_locale FROM booking_app.catalog_settings WHERE tenant_id = $1 AND center_id = $2',
      [tenantId, centerIds[0]],
    );
    expect(settings.rows).toEqual([{ default_activity_locale: 'es' }]);
    const read = await operation<{ defaultActivityLocale: string }>(
      page,
      `/v1/centers/${centerIds[0]}/catalog-settings`,
      first.tenantContext,
    );
    expect(read.status).toBe(200);
    expect(read.body?.defaultActivityLocale).toBe('es');
    const disabled = await operation<{ changed: boolean }>(
      page,
      `/v1/centers/${centerIds[0]}/entry-status`,
      first.tenantContext,
      'PATCH',
      {
        status: 'disabled',
        purpose: 'Synthetic browser retained-context check',
      },
    );
    expect(disabled.status).toBe(200);
    expect(disabled.body?.changed).toBe(true);
    const reloadRead = page.waitForResponse(
      (response) => response.url() === `${originA}/api/dashboard/v1/centers`,
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await reloadRead).status()).toBe(200);
    expect(
      (
        await operation(
          page,
          `/v1/centers/${centerIds[0]}/catalog-settings`,
          first.tenantContext,
          'PUT',
          { defaultActivityLocale: 'en' },
        )
      ).status,
    ).toBe(204);
    const handlesBefore = await admin.query(
      'SELECT count(*)::int AS count FROM iam_app.tenant_contexts WHERE tenant_id = $1',
      [tenantId],
    );
    const freshPage = await context.newPage();
    try {
      freshPage.setDefaultTimeout(60_000);
      const deniedBootstrap = freshPage.waitForResponse(
        (response) =>
          response.url() ===
            `${originA}/api/dashboard/v1/me/center-entry-contexts` &&
          response.request().method() === 'POST',
      );
      await freshPage.goto(`${originA}/dashboard`, {
        waitUntil: 'domcontentloaded',
      });
      expect((await deniedBootstrap).status()).toBe(403);
      expect(
        (
          await admin.query(
            'SELECT count(*)::int AS count FROM iam_app.tenant_contexts WHERE tenant_id = $1',
            [tenantId],
          )
        ).rows,
      ).toEqual(handlesBefore.rows);
    } finally {
      await freshPage.close();
    }
    const reactivated = await operation<{ changed: boolean }>(
      page,
      `/v1/centers/${centerIds[0]}/entry-status`,
      first.tenantContext,
      'PATCH',
      {
        status: 'active',
        purpose: 'Synthetic browser entry recovery check',
      },
    );
    expect(reactivated.status).toBe(200);
    expect(reactivated.body?.changed).toBe(true);
    const second = await enterCenter(page, originB);
    expect(second.center.centerId).toBe(centerIds[1]);
    const secondList = await operation<{ id: string }[]>(
      page,
      '/v1/centers',
      second.tenantContext,
    );
    expect(secondList.status).toBe(200);
    expect(secondList.body?.map((center) => center.id)).toEqual([centerIds[1]]);
    const secondSessionId = await page.evaluate(
      () =>
        (globalThis as unknown as { Clerk: { session: { id: string } } }).Clerk
          .session.id,
    );
    expect(secondSessionId === session.id).toBe(true);
    const handleHash = new TenantContextCrypto(
      'synthetic-key-unused-by-handle-hashing',
    ).handleHash(second.tenantContext);
    const handleBeforeLogout = await admin.query(
      'SELECT revoked_at IS NOT NULL AS revoked FROM iam_app.tenant_contexts WHERE tenant_id = $1 AND handle_hash = $2',
      [tenantId, handleHash],
    );
    expect(handleBeforeLogout.rows).toEqual([{ revoked: false }]);
    const handleRevoked = page.waitForResponse(
      (response) =>
        response.url() === `${originB}/api/dashboard/v1/me/tenant-contexts` &&
        response.request().method() === 'DELETE',
    );
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    const revocationResponse = await handleRevoked;
    expect(revocationResponse.status()).toBe(204);
    expect(
      await revocationResponse.request().headerValue('x-tenant-context'),
    ).toBe(second.tenantContext);
    await expect
      .poll(async () => (await clerk?.sessions.getSession(session.id))?.status)
      .toBe('revoked');
    pendingSessions.delete(session.id);
    const persisted = await admin.query(
      'SELECT revoked_at IS NOT NULL AS revoked FROM iam_app.tenant_contexts WHERE tenant_id = $1 AND handle_hash = $2',
      [tenantId, handleHash],
    );
    expect(persisted.rows).toEqual([{ revoked: true }]);
    expect([...violations]).toEqual([]);
    completedScenarios += 1;
    await page.close();
  });

  it('rejects the frozen JWT after expiry following external revocation and returns to login (DIVE-IAM-REQ-022,030)', async () => {
    if (!context || !clerk) throw new Error('Sandbox not prepared');
    const page = await context.newPage();
    const origin = config.origins[0] as string;
    const { session, entry } = await signInAtCenter(page, origin);
    expect(
      (
        await operation(
          page,
          `/v1/centers/${centerIds[0]}`,
          entry.tenantContext,
        )
      ).status,
    ).toBe(200);
    const before = await snapshot();
    const identityConfig = clerkIdentityConfigFromEnvironment(process.env);
    const claims = await verifyToken(session.token, {
      secretKey: identityConfig.secretKey,
      authorizedParties: [...identityConfig.authorizedParties],
    });
    if (!Number.isSafeInteger(claims.exp)) {
      throw new Error('Sandbox token expiry could not be established');
    }
    const controlSession = await clerk.sessions.createSession({
      userId: config.userId,
    });
    pendingSessions.add(controlSession.id);
    expect(controlSession.status).toBe('active');
    const revoked = await clerk.sessions.revokeSession(session.id);
    expect(revoked.status).toBe('revoked');
    const sandboxClerk = clerk;
    await assertClerkSessionCannotMintToken(() =>
      sandboxClerk.sessions.getToken(session.id),
    );
    const controlToken = await clerk.sessions.getToken(controlSession.id);
    const controlClaims = await verifyToken(controlToken.jwt, {
      secretKey: identityConfig.secretKey,
    });
    expect(controlClaims.sid).toBe(controlSession.id);
    expect(controlClaims.sub).toBe(config.userId);
    pendingSessions.delete(session.id);
    const browserRequests = context.request;
    await expect
      .poll(
        async () => {
          const response = await browserRequests.get(
            `${origin}/api/dashboard/v1/centers/${centerIds[0]}`,
            {
              headers: {
                authorization: `Bearer ${session.token}`,
                'x-tenant-context': entry.tenantContext,
              },
              maxRedirects: 0,
            },
          );
          const statusCode = response.status();
          await response.dispose();
          if (statusCode === 401) {
            expect(Date.now()).toBeGreaterThanOrEqual(claims.exp * 1_000);
          }
          return statusCode;
        },
        { timeout: 300_000, interval: 1_000 },
      )
      .toBe(401);
    expect(await snapshot()).toEqual(before);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForURL(
      (url) =>
        url.origin === config.authenticationOrigin &&
        url.pathname.startsWith('/sign-in'),
    );
    expect([...violations]).toEqual([]);
    completedScenarios += 1;
    await page.close();
  });
});
