import { IamAccessDeniedError } from '@dive-center/database';
import type { AuthenticatedPrincipal } from '@dive-center/identity';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  resolveIamAccess: vi.fn(),
  resolveIamTenantContext: vi.fn(),
}));

vi.mock('@dive-center/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dive-center/database')>();
  return {
    ...actual,
    resolveIamAccess: databaseMocks.resolveIamAccess,
    resolveIamTenantContext: databaseMocks.resolveIamTenantContext,
  };
});

import { CatalogService } from './catalog.service.js';

describe('CatalogService', () => {
  const principal = {
    issuer: 'test',
    subject: 'owner-a',
    sessionId: 'session-a',
  } as AuthenticatedPrincipal;
  const contextCrypto = {
    handleHash: vi.fn().mockReturnValue('handle-hash'),
    sessionIdHash: vi.fn().mockReturnValue('session-hash'),
  } as unknown as ConstructorParameters<typeof CatalogService>[1];

  beforeEach(() => {
    vi.resetAllMocks();
    databaseMocks.resolveIamTenantContext.mockResolvedValue({
      tenantId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('preserves operational IAM errors instead of returning unauthenticated', async () => {
    const operationalError = new Error('database unavailable');
    databaseMocks.resolveIamAccess.mockRejectedValue(operationalError);
    const service = new CatalogService({} as Pool, contextCrypto);

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
    const service = new CatalogService({} as Pool, contextCrypto);

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
});
