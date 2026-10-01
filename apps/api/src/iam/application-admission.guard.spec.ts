import { createHash } from 'node:crypto';
import {
  authenticateIdentity,
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
} from '@dive-center/identity';
import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ClerkAuthGuard } from '../common/auth/auth.guard.js';
import { BffServiceCredentialVerifier } from '../common/auth/bff-service-credential.js';
import {
  CenterApplicationScope,
  HttpAdmission,
  type ResolvedCenterApplicationScope,
} from '../common/auth/http-admission.js';
import { SECURITY_LOGGER } from '../common/security/security.tokens.js';
import { ApplicationAdmissionGuard } from './application-admission.guard.js';
import { TenantContextService } from './tenant-context/tenant-context.service.js';

const secret = Buffer.alloc(32, 7);
const credential = `test.${secret.toString('base64url')}`;

@Controller('admission-test')
class AdmissionTestController {
  @Get('unclassified')
  unclassified() {
    return { exposed: true };
  }

  @HttpAdmission({ kind: 'center-data' })
  @Get('center')
  center(@CenterApplicationScope() scope: ResolvedCenterApplicationScope) {
    return { centerId: scope.centerId };
  }

  @HttpAdmission({ kind: 'exception', exception: 'operators' })
  @Get('invalid-exception')
  invalidException() {
    return { exposed: true };
  }
}

@Module({ controllers: [AdmissionTestController] })
class AdmissionTestModule {}

describe('DIVE-IAM-REQ-032 global application admission', () => {
  async function createApp() {
    const identity: IdentityProviderPort = {
      authenticate: vi.fn(async () => ({
        issuer: 'test',
        subject: 'owner',
        sessionId: 'session',
        verifiedAddresses: [],
        assurance: { level: 'single_factor' as const, verifiedAt: null },
      })),
    };
    const principal = await authenticateIdentity(identity, 'user');
    vi.mocked(identity.authenticate).mockClear();
    const resolve = vi.fn(async () => ({
      access: {
        issuer: principal.issuer,
        subject: principal.subject,
        identityId: 'identity',
        membershipId: 'membership',
        tenantId: 'tenant-a',
        roles: ['tenant_owner'],
        centerIds: null,
      },
      centerId: 'center-a',
    }));
    const module = await Test.createTestingModule({
      imports: [AdmissionTestModule],
      providers: [
        ClerkAuthGuard,
        { provide: APP_GUARD, useClass: ApplicationAdmissionGuard },
        { provide: IDENTITY_PROVIDER, useValue: identity },
        { provide: SECURITY_LOGGER, useValue: { warn: vi.fn() } },
        {
          provide: BffServiceCredentialVerifier,
          useValue: new BffServiceCredentialVerifier({
            BFF_SERVICE_CREDENTIAL_VERIFIERS: JSON.stringify([
              {
                version: 'test',
                sha256: createHash('sha256').update(secret).digest('hex'),
              },
            ]),
          }),
        },
        {
          provide: TenantContextService,
          useValue: { resolveCenterApplicationScope: resolve },
        },
      ],
    }).compile();
    const app = module.createNestApplication();
    await app.init();
    return { app, identity, resolve };
  }

  it.each(['unclassified', 'invalid-exception'])(
    'denies %s even with valid service/user headers',
    async (path) => {
      const { app, identity, resolve } = await createApp();
      try {
        await request(app.getHttpServer())
          .get(`/admission-test/${path}`)
          .set('authorization', 'Bearer user')
          .set('x-bff-service-credential', credential)
          .set('x-bff-center-origin', 'https://alpha.app.example.test')
          .set('x-tenant-context', 'ctx_handle')
          .expect(403);
        expect(identity.authenticate).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it.each([undefined, 'invalid'])(
    'denies direct API access without valid service admission %#',
    async (serviceCredential) => {
      const { app, identity, resolve } = await createApp();
      try {
        const pending = request(app.getHttpServer())
          .get('/admission-test/center')
          .set('authorization', 'Bearer user')
          .set('x-bff-center-origin', 'https://alpha.app.example.test')
          .set('x-tenant-context', 'ctx_handle');
        if (serviceCredential)
          pending.set('x-bff-service-credential', serviceCredential);
        await pending.expect(401);
        expect(identity.authenticate).not.toHaveBeenCalled();
        expect(resolve).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
  );

  it('resolves the authenticated association after one user authentication', async () => {
    const { app, identity, resolve } = await createApp();
    try {
      await request(app.getHttpServer())
        .get('/admission-test/center')
        .set('authorization', 'Bearer user')
        .set('x-bff-service-credential', credential)
        .set('x-bff-center-origin', 'https://alpha.app.example.test')
        .set('x-tenant-context', 'ctx_handle')
        .expect(200)
        .expect({ centerId: 'center-a' });
      expect(identity.authenticate).toHaveBeenCalledTimes(1);
      expect(resolve).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('does not grant an implicit HEAD exemption', async () => {
    const { app, identity } = await createApp();
    try {
      await request(app.getHttpServer())
        .head('/admission-test/center')
        .set('authorization', 'Bearer user')
        .set('x-bff-service-credential', credential)
        .expect(403);
      expect(identity.authenticate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
