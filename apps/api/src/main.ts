import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
import { publicBookingCors } from './booking/public-booking.cors.js';
import { PublicBookingService } from './booking/public-booking.service.js';
import {
  configureHttpSecurity,
  configureOpenApi,
} from './common/security/http-hardening.js';
import { dashboardCorsOriginsFromEnvironment } from './common/tenant-context/tenant-context.crypto.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  configureHttpSecurity(app, process.env);
  app.use(
    publicBookingCors((channelPublicId, origin) =>
      app.get(PublicBookingService).isOriginAllowed(channelPublicId, origin),
    ),
  );
  app.enableCors({
    origin: [...dashboardCorsOriginsFromEnvironment(process.env)],
    credentials: false,
    allowedHeaders: [
      'Authorization',
      'X-Tenant-Context',
      'X-Correlation-ID',
      'Content-Type',
      'Idempotency-Key',
    ],
    exposedHeaders: ['X-Correlation-ID'],
  });

  configureOpenApi(app, process.env);

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
