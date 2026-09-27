import { createHmac } from 'node:crypto';
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
import { AppModule } from '../src/app.module.js';
import { DATABASE_POOL, SECURITY_LOGGER } from '../src/iam.tokens.js';
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
const centerA1 = 'aaaaaaaa-0001-0001-0001-000000000001';
const centerA2 = 'aaaaaaaa-0001-0001-0001-000000000002';
const centerB1 = 'bbbbbbbb-0002-0002-0002-000000000001';
const ownerA = 'a1111111-1111-1111-1111-111111111111';
const ownerA2 = 'a2222222-2222-2222-2222-222222222222';
const managerA = 'a3333333-3333-3333-3333-333333333333';
const pendingA = 'a4444444-4444-4444-4444-444444444444';
const memberB = 'b1111111-1111-1111-1111-111111111111';
const membershipOwnerA = 'aa111111-1111-1111-1111-111111111111';
const membershipOwnerA2 = 'aa222222-2222-2222-2222-222222222222';
const membershipManagerA = 'aa333333-3333-3333-3333-333333333333';
const membershipPendingA = 'aa444444-4444-4444-4444-444444444444';
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
  let app: INestApplication;

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
    await admin.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,'test','owner-a'),($2,'test','owner-a2'),($3,'test','manager-a'),($4,'test','member-b')`,
      [ownerA, ownerA2, managerA, memberB],
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
      `INSERT INTO iam_app.centers(id,tenant_id,name) VALUES ($1,$2,'A1'),($3,$2,'A2'),($4,$5,'B1')`,
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

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await admin.end();
  });
});
