import {
  type IamAccessContext,
  IamAccessDeniedError,
  type TenantUnitOfWork,
} from '@dive-center/database';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedCenterApplicationScope } from '../common/auth/http-admission.js';

const databaseMocks = vi.hoisted(() => ({
  recordBookingCatalogMutation: vi.fn(),
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
  const centerId = '11111111-1111-4111-8111-111111111112';
  const initialContext: IamAccessContext = Object.freeze({
    issuer: 'test',
    subject: 'owner-a',
    identityId: '11111111-1111-4111-8111-111111111113',
    membershipId: '11111111-1111-4111-8111-111111111114',
    tenantId: '11111111-1111-1111-1111-111111111111',
    roles: Object.freeze(['tenant_owner']),
    centerIds: null,
  });
  const applicationScope: ResolvedCenterApplicationScope = Object.freeze({
    access: initialContext,
    centerId,
  });
  const serviceForTest = () => new CatalogAccessService({} as Pool);

  beforeEach(() => {
    vi.resetAllMocks();
    observabilityMocks.correlationIdForCurrentContext.mockReturnValue(
      'aaaaaaaa-1001-4001-8001-000000000099',
    );
  });

  it.each([
    ['tenant_owner', true, true, true, true],
    ['auditor_compliance', false, false, false, false],
    ['reception_booking_manager', false, false, false, true],
  ])(
    'projects capabilities from current %s membership, not stale context (DIVE-IAM-REQ-030..032)',
    async (role, canCreateActivity, canUpdateActivity, canPublishActivity, canScheduleSession) => {
      const current = {
        ...initialContext,
        roles: Object.freeze([role]),
        centerIds: Object.freeze([centerId]),
      };
      const stale = initialContext;
      const db = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue([{ id: centerId, timeZone: null }]),
            }),
          }),
        }),
      } as unknown as TenantUnitOfWork['db'];
      databaseMocks.withIamAuthorizedTenant.mockImplementation(
        async (
          _pool: Pool,
          _context: IamAccessContext,
          action: (
            unitOfWork: TenantUnitOfWork,
            context: IamAccessContext,
          ) => Promise<unknown>,
        ) => action({ db } as TenantUnitOfWork, current),
      );

      await expect(
        serviceForTest().getDashboardCapabilities({ access: stale, centerId }),
      ).resolves.toEqual({
        canReadActivities: true,
        canReadSessions: true,
        canCreateActivity,
        canUpdateActivity,
        canPublishActivity,
        canScheduleSession,
      });
      expect(databaseMocks.withIamAuthorizedTenant).toHaveBeenCalledTimes(1);
      expect(databaseMocks.recordBookingCatalogMutation).not.toHaveBeenCalled();
    },
  );

  it('does not return capabilities after membership revocation (DIVE-IAM-REQ-030)', async () => {
    databaseMocks.withIamAuthorizedTenant.mockRejectedValue(
      new IamAccessDeniedError('membership_missing_or_inactive'),
    );
    await expect(
      serviceForTest().getDashboardCapabilities(applicationScope),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('does not turn operational failure into false capabilities', async () => {
    const error = new Error('database unavailable');
    databaseMocks.withIamAuthorizedTenant.mockRejectedValue(error);
    await expect(
      serviceForTest().getDashboardCapabilities(applicationScope),
    ).rejects.toBe(error);
  });

  it('preserves operational IAM errors instead of returning unauthenticated', async () => {
    const operationalError = new Error('database unavailable');
    databaseMocks.withIamAuthorizedTenant.mockRejectedValue(operationalError);
    const service = serviceForTest();

    await expect(
      service.authorized(
        applicationScope,
        'booking_service.read',
        async () => undefined,
      ),
    ).rejects.toBe(operationalError);
  });

  it('maps IAM denials to unauthenticated access', async () => {
    databaseMocks.withIamAuthorizedTenant.mockRejectedValue(
      new IamAccessDeniedError('membership_missing_or_inactive'),
    );
    const service = serviceForTest();

    await expect(
      service.authorized(
        applicationScope,
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
        Object.freeze({ access: initial, centerId }),
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
    'normalizes uppercase center UUID %s before comparing resolved scope (DIVE-IAM-REQ-032)',
    async (requestedCenterId, allowed) => {
      const operation = Promise.resolve().then(() =>
        serviceForTest().assertRequestedCenterScope(
          {
            access: initialContext,
            centerId: 'aaaaaaaa-0001-4001-8001-000000000001',
          },
          requestedCenterId,
        ),
      );
      if (allowed) await expect(operation).resolves.toBeUndefined();
      else await expect(operation).rejects.toMatchObject({ status: 404 });
      expect(databaseMocks.withIamAuthorizedTenant).not.toHaveBeenCalled();
      expect(databaseMocks.recordBookingCatalogMutation).not.toHaveBeenCalled();
    },
  );

  it('rejects a different center before entering a catalog transaction (DIVE-IAM-REQ-032)', async () => {
    await expect(
      Promise.resolve().then(() =>
        serviceForTest().assertRequestedCenterScope(
          applicationScope,
          '11111111-1111-4111-8111-111111111199',
        ),
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(databaseMocks.withIamAuthorizedTenant).not.toHaveBeenCalled();
    expect(databaseMocks.recordBookingCatalogMutation).not.toHaveBeenCalled();
  });
});
