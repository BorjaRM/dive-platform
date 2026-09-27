import { type MiddlewareConsumer, Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CoreModule } from '../common/core.module.js';
import { DatabaseModule } from '../common/database/database.module.js';
import { CorrelationIdMiddleware } from '../common/observability/correlation-id.middleware.js';
import { IamModule } from '../iam/iam.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [DatabaseModule, CoreModule, IamModule, CatalogModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
