import { createHmac, randomUUID } from 'node:crypto';
import { bootstrapRoles, migrateProduct } from '@dive-center/database';
import {
  ClerkIdentityAdapter,
  DeterministicIdentityProvider,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
  type IdentityProviderPort,
} from '@dive-center/identity';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app/app.module.js';
import { DATABASE_POOL } from '../src/common/database/database.tokens.js';
import { SECURITY_LOGGER } from '../src/common/security/security.tokens.js';
import { legacyDashboardCenterPath } from './legacy-dashboard-routes.js';

function testDatabaseUrl(
  name: 'SPIKE_ADMIN_DATABASE_URL' | 'SPIKE_APP_DATABASE_URL',
) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const centerA1 = 'aaaaaaaa-0001-4001-8001-000000000001';
const centerA2 = 'aaaaaaaa-0001-4001-8001-000000000002';
const centerB1 = 'bbbbbbbb-0002-4002-8002-000000000001';
const ownerA = 'a1111111-1111-1111-1111-111111111111';
const ownerA2 = 'a2222222-2222-2222-2222-222222222222';
const managerA = 'a3333333-3333-3333-3333-333333333333';
const pendingA = 'a4444444-4444-4444-4444-444444444444';
const auditorA = 'a5555555-5555-5555-5555-555555555555';
const memberB = 'b1111111-1111-1111-1111-111111111111';
const membershipOwnerA = 'aa111111-1111-1111-1111-111111111111';
const membershipOwnerA2 = 'aa222222-2222-2222-2222-222222222222';
const membershipManagerA = 'aa333333-3333-3333-3333-333333333333';
const membershipPendingA = 'aa444444-4444-4444-4444-444444444444';
const membershipAuditorA = 'aa555555-5555-5555-5555-555555555555';
const membershipB = 'bb111111-1111-1111-1111-111111111111';
const membershipManagerB = 'bb333333-3333-3333-3333-333333333333';
const invalidIdentity = 'cccccccc-3333-3333-3333-333333333333';
const webhookIdentity = 'dddddddd-4444-4444-4444-444444444444';
const webhookMembership = 'dd444444-4444-4444-4444-444444444444';
const clerkIssuer = 'https://clerk.example.test';
const clerkSubject = 'user_webhook';
const webhookSecretBytes = Buffer.from('clerk-webhook-e2e-secret');
const webhookSigningSecret = `whsec_${webhookSecretBytes.toString('base64')}`;

function signedWebhookHeaders(
  body: string,
  providerEventId: string,
  timestamp = Math.floor(Date.now() / 1_000),
) {
  const signature = createHmac('sha256', webhookSecretBytes)
    .update(`${providerEventId}.${timestamp}.${body}`)
    .digest('base64');
  return {
    'svix-id': providerEventId,
    'svix-signature': `v1,${signature}`,
    'svix-timestamp': String(timestamp),
  };
}

const principals = new Map([
  [
    'owner-a-token',
    {
      issuer: 'test',
      subject: 'owner-a',
      verifiedAddresses: ['owner-a@example.test'],
    },
  ],
  [
    'owner-a-no-email-token',
    {
      issuer: 'test',
      subject: 'owner-a',
      verifiedAddresses: [],
    },
  ],
  [
    'owner-a2-token',
    {
      issuer: 'test',
      subject: 'owner-a2',
      verifiedAddresses: ['owner-a2@example.test'],
    },
  ],
  [
    'manager-a-token',
    {
      issuer: 'test',
      subject: 'manager-a',
      verifiedAddresses: ['manager-a@example.test'],
    },
  ],
  [
    'auditor-a-token',
    {
      issuer: 'test',
      subject: 'auditor-a',
      verifiedAddresses: ['auditor-a@example.test'],
    },
  ],
  [
    'pending-a-token',
    {
      issuer: 'test',
      subject: 'pending-a',
      verifiedAddresses: ['pending-a@example.test'],
    },
  ],
  [
    'wrong-issuer-token',
    {
      issuer: 'other',
      subject: 'owner-a',
      verifiedAddresses: ['owner-a@example.test'],
    },
  ],
  [
    'member-b-token',
    {
      issuer: 'test',
      subject: 'member-b',
      verifiedAddresses: ['member-b@example.test'],
    },
  ],
  [
    'webhook-token',
    {
      issuer: clerkIssuer,
      subject: clerkSubject,
      sessionId: 'sess_webhook',
      verifiedAddresses: [],
    },
  ],
  [
    'malformed-principal-token',
    {
      issuer: 'test',
      subject: '   ',
      verifiedAddresses: ['malformed@example.test'],
    },
  ],
]);
const deterministicIdentityProvider = new DeterministicIdentityProvider(
  principals,
);
const terminatedTokens = new Set<string>();
const dashboardIdentityProvider: IdentityProviderPort = {
  authenticate: async (token) => {
    if (terminatedTokens.has(token)) throw new Error('Unauthenticated');
    return deterministicIdentityProvider.authenticate(token);
  },
};
const revocationRequirementMilliseconds = 5 * 60 * 1_000;

