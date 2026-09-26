import { randomUUID } from 'node:crypto';
import {
  iamAuditRecords,
  iamCenters,
  iamMemberships,
  iamOutboxEvents,
  resolveIamAccess,
  withIamAuthorizedTenant,
} from '@dive-center/database';
import {
  type AuthenticatedPrincipal,
  hasTenantWideScope,
  IAM_ROLES,
  permissionsForRoles,
} from '@dive-center/identity';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import type { Pool } from 'pg';
import { DATABASE_POOL } from './iam.tokens.js';

function denied(): never {
  throw new ForbiddenException('Access denied');
}

@Injectable()
export class IamService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async readCenter(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    centerId: string,
  ) {
    const context = await resolveIamAccess(
      this.pool,
      principal,
      tenantId,
    ).catch(denied);
    const permissions = permissionsForRoles(context.roles);
    if (!permissions.has('center.read')) denied();
    if (
      !hasTenantWideScope(context.roles) &&
      !context.centerIds?.includes(centerId)
    )
      denied();

    return withIamAuthorizedTenant(this.pool, context, async ({ db }) => {
      const rows = await db
        .select({ id: iamCenters.id, name: iamCenters.name })
        .from(iamCenters)
        .where(
          and(eq(iamCenters.tenantId, tenantId), eq(iamCenters.id, centerId)),
        )
        .limit(1);
      if (!rows[0]) denied();
      return rows[0];
    }).catch(denied);
  }

  async disableMembership(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    membershipId: string,
    correlationId: string,
  ) {
    const context = await resolveIamAccess(
      this.pool,
      principal,
      tenantId,
    ).catch(denied);
    if (!permissionsForRoles(context.roles).has('membership.disable')) denied();

    return withIamAuthorizedTenant(this.pool, context, async ({ db }) => {
      const targets = await db
        .select({
          id: iamMemberships.id,
          roles: iamMemberships.roles,
          status: iamMemberships.status,
        })
        .from(iamMemberships)
        .where(
          and(
            eq(iamMemberships.tenantId, tenantId),
            eq(iamMemberships.id, membershipId),
          ),
        )
        .limit(1);
      const target = targets[0];
      if (target?.status !== 'active') denied();

      if (target.roles.includes(IAM_ROLES.tenantOwner)) {
        const owners = await db.execute<{ owner_count: number }>(sql`
          SELECT count(*)::int AS owner_count
          FROM iam_app.memberships
          WHERE tenant_id = ${tenantId}::uuid
            AND status = 'active'
            AND roles @> ARRAY[${IAM_ROLES.tenantOwner}]::text[]
        `);
        if ((owners.rows[0]?.owner_count ?? 0) <= 1) {
          throw new ForbiddenException('Operation not allowed');
        }
      }

      await db
        .update(iamMemberships)
        .set({ status: 'disabled' })
        .where(
          and(
            eq(iamMemberships.tenantId, tenantId),
            eq(iamMemberships.id, membershipId),
          ),
        );

      const eventId = randomUUID();
      await db.insert(iamAuditRecords).values({
        id: randomUUID(),
        tenantId,
        actorIdentityId: context.identityId,
        action: 'membership.disable',
        resourceType: 'membership',
        resourceId: membershipId,
        result: 'success',
        correlationId,
        createdAt: new Date(),
      });
      await db.insert(iamOutboxEvents).values({
        id: eventId,
        tenantId,
        eventType: 'iam.membership.disabled.v1',
        payload: { membershipId },
        correlationId,
        idempotencyKey: `membership.disable:${membershipId}`,
        createdAt: new Date(),
      });
      return { status: 'disabled' as const };
    }).catch((error: unknown) => {
      if (error instanceof ForbiddenException) throw error;
      denied();
    });
  }
}
