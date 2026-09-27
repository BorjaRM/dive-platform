import {
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import { Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { SECURITY_LOGGER } from '../common/security.tokens.js';
import { TenantContextCrypto } from '../common/tenant-context.crypto.js';
import { DATABASE_POOL, TENANT_CONTEXT_CRYPTO } from '../common/tokens.js';
import { IamController } from '../iam/iam.controller.js';
import { IamService } from '../iam/iam.service.js';
import { IdentityWebhookController } from '../identity-webhook/identity-webhook.controller.js';

describe('OpenAPI document generation', () => {
  it('includes the IAM and webhook routes with a bearer security scheme', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IamController, IdentityWebhookController],
      providers: [
        { provide: IDENTITY_PROVIDER, useValue: { authenticate: vi.fn() } },
        { provide: IDENTITY_WEBHOOK_VERIFIER, useValue: { verify: vi.fn() } },
        { provide: SECURITY_LOGGER, useValue: { warn: vi.fn() } },
        { provide: Reflector, useValue: new Reflector() },
        { provide: IamService, useValue: {} },
        { provide: DATABASE_POOL, useValue: {} },
        {
          provide: TENANT_CONTEXT_CRYPTO,
          useValue: new TenantContextCrypto('t'.repeat(32)),
        },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Dive Platform API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    await app.close();

    expect(document.paths['/v1/me/operators']?.get).toBeDefined();
    expect(document.paths['/v1/me/tenant-contexts']?.post).toBeDefined();
    expect(document.paths['/v1/me/tenant-contexts']?.delete).toBeDefined();
    expect(document.paths['/v1/centers']?.get).toBeDefined();
    expect(document.paths['/v1/centers/{centerId}']?.get).toBeDefined();
    expect(
      document.paths['/v1/memberships/{membershipId}/disable']?.patch,
    ).toBeDefined();
    expect(
      document.paths['/v1/tenants/{tenantId}/centers/{centerId}'],
    ).toBeUndefined();
    expect(document.paths['/v1/webhooks/clerk']?.post).toBeDefined();
    expect(document.components?.securitySchemes?.bearer).toBeDefined();
  });
});