describe('IAM/API vertical (e2e)', () => {
  const admin = new Pool({
    connectionString: testDatabaseUrl('SPIKE_ADMIN_DATABASE_URL'),
  });
  const appPool = new Pool({
    connectionString: testDatabaseUrl('SPIKE_APP_DATABASE_URL'),
  });
  const logs: unknown[] = [];
  const contextHandles = new Map<string, string>();
  let app!: INestApplication;

  async function contextFor(token: string): Promise<string> {
    const existing = contextHandles.get(token);
    if (existing) return existing;
    const response = await request(app.getHttpServer())
      .post('/v1/me/tenant-contexts')
      .set('authorization', `Bearer ${token}`)
      .expect(201);
    const handle = response.body.tenantContext;
    expect(handle).toMatch(/^ctx_[A-Za-z0-9_-]+$/);
    contextHandles.set(token, handle);
    return handle;
  }

  async function seedImmediatePublicSlot(input: {
    capacity: number;
    publicId: string;
  }) {
    const activityId = randomUUID();
    const slotId = randomUUID();
    const channelId = randomUUID();
    await admin.query(
      `INSERT INTO booking_app.activities
       (id, tenant_id, center_id, name, status)
       VALUES ($1, $2, $3, '{"es":"Buceo","en":"Diving"}'::jsonb, 'Published')`,
      [activityId, tenantA, centerA1],
    );
    await admin.query(
      `INSERT INTO booking_app.slots
       (id, tenant_id, center_id, activity_id, starts_at, duration_minutes, capacity, status)
       VALUES ($1, $2, $3, $4, '2030-10-01T10:00:00Z', 60, $5, 'Available')`,
      [slotId, tenantA, centerA1, activityId, input.capacity],
    );
    await admin.query(
      `INSERT INTO booking_app.channels
       (id, tenant_id, center_id, public_id, type, activity_id, status, confirmation_mode, allowed_origins)
       VALUES ($1, $2, $3, $4, 'single_activity', $5, 'Published', 'immediate', ARRAY['https://a.example.test'])`,
      [channelId, tenantA, centerA1, input.publicId, activityId],
    );
    return { channelId, slotId };
  }

  async function waitForBlockedBackends(
    blockerPid: number,
    expectedCount: number,
  ): Promise<void> {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const blocked = await admin.query<{ count: number }>(
        `WITH RECURSIVE blocked(pid) AS (
           SELECT activity.pid
           FROM pg_stat_activity AS activity
           WHERE activity.datname = current_database()
             AND $1 = ANY(pg_blocking_pids(activity.pid))
           UNION
           SELECT activity.pid
           FROM pg_stat_activity AS activity
           JOIN blocked AS blocker
             ON blocker.pid = ANY(pg_blocking_pids(activity.pid))
           WHERE activity.datname = current_database()
         )
         SELECT count(*)::int AS count FROM blocked`,
        [blockerPid],
      );
      if ((blocked.rows[0]?.count ?? 0) >= expectedCount) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(
      `Expected ${expectedCount} backends to be blocked by PID ${blockerPid}`,
    );
  }

  beforeAll(async () => {
    await bootstrapRoles(admin);
    await migrateProduct();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(dashboardIdentityProvider)
      .overrideProvider(IDENTITY_WEBHOOK_VERIFIER)
      .useValue(
        new ClerkIdentityAdapter({
          secretKey: 'sk_test_not-a-real-secret',
          webhookSigningSecret,
          issuer: clerkIssuer,
          authorizedParties: ['https://dashboard.example.test'],
          requestTimeoutMillis: 100,
        }),
      )
      .overrideProvider(DATABASE_POOL)
      .useValue(appPool)
      .overrideProvider(SECURITY_LOGGER)
      .useValue({ warn: (entry: unknown) => logs.push(entry) })
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
    await app.listen(0);
  });

  beforeEach(async () => {
    logs.length = 0;
    contextHandles.clear();
    terminatedTokens.clear();
    await admin.query(
      'TRUNCATE iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
    await admin.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await admin.query(
      `INSERT INTO iam_app.identities(id) VALUES ($1),($2),($3),($4),($5)`,
      [ownerA, ownerA2, managerA, memberB, webhookIdentity],
    );
    await admin.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      pendingA,
    ]);
    await admin.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      auditorA,
    ]);
    await admin.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,'test','owner-a'),($2,'test','owner-a2'),($3,'test','manager-a'),($4,'test','member-b'),($5,'test','auditor-a')`,
      [ownerA, ownerA2, managerA, memberB, auditorA],
    );
    await admin.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,'test','pending-a')`,
      [pendingA],
    );
    await admin.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,$2,$3)`,
      [webhookIdentity, clerkIssuer, clerkSubject],
    );
    await admin.query(
      `INSERT INTO iam_app.centers(id,tenant_id,name,time_zone) VALUES ($1,$2,'A1','Europe/Madrid'),($3,$2,'A2','Europe/Madrid'),($4,$5,'B1','Europe/Madrid')`,
      [centerA1, tenantA, centerA2, centerB1, tenantB],
    );
    await admin.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids) VALUES
      ($1,$2,$3,'active',ARRAY['tenant_owner'],NULL),
      ($4,$2,$5,'active',ARRAY['tenant_owner'],NULL),
      ($6,$2,$7,'active',ARRAY['center_manager'],ARRAY[$8::uuid]),
      ($9,$10,$11,'active',ARRAY['tenant_admin'],NULL),
      ($12,$2,$13,'active',ARRAY['reception_booking_manager'],ARRAY[$8::uuid])`,
      [
        membershipOwnerA,
        tenantA,
        ownerA,
        membershipOwnerA2,
        ownerA2,
        membershipManagerA,
        managerA,
        centerA1,
        membershipB,
        tenantB,
        memberB,
        webhookMembership,
        webhookIdentity,
      ],
    );
    await admin.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,status,roles,center_ids)
       VALUES ($1,$2,'pending',ARRAY['center_manager'],ARRAY[$3::uuid])`,
      [membershipPendingA, tenantA, centerA1],
    );
    await admin.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES ($1,$2,$3,'active',ARRAY['auditor_compliance'],NULL)`,
      [membershipAuditorA, tenantA, auditorA],
    );
  });

  it('reads an authorized center and enforces assigned center scope', async () => {
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(200)
      .expect({ id: centerA1, name: 'A1' });

    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer owner-a-no-email-token')
      .set('x-tenant-context', await contextFor('owner-a-no-email-token'))
      .expect(200)
      .expect({ id: centerA1, name: 'A1' });
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA2))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(403)
      .expect({
        message: 'Access denied',
        error: 'Forbidden',
        statusCode: 403,
      });
  });

  it('lists operators and requires an explicit selector for multiple memberships (DIVE-IAM-REQ-031)', async () => {
    await admin.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES ($1,$2,$3,'active',ARRAY['tenant_admin'],NULL)`,
      [membershipManagerB, tenantB, managerA],
    );

    const operators = await request(app.getHttpServer())
      .get('/v1/me/operators')
      .set('authorization', 'Bearer manager-a-token')
      .expect(200);
    expect(operators.body.operators).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ displayName: 'A' }),
        expect.objectContaining({ displayName: 'B' }),
      ]),
    );
    const tenantBOperator = operators.body.operators.find(
      (operator: { displayName: string; operatorRef: string }) =>
        operator.displayName === 'B',
    );
    expect(tenantBOperator?.operatorRef).toMatch(/^op_[A-Za-z0-9_-]+$/);

    await request(app.getHttpServer())
      .post('/v1/me/tenant-contexts')
      .set('authorization', 'Bearer manager-a-token')
      .send({ operatorRef: tenantBOperator?.operatorRef })
      .expect(201);

    for (const operatorRef of ['', null, 'op_unknown']) {
      await request(app.getHttpServer())
        .post('/v1/me/tenant-contexts')
        .set('authorization', 'Bearer manager-a-token')
        .send({ operatorRef })
        .expect(403)
        .expect({
          message: 'Access denied',
          error: 'Forbidden',
          statusCode: 403,
        });
    }
  });

  it('lists centers allowed by the selected tenant context (DIVE-IAM-REQ-029..031)', async () => {
    const managerCenters = await request(app.getHttpServer())
      .get('/v1/centers')
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(200);
    expect(managerCenters.body).toEqual([{ id: centerA1, name: 'A1' }]);

    const ownerCenters = await request(app.getHttpServer())
      .get('/v1/centers')
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(200);
    expect(ownerCenters.body).toHaveLength(2);
    expect(ownerCenters.body).toEqual(
      expect.arrayContaining([
        { id: centerA1, name: 'A1' },
        { id: centerA2, name: 'A2' },
      ]),
    );
  });

  it('binds handles to the caller session and revokes them explicitly (DIVE-IAM-REQ-024, DIVE-IAM-REQ-030..031)', async () => {
    const ownerContext = await contextFor('owner-a-token');

    await request(app.getHttpServer())
      .get('/v1/centers')
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', ownerContext)
      .expect(403);
    await request(app.getHttpServer())
      .get('/v1/centers')
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', 'ctx_unknown')
      .expect(403);

    await request(app.getHttpServer())
      .delete('/v1/me/tenant-contexts')
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', ownerContext)
      .expect(204);
    await request(app.getHttpServer())
      .get('/v1/centers')
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', ownerContext)
      .expect(403);
  });

  it('limits context issuance to ten requests per minute (ADR-DIVE-008)', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/me/tenant-contexts')
        .set('authorization', 'Bearer manager-a-token')
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/v1/me/tenant-contexts')
      .set('authorization', 'Bearer manager-a-token')
      .expect(403);
  });

  it('limits live context handles to twenty per identity and session (ADR-DIVE-008)', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/me/tenant-contexts')
        .set('authorization', 'Bearer manager-a-token')
        .expect(201);
    }
    await admin.query(
      `UPDATE iam_app.tenant_contexts
       SET issued_at = clock_timestamp() - interval '2 minutes'
       WHERE identity_id=$1`,
      [managerA],
    );
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await request(app.getHttpServer())
        .post('/v1/me/tenant-contexts')
        .set('authorization', 'Bearer manager-a-token')
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/v1/me/tenant-contexts')
      .set('authorization', 'Bearer manager-a-token')
      .expect(403);
  });

  it('denies missing identity, foreign tenant, and foreign center without disclosure', async () => {
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA1}`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(404);
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .expect(401);
    const foreign = await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantB, centerB1))
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(403);
    expect(JSON.stringify(foreign.body)).not.toContain(centerB1);
    expect(JSON.stringify(logs)).not.toContain(centerB1);
    expect(JSON.stringify(logs)).not.toContain('owner-a-token');
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer sensitive@example.test')
      .expect(401);
    expect(JSON.stringify(logs)).not.toContain('sensitive@example.test');
    expect(logs).toEqual([
      expect.objectContaining({
        action: 'center.read',
        event: 'iam_security_event',
        reason: 'authentication_missing_or_invalid',
      }),
      expect.objectContaining({
        action: 'center.read',
        event: 'iam_security_event',
        reason: 'membership_missing_or_inactive',
      }),
      expect.objectContaining({
        action: 'center.read',
        event: 'iam_security_event',
        reason: 'authentication_missing_or_invalid',
      }),
    ]);
  });

  it('ignores client-supplied authorization claims', async () => {
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA2))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .set('x-tenant-id', tenantB)
      .set('x-permissions', 'membership.disable')
      .expect(403);
  });

  it('requires issuer plus subject and an active membership', async () => {
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer wrong-issuer-token')
      .expect(403);
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer pending-a-token')
      .expect(403);
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer malformed-principal-token')
      .expect(401);
  });

  it('applies role revocation on the next request', async () => {
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(200);
    await admin.query(
      'ALTER TABLE iam_app.memberships DISABLE TRIGGER memberships_lifecycle_guard',
    );
    try {
      await admin.query(
        `UPDATE iam_app.memberships
         SET roles=ARRAY['external_collaborator']
         WHERE tenant_id=$1 AND id=$2`,
        [tenantA, membershipManagerA],
      );
    } finally {
      await admin.query(
        'ALTER TABLE iam_app.memberships ENABLE TRIGGER memberships_lifecycle_guard',
      );
    }
    const committedAt = performance.now();
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(403);
    const elapsedMilliseconds = performance.now() - committedAt;
    expect(elapsedMilliseconds).toBeLessThanOrEqual(
      revocationRequirementMilliseconds,
    );
    console.info(
      `DIVE-IAM-REQ-016 role removal denied after ${elapsedMilliseconds.toFixed(3)} ms`,
    );
  });

  it('rejects unknown roles and center scopes from another tenant', async () => {
    await admin.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      invalidIdentity,
    ]);
    await expect(
      admin.query(
        `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
         VALUES ('cccccccc-1111-1111-1111-111111111111',$1,$2,'active',ARRAY['unknown_role'],NULL)`,
        [tenantA, invalidIdentity],
      ),
    ).rejects.toThrow();
    await expect(
      admin.query(
        `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
         VALUES ('cccccccc-2222-2222-2222-222222222222',$1,$2,'active',ARRAY['center_manager'],ARRAY[$3::uuid])`,
        [tenantA, invalidIdentity, centerB1],
      ),
    ).rejects.toThrow('Invalid membership center scope');
  });

  it('disables a membership with atomic audit and outbox derived from context', async () => {
    const managerContext = await contextFor('manager-a-token');
    await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipManagerA}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(200)
      .expect({ status: 'disabled' });
    const result = await admin.query(
      `SELECT m.status, a.tenant_id audit_tenant, a.result audit_result, a.reason audit_reason, o.tenant_id outbox_tenant, a.correlation_id audit_correlation, o.correlation_id outbox_correlation, o.payload
      FROM iam_app.memberships m JOIN iam_app.audit_records a ON a.resource_id=m.id JOIN iam_app.outbox_events o ON o.payload->>'membershipId'=m.id::text WHERE m.id=$1`,
      [membershipManagerA],
    );
    expect(result.rows[0]).toMatchObject({
      status: 'disabled',
      audit_tenant: tenantA,
      audit_result: 'success',
      audit_reason: null,
      outbox_tenant: tenantA,
      payload: { membershipId: membershipManagerA },
    });
    expect(result.rows[0].audit_correlation).toBe(
      result.rows[0].outbox_correlation,
    );
    const committedAt = performance.now();
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', managerContext)
      .expect(403);
    const elapsedMilliseconds = performance.now() - committedAt;
    expect(elapsedMilliseconds).toBeLessThanOrEqual(
      revocationRequirementMilliseconds,
    );
    console.info(
      `DIVE-IAM-REQ-016 membership disable denied after ${elapsedMilliseconds.toFixed(3)} ms`,
    );
  });

  it('revalidates the provider session and denies termination on the next request', async () => {
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(200);

    terminatedTokens.add('manager-a-token');
    const terminatedAt = performance.now();
    await request(app.getHttpServer())
      .get(legacyDashboardCenterPath(tenantA, centerA1))
      .set('authorization', 'Bearer manager-a-token')
      .expect(401);
    const elapsedMilliseconds = performance.now() - terminatedAt;
    expect(elapsedMilliseconds).toBeLessThanOrEqual(
      revocationRequirementMilliseconds,
    );
    console.info(
      `DIVE-IAM-REQ-016 session termination denied after ${elapsedMilliseconds.toFixed(3)} ms`,
    );
  });

  it('rolls back membership and audit when outbox insertion fails', async () => {
    await admin.query(
      `INSERT INTO iam_app.outbox_events(id,tenant_id,event_type,payload,correlation_id,idempotency_key)
       VALUES ($1,$2,'seed', '{}'::jsonb,$3,$4)`,
      [
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
        tenantA,
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        `membership.disable:${membershipManagerA}`,
      ],
    );
    await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipManagerA}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(500);
    const state = await admin.query(
      'SELECT status FROM iam_app.memberships WHERE id=$1',
      [membershipManagerA],
    );
    const audits = await admin.query(
      'SELECT count(*)::int count FROM iam_app.audit_records WHERE resource_id=$1',
      [membershipManagerA],
    );
    expect(state.rows[0]?.status).toBe('active');
    expect(audits.rows[0]?.count).toBe(0);
  });

  it('denies cross-tenant disable and protects the last active owner', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipB}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipOwnerA2}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipOwnerA}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', await contextFor('owner-a-token'))
      .expect(403)
      .expect({
        message: 'Operation not allowed',
        error: 'Forbidden',
        statusCode: 403,
      });
    const denied = await admin.query(
      `SELECT actor_identity_id, result, reason
       FROM iam_app.audit_records
       WHERE tenant_id=$1 AND resource_id=$2`,
      [tenantA, membershipOwnerA],
    );
    expect(denied.rows).toEqual([
      {
        actor_identity_id: ownerA,
        result: 'denied',
        reason: 'last_owner',
      },
    ]);
    const outbox = await admin.query<{ count: number }>(
      `SELECT count(*)::int count
       FROM iam_app.outbox_events
       WHERE tenant_id=$1 AND payload->>'membershipId'=$2`,
      [tenantA, membershipOwnerA],
    );
    expect(outbox.rows[0]?.count).toBe(0);
  });

  it('keeps one active owner under concurrent disable requests', async () => {
    await admin.query(`
      CREATE OR REPLACE FUNCTION iam_app.test_delay_owner_disable()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_sleep(0.1);
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_delay_owner_disable
      BEFORE UPDATE OF status ON iam_app.memberships
      FOR EACH ROW WHEN (OLD.status = 'active' AND NEW.status = 'disabled')
      EXECUTE FUNCTION iam_app.test_delay_owner_disable();
    `);
    try {
      const ownerContext = await contextFor('owner-a-token');
      const responses = await Promise.all([
        request(app.getHttpServer())
          .patch(`/v1/memberships/${membershipOwnerA}/disable`)
          .set('authorization', 'Bearer owner-a-token')
          .set('x-tenant-context', ownerContext),
        request(app.getHttpServer())
          .patch(`/v1/memberships/${membershipOwnerA2}/disable`)
          .set('authorization', 'Bearer owner-a-token')
          .set('x-tenant-context', ownerContext),
      ]);

      expect(responses.map(({ status }) => status).sort()).toEqual([200, 403]);
      const owners = await admin.query<{ count: number }>(
        `SELECT count(*)::int count
         FROM iam_app.memberships
         WHERE tenant_id=$1 AND status='active' AND roles @> ARRAY['tenant_owner']::text[]`,
        [tenantA],
      );
      expect(owners.rows[0]?.count).toBe(1);
    } finally {
      await admin.query(`
        DROP TRIGGER IF EXISTS test_delay_owner_disable ON iam_app.memberships;
        DROP FUNCTION IF EXISTS iam_app.test_delay_owner_disable();
      `);
    }
  });

  it('does not grant membership.disable to center managers', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/memberships/${membershipOwnerA}/disable`)
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(403);
    const audits = await admin.query(
      `SELECT actor_identity_id, result, reason
       FROM iam_app.audit_records
       WHERE tenant_id=$1 AND resource_id=$2`,
      [tenantA, membershipOwnerA],
    );
    expect(audits.rows).toEqual([
      {
        actor_identity_id: managerA,
        result: 'denied',
        reason: 'permission_missing',
      },
    ]);
    expect(logs).toEqual([]);
  });

  it('records a valid Clerk deletion signal without changing authorization state and deduplicates retries', async () => {
    const providerEventId = 'evt_http_delete';
    const body = JSON.stringify({
      type: 'user.deleted',
      data: { id: clerkSubject, updated_at: Date.now() },
    });
    const headers = signedWebhookHeaders(body, providerEventId);

    await request(app.getHttpServer())
      .post('/v1/webhooks/clerk')
      .set(headers)
      .set('content-type', 'application/json')
      .send(body)
      .expect(200)
      .expect({ received: true });
    await request(app.getHttpServer())
      .post('/v1/webhooks/clerk')
      .set(headers)
      .set('content-type', 'application/json')
      .send(body)
      .expect(200)
      .expect({ received: true });

    const proof = await admin.query<{
      audit_count: number;
      external_subject: string;
      inbox_count: number;
      membership_status: string;
      outbox_count: number;
      tenant_id: string;
    }>(
      `SELECT
        (SELECT subject FROM iam_app.external_identities WHERE issuer=$1 AND subject=$2) external_subject,
        (SELECT count(*)::int FROM iam_app.identity_webhook_inbox WHERE issuer=$1 AND provider_event_id=$3) inbox_count,
        (SELECT count(*)::int FROM iam_app.audit_records WHERE action='identity.webhook.apply' AND resource_id=$4::uuid) audit_count,
        (SELECT status FROM iam_app.memberships WHERE tenant_id=$5 AND identity_id=$4::uuid) membership_status,
        (SELECT count(*)::int FROM iam_app.outbox_events WHERE event_type='iam.identity.provider_deletion_recorded.v1' AND payload->>'identityId'=$4::text) outbox_count,
        (SELECT tenant_id::text FROM iam_app.audit_records WHERE action='identity.webhook.apply' AND resource_id=$4::uuid LIMIT 1) tenant_id`,
      [clerkIssuer, clerkSubject, providerEventId, webhookIdentity, tenantA],
    );
    expect(proof.rows[0]).toEqual({
      external_subject: clerkSubject,
      inbox_count: 1,
      audit_count: 1,
      membership_status: 'active',
      outbox_count: 1,
      tenant_id: tenantA,
    });
  });

  it('rejects an invalid webhook without disclosing or logging signed content', async () => {
    const signedBody = JSON.stringify({
      type: 'user.deleted',
      data: { id: clerkSubject, updated_at: Date.now() },
    });
    const changedBody = `${signedBody} `;
    const headers = signedWebhookHeaders(signedBody, 'evt_http_invalid');

    await request(app.getHttpServer())
      .post('/v1/webhooks/clerk')
      .set(headers)
      .set('content-type', 'application/json')
      .send(changedBody)
      .expect(400)
      .expect({
        message: 'Invalid webhook',
        error: 'Bad Request',
        statusCode: 400,
      });

    const serializedLogs = JSON.stringify(logs);
    expect(serializedLogs).not.toContain(clerkSubject);
    expect(serializedLogs).not.toContain(headers['svix-signature']);
    expect(serializedLogs).not.toContain(signedBody);
    expect(logs).toEqual([
      expect.objectContaining({
        action: 'identity.webhook.apply',
        reason: 'authentication_missing_or_invalid',
      }),
    ]);
  });

  it('persists an unknown verified event as ignored without granting authorization', async () => {
    const providerEventId = 'evt_http_unknown';
    const body = JSON.stringify({
      type: 'organization.updated',
      data: { id: 'org_unknown', updated_at: Date.now() },
    });
    const before = await admin.query<{ count: number }>(
      'SELECT count(*)::int count FROM iam_app.memberships',
    );

    await request(app.getHttpServer())
      .post('/v1/webhooks/clerk')
      .set(signedWebhookHeaders(body, providerEventId))
      .set('content-type', 'application/json')
      .send(body)
      .expect(200)
      .expect({ received: true });

    const inbox = await admin.query<{
      processing_result: string;
      resolved_identity_id: string | null;
      subject: string | null;
    }>(
      `SELECT processing_result, resolved_identity_id, subject
       FROM iam_app.identity_webhook_inbox
       WHERE issuer=$1 AND provider_event_id=$2`,
      [clerkIssuer, providerEventId],
    );
    const after = await admin.query<{ count: number }>(
      'SELECT count(*)::int count FROM iam_app.memberships',
    );
    expect(inbox.rows).toEqual([
      {
        processing_result: 'ignored',
        resolved_identity_id: null,
        subject: null,
      },
    ]);
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('revokes contexts for a verified session event without changing membership state', async () => {
    const providerEventId = 'evt_http_session_revoked';
    await contextFor('webhook-token');
    const body = JSON.stringify({
      type: 'session.revoked',
      data: {
        id: 'sess_webhook',
        user_id: clerkSubject,
        updated_at: Date.now(),
      },
    });

    await request(app.getHttpServer())
      .post('/v1/webhooks/clerk')
      .set(signedWebhookHeaders(body, providerEventId))
      .set('content-type', 'application/json')
      .send(body)
      .expect(200)
      .expect({ received: true });

    const state = await admin.query<{
      processing_result: string;
      revoked_at: string | null;
    }>(
      `SELECT inbox.processing_result, context.revoked_at
       FROM iam_app.external_identities external_identity
       JOIN iam_app.identity_webhook_inbox inbox
         ON inbox.issuer=external_identity.issuer AND inbox.subject=external_identity.subject
       LEFT JOIN iam_app.tenant_contexts context
         ON context.identity_id=(SELECT identity_id FROM iam_app.external_identities WHERE issuer=$1 AND subject=$2)
       WHERE external_identity.issuer=$1 AND external_identity.subject=$2
         AND inbox.provider_event_id=$3`,
      [clerkIssuer, clerkSubject, providerEventId],
    );
    expect(state.rows).toEqual([
      expect.objectContaining({ processing_result: 'applied' }),
    ]);
    expect(state.rows[0]?.revoked_at).not.toBeNull();
  });

  it('creates a public booking atomically and rejects cross-tenant scope (DIVE-BOOK-REQ-001, DIVE-BOOK-REQ-028, DIVE-BOOK-REQ-045, DIVE-BOOK-REQ-058, DIVE-BOOK-REQ-062, DIVE-BOOK-REQ-063, DIVE-BOOK-REQ-065, MT-REQ-004, MT-REQ-007, MT-REQ-010)', async () => {
    const activityA = randomUUID();
    const slotA = randomUUID();
    const channelA = randomUUID();
    const activityB = randomUUID();
    const slotB = randomUUID();
    const channelB = randomUUID();
    await admin.query(
      `INSERT INTO booking_app.activities
       (id, tenant_id, center_id, name, status)
       VALUES
         ($1, $2, $3, '{"es":"Buceo","en":"Diving"}'::jsonb, 'Published'),
         ($4, $5, $6, '{"es":"Buceo B","en":"Diving B"}'::jsonb, 'Published')`,
      [activityA, tenantA, centerA1, activityB, tenantB, centerB1],
    );
    await admin.query(
      `INSERT INTO booking_app.slots
       (id, tenant_id, center_id, activity_id, starts_at, duration_minutes, capacity, status)
       VALUES
         ($1, $2, $3, $4, '2026-10-01T10:00:00Z', 60, 4, 'Available'),
         ($5, $6, $7, $8, '2026-10-01T11:00:00Z', 60, 4, 'Available')`,
      [
        slotA,
        tenantA,
        centerA1,
        activityA,
        slotB,
        tenantB,
        centerB1,
        activityB,
      ],
    );
    await admin.query(
      `INSERT INTO booking_app.channels
       (id, tenant_id, center_id, public_id, type, activity_id, status, confirmation_mode, allowed_origins)
       VALUES
         ($1, $2, $3, 'hosted-a', 'single_activity', $4, 'Published', 'immediate', ARRAY['https://a.example.test']),
         ($5, $6, $7, 'hosted-b', 'single_activity', $8, 'Published', 'immediate', ARRAY['https://b.example.test'])`,
      [
        channelA,
        tenantA,
        centerA1,
        activityA,
        channelB,
        tenantB,
        centerB1,
        activityB,
      ],
    );

    const body = {
      slotId: slotA,
      seats: 2,
      locale: 'es',
      booker: {
        firstName: 'Ana',
        lastName: 'Buceadora',
        email: 'ana@example.test',
      },
    };
    const first = await request(app.getHttpServer())
      .post('/v1/public/channels/hosted-a/bookings')
      .set('origin', 'https://a.example.test')
      .set('idempotency-key', 'public-booking-e2e')
      .send(body)
      .expect(201);
    expect(first.body).toMatchObject({
      status: 'Confirmed',
      seats: 2,
      locale: 'es',
    });
    expect(first.body.confirmationReadToken).toEqual(expect.any(String));
    expect(first.body.cancelToken).toEqual(expect.any(String));

    const replay = await request(app.getHttpServer())
      .post('/v1/public/channels/hosted-a/bookings')
      .set('origin', 'https://a.example.test')
      .set('idempotency-key', 'public-booking-e2e')
      .send({ ...body, slotId: body.slotId.toUpperCase() })
      .expect(200);
    expect(replay.body).toEqual(first.body);

    await request(app.getHttpServer())
      .post('/v1/public/channels/hosted-a/bookings')
      .set('origin', 'https://a.example.test')
      .set('idempotency-key', 'public-booking-e2e')
      .send({ ...body, seats: 1 })
      .expect(409)
      .expect(({ body: problem }) => {
        expect(problem.code).toBe('idempotency_conflict');
      });

    await request(app.getHttpServer())
      .post('/v1/public/channels/hosted-b/bookings')
      .set('origin', 'https://b.example.test')
      .set('idempotency-key', 'cross-tenant-slot')
      .send({ ...body, slotId: slotA })
      .expect(404)
      .expect(({ body: problem }) => {
        expect(problem.code).toBe('resource_not_found');
      });

    await admin.query(`
      CREATE OR REPLACE FUNCTION iam_app.test_fail_public_booking_outbox()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'booking.public_created.v1' THEN
          RAISE EXCEPTION 'forced public booking outbox failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER test_fail_public_booking_outbox
      BEFORE INSERT ON iam_app.outbox_events
      FOR EACH ROW EXECUTE FUNCTION iam_app.test_fail_public_booking_outbox();
    `);
    try {
      await request(app.getHttpServer())
        .post('/v1/public/channels/hosted-a/bookings')
        .set('origin', 'https://a.example.test')
        .set('idempotency-key', 'public-booking-rollback')
        .send({ ...body, seats: 1 })
        .expect(500);
    } finally {
      await admin.query(`
        DROP TRIGGER IF EXISTS test_fail_public_booking_outbox ON iam_app.outbox_events;
        DROP FUNCTION IF EXISTS iam_app.test_fail_public_booking_outbox();
      `);
    }

    const persisted = await admin.query<{
      audit_correlation: string;
      audit_count: number;
      booking_count: number;
      outbox_correlation: string;
      outbox_count: number;
      tenant_audit_count: number;
      tenant_booking_count: number;
      tenant_outbox_count: number;
      tenant_verifier_count: number;
      verifier_count: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM booking_app.bookings WHERE tenant_id=$1 AND id=$2) booking_count,
         (SELECT count(*)::int FROM booking_app.capability_verifiers WHERE tenant_id=$1 AND booking_id=$2) verifier_count,
         (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND resource_id=$2) audit_count,
         (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND payload->>'bookingId'=$2::text) outbox_count,
         (SELECT count(*)::int FROM booking_app.bookings WHERE tenant_id=$1) tenant_booking_count,
         (SELECT count(*)::int FROM booking_app.capability_verifiers WHERE tenant_id=$1) tenant_verifier_count,
         (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND action='booking.create') tenant_audit_count,
         (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND event_type='booking.public_created.v1') tenant_outbox_count,
         (SELECT correlation_id::text FROM iam_app.audit_records WHERE tenant_id=$1 AND resource_id=$2) audit_correlation,
         (SELECT correlation_id::text FROM iam_app.outbox_events WHERE tenant_id=$1 AND payload->>'bookingId'=$2::text) outbox_correlation`,
      [tenantA, first.body.bookingId],
    );
    expect(persisted.rows[0]).toEqual({
      audit_correlation: persisted.rows[0]?.outbox_correlation,
      audit_count: 1,
      booking_count: 1,
      outbox_correlation: persisted.rows[0]?.audit_correlation,
      outbox_count: 1,
      tenant_audit_count: 1,
      tenant_booking_count: 1,
      tenant_outbox_count: 1,
      tenant_verifier_count: 2,
      verifier_count: 2,
    });
  });

  it('cancels active bookings with their slot atomically (DIVE-BOOK-REQ-020, DIVE-BOOK-REQ-031, DIVE-BOOK-REQ-045)', async () => {
    const { slotId } = await seedImmediatePublicSlot({
      capacity: 2,
      publicId: 'slot-cancellation-channel',
    });
    const created = await request(app.getHttpServer())
      .post('/v1/public/channels/slot-cancellation-channel/bookings')
      .set('origin', 'https://a.example.test')
      .set('idempotency-key', 'slot-cancellation-booking')
      .send({
        slotId,
        seats: 1,
        locale: 'es',
        booker: {
          firstName: 'Ana',
          lastName: 'Buceadora',
          email: 'ana@example.test',
        },
      })
      .expect(201);
    const catalogHeaders = {
      authorization: 'Bearer owner-a-token',
      'x-tenant-context': await contextFor('owner-a-token'),
    };

    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${slotId}/cancel`)
      .set(catalogHeaders)
      .expect(204);

    const state = await admin.query<{
      booking_status: string;
      cancellation_revoked_at: string | null;
      confirmation_revoked_at: string | null;
      slot_status: string;
    }>(
      `SELECT slot.status AS slot_status,
                booking.status AS booking_status,
                max(verifier.revoked_at::text) FILTER (
                  WHERE verifier.purpose='booking_cancel'
                ) AS cancellation_revoked_at,
                max(verifier.revoked_at::text) FILTER (
                  WHERE verifier.purpose='booking_confirmation_read'
                ) AS confirmation_revoked_at
         FROM booking_app.slots slot
         JOIN booking_app.bookings booking
           ON booking.tenant_id=slot.tenant_id AND booking.slot_id=slot.id
         JOIN booking_app.capability_verifiers verifier
           ON verifier.tenant_id=booking.tenant_id AND verifier.booking_id=booking.id
         WHERE slot.tenant_id=$1 AND slot.id=$2 AND booking.id=$3
         GROUP BY slot.status, booking.status`,
      [tenantA, slotId, created.body.bookingId],
    );
    expect(state.rows).toEqual([
      {
        slot_status: 'Cancelled',
        booking_status: 'Cancelled',
        cancellation_revoked_at: expect.any(String),
        confirmation_revoked_at: null,
      },
    ]);
  });

  it.each([
    { firstOperation: 'booking', publicId: 'booking-wins-cancellation-race' },
    {
      firstOperation: 'cancellation',
      publicId: 'cancellation-wins-booking-race',
    },
  ] as const)(
    'serializes full slot cancellation when $firstOperation wins (DIVE-BOOK-REQ-031)',
    async ({ firstOperation, publicId }) => {
      const { slotId } = await seedImmediatePublicSlot({
        capacity: 1,
        publicId,
      });
      const catalogHeaders = {
        authorization: 'Bearer owner-a-token',
        'x-tenant-context': await contextFor('owner-a-token'),
      };
      const blocker = await admin.connect();
      let blockerActive = false;
      let pendingRequests: Promise<unknown>[] = [];
      try {
        await blocker.query('BEGIN');
        blockerActive = true;
        const blockerPid = await blocker.query<{ pid: number }>(
          'SELECT pg_backend_pid()::int AS pid',
        );
        await blocker.query(
          'SELECT id FROM booking_app.slots WHERE id=$1 FOR UPDATE',
          [slotId],
        );
        const bookingRequest = () =>
          request(app.getHttpServer())
            .post(`/v1/public/channels/${publicId}/bookings`)
            .set('origin', 'https://a.example.test')
            .set('idempotency-key', `${publicId}-booking`)
            .send({
              slotId,
              seats: 1,
              locale: 'es',
              booker: {
                firstName: 'Ana',
                lastName: 'Buceadora',
                email: 'ana@example.test',
              },
            })
            .then((response) => response);
        const cancellationRequest = () =>
          request(app.getHttpServer())
            .patch(`/v1/centers/${centerA1}/slots/${slotId}/cancel`)
            .set(catalogHeaders)
            .then((response) => response);
        const firstRequest =
          firstOperation === 'booking'
            ? bookingRequest()
            : cancellationRequest();
        pendingRequests = [firstRequest];
        await waitForBlockedBackends(blockerPid.rows[0]?.pid ?? 0, 1);
        const secondRequest =
          firstOperation === 'booking'
            ? cancellationRequest()
            : bookingRequest();
        pendingRequests.push(secondRequest);
        await waitForBlockedBackends(blockerPid.rows[0]?.pid ?? 0, 2);
        await blocker.query('COMMIT');
        blockerActive = false;

        const [firstResponse, secondResponse] = await Promise.all([
          firstRequest,
          secondRequest,
        ]);
        expect(firstResponse.status).toBe(
          firstOperation === 'booking' ? 201 : 204,
        );
        expect(secondResponse.status).toBe(
          firstOperation === 'booking' ? 204 : 409,
        );
        const state = await admin.query<{
          active_booking_count: number;
          slot_status: string;
        }>(
          `SELECT slot.status AS slot_status,
                  count(booking.id) FILTER (
                    WHERE booking.status IN ('Pending', 'Confirmed')
                  )::int AS active_booking_count
           FROM booking_app.slots slot
           LEFT JOIN booking_app.bookings booking
             ON booking.tenant_id=slot.tenant_id AND booking.slot_id=slot.id
           WHERE slot.tenant_id=$1 AND slot.id=$2
           GROUP BY slot.status`,
          [tenantA, slotId],
        );
        expect(state.rows).toEqual([
          { slot_status: 'Cancelled', active_booking_count: 0 },
        ]);
      } finally {
        if (blockerActive) await blocker.query('ROLLBACK');
        await Promise.allSettled(pendingRequests);
        blocker.release();
      }
    },
    10_000,
  );

  it('serializes distinct public requests contending for the last seat (DIVE-BOOK-REQ-025, DIVE-BOOK-REQ-064)', async () => {
    const { slotId } = await seedImmediatePublicSlot({
      capacity: 1,
      publicId: 'last-seat-channel',
    });
    const blocker = await admin.connect();
    let blockerActive = false;
    let pendingRequests: Promise<unknown>[] = [];
    try {
      await blocker.query('BEGIN');
      blockerActive = true;
      const blockerPid = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid()::int AS pid',
      );
      await blocker.query(
        'SELECT id FROM booking_app.slots WHERE id=$1 FOR UPDATE',
        [slotId],
      );

      const body = {
        slotId,
        seats: 1,
        locale: 'es',
        booker: {
          firstName: 'Ana',
          lastName: 'Buceadora',
          email: 'ana@example.test',
        },
      };
      const firstRequest = request(app.getHttpServer())
        .post('/v1/public/channels/last-seat-channel/bookings')
        .set('origin', 'https://a.example.test')
        .set('idempotency-key', 'last-seat-first')
        .send(body)
        .then((response) => response);
      const secondRequest = request(app.getHttpServer())
        .post('/v1/public/channels/last-seat-channel/bookings')
        .set('origin', 'https://a.example.test')
        .set('idempotency-key', 'last-seat-second')
        .send({
          ...body,
          booker: { ...body.booker, email: 'berta@example.test' },
        })
        .then((response) => response);
      pendingRequests = [firstRequest, secondRequest];

      await waitForBlockedBackends(blockerPid.rows[0]?.pid ?? 0, 2);
      await blocker.query('COMMIT');
      blockerActive = false;

      const responses = await Promise.all([firstRequest, secondRequest]);
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
      const rejected = responses.find(({ status }) => status === 409);
      expect(rejected?.headers['content-type']).toMatch(
        /^application\/problem\+json/,
      );
      expect(rejected?.body.code).toBe('slot_unavailable');

      const persisted = await admin.query<{
        audit_count: number;
        booking_count: number;
        outbox_count: number;
        slot_status: string;
        tenant_audit_count: number;
        tenant_outbox_count: number;
        verifier_count: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM booking_app.bookings WHERE tenant_id=$1 AND slot_id=$2) booking_count,
           (SELECT count(*)::int FROM booking_app.capability_verifiers WHERE tenant_id=$1 AND booking_id IN (
             SELECT id FROM booking_app.bookings WHERE tenant_id=$1 AND slot_id=$2
           )) verifier_count,
           (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND resource_id IN (
             SELECT id FROM booking_app.bookings WHERE tenant_id=$1 AND slot_id=$2
           )) audit_count,
           (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND payload->>'bookingId' IN (
             SELECT id::text FROM booking_app.bookings WHERE tenant_id=$1 AND slot_id=$2
           )) outbox_count,
           (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND action='booking.create') tenant_audit_count,
           (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND event_type='booking.public_created.v1') tenant_outbox_count,
           (SELECT status FROM booking_app.slots WHERE tenant_id=$1 AND id=$2) slot_status`,
        [tenantA, slotId],
      );
      expect(persisted.rows[0]).toEqual({
        audit_count: 1,
        booking_count: 1,
        outbox_count: 1,
        slot_status: 'Full',
        tenant_audit_count: 1,
        tenant_outbox_count: 1,
        verifier_count: 2,
      });
    } finally {
      if (blockerActive) await blocker.query('ROLLBACK');
      await Promise.allSettled(pendingRequests);
      blocker.release();
    }
  }, 10_000);

  it('serializes concurrent same-key public retries without duplicate effects (DIVE-BOOK-REQ-028, DIVE-BOOK-REQ-062)', async () => {
    const { channelId, slotId } = await seedImmediatePublicSlot({
      capacity: 1,
      publicId: 'same-key-channel',
    });
    const idempotencyKey = 'same-key-retry';
    const blocker = await admin.connect();
    let blockerActive = false;
    let pendingRequests: Promise<unknown>[] = [];
    try {
      await blocker.query('BEGIN');
      blockerActive = true;
      const blockerPid = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid()::int AS pid',
      );
      await blocker.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${tenantA}:${channelId}:${idempotencyKey}`],
      );

      const body = {
        slotId,
        seats: 1,
        locale: 'en',
        booker: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'ada@example.test',
        },
      };
      const firstRequest = request(app.getHttpServer())
        .post('/v1/public/channels/same-key-channel/bookings')
        .set('origin', 'https://a.example.test')
        .set('idempotency-key', idempotencyKey)
        .send(body)
        .then((response) => response);
      const secondRequest = request(app.getHttpServer())
        .post('/v1/public/channels/same-key-channel/bookings')
        .set('origin', 'https://a.example.test')
        .set('idempotency-key', idempotencyKey)
        .send(body)
        .then((response) => response);
      pendingRequests = [firstRequest, secondRequest];

      await waitForBlockedBackends(blockerPid.rows[0]?.pid ?? 0, 2);
      await blocker.query('COMMIT');
      blockerActive = false;

      const responses = await Promise.all([firstRequest, secondRequest]);
      expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
      expect(responses[0]?.body).toEqual(responses[1]?.body);

      const persisted = await admin.query<{
        audit_count: number;
        booking_count: number;
        outbox_count: number;
        slot_status: string;
        tenant_audit_count: number;
        tenant_outbox_count: number;
        verifier_count: number;
      }>(
        `SELECT
           (SELECT count(*)::int FROM booking_app.bookings WHERE tenant_id=$1 AND channel_id=$2 AND idempotency_key=$3) booking_count,
           (SELECT count(*)::int FROM booking_app.capability_verifiers WHERE tenant_id=$1 AND booking_id IN (
             SELECT id FROM booking_app.bookings WHERE tenant_id=$1 AND channel_id=$2 AND idempotency_key=$3
           )) verifier_count,
           (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND resource_id IN (
             SELECT id FROM booking_app.bookings WHERE tenant_id=$1 AND channel_id=$2 AND idempotency_key=$3
           )) audit_count,
           (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND payload->>'bookingId' IN (
             SELECT id::text FROM booking_app.bookings WHERE tenant_id=$1 AND channel_id=$2 AND idempotency_key=$3
           )) outbox_count,
           (SELECT count(*)::int FROM iam_app.audit_records WHERE tenant_id=$1 AND action='booking.create') tenant_audit_count,
           (SELECT count(*)::int FROM iam_app.outbox_events WHERE tenant_id=$1 AND event_type='booking.public_created.v1') tenant_outbox_count,
           (SELECT status FROM booking_app.slots WHERE tenant_id=$1 AND id=$4) slot_status`,
        [tenantA, channelId, idempotencyKey, slotId],
      );
      expect(persisted.rows[0]).toEqual({
        audit_count: 1,
        booking_count: 1,
        outbox_count: 1,
        slot_status: 'Full',
        tenant_audit_count: 1,
        tenant_outbox_count: 1,
        verifier_count: 2,
      });
    } finally {
      if (blockerActive) await blocker.query('ROLLBACK');
      await Promise.allSettled(pendingRequests);
      blocker.release();
    }
  }, 10_000);

  it('implements the center-scoped catalog lifecycle and instant filters (DIVE-BOOK-REQ-049..057)', async () => {
    const authorization = 'Bearer owner-a-token';
    const tenantContext = await contextFor('owner-a-token');
    const catalogHeaders = {
      authorization,
      'x-tenant-context': tenantContext,
    };

    const forbiddenActivity = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .send({
        name: { es: 'Solo español', en: 'English' },
        status: 'Published',
      })
      .expect(422);
    expect(forbiddenActivity.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(forbiddenActivity.body.code).toBe('validation_error');

    const incomplete = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .send({ name: { es: 'Solo español' } })
      .expect(201);
    expect(incomplete.body.status).toBe('Draft');

    const incompletePublish = await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${incomplete.body.id}/publish`)
      .set(catalogHeaders)
      .expect(422);
    expect(incompletePublish.body.code).toBe('validation_error');

    const activity = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .send({
        name: { es: 'Buceo', en: 'Diving' },
        description: { es: 'Descripción', en: 'Description' },
        defaultCapacity: 8,
      })
      .expect(201);
    expect(activity.body).toMatchObject({
      status: 'Draft',
      name: { es: 'Buceo', en: 'Diving' },
      defaultCapacity: 8,
    });

    const defaultActivities = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .expect(200);
    expect(defaultActivities.body).toMatchObject({
      page: 1,
      pageSize: 20,
      hasNext: false,
    });
    expect(defaultActivities.body.items[0].id).toBe(activity.body.id);

    const draftActivities = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .query({ status: 'Draft' })
      .expect(200);
    expect(draftActivities.body.items).toHaveLength(2);
    expect(draftActivities.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: incomplete.body.id, status: 'Draft' }),
        expect.objectContaining({ id: activity.body.id, status: 'Draft' }),
      ]),
    );

    for (const query of [
      { page: 0 },
      { page: -1 },
      { pageSize: 0 },
      { pageSize: 51 },
    ]) {
      await request(app.getHttpServer())
        .get(`/v1/centers/${centerA1}/activities`)
        .set(catalogHeaders)
        .query(query)
        .expect(422);
    }
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .query({ pageSize: 50 })
      .expect(200)
      .expect(({ body }) => {
        expect(body.pageSize).toBe(50);
      });

    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(204);

    const forbiddenSlot = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .send({
        startsAt: '2024-01-15T10:00:00Z',
        durationMinutes: 60,
        capacity: 4,
        end: '2024-01-15T11:00:00Z',
      })
      .expect(422);
    expect(forbiddenSlot.body.code).toBe('validation_error');

    const firstSlot = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .send({
        startsAt: '2024-01-15T10:00:00Z',
        durationMinutes: 60,
        capacity: 4,
      })
      .expect(201);
    const secondSlot = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .send({
        startsAt: '2024-01-15T12:00:00Z',
        durationMinutes: 90,
        capacity: 6,
      })
      .expect(201);
    expect(firstSlot.body).toMatchObject({
      status: 'Available',
      startsAt: '2024-01-15T11:00:00+01:00',
    });

    const slots = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .query({
        from: '2024-01-15T09:00:00Z',
        to: '2024-01-15T11:00:00Z',
        page: 1,
        pageSize: 1,
      })
      .expect(200);
    expect(slots.body).toMatchObject({ page: 1, pageSize: 1, hasNext: false });
    expect(slots.body.items).toHaveLength(1);
    expect(slots.body.items[0].id).toBe(firstSlot.body.id);
    expect(secondSlot.body.startsAt).toBe('2024-01-15T13:00:00+01:00');

    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${firstSlot.body.id}/close`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${firstSlot.body.id}/close`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${firstSlot.body.id}/cancel`)
      .set(catalogHeaders)
      .expect(204);

    const cancelledSlots = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .query({ status: 'Cancelled' })
      .expect(200);
    expect(cancelledSlots.body.items).toEqual([
      expect.objectContaining({ id: firstSlot.body.id, status: 'Cancelled' }),
    ]);
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .query({ from: '2024-01-15T12:00:00Z', to: '2024-01-15T10:00:00Z' })
      .expect(422);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${firstSlot.body.id}/cancel`)
      .set(catalogHeaders)
      .expect(204);

    const evidence = await admin.query<{
      action: string;
      audit_correlation: string;
      outbox_correlation: string;
      resource_id: string;
    }>(
      `SELECT audit.action,
              audit.resource_id,
              audit.correlation_id AS audit_correlation,
              outbox.correlation_id AS outbox_correlation
       FROM iam_app.audit_records AS audit
       JOIN iam_app.outbox_events AS outbox
         ON outbox.tenant_id=audit.tenant_id
        AND outbox.correlation_id=audit.correlation_id
       WHERE audit.tenant_id=$1
         AND audit.action IN ('booking.create', 'booking.update')
       ORDER BY audit.created_at, audit.id`,
      [tenantA],
    );
    expect(evidence.rows).toHaveLength(7);
    expect(
      evidence.rows.every(
        (row) => row.audit_correlation === row.outbox_correlation,
      ),
    ).toBe(true);
    expect(new Set(evidence.rows.map((row) => row.resource_id)).size).toBe(4);
  });

  it('disables an activity idempotently without cancelling existing slots', async () => {
    const catalogHeaders = {
      authorization: 'Bearer owner-a-token',
      'x-tenant-context': await contextFor('owner-a-token'),
    };
    const activity = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(204);
    const slot = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .send({
        startsAt: '2026-10-01T10:00:00Z',
        durationMinutes: 60,
        capacity: 4,
      })
      .expect(201);

    const concurrentDisables = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .patch(
            `/v1/centers/${centerA1}/activities/${activity.body.id}/disable`,
          )
          .set(catalogHeaders)
          .expect(204),
      ),
    );
    expect(concurrentDisables).toHaveLength(2);

    const existingSlots = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .expect(200);
    expect(existingSlots.body.items).toEqual([
      expect.objectContaining({ id: slot.body.id, status: 'Available' }),
    ]);
    await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .send({
        startsAt: '2026-10-01T12:00:00Z',
        durationMinutes: 60,
        capacity: 4,
      })
      .expect(409);
  });

  it('rejects incompatible activity and slot transitions while allowing idempotent commands', async () => {
    const catalogHeaders = {
      authorization: 'Bearer owner-a-token',
      'x-tenant-context': await contextFor('owner-a-token'),
    };
    const activity = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/disable`)
      .set(catalogHeaders)
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(204);
    const slot = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .send({
        startsAt: '2026-10-01T10:00:00Z',
        durationMinutes: 60,
        capacity: 4,
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/disable`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(409);

    const concurrentCloses = await Promise.all(
      [1, 2].map(() =>
        request(app.getHttpServer())
          .patch(`/v1/centers/${centerA1}/slots/${slot.body.id}/close`)
          .set(catalogHeaders)
          .expect(204),
      ),
    );
    expect(concurrentCloses).toHaveLength(2);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${slot.body.id}/cancel`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${slot.body.id}/cancel`)
      .set(catalogHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/slots/${slot.body.id}/close`)
      .set(catalogHeaders)
      .expect(409);
  });

  it('serializes disabling an activity with slot creation (DIVE-BOOK-REQ-052..053)', async () => {
    const catalogHeaders = {
      authorization: 'Bearer owner-a-token',
      'x-tenant-context': await contextFor('owner-a-token'),
    };
    const activity = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(catalogHeaders)
      .expect(204);

    const [disableResponse, createSlotResponse] = await Promise.all([
      request(app.getHttpServer())
        .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/disable`)
        .set(catalogHeaders),
      request(app.getHttpServer())
        .post(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
        .set(catalogHeaders)
        .send({
          startsAt: '2026-10-01T10:00:00Z',
          durationMinutes: 60,
          capacity: 4,
        }),
    ]);

    expect(disableResponse.status).toBe(204);
    expect([201, 409]).toContain(createSlotResponse.status);

    const disabledActivity = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set(catalogHeaders)
      .query({ status: 'Disabled' })
      .expect(200);
    expect(disabledActivity.body.items).toEqual([
      expect.objectContaining({ id: activity.body.id, status: 'Disabled' }),
    ]);

    const slots = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(catalogHeaders)
      .expect(200);
    expect(slots.body.items).toHaveLength(
      createSlotResponse.status === 201 ? 1 : 0,
    );
  });

  it('enforces catalog context, permission, and date-range validation', async () => {
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(401);

    const auditorHeaders = {
      authorization: 'Bearer auditor-a-token',
      'x-tenant-context': await contextFor('auditor-a-token'),
    };
    const forbiddenCreate = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(auditorHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(403);
    expect(forbiddenCreate.body.code).toBe('permission_denied');

    const ownerHeaders = {
      authorization: 'Bearer owner-a-token',
      'x-tenant-context': await contextFor('owner-a-token'),
    };
    const activity = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(ownerHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerA1}/activities/${activity.body.id}/publish`)
      .set(ownerHeaders)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(ownerHeaders)
      .query({ from: 'not-a-date' })
      .expect(422);
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${activity.body.id}/slots`)
      .set(ownerHeaders)
      .query({ from: '2026-10-01T12:00:00Z', to: '2026-10-01T10:00:00Z' })
      .expect(422);
  });

  it('keeps catalog pagination and resources tenant-scoped', async () => {
    const ownerHeaders = {
      authorization: 'Bearer owner-a-token',
      'x-tenant-context': await contextFor('owner-a-token'),
    };
    await admin.query(
      `INSERT INTO booking_app.activities
       (id, tenant_id, center_id, name, status)
       SELECT gen_random_uuid(), $1, $2, jsonb_build_object('es', 'Actividad ' || n), 'Draft'
      FROM generate_series(1, 21) AS series(n)`,
      [tenantA, centerA1],
    );

    const firstPage = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set(ownerHeaders)
      .query({ page: 1, pageSize: 20 })
      .expect(200);
    expect(firstPage.body).toMatchObject({
      page: 1,
      pageSize: 20,
      hasNext: true,
    });
    expect(firstPage.body.items).toHaveLength(20);

    const lastPage = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .set(ownerHeaders)
      .query({ page: 2, pageSize: 20 })
      .expect(200);
    expect(lastPage.body).toMatchObject({
      page: 2,
      pageSize: 20,
      hasNext: false,
    });
    expect(lastPage.body.items).toHaveLength(1);

    const foreign = await request(app.getHttpServer())
      .post(`/v1/centers/${centerB1}/activities`)
      .set('authorization', 'Bearer member-b-token')
      .set('x-tenant-context', await contextFor('member-b-token'))
      .send({ name: { es: 'Buceo B', en: 'Diving B' } })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerB1}/activities`)
      .set(ownerHeaders)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities/${foreign.body.id}/slots`)
      .set(ownerHeaders)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/v1/centers/${centerB1}/activities/${foreign.body.id}/publish`)
      .set(ownerHeaders)
      .expect(404);
    const foreignState = await admin.query<{ status: string }>(
      `SELECT status
       FROM booking_app.activities
       WHERE tenant_id=$1 AND id=$2`,
      [tenantB, foreign.body.id],
    );
    expect(foreignState.rows).toEqual([{ status: 'Draft' }]);
  });

  it('returns non-disclosing problem responses for catalog authentication and scope failures', async () => {
    const missingSession = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1}/activities`)
      .expect(401);
    expect(missingSession.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(missingSession.body.code).toBe('unauthenticated');

    const ownerContext = await contextFor('owner-a-token');
    const foreignCenter = await request(app.getHttpServer())
      .get(`/v1/centers/${centerA2}/activities`)
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-context', await contextFor('manager-a-token'))
      .expect(404);
    expect(foreignCenter.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(foreignCenter.body.code).toBe('resource_not_found');

    await admin.query(
      `UPDATE iam_app.memberships
       SET roles=ARRAY['reception_booking_manager']
       WHERE tenant_id=$1 AND id=$2`,
      [tenantA, membershipManagerA],
    );
    const managerHeaders = {
      authorization: 'Bearer manager-a-token',
      'x-tenant-context': await contextFor('manager-a-token'),
    };
    const outOfScopeWithoutPermission = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA2}/activities`)
      .set(managerHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(404);
    expect(outOfScopeWithoutPermission.body.code).toBe('resource_not_found');
    const inScopeWithoutPermission = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set(managerHeaders)
      .send({ name: { es: 'Buceo', en: 'Diving' } })
      .expect(403);
    expect(inScopeWithoutPermission.body.code).toBe('permission_denied');

    await request(app.getHttpServer())
      .get(`/v1/centers/${centerA1.toUpperCase()}/activities`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', ownerContext)
      .expect(200);

    const malformed = await request(app.getHttpServer())
      .post(`/v1/centers/${centerA1}/activities`)
      .set('authorization', 'Bearer owner-a-token')
      .set('x-tenant-context', ownerContext)
      .set('content-type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(malformed.headers['content-type']).toMatch(
      /^application\/problem\+json/,
    );
    expect(malformed.body.code).toBe('malformed_json');
  });

  afterAll(async () => {
    if (app) await app.close();
    await admin.end();
  });
});
