import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { dashboardCorsOriginsFromEnvironment } from './tenant-context.crypto.js';

async function bootstrap() {
  const app = await NestFactory.create(
    AppModule,
    ObserveInstrument === undefined
      ? { rawBody: true }
      : { instrument: ObserveInstrument, rawBody: true },
  );
  app.enableCors({
    origin: [...dashboardCorsOriginsFromEnvironment(process.env)],
    credentials: false,
    allowedHeaders: ['Authorization', 'X-Tenant-Context', 'Content-Type'],
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
