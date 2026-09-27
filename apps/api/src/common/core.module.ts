import {
  ClerkIdentityAdapter,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import { Global, Module } from '@nestjs/common';
import { clerkIdentityConfigFromEnvironment } from '../clerk.config.js';
import { SECURITY_LOGGER } from '../iam.tokens.js';
import {
  dashboardContextHmacSecretFromEnvironment,
  TenantContextCrypto,
} from '../tenant-context.crypto.js';
import { ClerkAuthGuard } from './auth.guard.js';
import { TENANT_CONTEXT_CRYPTO } from './tokens.js';

@Global()
@Module({
  providers: [
    ClerkAuthGuard,
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
  exports: [
    ClerkAuthGuard,
    ClerkIdentityAdapter,
    IDENTITY_PROVIDER,
    IDENTITY_WEBHOOK_VERIFIER,
    SECURITY_LOGGER,
    TENANT_CONTEXT_CRYPTO,
  ],
})
export class CoreModule {}
