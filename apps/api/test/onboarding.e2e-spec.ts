import {
  bootstrapRoles,
  claimBootstrapOutboxEvent,
  completeBootstrapOutboxEvent,
  migrateProduct,
  setBootstrapPlatformCapability,
} from '@dive-center/database';
import {
  DeterministicIdentityProvider,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
  VERIFIED_ADDRESS_PROVIDER,
} from '@dive-center/identity';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app/app.module.js';
import { DATABASE_POOL } from '../src/common/database/database.tokens.js';
import { SECURITY_LOGGER } from '../src/common/security/security.tokens.js';

function databaseUrl(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const identityProvider = new DeterministicIdentityProvider(
  new Map([
    [
      'platform-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'platform-operator',
        verifiedAddresses: ['operator@example.test'],
      },
    ],
    [
      'tenant-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'tenant-operator',
        verifiedAddresses: ['tenant@example.test'],
      },
    ],
    [
      'bootstrap-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'invited-owner',
        sessionId: 'bootstrap-session',
        verifiedAddresses: ['owner@example.test'],
      },
    ],
    [
      'control-token',
      {
        issuer: 'https://identity.example.test',
        subject: 'control-owner',
        sessionId: 'control-session',
        verifiedAddresses: ['control@example.test'],
      },
    ],
  ]),
);

