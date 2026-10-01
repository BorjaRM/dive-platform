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
import {
  createLocalSwaggerViewer,
  generateLocalOpenApi,
  listenLocalSwagger,
} from '../local-openapi/local-openapi.js';
import { AppModule } from './app.module.js';

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
  it('binds the documentation viewer only to loopback and rejects invalid ports', async () => {
    const document = await generateLocalOpenApi(IamModule);
    await expect(listenLocalSwagger(document, -1)).rejects.toThrow(
      'Local Swagger port',
    );
    await expect(listenLocalSwagger(document, 65536)).rejects.toThrow(
      'Local Swagger port',
    );
    await expect(listenLocalSwagger(document, 1.5)).rejects.toThrow(
      'Local Swagger port',
    );
    const viewer = await listenLocalSwagger(document, 0);
    try {
      expect(viewer.getHttpServer().address()).toMatchObject({
        address: '127.0.0.1',
      });
      expect(
        (await request(viewer.getHttpServer()).get('/docs-json')).status,
      ).toBe(200);
    } finally {
      await viewer.close();
    }
  });

  it('generates the full local document without infrastructure or business HTTP handlers', async () => {
    const document = await generateLocalOpenApi(AppModule);
    expect(document.paths['/v1/me/operators']?.get).toBeDefined();
    expect(
      document.paths['/v1/centers/{centerId}/calendar/slots']?.get,
    ).toBeDefined();
    expect(
      document.paths['/v1/centers/{centerId}/slots/{slotId}/bookings']?.get,
    ).toBeDefined();
    expect(
      document.paths['/v1/centers/{centerId}/bookings/{bookingId}/contact']
        ?.get,
    ).toBeDefined();
    expect(document.paths['/v1/webhooks/clerk']?.post).toBeDefined();
    expect(
      document.paths['/v1/public/channels/{channelPublicId}/bookings']?.post,
    ).toBeDefined();
    expect(
      Object.keys(document.paths).some((path) => path.includes('catalog')),
    ).toBe(true);
    expect(document.paths['/v1/me/tenant-bootstrap']?.post).toBeDefined();
    expect(
      document.paths['/v1/centers/{centerId}/dashboard-capabilities']?.get,
    ).toBeDefined();
    expect(
      document.components?.schemas?.DashboardCapabilitiesDto,
    ).toMatchObject({
      properties: {
        canReadActivities: { type: 'boolean' },
        canReadSessions: { type: 'boolean' },
        canCreateActivity: { type: 'boolean' },
        canScheduleSession: { type: 'boolean' },
      },
      required: [
        'canReadActivities',
        'canReadSessions',
        'canCreateActivity',
        'canScheduleSession',
      ],
    });
    const activityPath =
      document.paths['/v1/centers/{centerId}/activities/{activityId}'];
    expect(activityPath?.get).toBeDefined();
    expect(activityPath?.put?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: '#/components/schemas/CatalogTranslationEditDto' },
              { $ref: '#/components/schemas/CatalogCommonEditDto' },
            ],
          },
        },
      },
    });
    expect(activityPath?.put?.parameters).toContainEqual(
      expect.objectContaining({
        name: 'If-Match',
        in: 'header',
        required: true,
      }),
    );

    const viewer = await createLocalSwaggerViewer(document);
    await viewer.init();
    try {
      const response = await request(viewer.getHttpServer()).get('/docs-json');
      expect(response.status).toBe(200);
      expect(response.body.paths).toEqual(document.paths);
      expect((await request(viewer.getHttpServer()).get('/docs/')).status).toBe(
        200,
      );
      const initializer = await request(viewer.getHttpServer()).get(
        '/docs/swagger-ui-init.js',
      );
      expect(initializer.text).toContain('"supportedSubmitMethods": []');
      expect(initializer.text).toContain('"tryItOutEnabled": false');
      expect(
        (await request(viewer.getHttpServer()).get('/v1/me/operators')).status,
      ).toBe(404);
      expect(
        (await request(viewer.getHttpServer()).post('/v1/me/tenant-bootstrap'))
          .status,
      ).toBe(404);
    } finally {
      await viewer.close();
    }
  });

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
    expect(document.components?.schemas?.CenterDto).toMatchObject({
      properties: {
        timeZone: { type: 'string', nullable: true },
      },
      required: ['id', 'name', 'timeZone'],
    });
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
