import {
  type IamAccessContext,
  IamAccessDeniedError,
  type TenantUnitOfWork,
} from '@dive-center/database';
import {
  authenticateIdentity,
  DeterministicIdentityProvider,
} from '@dive-center/identity';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantContextCrypto } from '../common/tenant-context/tenant-context.crypto.js';
import type { IamService } from '../iam/iam.facade.js';

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
  const principalProvider = new DeterministicIdentityProvider(
    new Map([
      [
        'token',
        {
          issuer: 'test',
          subject: 'owner-a',
          sessionId: 'session-a',
          verifiedAddresses: [],
        },
      ],
    ]),
  );
  const principal = () => authenticateIdentity(principalProvider, 'token');
  const contextCrypto = new TenantContextCrypto('t'.repeat(32));
  const centerId = '11111111-1111-4111-8111-111111111112';
  const resolveCenterOrigin = vi.fn<IamService['resolveCenterOrigin']>();
  const serviceForTest = () =>
    new CatalogAccessService(
      {} as Pool,
      contextCrypto,
      { resolveCenterOrigin } as unknown as IamService,
      ['https://auth.example.test', 'https://dashboard.example.test'],
    );

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
    const service = serviceForTest();

    await expect(
      service.authorized(
        await principal(),
        'ctx_test',
        centerId,
        'booking_service.read',
        async () => undefined,
      ),
    ).rejects.toBe(operationalError);
  });

  it('maps IAM denials to unauthenticated access', async () => {
    databaseMocks.resolveIamAccess.mockRejectedValue(
      new IamAccessDeniedError('membership_missing_or_inactive'),
    );
    const service = serviceForTest();

    await expect(
      service.authorized(
        await principal(),
        'ctx_test',
        centerId,
        'booking_service.read',
        async () => undefined,
      ),
    ).rejects.toMatchObject({ message: 'Unauthenticated', status: 401 });
  });

  it('binds catalog mutations to the revalidated transaction context', async () => {
    const tenantId = '11111111-1111-1111-1111-111111111111';
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
    const service = serviceForTest();

    await expect(
      service.authorized(
        await principal(),
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

  it.each([
    ['AAAAAAAA-0001-4001-8001-000000000001', true],
    ['AAAAAAAA-0001-4001-8001-000000000002', false],
  ])(
    'normalizes uppercase center UUID %s before comparing Origin scope (DIVE-IAM-REQ-032)',
    async (requestedCenterId, allowed) => {
      databaseMocks.resolveIamAccess.mockResolvedValue({
        tenantId: '11111111-1111-1111-1111-111111111111',
      });
      resolveCenterOrigin.mockResolvedValue({
        tenantId: '11111111-1111-1111-1111-111111111111',
        centerId: 'aaaaaaaa-0001-4001-8001-000000000001',
      });
      const result = serviceForTest().assertCenterOriginScope(
        await principal(),
        'ctx_test',
        requestedCenterId,
        'https://alpha.app.example.test',
      );
      if (allowed) await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toMatchObject({ status: 404 });
      expect(databaseMocks.withIamAuthorizedTenant).not.toHaveBeenCalled();
      expect(databaseMocks.recordBookingCatalogMutation).not.toHaveBeenCalled();
    },
  );

  it('rejects a different center before entering a catalog transaction (DIVE-IAM-REQ-032)', async () => {
    databaseMocks.resolveIamAccess.mockResolvedValue({
      tenantId: '11111111-1111-1111-1111-111111111111',
      roles: ['tenant_owner'],
      centerIds: null,
    });
    resolveCenterOrigin.mockResolvedValue({
      tenantId: '11111111-1111-1111-1111-111111111111',
      centerId,
    });
    await expect(
      serviceForTest().assertCenterOriginScope(
        await principal(),
        'ctx_test',
        '11111111-1111-4111-8111-111111111199',
        'https://alpha.app.example.test',
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(databaseMocks.withIamAuthorizedTenant).not.toHaveBeenCalled();
    expect(databaseMocks.recordBookingCatalogMutation).not.toHaveBeenCalled();
  });

  it.each([
    ['11111111-1111-1111-1111-111111111111', true],
    ['22222222-2222-2222-2222-222222222222', false],
  ])(
    'compares the mapped tenant with the handle tenant %s (DIVE-IAM-REQ-032)',
    async (entryTenantId, allowed) => {
      databaseMocks.resolveIamAccess.mockResolvedValue({
        tenantId: '11111111-1111-1111-1111-111111111111',
      });
      resolveCenterOrigin.mockResolvedValue({
        tenantId: entryTenantId,
        centerId,
      });
      const result = serviceForTest().assertCenterOriginScope(
        await principal(),
        'ctx_test',
        centerId,
        'https://alpha.app.example.test',
      );
      if (allowed) await expect(result).resolves.toBeUndefined();
      else await expect(result).rejects.toMatchObject({ status: 404 });
      expect(databaseMocks.withIamAuthorizedTenant).not.toHaveBeenCalled();
    },
  );

  it.each([
    undefined,
    'https://auth.example.test',
    'https://dashboard.example.test',
  ])(
    'keeps the existing catalog access boundary for Origin %s (DIVE-IAM-REQ-030..032)',
    async (origin) => {
      await expect(
        serviceForTest().assertCenterOriginScope(
          await principal(),
          'ctx_test',
          centerId,
          origin,
        ),
      ).resolves.toBeUndefined();
      expect(resolveCenterOrigin).not.toHaveBeenCalled();
      expect(databaseMocks.resolveIamTenantContext).not.toHaveBeenCalled();
      expect(databaseMocks.withIamAuthorizedTenant).not.toHaveBeenCalled();
    },
  );
});
