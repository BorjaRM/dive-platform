import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapRoles } from '../../src/bootstrap-roles.js';
import { resolveIamAccess } from '../../src/iam-authorize.js';
import { applyIdentityWebhook } from '../../src/iam-identity-webhooks.js';
import { migrateProduct } from '../../src/migrate.js';
import { createAdminPool, createAppPool } from './harness.js';

const tenantA = '11111111-1111-1111-1111-111111111111';
const tenantB = '22222222-2222-2222-2222-222222222222';
const identityId = 'a1111111-1111-1111-1111-111111111111';
const secondOwnerIdentityId = 'a2222222-2222-2222-2222-222222222222';
const secondOwnerMembershipId = 'aaaa2222-2222-2222-2222-222222222222';
const issuer = 'https://clerk.example.test';
const subject = 'user_123';

describe('IAM identity webhook inbox (DIVE-IAM-REQ-018, DIVE-IAM-REQ-021)', () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    adminPool = createAdminPool();
    appPool = createAppPool();
    await bootstrapRoles(adminPool);
    await migrateProduct();
  });

  beforeEach(async () => {
    await adminPool.query(
      'TRUNCATE iam_app.identity_webhook_inbox, iam_app.outbox_events, iam_app.audit_records, iam_app.memberships, iam_app.centers, iam_app.external_identities, iam_app.identities, iam_app.tenants CASCADE',
    );
    await adminPool.query(
      `INSERT INTO iam_app.tenants(id,name) VALUES ($1,'A'),($2,'B')`,
      [tenantA, tenantB],
    );
    await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
      identityId,
    ]);
    await adminPool.query(
      `INSERT INTO iam_app.external_identities(identity_id,issuer,subject)
       VALUES ($1,$2,$3)`,
      [identityId, issuer, subject],
    );
    await adminPool.query(
      `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
       VALUES
         ('aaaaaaaa-1111-1111-1111-111111111111',$1,$3,'active',ARRAY['tenant_admin'],NULL),
         ('bbbbbbbb-2222-2222-2222-222222222222',$2,$3,'active',ARRAY['auditor_compliance'],NULL)`,
      [tenantA, tenantB, identityId],
    );
  });

  afterAll(async () => {
    await appPool.end();
    await adminPool.end();
  });

  async function readAuthorizationState() {
    const externalIdentities = await adminPool.query(
      `SELECT identity_id::text, issuer, subject
       FROM iam_app.external_identities ORDER BY issuer, subject`,
    );
    const memberships = await adminPool.query(
      `SELECT id::text, tenant_id::text, identity_id::text, status, roles, center_ids
       FROM iam_app.memberships ORDER BY tenant_id, id`,
    );
    const identityTenants = await adminPool.query(
      `SELECT identity_id::text, tenant_id::text
       FROM iam_app.identity_tenants ORDER BY identity_id, tenant_id`,
    );
    const identities = await adminPool.query<{ count: number }>(
      'SELECT count(*)::int count FROM iam_app.identities',
    );
    return {
      externalIdentities: externalIdentities.rows,
      identityTenants: identityTenants.rows,
      memberships: memberships.rows,
      identityCount: identities.rows[0]?.count,
    };
  }

  async function configureOwnerScenario(includeSecondOwner: boolean) {
    await adminPool.query(
      'DELETE FROM iam_app.memberships WHERE tenant_id=$1 AND identity_id=$2',
      [tenantB, identityId],
    );
    await adminPool.query(
      'DELETE FROM iam_app.identity_tenants WHERE tenant_id=$1 AND identity_id=$2',
      [tenantB, identityId],
    );
    await adminPool.query(
      `UPDATE iam_app.memberships SET roles=ARRAY['tenant_owner']
       WHERE tenant_id=$1 AND identity_id=$2`,
      [tenantA, identityId],
    );
    if (includeSecondOwner) {
      await adminPool.query('INSERT INTO iam_app.identities(id) VALUES ($1)', [
        secondOwnerIdentityId,
      ]);
      await adminPool.query(
        `INSERT INTO iam_app.memberships(id,tenant_id,identity_id,status,roles,center_ids)
         VALUES ($1,$2,$3,'active',ARRAY['tenant_owner'],NULL)`,
        [secondOwnerMembershipId, tenantA, secondOwnerIdentityId],
      );
    }
  }

  function deletionEvent(providerEventId: string) {
    return {
      providerEventId,
      issuer,
      type: 'user.deleted',
      subject,
      occurredAt: '2026-09-26T12:00:00.000Z',
    } as const;
  }

  it('records a two-owner deletion sequentially without changing authorization state', async () => {
    await configureOwnerScenario(true);
    const before = await readAuthorizationState();
    const event = deletionEvent('evt_delete_two_owner_sequential');

    await expect(
      applyIdentityWebhook(
        appPool,
        event,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toEqual({
      duplicate: false,
      processingResult: 'applied',
      affectedTenantCount: 1,
    });
    await expect(
      applyIdentityWebhook(
        appPool,
        event,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ),
    ).resolves.toEqual({
      duplicate: true,
      processingResult: 'applied',
      affectedTenantCount: 0,
    });

    expect(await readAuthorizationState()).toEqual(before);
    await expect(
      resolveIamAccess(appPool, { issuer, subject }, tenantA),
    ).resolves.toMatchObject({ identityId, tenantId: tenantA });
    const proof = await adminPool.query(
      `SELECT
        (SELECT count(*)::int FROM iam_app.identity_webhook_inbox WHERE issuer=$1 AND provider_event_id=$2) inbox_count,
        (SELECT count(*)::int FROM iam_app.audit_records WHERE action='identity.webhook.apply' AND resource_id=$3::uuid) audit_count,
        (SELECT count(*)::int FROM iam_app.outbox_events WHERE event_type='iam.identity.provider_deletion_recorded.v1' AND payload->>'identityId'=$3::text) outbox_count`,
      [issuer, event.providerEventId, identityId],
    );
    expect(proof.rows[0]).toEqual({
      inbox_count: 1,
      audit_count: 1,
      outbox_count: 1,
    });
  });

  it('records concurrent two-owner deliveries exactly once without changing authorization state', async () => {
    await configureOwnerScenario(true);
    const before = await readAuthorizationState();
    const event = deletionEvent('evt_delete_two_owner_concurrent');

    const outcomes = await Promise.all([
      applyIdentityWebhook(
        appPool,
        event,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
      applyIdentityWebhook(
        appPool,
        event,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ),
    ]);

    expect(outcomes.map(({ duplicate }) => duplicate).sort()).toEqual([
      false,
      true,
    ]);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        {
          duplicate: false,
          processingResult: 'applied',
          affectedTenantCount: 1,
        },
        {
          duplicate: true,
          processingResult: 'applied',
          affectedTenantCount: 0,
        },
      ]),
    );
    expect(await readAuthorizationState()).toEqual(before);

    const proof = await adminPool.query(
      `SELECT
        (SELECT count(*)::int FROM iam_app.identity_webhook_inbox WHERE issuer=$1 AND provider_event_id=$2) inbox_count,
        (SELECT count(*)::int FROM iam_app.audit_records WHERE action='identity.webhook.apply' AND resource_id=$3::uuid) audit_count,
        (SELECT count(*)::int FROM iam_app.outbox_events WHERE event_type='iam.identity.provider_deletion_recorded.v1' AND payload->>'identityId'=$3::text) outbox_count`,
      [issuer, event.providerEventId, identityId],
    );
    expect(proof.rows[0]).toEqual({
      inbox_count: 1,
      audit_count: 1,
      outbox_count: 1,
    });
  });

  it('preserves a sole owner and records a successful non-authorizing signal', async () => {
    await configureOwnerScenario(false);
    const before = await readAuthorizationState();
    const event = deletionEvent('evt_delete_sole_owner');

    await expect(
      applyIdentityWebhook(
        appPool,
        event,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toEqual({
      duplicate: false,
      processingResult: 'applied',
      affectedTenantCount: 1,
    });

    expect(await readAuthorizationState()).toEqual(before);
    await expect(
      resolveIamAccess(appPool, { issuer, subject }, tenantA),
    ).resolves.toMatchObject({ identityId, tenantId: tenantA });
    const proof = await adminPool.query<{
      event_type: string;
      reason: string | null;
      result: string;
    }>(
      `SELECT audit.result, audit.reason, outbox.event_type
       FROM iam_app.audit_records audit
       JOIN iam_app.outbox_events outbox
         ON outbox.tenant_id=audit.tenant_id AND outbox.correlation_id=audit.correlation_id
       WHERE audit.action='identity.webhook.apply' AND audit.resource_id=$1`,
      [identityId],
    );
    expect(proof.rows).toEqual([
      {
        result: 'success',
        reason: null,
        event_type: 'iam.identity.provider_deletion_recorded.v1',
      },
    ]);
  });

  it('records one signal per associated tenant without mutation or grants', async () => {
    const before = await readAuthorizationState();
    const event = {
      ...deletionEvent('evt_delete_multi_tenant'),
    };

    await expect(
      applyIdentityWebhook(
        appPool,
        event,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toEqual({
      duplicate: false,
      processingResult: 'applied',
      affectedTenantCount: 2,
    });
    expect(await readAuthorizationState()).toEqual(before);
    await expect(
      resolveIamAccess(appPool, { issuer, subject }, tenantA),
    ).resolves.toMatchObject({ identityId, tenantId: tenantA });
    await expect(
      resolveIamAccess(appPool, { issuer, subject }, tenantB),
    ).resolves.toMatchObject({ identityId, tenantId: tenantB });

    const proof = await adminPool.query<{ tenant_id: string }>(
      `SELECT tenant_id::text
       FROM iam_app.audit_records
       WHERE action='identity.webhook.apply' AND resource_id=$1
       ORDER BY tenant_id`,
      [identityId],
    );
    const signals = await adminPool.query<{ tenant_id: string }>(
      `SELECT tenant_id::text
       FROM iam_app.outbox_events
       WHERE event_type='iam.identity.provider_deletion_recorded.v1'
         AND payload->>'identityId'=$1
       ORDER BY tenant_id`,
      [identityId],
    );
    expect(proof.rows).toEqual([
      { tenant_id: tenantA },
      { tenant_id: tenantB },
    ]);
    expect(signals.rows).toEqual(proof.rows);
  });

  it('keeps reversed delivery signal-only and idempotent without treating the older event as current state', async () => {
    const before = await readAuthorizationState();
    const newerDeletion = {
      ...deletionEvent('evt_out_of_order_delete'),
      occurredAt: '2026-09-26T13:00:00.000Z',
    } as const;
    const olderUpdate = {
      providerEventId: 'evt_out_of_order_update',
      issuer,
      type: 'user.updated',
      subject,
      occurredAt: '2026-09-26T12:00:00.000Z',
    } as const;

    await expect(
      applyIdentityWebhook(
        appPool,
        newerDeletion,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toEqual({
      duplicate: false,
      processingResult: 'applied',
      affectedTenantCount: 2,
    });
    await expect(
      applyIdentityWebhook(
        appPool,
        olderUpdate,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ),
    ).resolves.toEqual({
      duplicate: false,
      processingResult: 'ignored',
      affectedTenantCount: 0,
    });

    await expect(
      applyIdentityWebhook(
        appPool,
        newerDeletion,
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
      ),
    ).resolves.toEqual({
      duplicate: true,
      processingResult: 'applied',
      affectedTenantCount: 0,
    });
    await expect(
      applyIdentityWebhook(
        appPool,
        olderUpdate,
        'dddddddd-dddd-dddd-dddd-dddddddddddd',
      ),
    ).resolves.toEqual({
      duplicate: true,
      processingResult: 'ignored',
      affectedTenantCount: 0,
    });

    expect(await readAuthorizationState()).toEqual(before);
    await expect(
      resolveIamAccess(appPool, { issuer, subject }, tenantA),
    ).resolves.toMatchObject({ identityId, tenantId: tenantA });
    await expect(
      resolveIamAccess(appPool, { issuer, subject }, tenantB),
    ).resolves.toMatchObject({ identityId, tenantId: tenantB });

    const inbox = await adminPool.query<{
      event_type: string;
      occurred_at: string;
      processing_result: string;
      provider_event_id: string;
      resolved_identity_id: string;
      subject: string;
    }>(
      `SELECT provider_event_id, event_type, subject,
              to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
              resolved_identity_id::text, processing_result
       FROM iam_app.identity_webhook_inbox
       WHERE issuer=$1
       ORDER BY provider_event_id`,
      [issuer],
    );
    expect(inbox.rows).toEqual([
      {
        event_type: 'user.deleted',
        occurred_at: '2026-09-26T13:00:00.000Z',
        processing_result: 'applied',
        provider_event_id: 'evt_out_of_order_delete',
        resolved_identity_id: identityId,
        subject,
      },
      {
        event_type: 'user.updated',
        occurred_at: '2026-09-26T12:00:00.000Z',
        processing_result: 'ignored',
        provider_event_id: 'evt_out_of_order_update',
        resolved_identity_id: identityId,
        subject,
      },
    ]);

    const effects = await adminPool.query<{
      audit_event_id: string;
      event_type: string;
      outbox_event_id: string;
      result: string;
      tenant_id: string;
    }>(
      `SELECT audit.tenant_id::text, audit.result,
              audit.source_metadata->>'providerEventId' AS audit_event_id,
              outbox.event_type,
              outbox.payload->>'providerEventId' AS outbox_event_id
       FROM iam_app.audit_records AS audit
       JOIN iam_app.outbox_events AS outbox
         ON outbox.tenant_id = audit.tenant_id
        AND outbox.correlation_id = audit.correlation_id
       WHERE audit.action='identity.webhook.apply'
         AND audit.resource_id=$1
       ORDER BY audit.tenant_id`,
      [identityId],
    );
    expect(effects.rows).toEqual([
      {
        audit_event_id: 'evt_out_of_order_delete',
        event_type: 'iam.identity.provider_deletion_recorded.v1',
        outbox_event_id: 'evt_out_of_order_delete',
        result: 'success',
        tenant_id: tenantA,
      },
      {
        audit_event_id: 'evt_out_of_order_delete',
        event_type: 'iam.identity.provider_deletion_recorded.v1',
        outbox_event_id: 'evt_out_of_order_delete',
        result: 'success',
        tenant_id: tenantB,
      },
    ]);
  });

  it('records unknown and unresolved events without creating authorization state', async () => {
    await expect(
      applyIdentityWebhook(
        appPool,
        {
          providerEventId: 'evt_unknown',
          issuer,
          type: 'organization.updated',
          subject: null,
          occurredAt: new Date().toISOString(),
        },
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      ),
    ).resolves.toMatchObject({ processingResult: 'ignored' });
    await expect(
      applyIdentityWebhook(
        appPool,
        {
          providerEventId: 'evt_unresolved_deletion',
          issuer,
          type: 'user.deleted',
          subject: 'user_missing',
          occurredAt: new Date().toISOString(),
        },
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      ),
    ).resolves.toMatchObject({ processingResult: 'unresolved' });

    const counts = await adminPool.query<{
      identities: number;
      memberships: number;
    }>(
      `SELECT
        (SELECT count(*)::int FROM iam_app.identities) identities,
        (SELECT count(*)::int FROM iam_app.memberships) memberships`,
    );
    expect(counts.rows[0]).toEqual({ identities: 1, memberships: 2 });
  });

  it('prevents the runtime role from bypassing the webhook command', async () => {
    await expect(
      appPool.query(
        `INSERT INTO iam_app.identity_webhook_inbox
         (provider_event_id,issuer,event_type,processing_result)
         VALUES ('evt_direct',$1,'user.deleted','applied')`,
        [issuer],
      ),
    ).rejects.toThrow('permission denied for table identity_webhook_inbox');
    await expect(
      appPool.query(
        `UPDATE iam_app.external_identities SET subject='tampered'
         WHERE issuer=$1 AND subject=$2`,
        [issuer, subject],
      ),
    ).rejects.toThrow('permission denied for table external_identities');
  });
});
