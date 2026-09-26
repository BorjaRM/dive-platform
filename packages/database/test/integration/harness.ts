import { Pool } from 'pg';
import { applyMtSpikeHarness } from '../../src/apply-harness.js';
import { spikeAdminDatabaseUrl, spikeAppDatabaseUrl } from '../../src/env.js';

export const tenantA = '11111111-1111-1111-1111-111111111111';
export const tenantB = '22222222-2222-2222-2222-222222222222';
export const centerA1 = 'aaaaaaaa-0001-0001-0001-000000000001';
export const centerA2 = 'aaaaaaaa-0001-0001-0001-000000000002';
export const centerB1 = 'bbbbbbbb-0002-0002-0002-000000000001';
export const identityA = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
export const identityB = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
export const identityUnaffiliated = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';

/** Documented names from SPEC-DIVE-IAM-001; prototype membership payload only. */
export const typicalPermissions = ['center.read', 'booking.create'];

export function createAdminPool(): Pool {
  return new Pool({ connectionString: spikeAdminDatabaseUrl(), max: 4 });
}

export function createAppPool(max = 4): Pool {
  return new Pool({ connectionString: spikeAppDatabaseUrl(), max });
}

export async function setupHarness(adminPool: Pool): Promise<void> {
  await applyMtSpikeHarness(adminPool);
  await adminPool.query(
    'TRUNCATE mt_spike.consumer_receipts, mt_spike.audit_records, mt_spike.outbox_events, mt_spike.notes, mt_spike.memberships, mt_spike.centers, mt_spike.identities, mt_spike.tenants CASCADE',
  );
  await adminPool.query(`INSERT INTO mt_spike.tenants (id) VALUES ($1), ($2)`, [
    tenantA,
    tenantB,
  ]);
  await adminPool.query(
    `INSERT INTO mt_spike.identities (id) VALUES ($1), ($2), ($3)`,
    [identityA, identityB, identityUnaffiliated],
  );
  await adminPool.query(
    `INSERT INTO mt_spike.centers (id, tenant_id, name) VALUES
      ($1, $2, 'Center A1'),
      ($3, $2, 'Center A2'),
      ($4, $5, 'Center B1')`,
    [centerA1, tenantA, centerA2, centerB1, tenantB],
  );
  await adminPool.query(
    `INSERT INTO mt_spike.memberships (tenant_id, identity_id, permissions) VALUES
      ($1, $2, $3),
      ($4, $5, $3)`,
    [tenantA, identityA, typicalPermissions, tenantB, identityB],
  );
}

export async function truncateTenantData(adminPool: Pool): Promise<void> {
  await adminPool.query(
    'TRUNCATE mt_spike.consumer_receipts, mt_spike.audit_records, mt_spike.outbox_events, mt_spike.notes',
  );
}
