import { type ChildProcess, spawn } from 'node:child_process';
import { cp, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bootstrapRoles,
  migrateProduct,
  setBootstrapPlatformCapability,
} from '@dive-center/database';
import {
  DeterministicIdentityProvider,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  Response as ExpressResponse,
  NextFunction,
  Request,
} from 'express';
import { Pool } from 'pg';
import { AppModule } from '../src/app/app.module.js';
import type {
  BookingPageReadDto,
  CalendarPageReadDto,
} from '../src/booking/reads/booking-read.dto.js';
import { BffServiceCredentialVerifier } from '../src/common/auth/bff-service-credential.js';
import { DATABASE_POOL } from '../src/common/database/database.tokens.js';
import { SECURITY_LOGGER } from '../src/common/security/security.tokens.js';
import {
  CENTER_APP_BASE_DOMAIN,
  CENTER_APP_BASE_ORIGIN,
} from '../src/common/tenant-context/tenant-context.tokens.js';
import { bffServiceCredential } from './bff-test-fixture.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const centerA1 = 'aaaaaaaa-0001-4001-8001-000000000001';
const centerA2 = 'aaaaaaaa-0001-4001-8001-000000000002';
const centerB1 = 'bbbbbbbb-0002-4002-8002-000000000001';
const ownerA = 'a1111111-1111-1111-1111-111111111111';

type IssuedInvitation = {
  invitationId: string;
  status: string;
  deliveryStatus: 'pending' | 'retrying' | 'succeeded' | 'dead_letter';
};

