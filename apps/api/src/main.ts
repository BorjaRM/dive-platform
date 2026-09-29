import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module.js';
import { publicBookingCors } from './booking/public-booking.cors.js';
import { PublicBookingService } from './booking/public-booking.service.js';
import {
  configureHttpSecurity,
  configureOpenApi,
} from './common/security/http-hardening.js';
import { dashboardCors } from './common/tenant-context/dashboard-cors.js';
import { dashboardCorsOriginsFromEnvironment } from './common/tenant-context/tenant-context.crypto.js';
import { IamService } from './iam/iam.facade.js';

async function bootstrap() {
  const logger = new Logger('DashboardCors');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  configureHttpSecurity(app, process.env);
  app.use(
    publicBookingCors((channelPublicId, origin) =>
      app.get(PublicBookingService).isOriginAllowed(channelPublicId, origin),
    ),
  );
  const exactDashboardOrigins = dashboardCorsOriginsFromEnvironment(
    process.env,
  );
  const iam = app.get(IamService);
  app.enableCors(
    dashboardCors(
      exactDashboardOrigins,
      (origin) => iam.isCenterOriginAllowed(origin),
      (error) => logger.error('Center origin resolution failed', error.stack),
    ),
  );

  configureOpenApi(app, process.env);

  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
