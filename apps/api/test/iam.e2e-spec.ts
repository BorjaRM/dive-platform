import {
  applyIamApiVertical,
  spikeAdminDatabaseUrl,
  spikeAppDatabaseUrl,
} from '@dive-center/database';
import {
  DeterministicIdentityProvider,
  IDENTITY_PROVIDER,
} from '@dive-center/identity';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DATABASE_POOL, SECURITY_LOGGER } from '../src/iam.tokens.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const centerA1 = 'aaaaaaaa-0001-0001-0001-000000000001';
const centerA2 = 'aaaaaaaa-0001-0001-0001-000000000002';
const centerB1 = 'bbbbbbbb-0002-0002-0002-000000000001';
const ownerA = 'a1111111-1111-1111-1111-111111111111';
const ownerA2 = 'a2222222-2222-2222-2222-222222222222';
const managerA = 'a3333333-3333-3333-3333-333333333333';
const memberB = 'b1111111-1111-1111-1111-111111111111';
const membershipOwnerA = 'aa111111-1111-1111-1111-111111111111';
const membershipOwnerA2 = 'aa222222-2222-2222-2222-222222222222';
const membershipManagerA = 'aa333333-3333-3333-3333-333333333333';
const membershipB = 'bb111111-1111-1111-1111-111111111111';

const principals = new Map([
  ['owner-a-token', { issuer: 'test', subject: 'owner-a' }],
  ['owner-a2-token', { issuer: 'test', subject: 'owner-a2' }],
  ['manager-a-token', { issuer: 'test', subject: 'manager-a' }],
  ['member-b-token', { issuer: 'test', subject: 'member-b' }],
]);

describe('IAM/API vertical (e2e)', () => {
  const admin = new Pool({ connectionString: spikeAdminDatabaseUrl() });
  const appPool = new Pool({ connectionString: spikeAppDatabaseUrl() });
  const logs: unknown[] = [];
  let app: INestApplication;

  beforeAll(async () => {
    await applyIamApiVertical(admin);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(new DeterministicIdentityProvider(principals))
      .overrideProvider(DATABASE_POOL)
      .useValue(appPool)
      .overrideProvider(SECURITY_LOGGER)
      .useValue({ warn: (entry: unknown) => logs.push(entry) })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    logs.length = 0;
    await admin.query(
      'TRUNCATE iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
    await admin.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await admin.query(
      `INSERT INTO iam_app.identities(id) VALUES ($1),($2),($3),($4)`,
      [ownerA, ownerA2, managerA, memberB],
    );
    await admin.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject) VALUES ($1,'test','owner-a'),($2,'test','owner-a2'),($3,'test','manager-a'),($4,'test','member-b')`,
      [ownerA, ownerA2, managerA, memberB],
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
      ($9,$10,$11,'active',ARRAY['tenant_admin'],NULL)`,
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
      ],
    );
  });

  it('reads an authorized center and enforces assigned center scope', async () => {
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA1}`)
      .set('authorization', 'Bearer manager-a-token')
      .expect(200)
      .expect({ id: centerA1, name: 'A1' });
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA2}`)
      .set('authorization', 'Bearer manager-a-token')
      .expect(403)
      .expect({
        message: 'Access denied',
        error: 'Forbidden',
        statusCode: 403,
      });
  });

  it('denies missing identity, foreign tenant, and foreign center without disclosure', async () => {
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA1}`)
      .expect(401);
    const foreign = await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantB}/centers/${centerB1}`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(403);
    expect(JSON.stringify(foreign.body)).not.toContain(centerB1);
    expect(JSON.stringify(logs)).not.toContain(centerB1);
    expect(JSON.stringify(logs)).not.toContain('owner-a-token');
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA1}`)
      .set('authorization', 'Bearer sensitive@example.test')
      .expect(401);
    expect(JSON.stringify(logs)).not.toContain('sensitive@example.test');
  });

  it('ignores client-supplied authorization claims', async () => {
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA2}`)
      .set('authorization', 'Bearer manager-a-token')
      .set('x-tenant-id', tenantB)
      .set('x-permissions', 'membership.disable')
      .expect(403);
  });

  it('disables a membership with atomic audit and outbox derived from context', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/tenants/${tenantA}/memberships/${membershipManagerA}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(200)
      .expect({ status: 'disabled' });
    const result = await admin.query(
      `SELECT m.status, a.tenant_id audit_tenant, o.tenant_id outbox_tenant, a.correlation_id audit_correlation, o.correlation_id outbox_correlation, o.payload
      FROM iam_app.memberships m JOIN iam_app.audit_records a ON a.resource_id=m.id JOIN iam_app.outbox_events o ON o.payload->>'membershipId'=m.id::text WHERE m.id=$1`,
      [membershipManagerA],
    );
    expect(result.rows[0]).toMatchObject({
      status: 'disabled',
      audit_tenant: tenantA,
      outbox_tenant: tenantA,
      payload: { membershipId: membershipManagerA },
    });
    expect(result.rows[0].audit_correlation).toBe(
      result.rows[0].outbox_correlation,
    );
    await request(app.getHttpServer())
      .get(`/v1/tenants/${tenantA}/centers/${centerA1}`)
      .set('authorization', 'Bearer manager-a-token')
      .expect(403);
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
      .patch(`/v1/tenants/${tenantA}/memberships/${membershipManagerA}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(403);
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
      .patch(`/v1/tenants/${tenantB}/memberships/${membershipB}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/v1/tenants/${tenantA}/memberships/${membershipOwnerA2}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/v1/tenants/${tenantA}/memberships/${membershipOwnerA}/disable`)
      .set('authorization', 'Bearer owner-a-token')
      .expect(403)
      .expect({
        message: 'Operation not allowed',
        error: 'Forbidden',
        statusCode: 403,
      });
  });

  it('does not grant membership.disable to center managers', async () => {
    await request(app.getHttpServer())
      .patch(`/v1/tenants/${tenantA}/memberships/${membershipOwnerA}/disable`)
      .set('authorization', 'Bearer manager-a-token')
      .expect(403);
  });

  afterAll(async () => {
    await app.close();
    await appPool.end();
    await admin.end();
  });
});
