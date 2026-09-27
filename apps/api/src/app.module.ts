import { appDatabaseUrl } from '@dive-center/database';
import {
  ClerkIdentityAdapter,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { Pool } from 'pg';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { clerkIdentityConfigFromEnvironment } from './clerk.config.js';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';
import {
  DATABASE_POOL,
  SECURITY_LOGGER,
  TENANT_CONTEXT_CRYPTO,
} from './iam.tokens.js';
import { IdentityWebhookController } from './identity-webhook.controller.js';
import {
  dashboardContextHmacSecretFromEnvironment,
  TenantContextCrypto,
} from './tenant-context.crypto.js';

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
  imports: observeImport ? [observeImport] : [],
  controllers: [AppController, IamController, IdentityWebhookController],
  providers: [
    AppService,
    IamService,
    {
      provide: ClerkIdentityAdapter,
      useFactory: () =>
        new ClerkIdentityAdapter(
          clerkIdentityConfigFromEnvironment(process.env),
        ),
    },
    { provide: IDENTITY_PROVIDER, useExisting: ClerkIdentityAdapter },
    { provide: IDENTITY_WEBHOOK_VERIFIER, useExisting: ClerkIdentityAdapter },
    {
      provide: DATABASE_POOL,
      useFactory: () => new Pool({ connectionString: appDatabaseUrl() }),
    },
    {
      provide: SECURITY_LOGGER,
      useValue: {
        warn: (entry: unknown) => console.warn(JSON.stringify(entry)),
      },
    },
    {
      provide: TENANT_CONTEXT_CRYPTO,
      useFactory: () =>
        new TenantContextCrypto(
          dashboardContextHmacSecretFromEnvironment(process.env),
        ),
    },
  ],
})
export class AppModule {}
