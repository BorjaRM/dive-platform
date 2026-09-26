import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { applyMtSpikeHarness } from './apply-harness.js';

const sqlPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../sql/0002_iam_api_vertical.sql',
);

export async function applyIamApiVertical(adminPool: Pool): Promise<void> {
  await applyMtSpikeHarness(adminPool);
  await adminPool.query(readFileSync(sqlPath, 'utf8'));
}
