import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ClerkIdentityAdapter,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import {
  Controller,
  Get,
  type INestApplication,
  RequestMethod,
  SetMetadata,
} from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { MetadataScanner, ModulesContainer, Reflector } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import {
  bffServiceCredential,
  bffServiceVerifierConfiguration,
} from '../../test/bff-test-fixture.js';
import { AppModule } from '../app/app.module.js';
import {
  PUBLIC_BOOKING_CAPABILITY_CRYPTO,
  PublicBookingCapabilityCrypto,
} from '../booking/public-booking.crypto.js';
import {
  HTTP_ADMISSION_METADATA,
  HttpAdmission,
  type HttpAdmissionClassification,
  nonCenterAdmissionExceptions,
} from '../common/auth/http-admission.js';
import { DATABASE_POOL } from '../common/database/database.tokens.js';
import { CorrelationIdMiddleware } from '../common/observability/correlation-id.middleware.js';
import { configureOpenApi } from '../common/security/http-hardening.js';
import { SECURITY_LOGGER } from '../common/security/security.tokens.js';
import { TenantContextCrypto } from '../common/tenant-context/tenant-context.crypto.js';
import {
  CENTER_APP_BASE_DOMAIN,
  CENTER_APP_BASE_ORIGIN,
  TENANT_CONTEXT_CRYPTO,
} from '../common/tenant-context/tenant-context.tokens.js';

@HttpAdmission({ kind: 'center-data' })
@Controller('composition-conflict')
class ConflictingAdmissionController {
  @HttpAdmission({ kind: 'exception', exception: 'operators' })
  @Get()
  exposed() {
    return { exposed: true };
  }
}

@Controller('composition-test')
class UnclassifiedAdmissionController {
  @Get('unclassified')
  unclassified() {
    return { exposed: true };
  }

  @HttpAdmission({ kind: 'exception', exception: 'operators' })
  @Get('wrong-exception-path')
  wrongExceptionPath() {
    return { exposed: true };
  }

  @SetMetadata(HTTP_ADMISSION_METADATA, {
    kind: 'exception',
    exception: 'forged-public-route',
  })
  @Get('forged-exception')
  forgedException() {
    return { exposed: true };
  }

  @HttpAdmission({ kind: 'center-bootstrap' })
  @Get('wrong-bootstrap-route')
  wrongBootstrapRoute() {
    return { exposed: true };
  }
}

type DiscoveredOperation = {
  method: string;
  path: string;
  classification: HttpAdmissionClassification | undefined;
  conflicts: boolean;
};

function discoverControllers(app: INestApplication): DiscoveredOperation[] {
  const reflector = app.get(Reflector);
  const scanner = new MetadataScanner();
  const operations: DiscoveredOperation[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const controller of module.controllers.values()) {
      const controllerType = controller.metatype;
      if (!controllerType) continue;
      const prototype = controllerType.prototype;
      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = prototype[name];
        const method = reflector.get<RequestMethod>(METHOD_METADATA, handler);
        if (method === undefined) continue;
        const classAdmission = reflector.get<HttpAdmissionClassification>(
          HTTP_ADMISSION_METADATA,
          controllerType,
        );
        const handlerAdmission = reflector.get<HttpAdmissionClassification>(
          HTTP_ADMISSION_METADATA,
          handler,
        );
        const controllerPath = reflector.get<string>(
          PATH_METADATA,
          controllerType,
        );
        const handlerPath = reflector.get<string>(PATH_METADATA, handler);
        expect(typeof controllerPath).toBe('string');
        expect(typeof handlerPath).toBe('string');
        operations.push({
          method: RequestMethod[method],
          path: `/${[controllerPath, handlerPath].join('/').split('/').filter(Boolean).join('/')}`,
          classification: handlerAdmission ?? classAdmission,
          conflicts: Boolean(
            classAdmission &&
              handlerAdmission &&
              JSON.stringify(classAdmission) !==
                JSON.stringify(handlerAdmission),
          ),
        });
      }
    }
  }
  return operations;
}

