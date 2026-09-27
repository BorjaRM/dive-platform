import {
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';
import { DATABASE_POOL, SECURITY_LOGGER } from './iam.tokens.js';
import { IdentityWebhookController } from './identity-webhook.controller.js';

describe('OpenAPI document generation', () => {
  it('includes the IAM and webhook routes with a bearer security scheme', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IamController, IdentityWebhookController],
      providers: [
        { provide: IDENTITY_PROVIDER, useValue: { authenticate: vi.fn() } },
        { provide: IDENTITY_WEBHOOK_VERIFIER, useValue: { verify: vi.fn() } },
        { provide: SECURITY_LOGGER, useValue: { warn: vi.fn() } },
        { provide: IamService, useValue: {} },
        { provide: DATABASE_POOL, useValue: {} },
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

    expect(
      document.paths['/v1/tenants/{tenantId}/centers/{centerId}']?.get,
    ).toBeDefined();
    expect(
      document.paths[
        '/v1/tenants/{tenantId}/memberships/{membershipId}/disable'
      ]?.patch,
    ).toBeDefined();
    expect(document.paths['/v1/webhooks/clerk']?.post).toBeDefined();
    expect(document.components?.securitySchemes?.bearer).toBeDefined();
  });
});
