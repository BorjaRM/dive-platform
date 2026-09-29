import {
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import { Global, Module } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { configureOpenApi } from '../common/security/http-hardening.js';
import { SECURITY_LOGGER } from '../common/security/security.tokens.js';
import { TenantContextCrypto } from '../common/tenant-context/tenant-context.crypto.js';
import {
  CENTER_APP_BASE_DOMAIN,
  TENANT_CONTEXT_CRYPTO,
} from '../common/tenant-context/tenant-context.tokens.js';
import { IamModule } from '../iam/iam.module.js';

@Global()
@Module({
  providers: [
    { provide: DATABASE_POOL, useValue: {} },
    { provide: IDENTITY_PROVIDER, useValue: { authenticate: vi.fn() } },
    { provide: IDENTITY_WEBHOOK_VERIFIER, useValue: { verify: vi.fn() } },
    { provide: SECURITY_LOGGER, useValue: { warn: vi.fn() } },
    {
      provide: CENTER_APP_BASE_DOMAIN,
      useValue: 'app.example.test',
    },
    {
      provide: TENANT_CONTEXT_CRYPTO,
      useValue: new TenantContextCrypto('t'.repeat(32)),
    },
  ],
  exports: [
    DATABASE_POOL,
    IDENTITY_PROVIDER,
    IDENTITY_WEBHOOK_VERIFIER,
    SECURITY_LOGGER,
    CENTER_APP_BASE_DOMAIN,
    TENANT_CONTEXT_CRYPTO,
  ],
})
class OpenApiSharedTestModule {}

describe('OpenAPI document generation', () => {
  it('includes the IAM and webhook routes with a bearer security scheme', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiSharedTestModule, IamModule],
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
    expect(document.paths['/v1/me/center-entry-contexts']?.post).toBeDefined();
    expect(document.paths['/v1/me/tenant-contexts']?.delete).toBeDefined();
    expect(document.paths['/v1/centers']?.get).toBeDefined();
    expect(document.paths['/v1/centers/{centerId}']?.get).toBeDefined();
    expect(
      document.paths['/v1/centers/{centerId}/entry-status']?.patch,
    ).toBeDefined();
    expect(document.components?.schemas?.CenterEntryStatusDto).toMatchObject({
      properties: {
        changed: { type: 'boolean' },
        status: { enum: ['active', 'disabled'], type: 'string' },
      },
      required: ['changed', 'status'],
    });
    expect(
      document.paths['/v1/memberships/{membershipId}/disable']?.patch,
    ).toBeDefined();
    expect(
      document.paths['/v1/tenants/{tenantId}/centers/{centerId}'],
    ).toBeUndefined();
    expect(document.paths['/v1/webhooks/clerk']?.post).toBeDefined();
    expect(document.components?.securitySchemes?.bearer).toBeDefined();
  });

  it('serves Swagger only when explicitly enabled', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiSharedTestModule, IamModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    expect(
      configureOpenApi(app, {
        NODE_ENV: 'test',
        API_SWAGGER_ENABLED: 'true',
      }),
    ).toBe(true);
    await app.init();

    try {
      const response = await request(app.getHttpServer()).get('/docs-json');
      expect(response.status).toBe(200);
      expect(response.body.info.title).toBe('Dive Platform API');
    } finally {
      await app.close();
    }
  });

  it('does not register Swagger by default', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenApiSharedTestModule, IamModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    expect(configureOpenApi(app, { NODE_ENV: 'test' })).toBe(false);
    await app.init();

    try {
      const response = await request(app.getHttpServer()).get('/docs-json');
      expect(response.status).toBe(404);
    } finally {
      await app.close();
    }
  });
});
