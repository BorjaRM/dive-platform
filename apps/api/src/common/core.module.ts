import {
  ClerkIdentityAdapter,
  IDENTITY_PROVIDER,
  IDENTITY_WEBHOOK_VERIFIER,
} from '@dive-center/identity';
import { Global, Module } from '@nestjs/common';
import { ClerkAuthGuard } from './auth/auth.guard.js';
import { clerkIdentityConfigFromEnvironment } from './auth/clerk.config.js';
import { SECURITY_LOGGER } from './security/security.tokens.js';
import {
  centerAppBaseDomainFromEnvironment,
  dashboardContextHmacSecretFromEnvironment,
  TenantContextCrypto,
} from './tenant-context/tenant-context.crypto.js';
import {
  CENTER_APP_BASE_DOMAIN,
  TENANT_CONTEXT_CRYPTO,
} from './tenant-context/tenant-context.tokens.js';

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
        operational: (entry: unknown) => console.error(JSON.stringify(entry)),
      },
    },
    {
      provide: CENTER_APP_BASE_DOMAIN,
      useFactory: () => centerAppBaseDomainFromEnvironment(process.env),
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
    CENTER_APP_BASE_DOMAIN,
    TENANT_CONTEXT_CRYPTO,
  ],
})
export class CoreModule {}
