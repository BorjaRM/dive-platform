import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { bootstrapRoles } from './bootstrap-roles.js';

const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../sql/0001_mt_spike_harness.sql',
);

export async function applyMtSpikeHarness(adminPool: Pool): Promise<void> {
  await bootstrapRoles(adminPool);
  const sql = readFileSync(sqlPath, 'utf8');
  await adminPool.query(sql);
}
