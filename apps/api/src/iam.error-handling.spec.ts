import {
  authenticateIdentity,
  type IdentityProviderPort,
} from '@dive-center/identity';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';

const principalProvider: IdentityProviderPort = {
  authenticate: async () => ({
    issuer: 'test',
    subject: 'owner-a',
    verifiedAddresses: [],
    assurance: { level: 'single_factor', verifiedAt: null },
  }),
};

const principal = () => authenticateIdentity(principalProvider, 'token');

describe('IAM error handling', () => {
  it('keeps authorization denials as non-disclosing 403 responses', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ access: null }] }),
    };
    const logger = { warn: vi.fn() };
    const service = new IamService(pool as never, logger);

    await expect(
      service.readCenter(
        await principal(),
        '11111111-1111-1111-1111-111111111111',
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
    const service = new IamService(pool as never, logger);

    await expect(
      service.readCenter(
        await principal(),
        '11111111-1111-1111-1111-111111111111',
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
    const service = new IamService(pool as never, { warn: vi.fn() });

    await expect(
      service.disableMembership(
        await principal(),
        '11111111-1111-1111-1111-111111111111',
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
    const controller = new IamController(
      principalProvider,
      { warn: vi.fn() },
      iam as never,
    );

    await expect(
      controller.readCenter(
        'Bearer token',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0001-0001-0001-000000000001',
      ),
    ).rejects.toBe(dependencyFailure);
    await expect(
      new IamController(principalProvider, { warn: vi.fn() }, {
        readCenter: vi
          .fn()
          .mockRejectedValue(new ForbiddenException('Access denied')),
      } as never).readCenter(
        'Bearer token',
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0001-0001-0001-000000000001',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps missing credentials as 401', async () => {
    const controller = new IamController(principalProvider, { warn: vi.fn() }, {
      readCenter: vi.fn(),
    } as never);

    await expect(
      controller.readCenter(
        undefined,
        '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0001-0001-0001-000000000001',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
