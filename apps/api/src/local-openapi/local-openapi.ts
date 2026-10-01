import 'reflect-metadata';
import { type INestApplication, Module, type Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

function documentationControllers(rootModule: Type<unknown>): Type<unknown>[] {
  const visited = new Set<Type<unknown>>();
  const controllers = new Set<Type<unknown>>();

  function visit(module: Type<unknown>): void {
    if (visited.has(module)) return;
    visited.add(module);
    for (const controller of Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      module,
    ) ?? []) {
      controllers.add(controller);
    }
    for (const imported of Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      module,
    ) ?? []) {
      if (typeof imported !== 'function') {
        throw new Error('Local OpenAPI requires static module imports');
      }
      visit(imported);
    }
  }

  visit(rootModule);
  return [...controllers];
}

export async function generateLocalOpenApi(
  rootModule: Type<unknown>,
): Promise<OpenAPIObject> {
  const moduleRef = await Test.createTestingModule({
    controllers: documentationControllers(rootModule),
  })
    .useMocker(() => ({}))
    .compile();
  const app = moduleRef.createNestApplication();
  try {
    return SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Dive Platform API')
        .setDescription('REST API for the Dive Platform.')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
  } finally {
    await app.close();
  }
}

@Module({})
class LocalSwaggerModule {}

export async function createLocalSwaggerViewer(
  document: OpenAPIObject,
): Promise<INestApplication> {
  const app = await NestFactory.create(LocalSwaggerModule, { logger: false });
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      supportedSubmitMethods: [],
      tryItOutEnabled: false,
      persistAuthorization: false,
      validatorUrl: null,
    },
  });
  return app;
}

export async function listenLocalSwagger(
  document: OpenAPIObject,
  port = 3002,
): Promise<INestApplication> {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Local Swagger port must be an integer from 0 to 65535');
  }
  const app = await createLocalSwaggerViewer(document);
  try {
    app.enableShutdownHooks();
    await app.listen(port, '127.0.0.1');
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
