import {
  authenticateIdentity,
  type IdentityProviderPort,
} from '@dive-center/identity';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { AuthAction, ClerkAuthGuard } from '../common/auth.guard.js';
import { TenantContextCrypto } from '../common/tenant-context.crypto.js';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';

const principalProvider: IdentityProviderPort = {
  authenticate: async () => ({
    issuer: 'test',
    subject: 'owner-a',
    sessionId: 'session-a',
    verifiedAddresses: [],
    assurance: { level: 'single_factor', verifiedAt: null },
  }),
};

const principal = () => authenticateIdentity(principalProvider, 'token');
const contextCrypto = new TenantContextCrypto('t'.repeat(32));

describe('IAM error handling', () => {
  it('keeps authorization denials as non-disclosing 403 responses', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ access: null }] }),
    };
    const logger = { warn: vi.fn() };
    const service = new IamService(pool as never, logger, contextCrypto);

    await expect(
      service.readCenter(
        await principal(),
        'ctx_test',
        'aaaaaaaa-0001-0001-0001-000000000001',
        '33333333-3333-3333-3333-333333333333',
      ),
    ).rejects.toMatchObject({
      response: {
        message: 'Access denied',
        statusCode: 403,
      },
      status: 403,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'center.read',
        reason: 'membership_missing_or_inactive',
      }),
    );
  });

  it('propagates database failures instead of returning 403', async () => {
    const dependencyFailure = new Error('database unavailable');
    const pool = {
      query: vi.fn().mockRejectedValue(dependencyFailure),
    };
    const logger = { warn: vi.fn() };
    const service = new IamService(pool as never, logger, contextCrypto);

    await expect(
      service.readCenter(
        await principal(),
        'ctx_test',
        'aaaaaaaa-0001-0001-0001-000000000001',
        '33333333-3333-3333-3333-333333333333',
      ),
    ).rejects.toBe(dependencyFailure);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('propagates command dependency failures', async () => {
    const dependencyFailure = new Error('database unavailable');
    const pool = {
      query: vi.fn().mockRejectedValue(dependencyFailure),
    };
    const service = new IamService(
      pool as never,
      { warn: vi.fn() },
      contextCrypto,
    );

    await expect(
      service.disableMembership(
        await principal(),
        'ctx_test',
        'aaaaaaaa-0001-0001-0001-000000000001',
        '33333333-3333-3333-3333-333333333333',
      ),
    ).rejects.toBe(dependencyFailure);
  });

  it('does not translate unexpected controller errors into 403', async () => {
    const dependencyFailure = new Error('database unavailable');
    const iam = {
      readCenter: vi.fn().mockRejectedValue(dependencyFailure),
    };
    const controller = new IamController({ warn: vi.fn() }, iam as never);

    await expect(
      controller.readCenter(
        await principal(),
        'ctx_test',
        'aaaaaaaa-0001-0001-0001-000000000001',
      ),
    ).rejects.toBe(dependencyFailure);
    await expect(
      new IamController({ warn: vi.fn() }, {
        readCenter: vi
          .fn()
          .mockRejectedValue(new ForbiddenException('Access denied')),
      } as never).readCenter(
        await principal(),
        'ctx_test',
        'aaaaaaaa-0001-0001-0001-000000000001',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps missing credentials as 401', async () => {
    const guard = new ClerkAuthGuard(
      principalProvider,
      { warn: vi.fn() },
      new Reflector(),
    );

    await expect(
      guard.canActivate(httpContext(undefined)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('normalizes provider failures to 401 at the controller boundary', async () => {
    const guard = new ClerkAuthGuard(
      {
        authenticate: async () => {
          throw new Error('provider unavailable');
        },
      },
      { warn: vi.fn() },
      new Reflector(),
    );

    await expect(
      guard.canActivate(httpContext('Bearer ******')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs the IAM action when bearer authentication fails', async () => {
    const handler = () => undefined;
    AuthAction('center.read')(handler);
    const logger = { warn: vi.fn() };
    const guard = new ClerkAuthGuard(
      principalProvider,
      logger,
      new Reflector(),
    );

    await expect(
      guard.canActivate(httpContext(undefined, handler)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'center.read',
        reason: 'authentication_missing_or_invalid',
      }),
    );
  });
});

function httpContext(
  authorization: string | undefined,
  handler?: () => unknown,
) {
  return {
    getHandler: () => handler ?? httpContext,
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  } as never;
}
