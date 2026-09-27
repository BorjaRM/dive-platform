import type { Pool } from 'pg';

export type RuntimeDatabaseRoleSnapshot = Readonly<{
  canCreateApplicationSchemaObjects: boolean;
  canCreateDatabaseObjects: boolean;
  databaseName: string;
  currentUser: string;
  isMigrationRole: boolean;
  ownsDatabase: boolean;
  ownsUserRelation: boolean;
  roleBypassesRls: boolean;
  roleCanCreateDatabase: boolean;
  roleCanCreateRoles: boolean;
  roleIsSuperuser: boolean;
}>;

const runtimeRoleSnapshotQuery = `
  SELECT
    current_user AS "currentUser",
    current_database() AS "databaseName",
    runtime_role.rolname = 'dive_migration' AS "isMigrationRole",
    runtime_role.rolsuper AS "roleIsSuperuser",
    runtime_role.rolbypassrls AS "roleBypassesRls",
    runtime_role.rolcreatedb AS "roleCanCreateDatabase",
    runtime_role.rolcreaterole AS "roleCanCreateRoles",
    runtime_database.datdba = runtime_role.oid AS "ownsDatabase",
    EXISTS (
      SELECT 1
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname NOT LIKE 'pg_%'
        AND namespace.nspname <> 'information_schema'
        AND relation.relowner = runtime_role.oid
        AND relation.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    ) AS "ownsUserRelation",
    has_database_privilege(
      current_user,
      current_database(),
      'CREATE'
    ) AS "canCreateDatabaseObjects",
    EXISTS (
      SELECT 1
      FROM pg_namespace namespace
      WHERE namespace.nspname NOT LIKE 'pg_%'
        AND namespace.nspname <> 'information_schema'
        AND has_schema_privilege(current_user, namespace.nspname, 'CREATE')
    ) AS "canCreateApplicationSchemaObjects"
  FROM pg_roles runtime_role
  JOIN pg_database runtime_database
    ON runtime_database.datname = current_database()
  WHERE runtime_role.rolname = current_user
`;

export function validateRuntimeDatabaseRole(
  snapshot: RuntimeDatabaseRoleSnapshot,
): void {
  const violations: string[] = [];
  if (snapshot.isMigrationRole) violations.push('migration role');
  if (snapshot.roleIsSuperuser) violations.push('SUPERUSER');
  if (snapshot.roleBypassesRls) violations.push('BYPASSRLS');
  if (snapshot.roleCanCreateDatabase) violations.push('CREATEDB');
  if (snapshot.roleCanCreateRoles) violations.push('CREATEROLE');
  if (snapshot.ownsDatabase) violations.push('database ownership');
  if (snapshot.ownsUserRelation) violations.push('relation ownership');
  if (snapshot.canCreateDatabaseObjects) {
    violations.push('database CREATE privilege');
  }
  if (snapshot.canCreateApplicationSchemaObjects) {
    violations.push('schema CREATE privilege');
  }

  if (violations.length > 0) {
    throw new Error(
      `Unsafe runtime database role ${snapshot.currentUser}: ${violations.join(', ')}`,
    );
  }
}

export async function assertRuntimeDatabaseRole(
  pool: Pick<Pool, 'query'>,
): Promise<void> {
  let result: { rows: RuntimeDatabaseRoleSnapshot[] };
  try {
    result = await pool.query<RuntimeDatabaseRoleSnapshot>(
      runtimeRoleSnapshotQuery,
    );
  } catch {
    throw new Error('Unable to verify runtime database role');
  }

  const snapshot = result.rows[0];
  if (!snapshot) {
    throw new Error('Unable to verify runtime database role');
  }
  validateRuntimeDatabaseRole(snapshot);
}