function classificationFailures(operations: DiscoveredOperation[]): string[] {
  return operations.flatMap((operation) => {
    const label = `${operation.method} ${operation.path}`;
    const classification = operation.classification;
    if (!classification || operation.conflicts) return [label];
    if (classification.kind === 'exception') {
      const exception = nonCenterAdmissionExceptions[classification.exception];
      if (
        !exception ||
        exception.method !== operation.method ||
        exception.path !== operation.path
      )
        return [label];
      return [];
    }
    if (classification.kind === 'center-bootstrap') {
      return label === 'POST /v1/me/center-entry-contexts' ? [] : [label];
    }
    return classification.kind === 'center-data' ? [] : [label];
  });
}

const frameworkLayers = new WeakMap<INestApplication, Set<unknown>>();

function adapterOperations(app: INestApplication): string[] {
  const router = app.getHttpAdapter().getInstance().router;
  const operations: string[] = [];
  for (const layer of router.stack) {
    if (!layer.route) {
      if (!frameworkLayers.get(app)?.has(layer))
        operations.push('UNCLASSIFIED middleware/router');
      continue;
    }
    expect(typeof layer.route.path).toBe('string');
    for (const [method, enabled] of Object.entries(layer.route.methods)) {
      if (enabled)
        operations.push(`${method.toUpperCase()} ${layer.route.path}`);
    }
  }
  return operations.sort();
}

async function createApp(
  injectTestControllers = false,
  configureAdapter?: (app: INestApplication) => void,
) {
  const identity = {
    authenticate: vi.fn(async () => ({
      issuer: 'test',
      subject: 'owner',
      sessionId: 'session',
      verifiedAddresses: [],
      assurance: { level: 'single_factor' as const, verifiedAt: null },
    })),
  };
  const module = await Test.createTestingModule({
    imports: [AppModule],
    controllers: injectTestControllers
      ? [UnclassifiedAdmissionController, ConflictingAdmissionController]
      : [],
  })
    .overrideProvider(DATABASE_POOL)
    .useValue({ end: vi.fn() })
    .overrideProvider(ClerkIdentityAdapter)
    .useValue({})
    .overrideProvider(IDENTITY_PROVIDER)
    .useValue(identity)
    .overrideProvider(IDENTITY_WEBHOOK_VERIFIER)
    .useValue({ verify: vi.fn() })
    .overrideProvider(SECURITY_LOGGER)
    .useValue({ warn: vi.fn() })
    .overrideProvider(CENTER_APP_BASE_DOMAIN)
    .useValue('app.example.test')
    .overrideProvider(CENTER_APP_BASE_ORIGIN)
    .useValue('https://app.example.test')
    .overrideProvider(TENANT_CONTEXT_CRYPTO)
    .useValue(new TenantContextCrypto('t'.repeat(32)))
    .overrideProvider(PUBLIC_BOOKING_CAPABILITY_CRYPTO)
    .useValue(new PublicBookingCapabilityCrypto('b'.repeat(32)))
    .compile();
  const adapter = new ExpressAdapter();
  const knownLayers = new Set<unknown>(
    adapter.getInstance().router?.stack ?? [],
  );
  const app = module.createNestApplication(adapter);
  frameworkLayers.set(app, knownLayers);
  const registerFrameworkLayers = (register: () => unknown) => {
    const before = new Set(adapter.getInstance().router?.stack ?? []);
    const result = register();
    for (const layer of adapter.getInstance().router?.stack ?? []) {
      if (!before.has(layer) && !layer.route) knownLayers.add(layer);
    }
    return result;
  };
  const registerParsers = adapter.registerParserMiddleware.bind(adapter);
  const registerNotFound = adapter.setNotFoundHandler.bind(adapter);
  const registerErrors = adapter.setErrorHandler.bind(adapter);
  const createMiddleware = adapter.createMiddlewareFactory.bind(adapter);
  vi.spyOn(adapter, 'createMiddlewareFactory').mockImplementation((method) => {
    const register = createMiddleware(method);
    return (path, callback) =>
      registerFrameworkLayers(() => register(path, callback));
  });
  vi.spyOn(adapter, 'registerParserMiddleware').mockImplementation(
    (prefix, rawBody) => {
      registerFrameworkLayers(() => registerParsers(prefix, rawBody));
    },
  );
  vi.spyOn(adapter, 'setNotFoundHandler').mockImplementation(
    (handler, prefix) =>
      registerFrameworkLayers(() => registerNotFound(handler, prefix)),
  );
  vi.spyOn(adapter, 'setErrorHandler').mockImplementation((handler, prefix) =>
    registerFrameworkLayers(() => registerErrors(handler, prefix)),
  );
  if (configureAdapter) {
    configureAdapter(app);
  } else {
    configureOpenApi(app, process.env);
  }
  await app.init();
  for (const registeredModule of app.get(ModulesContainer).values()) {
    for (const middleware of registeredModule.middlewares.values()) {
      expect(middleware.metatype).toBe(CorrelationIdMiddleware);
    }
  }
  return { app, identity };
}

