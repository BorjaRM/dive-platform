import {
  authenticateIdentity,
  type IdentityProviderPort,
  IdentityProviderUnavailableError,
  InvalidIdentityCredentialsError,
} from '@dive-center/identity';
import {
  Controller,
  ForbiddenException,
  Get,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AuthAction, ClerkAuthGuard } from '../common/auth/auth.guard.js';
import { TenantContextCrypto } from '../common/tenant-context/tenant-context.crypto.js';
import { CentersService } from './centers/centers.service.js';
import { IamController } from './iam.controller.js';
import { MembershipsService } from './memberships/memberships.service.js';
import { TenantContextService } from './tenant-context/tenant-context.service.js';

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

@Controller('test-auth-boundary')
class AuthBoundaryController {
  @Get()
  @AuthAction('center.read')
  read() {
    return { ok: true };
  }
}

describe('IAM error handling', () => {
  it('keeps authorization denials as non-disclosing 403 responses', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ access: null }] }),
    };
    const logger = { warn: vi.fn() };
    const tenantContexts = new TenantContextService(
      pool as never,
      logger,
      contextCrypto,
      'app.example.test',
    );
    const service = new CentersService(pool as never, logger, tenantContexts);

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
    const tenantContexts = new TenantContextService(
      pool as never,
      logger,
      contextCrypto,
      'app.example.test',
    );
    const service = new CentersService(pool as never, logger, tenantContexts);

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
    const tenantContexts = new TenantContextService(
      pool as never,
      { warn: vi.fn() },
      contextCrypto,
      'app.example.test',
    );
    const service = new MembershipsService(
      pool as never,
      { warn: vi.fn() },
      tenantContexts,
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

  it('maps provider outages to 503 at the controller boundary', async () => {
    const guard = new ClerkAuthGuard(
      {
        authenticate: async () => {
          throw new IdentityProviderUnavailableError();
        },
      },
      { warn: vi.fn() },
      new Reflector(),
    );

    await expect(
      guard.canActivate(httpContext('Bearer ******')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
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

  it('keeps invalid credentials at 401 and provider outages at generic 503', async () => {
    const cases = [
      {
        error: new InvalidIdentityCredentialsError(),
        status: 401,
        message: 'Unauthenticated',
        errorLabel: 'Unauthorized',
      },
      {
        error: new IdentityProviderUnavailableError(),
        status: 503,
        message: 'Authentication service unavailable',
        errorLabel: 'Service Unavailable',
      },
    ];

    for (const testCase of cases) {
      const logger = { warn: vi.fn(), operational: vi.fn() };
      const moduleRef = await Test.createTestingModule({
        controllers: [AuthBoundaryController],
      }).compile();
      const app = moduleRef.createNestApplication();
      app.useGlobalGuards(
        new ClerkAuthGuard(
          { authenticate: async () => Promise.reject(testCase.error) },
          logger,
          new Reflector(),
        ),
      );
      await app.init();

      const response = await request(app.getHttpServer())
        .get('/test-auth-boundary')
        .set('Authorization', 'Bearer session-secret');

      try {
        expect(response.status).toBe(testCase.status);
        expect(response.body).toEqual({
          statusCode: testCase.status,
          message: testCase.message,
          error: testCase.errorLabel,
        });
        expect(JSON.stringify(response.body)).not.toContain('session-secret');
        expect(JSON.stringify(response.body)).not.toContain(
          'Identity provider',
        );
        if (testCase.status === 503) {
          expect(logger.operational).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'identity_provider_unavailable' }),
          );
        }
      } finally {
        await app.close();
      }
    }
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