function databaseUrl(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`Missing integration database configuration: ${name}`);
  return value;
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('real Next BFF / AppModule / PostgreSQL (DIVE-IAM-REQ-030..032)', () => {
  for (const name of [
    'SPIKE_ADMIN_DATABASE_URL',
    'SPIKE_APP_DATABASE_URL',
    'SPIKE_WORKER_DATABASE_URL',
    'SPIKE_PLATFORM_ADMIN_DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'APP_DATABASE_URL',
    'WORKER_DATABASE_URL',
  ])
    databaseUrl(name);
  const admin = new Pool({
    connectionString: databaseUrl('SPIKE_ADMIN_DATABASE_URL'),
  });
  const appPool = new Pool({
    connectionString: databaseUrl('SPIKE_APP_DATABASE_URL'),
  });
  const platformAdminPool = new Pool({
    connectionString: databaseUrl('SPIKE_PLATFORM_ADMIN_DATABASE_URL'),
  });
  const previousWritesFlag = process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
  const identity = new DeterministicIdentityProvider(
    new Map([
      [
        'platform-token',
        {
          issuer: 'test',
          subject: 'platform-operator',
          verifiedAddresses: [],
        },
      ],
      [
        'owner-a-token',
        {
          issuer: 'test',
          subject: 'owner-a',
          sessionId: 'next-test-session',
          verifiedAddresses: [],
        },
      ],
    ]),
  );
  const securityLogs: unknown[] = [];
  let app: INestApplication | undefined;
  let child: ChildProcess | undefined;
  let project: string | undefined;
  let childLogs = '';
  let webPort: number;
  let apiOrigin: string;
  let centerOrigin: string;
  let transportFault:
    | 'redirect'
    | 'echo'
    | 'hold'
    | 'committed-drop'
    | 'committed-hold'
    | undefined;
  let upstreamRequests = 0;
  const invitationRequests: Request['headers'][] = [];
  let onUpstreamArrival: (() => void) | undefined;
  let onUpstreamClose: (() => void) | undefined;
  const heldResponses = new Set<ExpressResponse>();

  async function browser(
    path: string,
    options: {
      method?: string;
      handle?: string;
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
      surface?: 'platform';
    } = {},
  ) {
    const headers = new Headers({
      host:
        options.surface === 'platform'
          ? `localhost:${webPort}`
          : `alpha.app.localhost:${webPort}`,
      authorization:
        options.surface === 'platform'
          ? 'Bearer platform-token'
          : 'Bearer owner-a-token',
    });
    if (options.handle) headers.set('x-tenant-context', options.handle);
    if (options.body !== undefined)
      headers.set('content-type', 'application/json');
    for (const [name, value] of Object.entries(options.headers ?? {}))
      headers.set(name, value);
    return new Promise<Response>((resolve, reject) => {
      const pending = httpRequest(
        `http://127.0.0.1:${webPort}${options.surface === 'platform' ? '/api/platform/invitations' : '/api/dashboard'}${path}`,
        {
          method: options.method ?? 'GET',
          headers: Object.fromEntries(headers),
          signal: options.signal ?? AbortSignal.timeout(30_000),
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.once('error', reject);
          incoming.once('end', () => {
            const responseHeaders = new Headers();
            for (
              let index = 0;
              index < incoming.rawHeaders.length;
              index += 2
            ) {
              const name = incoming.rawHeaders[index];
              const value = incoming.rawHeaders[index + 1];
              if (name !== undefined && value !== undefined) {
                responseHeaders.append(name, value);
              }
            }
            const status = incoming.statusCode ?? 500;
            try {
              const body = Buffer.concat(chunks);
              const exposed = `${body.toString()}${JSON.stringify([...responseHeaders])}`;
              expect(exposed).not.toContain(bffServiceCredential);
              expect(exposed).not.toContain(bffServiceCredential.split('.')[1]);
              resolve(
                new Response(
                  status === 204 || options.method === 'HEAD' ? null : body,
                  { status, headers: responseHeaders },
                ),
              );
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      pending.once('error', reject);
      pending.end(
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
      );
    });
  }

  async function bootstrap() {
    const response = await browser('/v1/me/center-entry-contexts', {
      method: 'POST',
      body: { centerRef: 'alpha' },
      headers: { origin: centerOrigin },
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as {
      center: { centerId: string };
      tenantContext: string;
    };
    expect(payload.center).toMatchObject({ centerId: centerA1 });
    expect(payload.tenantContext).toMatch(/^ctx_[A-Za-z0-9_-]+$/);
    return payload.tenantContext as string;
  }

  async function snapshot() {
    return (
      await admin.query(`SELECT jsonb_build_object(
      'settings', (SELECT jsonb_agg(to_jsonb(settings) ORDER BY center_id) FROM booking_app.catalog_settings settings),
      'audit', (SELECT jsonb_agg(to_jsonb(audit) ORDER BY id) FROM iam_app.audit_records audit),
      'outbox', (SELECT jsonb_agg(to_jsonb(outbox) ORDER BY id) FROM iam_app.outbox_events outbox)
    ) AS state`)
    ).rows;
  }

  async function invitationSnapshot() {
    return (
      await admin.query(`SELECT jsonb_build_object(
        'grants', (SELECT jsonb_agg(to_jsonb(grants) ORDER BY id) FROM onboarding_app.tenant_bootstrap_grants grants),
        'audit', (SELECT jsonb_agg(to_jsonb(audit) ORDER BY id) FROM onboarding_app.bootstrap_invitation_audit_records audit),
        'outbox', (SELECT jsonb_agg(to_jsonb(outbox) ORDER BY id) FROM onboarding_app.tenant_bootstrap_outbox_events outbox),
        'receipts', (SELECT jsonb_agg(to_jsonb(receipts)) FROM onboarding_app.bootstrap_invitation_command_receipts receipts)
      ) AS state`)
    ).rows[0].state;
  }

  async function platformCapability(
    capability: 'bootstrap_invitation.issue' | 'bootstrap_invitation.read',
    enabled: boolean,
  ) {
    await setBootstrapPlatformCapability(platformAdminPool, {
      issuer: 'test',
      subject: 'platform-operator',
      capability,
      enabled,
    });
  }

  function issueInvitation(headers: Record<string, string> = {}) {
    return browser('', {
      surface: 'platform',
      method: 'POST',
      body: { destinationEmail: ' OWNER@Example.Test ', reason: 'Next pilot' },
      headers: {
        origin: `http://localhost:${webPort}`,
        'idempotency-key': 'next-platform-issue',
        ...headers,
      },
    });
  }

  beforeAll(async () => {
    await bootstrapRoles(admin);
    await migrateProduct();
    webPort = await unusedPort();
    centerOrigin = `http://alpha.app.localhost:${webPort}`;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DATABASE_POOL)
      .useValue(appPool)
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(identity)
      .overrideProvider(IDENTITY_WEBHOOK_VERIFIER)
      .useValue({
        verify: () => {
          throw new Error('Webhook not used by BFF fixture');
        },
      })
      .overrideProvider(SECURITY_LOGGER)
      .useValue({ warn: (entry: unknown) => securityLogs.push(entry) })
      .overrideProvider(CENTER_APP_BASE_DOMAIN)
      .useValue('app.localhost')
      .overrideProvider(CENTER_APP_BASE_ORIGIN)
      .useValue(`http://app.localhost:${webPort}`)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    app.use(
      (incoming: Request, outgoing: ExpressResponse, next: NextFunction) => {
        upstreamRequests += 1;
        if (incoming.path.startsWith('/v1/platform/bootstrap-invitations'))
          invitationRequests.push({ ...incoming.headers });
        onUpstreamArrival?.();
        if (!transportFault) return next();
        if (
          transportFault === 'committed-drop' ||
          transportFault === 'committed-hold'
        ) {
          const fault = transportFault;
          const originalEnd = outgoing.end;
          outgoing.end = (...args: unknown[]) => {
            if (outgoing.statusCode !== 204)
              return Reflect.apply(originalEnd, outgoing, args);
            if (fault === 'committed-drop') outgoing.destroy();
            else {
              heldResponses.add(outgoing);
              outgoing.once('close', () => heldResponses.delete(outgoing));
            }
            return outgoing;
          };
          return next();
        }
        if (transportFault === 'redirect') {
          outgoing.setHeader('location', 'http://127.0.0.1:9/credential-sink');
          outgoing.setHeader('set-cookie', 'upstream=private');
          return outgoing.status(307).end();
        }
        if (transportFault === 'echo') {
          outgoing.setHeader('x-bff-service-credential', bffServiceCredential);
          return outgoing.json({ secret: bffServiceCredential });
        }
        heldResponses.add(outgoing);
        outgoing.once('close', () => {
          heldResponses.delete(outgoing);
          onUpstreamClose?.();
        });
      },
    );
    await app.listen(0, '127.0.0.1');
    apiOrigin = await app.getUrl();
    const web = fileURLToPath(new URL('../../web/', import.meta.url));
    project = await mkdtemp(join(tmpdir(), 'dive-bff-next-'));
    for (const name of [
      'src',
      'next.config.ts',
      'package.json',
      'tsconfig.json',
      'postcss.config.mjs',
    ]) {
      await cp(join(web, name), join(project, name), { recursive: true });
    }
    await symlink(
      await realpath(join(web, 'node_modules')),
      join(project, 'node_modules'),
      'dir',
    );
    child = spawn(
      process.execPath,
      [
        join(web, 'node_modules/next/dist/bin/next'),
        'dev',
        '--webpack',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(webPort),
      ],
      {
        cwd: project,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: 'development',
          NEXT_TELEMETRY_DISABLED: '1',
          AUTHENTICATION_ORIGIN: `http://localhost:${webPort}`,
          CENTER_APP_BASE_DOMAIN: 'app.localhost',
          CENTER_APP_BASE_ORIGIN: `http://app.localhost:${webPort}`,
          BFF_API_ORIGIN: apiOrigin,
          BFF_SERVICE_CREDENTIAL: bffServiceCredential,
          BFF_REQUEST_TIMEOUT_MS: '5000',
          BFF_MAX_REQUEST_BODY_BYTES: '1048576',
          BFF_MAX_RESPONSE_BODY_BYTES: '8388608',
          NEXT_PUBLIC_DASHBOARD_REQUEST_TIMEOUT_MS: '5000',
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
        },
      },
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Next startup exceeded 60 seconds')),
        60_000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const capture = (chunk: Buffer) => {
        childLogs += chunk.toString();
        if (/Ready in/.test(childLogs)) finish();
      };
      child?.stdout?.on('data', capture);
      child?.stderr?.on('data', capture);
      child?.once('error', finish);
      child?.once('exit', (code) =>
        finish(new Error(`Next exited during startup (${code})`)),
      );
    });
    const smoke = await browser('/v1/centers', {
      headers: { authorization: '' },
    });
    expect(smoke.status).toBe(401);
    expect(await smoke.json()).toMatchObject({ code: 'unauthenticated' });
  }, 120_000);

  beforeEach(async () => {
    vi.restoreAllMocks();
    transportFault = undefined;
    upstreamRequests = 0;
    onUpstreamArrival = undefined;
    onUpstreamClose = undefined;
    invitationRequests.length = 0;
    process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = 'true';
    await admin.query(
      `TRUNCATE onboarding_app.bootstrap_invitation_audit_records,
        onboarding_app.tenant_bootstrap_outbox_events,
        onboarding_app.bootstrap_invitation_command_receipts,
        onboarding_app.bootstrap_invitation_rate_limits,
        onboarding_app.bootstrap_redemption_rate_limits,
        onboarding_app.tenant_bootstrap_grants,
        onboarding_app.platform_principal_capabilities,
        onboarding_app.platform_principals CASCADE`,
    );
    await admin.query(
      'TRUNCATE iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
    await admin.query(
      "INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')",
      [tenantA, tenantB],
    );
    await admin.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      ownerA,
    ]);
    await admin.query(
      "INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,'test','owner-a')",
      [ownerA],
    );
    await admin.query(
      "INSERT INTO iam_app.centers(id,tenant_id,name,time_zone) VALUES ($1,$2,'A1','Europe/Madrid'),($3,$2,'A2','Europe/Madrid'),($4,$5,'B1','Europe/Madrid')",
      [centerA1, tenantA, centerA2, centerB1, tenantB],
    );
    await admin.query(
      "INSERT INTO iam_app.center_entries(center_key,tenant_id,center_id) VALUES ('alpha',$1,$2),('alpha-two',$1,$3),('bravo',$4,$5)",
      [tenantA, centerA1, centerA2, tenantB, centerB1],
    );
    await admin.query(
      "INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids) VALUES ($1,$2,$3,'active',ARRAY['tenant_owner'],NULL)",
      ['aa111111-1111-1111-1111-111111111111', tenantA, ownerA],
    );
  });

  afterEach(() => {
    if (previousWritesFlag === undefined)
      delete process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
    else process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = previousWritesFlag;
  });

  afterAll(async () => {
    try {
      for (const response of heldResponses) response.destroy();
      if (child && child.exitCode === null && child.signalCode === null) {
        const running = child;
        const signal = (value: NodeJS.Signals) => {
          if (process.platform !== 'win32' && running.pid)
            process.kill(-running.pid, value);
          else running.kill(value);
        };
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => signal('SIGKILL'), 5_000);
          running.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
          signal('SIGTERM');
        });
      }
      for (const secret of [
        bffServiceCredential,
        bffServiceCredential.slice(bffServiceCredential.indexOf('.') + 1),
      ]) {
        expect(childLogs).not.toContain(secret);
        expect(JSON.stringify(securityLogs)).not.toContain(secret);
      }
    } finally {
      try {
        if (app) await app.close();
        else await appPool.end();
      } finally {
        await platformAdminPool.end();
        await admin.end();
        if (project) await rm(project, { recursive: true, force: true });
      }
    }
  }, 30_000);

  it('serves only scoped calendar, booking and audited contact reads (DIVE-BOOK-REQ-043; DIVE-IAM-REQ-015,025,030..032)', async () => {
    const activity = 'cccccccc-0001-4001-8001-000000000001';
    const activities = [
      activity,
      'cccccccc-0001-4001-8001-000000000002',
      'cccccccc-0001-4001-8001-000000000003',
    ];
    const slots = [
      'dddddddd-0001-4001-8001-000000000001',
      'dddddddd-0001-4001-8001-000000000002',
      'dddddddd-0001-4001-8001-000000000003',
    ];
    const channels = [
      'eeeeeeee-0001-4001-8001-000000000001',
      'eeeeeeee-0001-4001-8001-000000000002',
      'eeeeeeee-0001-4001-8001-000000000003',
    ];
    const bookings = [
      'ffffffff-0001-4001-8001-000000000001',
      'ffffffff-0001-4001-8001-000000000002',
      'ffffffff-0001-4001-8001-000000000003',
    ];
    for (const [index, tenant, center] of [
      [0, tenantA, centerA1],
      [1, tenantA, centerA2],
      [2, tenantB, centerB1],
    ] as const) {
      await admin.query(
        "INSERT INTO booking_app.activities(id,tenant_id,center_id,base_locale,name,status) VALUES ($1,$2,$3,'en','{\"en\":\"BFF dive\"}','Published')",
        [activities[index], tenant, center],
      );
      await admin.query(
        "INSERT INTO booking_app.slots(id,tenant_id,center_id,activity_id,starts_at,duration_minutes,capacity,status) VALUES ($1,$2,$3,$4,'2026-09-30T23:30:00Z',60,8,'Closed')",
        [slots[index], tenant, center, activities[index]],
      );
      await admin.query(
        "INSERT INTO booking_app.channels(id,tenant_id,center_id,public_id,type,activity_id,status,allowed_origins) VALUES ($1,$2,$3,$1::uuid::text,'single_activity',$4,'Published',ARRAY['https://test.example.test'])",
        [channels[index], tenant, center, activities[index]],
      );
      await admin.query(
        "INSERT INTO booking_app.bookings(id,tenant_id,center_id,channel_id,slot_id,booking_channel,idempotency_key,request_hash,status,seats,locale,booker_first_name,booker_last_name,booker_email) VALUES ($1::uuid,$2,$3,$4,$5,'public_hosted',$1::uuid::text,'test','Confirmed',2,'en','Private','Contact','bff-contact@example.test')",
        [bookings[index], tenant, center, channels[index], slots[index]],
      );
    }
    const handle = await bootstrap();
    const range = '?from=2026-10-01T00%3A00%3A00Z&to=2026-10-02T00%3A00%3A00Z';
    const calendar = await browser(
      `/v1/centers/${centerA1}/calendar/slots${range}`,
      { handle },
    );
    expect(calendar.status).toBe(200);
    expect(calendar.headers.get('cache-control')).toBe('private, no-store');
    const projection = (await calendar.json()) as CalendarPageReadDto;
    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      id: slots[0],
      confirmedSeats: 2,
      heldSeats: 0,
      remainingSeats: null,
    });
    expect(projection.asOf).toMatch(/\.\d{6}Z$/);
    const list = await browser(
      `/v1/centers/${centerA1}/slots/${slots[0]}/bookings`,
      { handle },
    );
    expect(list.status).toBe(200);
    expect(list.headers.get('cache-control')).toBe('private, no-store');
    const operational = (await list.json()) as BookingPageReadDto;
    expect(operational.items).toEqual([
      expect.objectContaining({
        bookingId: bookings[0],
        status: 'Confirmed',
        seats: 2,
        holdExpiresAt: null,
      }),
    ]);
    expect(JSON.stringify([projection, operational])).not.toContain(
      'bff-contact@example.test',
    );
    const contact = await browser(
      `/v1/centers/${centerA1}/bookings/${bookings[0]}/contact`,
      { handle },
    );
    expect(contact.status).toBe(200);
    expect(contact.headers.get('cache-control')).toBe('private, no-store');
    expect(await contact.json()).toEqual({
      bookingId: bookings[0],
      booker: {
        firstName: 'Private',
        lastName: 'Contact',
        email: 'bff-contact@example.test',
        phone: null,
      },
    });
    for (const requested of [centerA2, centerB1]) {
      expect(
        (
          await browser(`/v1/centers/${requested}/calendar/slots${range}`, {
            handle,
          })
        ).status,
      ).toBe(404);
    }
    for (const index of [1, 2]) {
      for (const suffix of [
        `slots/${slots[index]}/bookings`,
        `bookings/${bookings[index]}/contact`,
        `calendar/slots${range}&activityId=${activities[index]}`,
      ]) {
        const denied = await browser(`/v1/centers/${centerA1}/${suffix}`, {
          handle,
          headers: {
            'x-bff-center-origin': `http://bravo.app.localhost:${webPort}`,
          },
        });
        expect(denied.status).toBe(404);
        expect(JSON.stringify(await denied.json())).not.toContain(
          'bff-contact@example.test',
        );
      }
    }
    const audit = await admin.query(
      "SELECT action,resource_type,result,purpose,source_metadata FROM iam_app.audit_records WHERE tenant_id=$1 AND action IN ('booking.read','customer_contact.read') ORDER BY created_at,id",
      [tenantA],
    );
    expect(audit.rows.filter((row) => row.result === 'success')).toEqual([
      {
        action: 'booking.read',
        resource_type: 'center',
        result: 'success',
        purpose: 'calendar_operations',
        source_metadata: { centerId: centerA1 },
      },
      {
        action: 'booking.read',
        resource_type: 'slot',
        result: 'success',
        purpose: 'booking_operations',
        source_metadata: { centerId: centerA1 },
      },
      {
        action: 'customer_contact.read',
        resource_type: 'booking',
        result: 'success',
        purpose: 'booking_operations',
        source_metadata: { centerId: centerA1, slotId: slots[0] },
      },
    ]);
    expect(audit.rows.filter((row) => row.result === 'denied')).toHaveLength(8);
    expect(JSON.stringify(audit.rows)).not.toContain(
      'bff-contact@example.test',
    );
    expect(JSON.stringify(securityLogs)).not.toContain(
      'bff-contact@example.test',
    );
    expect(
      (await admin.query('SELECT id FROM iam_app.outbox_events')).rows,
    ).toEqual([]);
  }, 30_000);

  it('issues, replays and reads one safe platform invitation effect (DIVE-ONB-REQ-005,039,040)', async () => {
    await platformCapability('bootstrap_invitation.issue', true);
    await platformCapability('bootstrap_invitation.read', true);
    const spoofed = {
      cookie: '__session=browser-cookie',
      'x-tenant-context': 'ctx_browser_fake',
      'x-tenant-id': tenantB,
      'x-center-id': centerB1,
      'x-bff-service-credential': 'browser-fake',
      'x-bff-center-origin': centerOrigin,
    };
    const issued = await issueInvitation(spoofed);
    expect(issued.status).toBe(201);
    expect(issued.headers.get('cache-control')).toBe('no-store');
    expect(issued.headers.get('set-cookie')).toBeNull();
    const state = (await issued.json()) as IssuedInvitation;
    expect(state).toEqual({
      invitationId: expect.any(String),
      destinationEmail: 'owner@example.test',
      status: 'issued',
      deliveryStatus: 'pending',
    });
    for (const field of [
      'ticket',
      'url',
      'token',
      'providerInvitationRef',
      'tenantId',
      'reason',
    ])
      expect(state).not.toHaveProperty(field);
    const persisted = await invitationSnapshot();
    expect(persisted.grants).toHaveLength(1);
    expect(persisted.audit).toHaveLength(1);
    expect(persisted.outbox).toHaveLength(1);
    expect(persisted.receipts).toHaveLength(1);
    const replayed = await issueInvitation(spoofed);
    expect(replayed.status).toBe(201);
    expect(await replayed.json()).toEqual(state);
    const read = await browser(`/${state.invitationId}`, {
      surface: 'platform',
      headers: spoofed,
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({
      ...state,
      issuedAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(read.headers.get('cache-control')).toBe('no-store');
    expect(await invitationSnapshot()).toEqual(persisted);
    expect(upstreamRequests).toBe(3);
    expect(invitationRequests).toHaveLength(3);
    for (const headers of invitationRequests) {
      expect(headers.authorization).toBe('Bearer platform-token');
      for (const name of Object.keys(spoofed))
        expect(headers[name]).toBeUndefined();
    }
    expect(invitationRequests[0]?.origin).toBe(`http://localhost:${webPort}`);
    expect(invitationRequests[1]?.origin).toBe(`http://localhost:${webPort}`);
    expect(invitationRequests[0]?.['idempotency-key']).toBe(
      'next-platform-issue',
    );
    expect(invitationRequests[1]?.['idempotency-key']).toBe(
      'next-platform-issue',
    );
    expect(invitationRequests[2]?.['idempotency-key']).toBeUndefined();
  }, 30_000);

  it('denies tenant owners and checks independent and revoked platform capabilities (DIVE-ONB-REQ-005,039)', async () => {
    const empty = await invitationSnapshot();
    for (const authorization of [
      'Bearer owner-a-token',
      'Bearer platform-token',
    ]) {
      const denied = await issueInvitation({ authorization });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({
        status: 403,
        code: 'permission_denied',
        title: 'permission_denied',
      });
    }
    expect(await invitationSnapshot()).toEqual(empty);
    await platformCapability('bootstrap_invitation.issue', true);
    const issued = await issueInvitation();
    expect(issued.status).toBe(201);
    const state = (await issued.json()) as IssuedInvitation;
    const persisted = await invitationSnapshot();
    const unreadable = await browser(`/${state.invitationId}`, {
      surface: 'platform',
    });
    expect(unreadable.status).toBe(404);
    expect(await unreadable.json()).toEqual({
      status: 404,
      code: 'invitation_unavailable',
      title: 'invitation_unavailable',
    });
    await platformCapability('bootstrap_invitation.issue', false);
    await platformCapability('bootstrap_invitation.read', true);
    expect(
      (await browser(`/${state.invitationId}`, { surface: 'platform' })).status,
    ).toBe(200);
    expect(
      (await issueInvitation({ 'idempotency-key': 'read-only-attempt' }))
        .status,
    ).toBe(403);
    await platformCapability('bootstrap_invitation.read', false);
    const revoked = await browser(`/${state.invitationId}`, {
      surface: 'platform',
    });
    expect(revoked.status).toBe(404);
    expect(await revoked.json()).toEqual({
      status: 404,
      code: 'invitation_unavailable',
      title: 'invitation_unavailable',
    });
    expect(await invitationSnapshot()).toEqual(persisted);
  }, 30_000);

  it('rejects cookie-only authority, center hosts and foreign mutation Origins before platform upstream (DIVE-ONB-REQ-040)', async () => {
    const before = await invitationSnapshot();
    for (const headers of [
      { authorization: '', cookie: '__session=platform-token' },
      { host: `alpha.app.localhost:${webPort}`, origin: centerOrigin },
      { origin: 'https://foreign.example.test' },
      { origin: '' },
    ]) {
      const denied = await issueInvitation(headers);
      expect(denied.status).toBe('authorization' in headers ? 401 : 403);
    }
    const read = await browser('/aaaaaaaa-1111-4111-8111-111111111111', {
      surface: 'platform',
      headers: { authorization: '', cookie: '__session=platform-token' },
    });
    expect(read.status).toBe(401);
    expect(upstreamRequests).toBe(0);
    expect(await invitationSnapshot()).toEqual(before);
  }, 30_000);

  it('keeps safe platform reads available while writes are disabled (DIVE-ONB-REQ-039,040)', async () => {
    await platformCapability('bootstrap_invitation.issue', true);
    await platformCapability('bootstrap_invitation.read', true);
    const issued = await issueInvitation();
    expect(issued.status).toBe(201);
    const state = (await issued.json()) as IssuedInvitation;
    const persisted = await invitationSnapshot();
    process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = 'false';
    const denied = await issueInvitation({
      'idempotency-key': 'disabled-attempt',
    });
    expect(denied.status).toBe(503);
    expect(await denied.json()).toMatchObject({ code: 'feature_unavailable' });
    const read = await browser(`/${state.invitationId}`, {
      surface: 'platform',
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toEqual({
      ...state,
      issuedAt: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(await invitationSnapshot()).toEqual(persisted);
  }, 30_000);

  it('bootstraps without a handle and constrains lists, reads and writes despite owner A1/A2 permissions', async () => {
    const handle = await bootstrap();
    const list = await browser('/v1/centers', { handle });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([
      { id: centerA1, name: 'A1', timeZone: 'Europe/Madrid' },
    ]);
    const before = await snapshot();
    expect((await browser(`/v1/centers/${centerA2}`, { handle })).status).toBe(
      403,
    );
    const denied = await browser(`/v1/centers/${centerA2}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { origin: centerOrigin },
    });
    expect(denied.status).toBe(404);
    expect(await denied.json()).toMatchObject({ code: 'resource_not_found' });
    expect(await snapshot()).toEqual(before);
    const authorizedA2 = await browser(`/v1/centers/${centerA2}`, {
      handle,
      headers: { host: `alpha-two.app.localhost:${webPort}` },
    });
    expect(authorizedA2.status).toBe(200);
    expect(await authorizedA2.json()).toEqual({
      id: centerA2,
      name: 'A2',
      timeZone: 'Europe/Madrid',
    });
  }, 30_000);

  it('reads current dashboard capabilities through Next without admitting other centers (DIVE-IAM-REQ-030..032)', async () => {
    const handle = await bootstrap();
    const path = `/v1/centers/${centerA1}/dashboard-capabilities`;
    const before = await snapshot();
    const response = await browser(path, { handle });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: true,
      canUpdateActivity: true,
      canPublishActivity: true,
      canScheduleSession: true,
    });
    for (const centerId of [centerA2, centerB1]) {
      const denied = await browser(
        `/v1/centers/${centerId}/dashboard-capabilities`,
        { handle },
      );
      expect(denied.status).toBe(404);
      expect(await denied.json()).toMatchObject({ code: 'resource_not_found' });
    }
    expect((await browser(path)).status).toBe(403);
    expect(await snapshot()).toEqual(before);
    await admin.query(
      `WITH identity AS (
        INSERT INTO iam_app.identities(id) VALUES (gen_random_uuid()) RETURNING id
      )
      INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
      SELECT gen_random_uuid(),$1,id,'active',ARRAY['tenant_owner'],NULL FROM identity`,
      [tenantA],
    );
    await admin.query(
      `UPDATE iam_app.memberships SET roles=ARRAY['auditor_compliance'] WHERE tenant_id=$1 AND identity_id=$2`,
      [tenantA, ownerA],
    );
    const updated = await browser(path, { handle });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({
      canReadActivities: true,
      canReadSessions: true,
      canCreateActivity: false,
      canUpdateActivity: false,
      canPublishActivity: false,
      canScheduleSession: false,
    });
  }, 30_000);

  it('compares warmed local direct API and Next BFF latency without duplicate identity authentication', async () => {
    const handle = await bootstrap();
    const authenticate = vi.spyOn(identity, 'authenticate');
    const direct = () =>
      fetch(`${apiOrigin}/v1/centers`, {
        headers: {
          authorization: 'Bearer owner-a-token',
          'x-tenant-context': handle,
          'x-bff-service-credential': bffServiceCredential,
          'x-bff-center-origin': centerOrigin,
          origin: centerOrigin,
        },
        signal: AbortSignal.timeout(5_000),
      });
    const bff = () =>
      browser('/v1/centers', {
        handle,
        headers: { origin: centerOrigin },
      });
    async function sample(request: () => Promise<Response>) {
      const authenticationCalls = authenticate.mock.calls.length;
      const started = performance.now();
      const response = await request();
      const payload = await response.json();
      const elapsed = performance.now() - started;
      expect(response.status).toBe(200);
      expect(payload).toEqual([
        { id: centerA1, name: 'A1', timeZone: 'Europe/Madrid' },
      ]);
      expect(authenticate).toHaveBeenCalledTimes(authenticationCalls + 1);
      return elapsed;
    }

    try {
      const warmupCount = 3;
      for (let index = 0; index < warmupCount; index += 1) {
        await sample(direct);
        await sample(bff);
      }
      authenticate.mockClear();
      const before = upstreamRequests;
      const sampleCount = 15;
      const directSamples: number[] = [];
      const bffSamples: number[] = [];
      for (let index = 0; index < sampleCount; index += 1) {
        directSamples.push(await sample(direct));
        bffSamples.push(await sample(bff));
      }
      expect(authenticate).toHaveBeenCalledTimes(sampleCount * 2);
      expect(upstreamRequests - before).toBe(sampleCount * 2);
      console.info(
        'Local warmed HTTP comparison',
        JSON.stringify({
          runtime: 'Next development; PostgreSQL; deterministic identity',
          caveat: 'Real-provider latency not measured',
          warmupsPerPath: warmupCount,
          identityAuthenticationsPerRequest: 1,
          measurements: [
            { path: 'direct-api', samples: directSamples },
            { path: 'next-bff', samples: bffSamples },
          ].map(({ path, samples }) => ({
            path,
            sampleCount: samples.length,
            minMs: Number(Math.min(...samples).toFixed(2)),
            meanMs: Number(
              (
                samples.reduce((total, value) => total + value, 0) /
                samples.length
              ).toFixed(2),
            ),
            maxMs: Number(Math.max(...samples).toFixed(2)),
          })),
        }),
      );
    } finally {
      authenticate.mockRestore();
    }
  }, 30_000);

  it('ignores browser service/scope metadata and rejects direct API admission and foreign resources', async () => {
    const handle = await bootstrap();
    const tampered = {
      'x-bff-service-credential': 'browser-fake',
      'x-bff-center-origin': `http://bravo.app.localhost:${webPort}`,
      'x-tenant-id': tenantB,
      'x-center-id': centerB1,
    };
    const list = await browser('/v1/centers', { handle, headers: tampered });
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([
      { id: centerA1, name: 'A1', timeZone: 'Europe/Madrid' },
    ]);
    const before = await snapshot();
    expect(
      (await browser(`/v1/centers/${centerB1}`, { handle, headers: tampered }))
        .status,
    ).toBe(403);
    const write = await browser(`/v1/centers/${centerB1}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { ...tampered, origin: centerOrigin },
    });
    expect(write.status).toBe(404);
    expect(await write.json()).toMatchObject({ code: 'resource_not_found' });
    const direct = await fetch(`${apiOrigin}/v1/centers/${centerA1}`, {
      headers: {
        authorization: 'Bearer owner-a-token',
        'x-tenant-context': handle,
      },
      signal: AbortSignal.timeout(5_000),
    });
    expect(direct.status).toBe(401);
    expect(await direct.json()).toMatchObject({
      code: 'bff_service_authentication_failed',
    });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects an oversized body in real Next before API admission or persisted effects', async () => {
    const handle = await bootstrap();
    const requestsBefore = upstreamRequests;
    const before = await snapshot();
    const response = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
      method: 'PUT',
      handle,
      headers: { origin: centerOrigin },
      body: { defaultActivityLocale: 'es', padding: 'x'.repeat(1_048_576) },
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      status: 413,
      code: 'request_body_too_large',
      title: 'request_body_too_large',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(upstreamRequests).toBe(requestsBefore);
    expect(await snapshot()).toEqual(before);
  });

  it('executes bodyless publish, disable, close and cancel through the real BFF (DIVE-IAM-REQ-032)', async () => {
    const handle = await bootstrap();
    const headers = { origin: centerOrigin };
    const root = `/v1/centers/${centerA1}`;
    const settings = await browser(`${root}/catalog-settings`, {
      method: 'PUT',
      handle,
      headers,
      body: { defaultActivityLocale: 'es' },
    });
    expect(settings.status).toBe(204);
    const activity = await browser(`${root}/activities`, {
      method: 'POST',
      handle,
      headers,
      body: { name: { es: 'Bodyless commands' } },
    });
    expect(activity.status).toBe(201);
    const activityId = ((await activity.json()) as { id: string }).id;
    expect(
      (
        await browser(`${root}/activities/${activityId}/publish`, {
          method: 'PATCH',
          handle,
          headers,
        })
      ).status,
    ).toBe(204);
    const slot = await browser(`${root}/activities/${activityId}/slots`, {
      method: 'POST',
      handle,
      headers,
      body: {
        startsAt: '2030-10-01T10:00:00Z',
        durationMinutes: 60,
        capacity: 4,
      },
    });
    expect(slot.status).toBe(201);
    const slotId = ((await slot.json()) as { id: string }).id;
    for (const command of ['close', 'cancel']) {
      const response = await browser(`${root}/slots/${slotId}/${command}`, {
        method: 'PATCH',
        handle,
        headers,
      });
      expect(response.status).toBe(204);
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
    expect(
      (
        await browser(`${root}/activities/${activityId}/disable`, {
          method: 'PATCH',
          handle,
          headers,
        })
      ).status,
    ).toBe(204);
    const persisted = await admin.query(
      `SELECT activity.status AS activity_status, slot.status AS slot_status
       FROM booking_app.activities activity
       JOIN booking_app.slots slot ON slot.tenant_id=activity.tenant_id AND slot.activity_id=activity.id
       WHERE activity.tenant_id=$1 AND activity.id=$2 AND slot.id=$3`,
      [tenantA, activityId, slotId],
    );
    expect(persisted.rows).toEqual([
      { activity_status: 'Disabled', slot_status: 'Cancelled' },
    ]);
  });

  it('writes and reads own catalog settings once with a 204 no-store response', async () => {
    const handle = await bootstrap();
    const before = upstreamRequests;
    const written = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { origin: centerOrigin },
    });
    expect(written.status).toBe(204);
    expect(await written.text()).toBe('');
    expect(written.headers.get('cache-control')).toBe('no-store');
    expect(upstreamRequests - before).toBe(1);
    const read = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
      handle,
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ defaultActivityLocale: 'es' });
    const settings = await admin.query(
      'SELECT tenant_id::text, center_id::text, default_activity_locale FROM booking_app.catalog_settings',
    );
    expect(settings.rows).toEqual([
      {
        tenant_id: tenantA,
        center_id: centerA1,
        default_activity_locale: 'es',
      },
    ]);
  });

  it('requires the original mutation Origin and rejects selectors and forwarded-host contradictions before upstream', async () => {
    const before = await admin.query(
      'SELECT count(*)::int AS count FROM iam_app.tenant_contexts',
    );
    for (const options of [
      { body: { centerRef: 'alpha-two' }, headers: { origin: centerOrigin } },
      {
        body: { centerRef: 'alpha' },
        headers: { origin: `http://alpha-two.app.localhost:${webPort}` },
      },
      { body: { centerRef: 'alpha' } },
      {
        body: { centerRef: 'alpha' },
        headers: {
          origin: centerOrigin,
          'x-forwarded-host': `bravo.app.localhost:${webPort}`,
        },
      },
      {
        body: { centerRef: 'alpha' },
        headers: {
          origin: centerOrigin,
          forwarded: 'host=bravo.app.localhost',
        },
      },
    ]) {
      expect(
        (
          await browser('/v1/me/center-entry-contexts', {
            method: 'POST',
            ...options,
          })
        ).status,
      ).toBe(403);
    }
    expect(upstreamRequests).toBe(0);
    expect(
      (
        await admin.query(
          'SELECT count(*)::int AS count FROM iam_app.tenant_contexts',
        )
      ).rows,
    ).toEqual(before.rows);
    const handle = await bootstrap();
    const state = await snapshot();
    const count = upstreamRequests;
    expect(
      (
        await browser(`/v1/centers/${centerA1}/catalog-settings`, {
          method: 'PUT',
          handle,
          body: { defaultActivityLocale: 'es' },
        })
      ).status,
    ).toBe(403);
    expect(upstreamRequests).toBe(count);
    expect(await snapshot()).toEqual(state);
  });

  it('retains existing scope after entry disablement but denies new bootstrap', async () => {
    const handle = await bootstrap();
    const disabled = await browser(`/v1/centers/${centerA1}/entry-status`, {
      method: 'PATCH',
      handle,
      body: { status: 'disabled', purpose: 'Synthetic retained-entry check' },
      headers: { origin: centerOrigin },
    });
    expect(disabled.status).toBe(200);
    expect((await browser(`/v1/centers/${centerA1}`, { handle })).status).toBe(
      200,
    );
    expect(
      (
        await browser('/v1/me/center-entry-contexts', {
          method: 'POST',
          body: { centerRef: 'alpha' },
          headers: { origin: centerOrigin },
        })
      ).status,
    ).toBe(403);
    const written = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { origin: centerOrigin },
    });
    expect(written.status).toBe(204);
    expect(
      (await browser(`/v1/centers/${centerA1}/catalog-settings`, { handle }))
        .status,
    ).toBe(200);
  });

  it('revokes the handle through DELETE and rechecks it on subsequent operations', async () => {
    const handle = await bootstrap();
    const revoked = await browser('/v1/me/tenant-contexts', {
      method: 'DELETE',
      handle,
      headers: { origin: centerOrigin },
    });
    expect(revoked.status).toBe(204);
    expect((await browser(`/v1/centers/${centerA1}`, { handle })).status).toBe(
      403,
    );
    const write = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { origin: centerOrigin },
    });
    expect(write.status).toBe(403);
  });

  it('keeps service rejection separate from user authentication over real HTTP', async () => {
    const handle = await bootstrap();
    if (!app) throw new Error('Missing Nest test application');
    const verifier = vi
      .spyOn(app.get(BffServiceCredentialVerifier), 'authenticate')
      .mockReturnValue(false);
    const service = await browser(`/v1/centers/${centerA1}`, { handle });
    expect(service.status).toBe(502);
    expect(await service.json()).toMatchObject({
      code: 'bff_service_unavailable',
    });
    verifier.mockRestore();
    const user = await browser(`/v1/centers/${centerA1}`, {
      handle,
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(user.status).toBe(401);
    expect(await user.json()).not.toMatchObject({
      code: 'bff_service_unavailable',
    });
    expect((await browser(`/v1/centers/${centerA1}`, { handle })).status).toBe(
      200,
    );
  });

  it('rejects arbitrary destinations, unlisted query parameters, HEAD and OPTIONS without upstream access', async () => {
    const handle = await bootstrap();
    const before = upstreamRequests;
    const normalized = await browser('/https://evil.example.test', { handle });
    expect(normalized.status).toBe(308);
    expect(normalized.headers.get('location')).toBe(
      '/api/dashboard/https:/evil.example.test',
    );
    expect(
      (await browser('/https:/evil.example.test', { handle })).status,
    ).toBe(404);
    for (const path of [
      '/https%3A%2F%2Fevil.example.test',
      '/v1/centers?url=https://evil.example.test',
      '/v1/unknown',
    ]) {
      const response = await browser(path, { handle });
      expect(response.status).toBe(path.includes('?') ? 400 : 404);
    }
    for (const method of ['HEAD', 'OPTIONS']) {
      expect((await browser('/v1/centers', { handle, method })).status).toBe(
        404,
      );
    }
    expect(upstreamRequests).toBe(before);
  });

  it.each(['redirect', 'echo'] as const)(
    'suppresses an injected upstream %s response without retry',
    async (fault) => {
      const handle = await bootstrap();
      const before = upstreamRequests;
      const state = await snapshot();
      transportFault = fault;
      const response = await browser(
        `/v1/centers/${centerA1}/catalog-settings`,
        {
          method: 'PUT',
          handle,
          body: { defaultActivityLocale: 'es' },
          headers: { origin: centerOrigin },
        },
      );
      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({
        code: 'bff_upstream_unavailable',
      });
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(upstreamRequests - before).toBe(1);
      expect(await snapshot()).toEqual(state);
    },
  );

  it.each(['committed-drop', 'committed-hold'] as const)(
    'does not retry a persisted mutation after %s (DIVE-IAM-REQ-032)',
    async (fault) => {
      const handle = await bootstrap();
      const before = upstreamRequests;
      transportFault = fault;
      const response = await browser(
        `/v1/centers/${centerA1}/catalog-settings`,
        {
          method: 'PUT',
          handle,
          body: { defaultActivityLocale: 'es' },
          headers: { origin: centerOrigin },
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'bff_upstream_unavailable',
      });
      expect(upstreamRequests - before).toBe(1);
      const settings = await admin.query(
        'SELECT tenant_id::text, center_id::text, default_activity_locale FROM booking_app.catalog_settings',
      );
      expect(settings.rows).toEqual([
        {
          tenant_id: tenantA,
          center_id: centerA1,
          default_activity_locale: 'es',
        },
      ]);
      transportFault = undefined;
      const read = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
        handle,
      });
      expect(read.status).toBe(200);
      expect(await read.json()).toMatchObject({ defaultActivityLocale: 'es' });
      expect(upstreamRequests - before).toBe(2);
    },
    15_000,
  );

  it('bounds a stalled mutation to the configured deadline without retry or database effects', async () => {
    const handle = await bootstrap();
    const state = await snapshot();
    const before = upstreamRequests;
    transportFault = 'hold';
    const closed = new Promise<void>((resolve) => {
      onUpstreamClose = resolve;
    });
    const started = Date.now();
    const response = await browser(`/v1/centers/${centerA1}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { origin: centerOrigin },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'bff_upstream_unavailable',
    });
    expect(Date.now() - started).toBeLessThan(10_000);
    await closed;
    expect(upstreamRequests - before).toBe(1);
    expect(await snapshot()).toEqual(state);
  }, 15_000);

  it('propagates caller cancellation to the real upstream without mutation retry', async () => {
    const handle = await bootstrap();
    const state = await snapshot();
    const before = upstreamRequests;
    transportFault = 'hold';
    const arrived = new Promise<void>((resolve) => {
      onUpstreamArrival = resolve;
    });
    const closed = new Promise<void>((resolve) => {
      onUpstreamClose = resolve;
    });
    const controller = new AbortController();
    const pending = browser(`/v1/centers/${centerA1}/catalog-settings`, {
      method: 'PUT',
      handle,
      body: { defaultActivityLocale: 'es' },
      headers: { origin: centerOrigin },
      signal: controller.signal,
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'AbortError',
    });
    await arrived;
    const cancelledAt = Date.now();
    controller.abort();
    await rejected;
    await closed;
    expect(Date.now() - cancelledAt).toBeLessThan(2_000);
    expect(upstreamRequests - before).toBe(1);
    expect(await snapshot()).toEqual(state);
  }, 10_000);
});
