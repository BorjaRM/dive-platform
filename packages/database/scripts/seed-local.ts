import { Client } from 'pg';

const localDatabaseName = 'dive_spike';
const localDatabasePort = '55432';
const syntheticIssuer = 'https://seed.identity.test';

const tenants = {
  blueCurrent: '00000000-0000-4000-8000-000000000001',
  oceanAtlas: '00000000-0000-4000-8000-000000000002',
} as const;

const centers = {
  puertoAzul: '00000000-0000-4000-8000-000000000101',
  bahiaLuna: '00000000-0000-4000-8000-000000000102',
  arrecifeSur: '00000000-0000-4000-8000-000000000201',
} as const;

const identities = {
  owner: '00000000-0000-4000-8000-000000000301',
  operationsLead: '00000000-0000-4000-8000-000000000302',
  centerManager: '00000000-0000-4000-8000-000000000303',
  atlasAdmin: '00000000-0000-4000-8000-000000000304',
} as const;

const memberships = {
  ownerBlueCurrent: '00000000-0000-4000-8000-000000000401',
  ownerOceanAtlas: '00000000-0000-4000-8000-000000000402',
  operationsLead: '00000000-0000-4000-8000-000000000403',
  centerManager: '00000000-0000-4000-8000-000000000404',
  atlasAdmin: '00000000-0000-4000-8000-000000000405',
} as const;

type Environment = Record<string, string | undefined>;

type SeedIdentity = Readonly<{
  id: string;
  key: string;
  fallbackSubject: string;
}>;

const seedIdentities: readonly SeedIdentity[] = [
  { id: identities.owner, key: 'OWNER', fallbackSubject: 'demo-owner' },
  {
    id: identities.operationsLead,
    key: 'OPERATIONS_LEAD',
    fallbackSubject: 'demo-operations-lead',
  },
  {
    id: identities.centerManager,
    key: 'CENTER_MANAGER',
    fallbackSubject: 'demo-center-manager',
  },
  {
    id: identities.atlasAdmin,
    key: 'ATLAS_ADMIN',
    fallbackSubject: 'demo-atlas-admin',
  },
];

function localDatabaseUrl(environment: Environment): string {
  const value = environment.MIGRATION_DATABASE_URL;
  if (!value) throw new Error('Missing MIGRATION_DATABASE_URL.');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      'MIGRATION_DATABASE_URL must be a valid local PostgreSQL URL.',
    );
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.port !== localDatabasePort ||
    url.pathname !== `/${localDatabaseName}` ||
    url.username !== 'dive_migration' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `MIGRATION_DATABASE_URL must target ${localDatabaseName} on loopback port ${localDatabasePort} as dive_migration, without query parameters or fragments.`,
    );
  }

  return url.href;
}

export function assertLocalSeedEnvironment(environment: Environment): string {
  if (environment.NODE_ENV !== 'development') {
    throw new Error('Local seed requires NODE_ENV=development.');
  }
  return localDatabaseUrl(environment);
}

function requiredSeedValue(
  environment: Environment,
  name: string,
  fallback: string,
): string {
  const value = environment[name]?.trim() || fallback;
  if (!value) throw new Error(`${name} must not be empty.`);
  return value;
}

function seedSubjects(environment: Environment): ReadonlyMap<string, string> {
  return new Map(
    seedIdentities.map((identity) => [
      identity.key,
      requiredSeedValue(
        environment,
        `SEED_${identity.key}_SUBJECT`,
        identity.fallbackSubject,
      ),
    ]),
  );
}

async function setTenantContext(
  client: Client,
  tenantId: string,
): Promise<void> {
  await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [
    tenantId,
  ]);
}

