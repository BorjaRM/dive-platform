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
import { DATABASE_POOL, IAM_ACTIONS } from './iam.tokens.js';

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
    return withIamAuthorizedTenant(
      this.pool,
      context,
      async ({ db }, current) => {
        const permissions = permissionsForRoles(current.roles);
        if (!permissions.has('center.read')) denied();
        if (
          !hasTenantWideScope(current.roles) &&
          !current.centerIds?.includes(centerId)
        )
          denied();

        const rows = await db
          .select({ id: iamCenters.id, name: iamCenters.name })
          .from(iamCenters)
          .where(
            and(eq(iamCenters.tenantId, tenantId), eq(iamCenters.id, centerId)),
          )
          .limit(1);
        if (!rows[0]) denied();
        return rows[0];
      },
    ).catch(denied);
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
    const outcome = await withIamAuthorizedTenant(
      this.pool,
      context,
      async ({ db }, current) => {
        const appendAudit = (result: 'success' | 'denied', reason?: string) =>
          db.insert(iamAuditRecords).values({
            id: randomUUID(),
            tenantId,
            actorIdentityId: current.identityId,
            action: IAM_ACTIONS.membershipDisable,
            resourceType: 'membership',
            resourceId: membershipId,
            result,
            reason,
            correlationId,
            createdAt: new Date(),
          });

        if (!permissionsForRoles(current.roles).has('membership.disable')) {
          await appendAudit('denied', 'permission_missing');
          return { denied: true as const, reason: 'access' as const };
        }

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
        if (target?.status !== 'active') {
          await appendAudit('denied', 'target_inactive_or_missing');
          return { denied: true as const, reason: 'access' as const };
        }

        if (target.roles.includes(IAM_ROLES.tenantOwner)) {
          const owners = await db.execute<{ owner_count: number }>(sql`
          SELECT count(*)::int AS owner_count
          FROM iam_app.memberships
          WHERE tenant_id = ${tenantId}::uuid
            AND status = 'active'
            AND roles @> ARRAY[${IAM_ROLES.tenantOwner}]::text[]
        `);
          if ((owners.rows[0]?.owner_count ?? 0) <= 1) {
            await appendAudit('denied', 'last_owner');
            return { denied: true as const, reason: 'last_owner' as const };
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

        await appendAudit('success');
        await db.insert(iamOutboxEvents).values({
          id: randomUUID(),
          tenantId,
          eventType: 'iam.membership.disabled.v1',
          payload: { membershipId },
          correlationId,
          idempotencyKey: `${IAM_ACTIONS.membershipDisable}:${membershipId}`,
          createdAt: new Date(),
        });
        return { denied: false as const, status: 'disabled' as const };
      },
      { lockTenant: true },
    ).catch((error: unknown) => {
      if (error instanceof ForbiddenException) throw error;
      denied();
    });
    if (outcome.denied) {
      if (outcome.reason === 'last_owner') {
        throw new ForbiddenException('Operation not allowed');
      }
      denied();
    }
    return { status: outcome.status };
  }
}
