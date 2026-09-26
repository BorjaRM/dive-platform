import { appDatabaseUrl } from '@dive-center/database';
import {
  IDENTITY_PROVIDER,
  RejectingIdentityProvider,
} from '@dive-center/identity';
import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { Pool } from 'pg';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.service.js';
import { DATABASE_POOL, SECURITY_LOGGER } from './iam.tokens.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'api',
    }),
  ],
  controllers: [AppController, IamController],
  providers: [
    AppService,
    IamService,
    { provide: IDENTITY_PROVIDER, useClass: RejectingIdentityProvider },
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
  ],
})
export class AppModule {}