async function seedTenantData(
  client: Client,
  input: Readonly<{
    tenantId: string;
    tenantName: string;
    centers: readonly Readonly<{
      id: string;
      name: string;
      timeZone: string;
      key: string;
    }>[];
    memberships: readonly Readonly<{
      id: string;
      identityId: string;
      roles: readonly string[];
      centerIds: readonly string[] | null;
    }>[];
  }>,
): Promise<void> {
  await setTenantContext(client, input.tenantId);
  await client.query(
    `INSERT INTO iam_app.tenants (id, name)
     VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [input.tenantId, input.tenantName],
  );

  for (const center of input.centers) {
    await client.query(
      `INSERT INTO iam_app.centers (id, tenant_id, name, time_zone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, id) DO UPDATE
       SET name = EXCLUDED.name, time_zone = EXCLUDED.time_zone`,
      [center.id, input.tenantId, center.name, center.timeZone],
    );
    await client.query(
      `INSERT INTO iam_app.center_entries (center_key, status, tenant_id, center_id)
       VALUES ($1, 'active', $2, $3)
       ON CONFLICT (center_key) DO UPDATE
       SET status = EXCLUDED.status,
           tenant_id = EXCLUDED.tenant_id,
           center_id = EXCLUDED.center_id`,
      [center.key, input.tenantId, center.id],
    );
  }

  for (const membership of input.memberships) {
    await client.query(
      `INSERT INTO iam_app.memberships
        (id, tenant_id, identity_id, status, roles, center_ids)
       VALUES ($1, $2, $3, 'active', $4, $5)
       ON CONFLICT (tenant_id, id) DO UPDATE
       SET identity_id = EXCLUDED.identity_id,
           status = EXCLUDED.status,
           roles = EXCLUDED.roles,
           center_ids = EXCLUDED.center_ids`,
      [
        membership.id,
        input.tenantId,
        membership.identityId,
        membership.roles,
        membership.centerIds,
      ],
    );
  }
}

export async function seedLocalDatabase({
  environment = process.env,
  createClient = (connectionString: string) => new Client({ connectionString }),
}: Readonly<{
  environment?: Environment;
  createClient?: (connectionString: string) => Client;
}> = {}): Promise<void> {
  const connectionString = assertLocalSeedEnvironment(environment);
  const issuer = requiredSeedValue(
    environment,
    'SEED_IDENTITY_ISSUER',
    syntheticIssuer,
  );
  const subjects = seedSubjects(environment);
  const client = createClient(connectionString);

  try {
    await client.connect();
    await client.query('BEGIN');

    for (const identity of seedIdentities) {
      await client.query(
        `INSERT INTO iam_app.identities (id)
         VALUES ($1)
         ON CONFLICT (id) DO NOTHING`,
        [identity.id],
      );
      await client.query(
        `INSERT INTO iam_app.external_identities (identity_id, issuer, subject)
         VALUES ($1, $2, $3)
         ON CONFLICT (identity_id, issuer) DO UPDATE
         SET subject = EXCLUDED.subject`,
        [identity.id, issuer, subjects.get(identity.key)],
      );
    }

    await seedTenantData(client, {
      tenantId: tenants.blueCurrent,
      tenantName: 'Blue Current Diving',
      centers: [
        {
          id: centers.puertoAzul,
          name: 'Puerto Azul',
          timeZone: 'Europe/Madrid',
          key: 'puerto-azul',
        },
        {
          id: centers.bahiaLuna,
          name: 'Bahia Luna',
          timeZone: 'Atlantic/Canary',
          key: 'bahia-luna',
        },
      ],
      memberships: [
        {
          id: memberships.ownerBlueCurrent,
          identityId: identities.owner,
          roles: ['tenant_owner'],
          centerIds: null,
        },
        {
          id: memberships.operationsLead,
          identityId: identities.operationsLead,
          roles: ['operations_lead'],
          centerIds: [centers.puertoAzul, centers.bahiaLuna],
        },
        {
          id: memberships.centerManager,
          identityId: identities.centerManager,
          roles: ['center_manager'],
          centerIds: [centers.puertoAzul],
        },
      ],
    });

    await seedTenantData(client, {
      tenantId: tenants.oceanAtlas,
      tenantName: 'Ocean Atlas Expeditions',
      centers: [
        {
          id: centers.arrecifeSur,
          name: 'Arrecife Sur',
          timeZone: 'Atlantic/Canary',
          key: 'arrecife-sur',
        },
      ],
      memberships: [
        {
          id: memberships.ownerOceanAtlas,
          identityId: identities.owner,
          roles: ['tenant_owner'],
          centerIds: null,
        },
        {
          id: memberships.atlasAdmin,
          identityId: identities.atlasAdmin,
          roles: ['tenant_admin'],
          centerIds: null,
        },
      ],
    });

    await client.query(
      `INSERT INTO iam_app.identity_tenants (identity_id, tenant_id)
       VALUES
         ($1, $2),
         ($1, $3),
         ($4, $2),
         ($5, $2),
         ($6, $3)
       ON CONFLICT (identity_id, tenant_id) DO NOTHING`,
      [
        identities.owner,
        tenants.blueCurrent,
        tenants.oceanAtlas,
        identities.operationsLead,
        identities.centerManager,
        identities.atlasAdmin,
      ],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  console.log('Local seed loaded.');
  console.log(`Identity issuer: ${issuer}`);
  console.log('Centers: puerto-azul, bahia-luna, arrecife-sur');
  console.log(
    'Synthetic subjects are active by default; set SEED_IDENTITY_ISSUER and SEED_*_SUBJECT to use Clerk identities.',
  );
}

if (process.argv[1]?.endsWith('/seed-local.ts')) {
  await seedLocalDatabase();
}