describe('platform bootstrap invitations HTTP (DIVE-ONB-REQ-039..040)', () => {
  const admin = new Pool({
    connectionString: databaseUrl('SPIKE_ADMIN_DATABASE_URL'),
    max: 1,
  });
  const appPool = new Pool({
    connectionString: databaseUrl('SPIKE_APP_DATABASE_URL'),
    max: 2,
  });
  const platformAdminPool = new Pool({
    connectionString: databaseUrl('SPIKE_PLATFORM_ADMIN_DATABASE_URL'),
    max: 1,
  });
  const workerPool = new Pool({
    connectionString: databaseUrl('SPIKE_WORKER_DATABASE_URL'),
    max: 1,
  });
  let app: INestApplication;
  const previousWritesFlag = process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;

  beforeAll(async () => {
    await bootstrapRoles(admin);
    await migrateProduct();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IDENTITY_PROVIDER)
      .useValue(identityProvider)
      .overrideProvider(VERIFIED_ADDRESS_PROVIDER)
      .useValue(identityProvider)
      .overrideProvider(IDENTITY_WEBHOOK_VERIFIER)
      .useValue({ verify: async () => undefined })
      .overrideProvider(DATABASE_POOL)
      .useValue(appPool)
      .overrideProvider(SECURITY_LOGGER)
      .useValue({ warn: () => undefined })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
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
    for (const capability of [
      'bootstrap_invitation.issue',
      'bootstrap_invitation.read',
      'bootstrap_invitation.reissue',
      'bootstrap_invitation.revoke',
    ] as const) {
      await setBootstrapPlatformCapability(platformAdminPool, {
        issuer: 'https://identity.example.test',
        subject: 'platform-operator',
        capability,
        enabled: true,
      });
    }
  });

  afterAll(async () => {
    if (previousWritesFlag === undefined) {
      delete process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED;
    } else {
      process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = previousWritesFlag;
    }
    await app?.close();
    await workerPool.end();
    await platformAdminPool.end();
    await admin.end();
  });

  it('issues, reads, reissues, and revokes safe state without credentials', async () => {
    const issued = await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'issue-1')
      .send({ destinationEmail: ' OWNER@Example.Test ', reason: 'Pilot' })
      .expect(201);
    expect(issued.body).toMatchObject({
      status: 'issued',
      deliveryStatus: 'pending',
    });
    expect(issued.body).not.toHaveProperty('ticket');
    expect(issued.body).not.toHaveProperty('url');

    await request(app.getHttpServer())
      .get(
        `/v1/platform/bootstrap-invitations/${issued.body.invitationId as string}`,
      )
      .set('Authorization', 'Bearer platform-token')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          invitationId: issued.body.invitationId,
          status: 'issued',
        });
      });

    const reissued = await request(app.getHttpServer())
      .post(
        `/v1/platform/bootstrap-invitations/${issued.body.invitationId as string}/reissue`,
      )
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'reissue-1')
      .send({ reason: 'Replace' })
      .expect(200);
    expect(reissued.body.invitationId).not.toBe(issued.body.invitationId);

    await request(app.getHttpServer())
      .post(
        `/v1/platform/bootstrap-invitations/${reissued.body.invitationId as string}/revoke`,
      )
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'revoke-1')
      .send({ reason: 'Operator request' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('revoked'));
  });

  it('allows an initial issue without a reason but requires reasons for mutations', async () => {
    const issued = await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'issue-without-reason')
      .send({ destinationEmail: 'owner@example.test' })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/v1/platform/bootstrap-invitations/${issued.body.invitationId as string}/reissue`,
      )
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'reissue-without-reason')
      .send({})
      .expect(422);

    await request(app.getHttpServer())
      .post(
        `/v1/platform/bootstrap-invitations/${issued.body.invitationId as string}/revoke`,
      )
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'revoke-without-reason')
      .send({})
      .expect(422);
  });

  async function deliverInvitation(
    destinationEmail: string,
    idempotencyKey: string,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', idempotencyKey)
      .send({ destinationEmail, reason: 'Self bootstrap' })
      .expect(201);

    const workerClient = await workerPool.connect();
    try {
      await workerClient.query('BEGIN');
      const event = await claimBootstrapOutboxEvent(workerClient);
      if (!event) throw new Error('Expected provider create command');
      await completeBootstrapOutboxEvent(workerClient, {
        eventId: event.eventId,
        providerInvitationRef: `clerk_invitation_${idempotencyKey}`,
        providerStatus: 'pending',
      });
      await workerClient.query('COMMIT');
    } catch (error) {
      await workerClient.query('ROLLBACK');
      throw error;
    } finally {
      workerClient.release();
    }
  }

  it('completes registration for a new or existing invited identity after its session is established (DIVE-ONB-REQ-038, DIVE-ONB-REQ-041)', async () => {
    await deliverInvitation('owner@example.test', 'registration-matching');
    const setup = {
      operatorDisplayName: 'Ocean Blue',
      centerDisplayName: 'North Shore',
      timeZone: 'Europe/Madrid',
      locale: 'en',
    };

    const completed = await request(app.getHttpServer())
      .post('/v1/me/tenant-bootstrap')
      .set('Authorization', 'Bearer bootstrap-token')
      .send(setup)
      .expect(201);
    expect(completed.body).toMatchObject({
      centerKey: expect.stringMatching(/^north-shore/),
    });
    expect(completed.body).not.toHaveProperty('invitationId');

    const persisted = await admin.query<{
      centers: number;
      grant_status: string;
      memberships: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.centers WHERE tenant_id = $1) AS centers,
        (SELECT count(*)::int FROM iam_app.memberships
          WHERE tenant_id = $1 AND status = 'active' AND roles = ARRAY['tenant_owner']) AS memberships,
        (SELECT status FROM onboarding_app.tenant_bootstrap_grants
          WHERE result_tenant_id = $1) AS grant_status`,
      [completed.body.tenantId],
    );
    expect(persisted.rows[0]).toEqual({
      centers: 1,
      grant_status: 'consumed',
      memberships: 1,
    });
  });

  it('rejects registration without a session before any tenant write (DIVE-ONB-REQ-050)', async () => {
    await deliverInvitation(
      'owner@example.test',
      'registration-missing-session',
    );
    const before = await admin.query<{ tenants: number }>(
      `SELECT count(*)::int AS tenants FROM iam_app.tenants`,
    );

    await request(app.getHttpServer())
      .post('/v1/me/tenant-bootstrap')
      .send({
        operatorDisplayName: 'Ocean Blue',
        centerDisplayName: 'North Shore',
        timeZone: 'Europe/Madrid',
        locale: 'en',
      })
      .expect(401)
      .expect(({ body }) => expect(body.message).toBe('Unauthenticated'));

    const persisted = await admin.query<{
      grant_status: string;
      tenants: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.tenants) AS tenants,
        (SELECT status FROM onboarding_app.tenant_bootstrap_grants) AS grant_status`,
    );
    expect(persisted.rows[0]).toEqual({
      grant_status: 'issued',
      tenants: before.rows[0]?.tenants,
    });
  });

  it('denies registration for a different active identity without disclosure (DIVE-ONB-REQ-041, DIVE-ONB-REQ-050)', async () => {
    await deliverInvitation(
      'owner@example.test',
      'registration-different-session',
    );
    const before = await admin.query<{ tenants: number }>(
      `SELECT count(*)::int AS tenants FROM iam_app.tenants`,
    );

    await request(app.getHttpServer())
      .post('/v1/me/tenant-bootstrap')
      .set('Authorization', 'Bearer control-token')
      .send({
        operatorDisplayName: 'Ocean Blue',
        centerDisplayName: 'North Shore',
        timeZone: 'Europe/Madrid',
        locale: 'en',
      })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('bootstrap_unavailable'));

    const persisted = await admin.query<{
      grant_status: string;
      tenants: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.tenants) AS tenants,
        (SELECT status FROM onboarding_app.tenant_bootstrap_grants) AS grant_status`,
    );
    expect(persisted.rows[0]).toEqual({
      grant_status: 'issued',
      tenants: before.rows[0]?.tenants,
    });
  });

  it('completes bootstrap only for the matching authenticated identity and closed setup body (DIVE-ONB-REQ-004, DIVE-ONB-REQ-041)', async () => {
    await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'completion-issue')
      .send({
        destinationEmail: 'owner@example.test',
        reason: 'Self bootstrap',
      })
      .expect(201);

    const workerClient = await workerPool.connect();
    try {
      await workerClient.query('BEGIN');
      const event = await claimBootstrapOutboxEvent(workerClient);
      if (!event) throw new Error('Expected provider create command');
      await completeBootstrapOutboxEvent(workerClient, {
        eventId: event.eventId,
        providerInvitationRef: 'clerk_invitation_e2e',
        providerStatus: 'pending',
      });
      await workerClient.query('COMMIT');
    } catch (error) {
      await workerClient.query('ROLLBACK');
      throw error;
    } finally {
      workerClient.release();
    }

    await request(app.getHttpServer())
      .post('/v1/me/tenant-bootstrap')
      .set('Authorization', 'Bearer bootstrap-token')
      .send({
        operatorDisplayName: 'Ocean Blue',
        centerDisplayName: 'North Shore',
        timeZone: 'Europe/Madrid',
        locale: 'en',
      })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          centerKey: expect.stringMatching(/^north-shore/),
        });
        expect(body).not.toHaveProperty('invitationId');
      });

    await request(app.getHttpServer())
      .post('/v1/me/tenant-bootstrap')
      .set('Authorization', 'Bearer bootstrap-token')
      .send({
        operatorDisplayName: 'Ocean Blue',
        centerDisplayName: 'North Shore',
        timeZone: 'Europe/Madrid',
        locale: 'en',
        tenantId: 'aaaaaaaa-1111-4111-8111-111111111111',
      })
      .expect(422);
  });

  it('denies tenant identities and caller-owned provider fields', async () => {
    await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer tenant-token')
      .set('Idempotency-Key', 'tenant-attempt')
      .send({ destinationEmail: 'owner@example.test', reason: 'Attempt' })
      .expect(403)
      .expect('Content-Type', /application\/problem\+json/);

    await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'unsafe-input')
      .send({
        destinationEmail: 'owner@example.test',
        reason: 'Attempt',
        redirectUrl: 'https://attacker.example.test',
      })
      .expect(422);
  });

  it('keeps reads available while disabled and rejects mutations', async () => {
    process.env.BOOTSTRAP_INVITATION_WRITES_ENABLED = 'false';
    await request(app.getHttpServer())
      .get(
        '/v1/platform/bootstrap-invitations/aaaaaaaa-1111-4111-8111-111111111111',
      )
      .set('Authorization', 'Bearer platform-token')
      .expect(404);
    await request(app.getHttpServer())
      .post('/v1/platform/bootstrap-invitations')
      .set('Authorization', 'Bearer platform-token')
      .set('Idempotency-Key', 'disabled')
      .send({ destinationEmail: 'owner@example.test', reason: 'Attempt' })
      .expect(503)
      .expect(({ body }) => expect(body.code).toBe('feature_unavailable'));
  });

  it('limits the eleventh operation with a non-disclosing Retry-After', async () => {
    for (let operation = 0; operation < 10; operation += 1) {
      await request(app.getHttpServer())
        .get(
          `/v1/platform/bootstrap-invitations/aaaaaaaa-1111-4111-8111-${String(operation).padStart(12, '0')}`,
        )
        .set('Authorization', 'Bearer platform-token')
        .expect(404);
    }
    await request(app.getHttpServer())
      .get(
        '/v1/platform/bootstrap-invitations/aaaaaaaa-1111-4111-8111-999999999999',
      )
      .set('Authorization', 'Bearer platform-token')
      .expect(429)
      .expect('Content-Type', /application\/problem\+json/)
      .expect('Retry-After', /[1-9][0-9]*/)
      .expect(({ body }) => expect(body.code).toBe('rate_limited'));
  });
});
