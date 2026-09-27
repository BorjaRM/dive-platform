import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { CatalogProblemFilter } from '../catalog/catalog.errors.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { CoreModule } from '../common/core.module.js';
import { DatabaseModule } from '../common/database.module.js';
import { IamModule } from '../iam/iam.module.js';
import { IdentityWebhookModule } from '../identity-webhook/identity-webhook.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

const observe = createObserveModule();
const observeAppKey = process.env.OBSERVE_APP_KEY;
const observeAppSecret = process.env.OBSERVE_APP_SECRET;
const observeConfigured = Boolean(observeAppKey && observeAppSecret);

export const ObserveModule = observe.ObserveModule;
export const ObserveInstrument = observeConfigured
  ? observe.ObserveInstrument
  : undefined;

const observeImport =
  observeAppKey && observeAppSecret
    ? ObserveModule.forRoot({
        appKey: observeAppKey,
        appSecret: observeAppSecret,
        serviceId: 'api',
      })
    : undefined;

@Module({
  imports: [
    DatabaseModule,
    CoreModule,
    IamModule,
    CatalogModule,
    IdentityWebhookModule,
    ...(observeImport ? [observeImport] : []),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: CatalogProblemFilter },
  ],
})
export class AppModule {}
