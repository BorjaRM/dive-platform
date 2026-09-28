import {
  type IamAccessContext,
  IamAccessDeniedError,
  type TenantUnitOfWork,
} from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  recordBookingCatalogMutation: vi.fn(),
  resolveIamAccess: vi.fn(),
  resolveIamTenantContext: vi.fn(),
  withIamAuthorizedTenant: vi.fn(),
}));

const observabilityMocks = vi.hoisted(() => ({
  correlationIdForCurrentContext: vi.fn(),
}));

vi.mock('@dive-center/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dive-center/database')>();
  return {
    ...actual,
    recordBookingCatalogMutation: databaseMocks.recordBookingCatalogMutation,
    resolveIamAccess: databaseMocks.resolveIamAccess,
    resolveIamTenantContext: databaseMocks.resolveIamTenantContext,
    withIamAuthorizedTenant: databaseMocks.withIamAuthorizedTenant,
  };
});

vi.mock('@dive-center/observability', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@dive-center/observability')>();
  return {
    ...actual,
    correlationIdForCurrentContext:
      observabilityMocks.correlationIdForCurrentContext,
  };
});

import { CatalogAccessService } from './catalog-access.service.js';

describe('CatalogAccessService', () => {
  const principal = {
    issuer: 'test',
    subject: 'owner-a',
    sessionId: 'session-a',
  } as AuthenticatedPrincipal;
  const contextCrypto = {
    handleHash: vi.fn().mockReturnValue('handle-hash'),
    sessionIdHash: vi.fn().mockReturnValue('session-hash'),
  } as unknown as ConstructorParameters<typeof CatalogAccessService>[1];

  beforeEach(() => {
    vi.resetAllMocks();
    observabilityMocks.correlationIdForCurrentContext.mockReturnValue(
      'aaaaaaaa-1001-4001-8001-000000000099',
    );
    databaseMocks.resolveIamTenantContext.mockResolvedValue({
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('preserves operational IAM errors instead of returning unauthenticated', async () => {
    const operationalError = new Error('database unavailable');
    databaseMocks.resolveIamAccess.mockRejectedValue(operationalError);
    const service = new CatalogAccessService({} as Pool, contextCrypto);

    const resolveContext = (
      service as unknown as {
        context(
          currentPrincipal: AuthenticatedPrincipal,
          handle: string,
        ): Promise<unknown>;
      }
    ).context.bind(service);

    await expect(resolveContext(principal, 'ctx_test')).rejects.toBe(
      operationalError,
    );
  });

  it('maps IAM denials to unauthenticated access', async () => {
    databaseMocks.resolveIamAccess.mockRejectedValue(
      new IamAccessDeniedError('membership_missing_or_inactive'),
    );
    const service = new CatalogAccessService({} as Pool, contextCrypto);

    const resolveContext = (
      service as unknown as {
        context(
          currentPrincipal: AuthenticatedPrincipal,
          handle: string,
        ): Promise<unknown>;
      }
    ).context.bind(service);

    await expect(resolveContext(principal, 'ctx_test')).rejects.toMatchObject({
      message: 'Unauthenticated',
      status: 401,
    });
  });

  it('binds catalog mutations to the revalidated transaction context', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const centerId = '11111111-1111-4111-8111-111111111112';
    const initial = Object.freeze({
      issuer: 'test',
      subject: 'owner-a',
      identityId: '11111111-1111-4111-8111-111111111113',
      membershipId: '11111111-1111-4111-8111-111111111114',
      tenantId,
      roles: Object.freeze(['auditor_compliance']),
      centerIds: null,
    }) satisfies IamAccessContext;
    const current = Object.freeze({
      ...initial,
      roles: Object.freeze(['tenant_owner']),
    }) satisfies IamAccessContext;
    const client = {
      query: vi.fn(),
    } as unknown as TenantUnitOfWork['client'];
    const limit = vi.fn().mockResolvedValue([
      {
        id: centerId,
        timeZone: 'Europe/Madrid',
      },
    ]);
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ limit }),
        }),
      }),
    } as unknown as TenantUnitOfWork['db'];
    const unitOfWork = { client, db };
    databaseMocks.resolveIamAccess.mockResolvedValue(initial);
    databaseMocks.withIamAuthorizedTenant.mockImplementation(
      async (
        _pool: Pool,
        _context: IamAccessContext,
        action: (
          currentUnitOfWork: TenantUnitOfWork,
          currentContext: IamAccessContext,
        ) => Promise<unknown>,
      ) => action(unitOfWork, current),
    );
    databaseMocks.recordBookingCatalogMutation.mockResolvedValue(undefined);
    const service = new CatalogAccessService({} as Pool, contextCrypto);

    await expect(
      service.authorized(
        principal,
        'ctx_test',
        centerId,
        'booking_service.create',
        async (scope) => {
          expect(Object.isFrozen(scope)).toBe(true);
          expect(scope.context).toBe(current);
          await scope.recordMutation({
            action: 'booking.create',
            eventType: 'booking.activity.created.v1',
            resourceType: 'activity',
            resourceId: '11111111-1111-4111-8111-111111111115',
            payload: { centerId },
            idempotencyKey: 'booking.activity.created:test',
          });
          return 'created';
        },
      ),
    ).resolves.toBe('created');
    expect(databaseMocks.recordBookingCatalogMutation).toHaveBeenCalledWith(
      client,
      {
        action: 'booking.create',
        eventType: 'booking.activity.created.v1',
        resourceType: 'activity',
        resourceId: '11111111-1111-4111-8111-111111111115',
        payload: { centerId },
        idempotencyKey: 'booking.activity.created:test',
        tenantId,
        actorIdentityId: current.identityId,
        correlationId: 'aaaaaaaa-1001-4001-8001-000000000099',
      },
    );
  });
});
