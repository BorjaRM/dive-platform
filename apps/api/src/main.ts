import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module.js';
import { dashboardCorsOriginsFromEnvironment } from './common/tenant-context/tenant-context.crypto.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.enableCors({
    origin: [...dashboardCorsOriginsFromEnvironment(process.env)],
    credentials: false,
    allowedHeaders: [
      'Authorization',
      'X-Tenant-Context',
      'X-Correlation-ID',
      'Content-Type',
    ],
    exposedHeaders: ['X-Correlation-ID'],
  });

  // ADR-DIVE-002: REST / OpenAPI. UI at /docs, raw document at /docs-json.
  const openApiConfig = new DocumentBuilder()
    .setTitle('Dive Platform API')
    .setDescription('REST API for the Dive Platform.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup('docs', app, openApiDocument);

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