describe('DIVE-IAM-REQ-032 real AppModule admission inventory', () => {
  it('discovers classified controllers and checks exception owner, approval and test references', async () => {
    const { app } = await createApp();
    try {
      const operations = discoverControllers(app);
      expect(operations.length).toBeGreaterThan(0);
      expect(classificationFailures(operations)).toEqual([]);
      expect(adapterOperations(app)).toEqual(
        operations.map(({ method, path }) => `${method} ${path}`).sort(),
      );
      const exceptions = operations.filter(
        ({ classification }) => classification?.kind === 'exception',
      );
      expect(
        exceptions
          .map(
            ({ classification }) =>
              classification?.kind === 'exception' && classification.exception,
          )
          .sort(),
      ).toEqual(Object.keys(nonCenterAdmissionExceptions).sort());
      for (const exception of Object.values(nonCenterAdmissionExceptions)) {
        const authority = readFileSync(
          resolve('../..', exception.owner),
          'utf8',
        );
        for (const requirement of exception.requirements)
          expect(authority).toContain(requirement);
        const [approvalPath, approvalAnchor] =
          exception.approval.source.split('#');
        if (!approvalPath || !approvalAnchor)
          throw new Error('Invalid classification approval reference');
        const approvalAuthority = readFileSync(
          resolve('../..', approvalPath),
          'utf8',
        );
        expect(approvalAuthority).toContain(`id="${approvalAnchor}"`);
        expect(exception.approval.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(approvalAuthority).toContain(exception.approval.date);
        expect(
          readFileSync(resolve('../..', exception.test), 'utf8').length,
        ).toBeGreaterThan(0);
        expect(['clerk', 'public-channel', 'provider-signature']).toContain(
          exception.mechanism,
        );
      }
      await request(app.getHttpServer()).get('/').expect(404);
      for (const operation of operations.filter(
        ({ method }) => method === 'GET',
      )) {
        await request(app.getHttpServer())
          .head(operation.path)
          .set('authorization', 'Bearer user')
          .set('x-bff-service-credential', bffServiceCredential)
          .set('x-bff-center-origin', 'https://alpha.app.example.test')
          .set('x-tenant-context', 'ctx_synthetic')
          .expect(403);
      }
    } finally {
      await app.close();
    }
  });

  it('requires user authentication for every Clerk exception without BFF credentials', async () => {
    const { app, identity } = await createApp();
    try {
      for (const exception of Object.values(nonCenterAdmissionExceptions)) {
        if (exception.mechanism !== 'clerk') continue;
        const path = exception.path.replace(/:[^/]+/g, 'test-resource');
        const agent = request(app.getHttpServer());
        switch (exception.method) {
          case 'GET':
            await agent.get(path).expect(401);
            break;
          case 'POST':
            await agent.post(path).expect(401);
            break;
          case 'DELETE':
            await agent.delete(path).expect(401);
            break;
          case 'PATCH':
            await agent.patch(path).expect(401);
            break;
        }
      }
      expect(identity.authenticate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('fails discovery and uses the actual IamModule APP_GUARD for omitted, conflicting, forged and misplaced metadata', async () => {
    const { app, identity } = await createApp(true);
    try {
      const failures = classificationFailures(discoverControllers(app));
      expect(failures.sort()).toEqual([
        'GET /composition-conflict',
        'GET /composition-test/forged-exception',
        'GET /composition-test/unclassified',
        'GET /composition-test/wrong-bootstrap-route',
        'GET /composition-test/wrong-exception-path',
      ]);
      for (const operation of failures) {
        await request(app.getHttpServer())
          .get(operation.slice(4))
          .set('authorization', 'Bearer user')
          .set('x-bff-service-credential', bffServiceCredential)
          .set('x-bff-center-origin', 'https://alpha.app.example.test')
          .set('x-tenant-context', 'ctx_synthetic')
          .expect(403);
      }
      expect(identity.authenticate).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('detects raw adapter business handlers outside controller discovery', async () => {
    const { app } = await createApp(false, (application) => {
      application
        .getHttpAdapter()
        .get(
          '/raw-business',
          (_request: unknown, response: { json: (body: unknown) => void }) =>
            response.json({ exposed: true }),
        );
    });
    try {
      const discovered = new Set(
        discoverControllers(app).map(({ method, path }) => `${method} ${path}`),
      );
      expect(
        adapterOperations(app).filter(
          (operation) => !discovered.has(operation),
        ),
      ).toEqual(['GET /raw-business']);
      await request(app.getHttpServer()).get('/raw-business').expect(200);
    } finally {
      await app.close();
    }
  });

  it.each(['middleware', 'mounted-router'] as const)(
    'detects an unclassified %s even when it responds outside APP_GUARD',
    async (surface) => {
      const { app } = await createApp(false, (application) => {
        const adapter = application.getHttpAdapter().getInstance();
        const handler = (
          _request: unknown,
          response: { json(body: unknown): void },
        ) => response.json({ exposed: true });
        if (surface === 'middleware') adapter.use('/raw-business', handler);
        else {
          const nested = new ExpressAdapter();
          nested.get('/business', handler);
          adapter.use('/raw', nested.getInstance());
        }
      });
      try {
        const discovered = new Set(
          discoverControllers(app).map(
            ({ method, path }) => `${method} ${path}`,
          ),
        );
        expect(
          adapterOperations(app).filter(
            (operation) => !discovered.has(operation),
          ),
        ).toEqual(['UNCLASSIFIED middleware/router']);
        await request(app.getHttpServer())
          .get(surface === 'middleware' ? '/raw-business' : '/raw/business')
          .expect(200);
      } finally {
        await app.close();
      }
    },
  );

  it('rejects enabled Swagger in the BFF deployment rather than granting an implicit exemption', async () => {
    const { app } = await createApp(false, (application) => {
      expect(() =>
        configureOpenApi(application, {
          NODE_ENV: 'test',
          API_SWAGGER_ENABLED: 'true',
          BFF_SERVICE_CREDENTIAL_VERIFIERS: bffServiceVerifierConfiguration,
        }),
      ).toThrow('Swagger unavailable with BFF admission');
    });
    try {
      const discovered = new Set(
        discoverControllers(app).map(({ method, path }) => `${method} ${path}`),
      );
      const rawOperations = adapterOperations(app).filter(
        (operation) => !discovered.has(operation),
      );
      expect(rawOperations).toEqual([]);
      await request(app.getHttpServer()).get('/docs-json').expect(404);
    } finally {
      await app.close();
    }
  });
});
