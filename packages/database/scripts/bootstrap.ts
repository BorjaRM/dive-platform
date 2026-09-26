import { Pool } from 'pg';
import { bootstrapRoles } from '../src/bootstrap-roles.js';
import { spikeAdminDatabaseUrl } from '../src/env.js';

const adminPool = new Pool({
  connectionString: spikeAdminDatabaseUrl(),
  max: 1,
});
try {
  await bootstrapRoles(adminPool);
} finally {
  await adminPool.end();
}
