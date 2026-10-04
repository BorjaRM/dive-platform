import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ClerkAuthGuard } from '../common/auth/auth.guard.js';
import { BffServiceCredentialVerifier } from '../common/auth/bff-service-credential.js';
import { ApplicationAdmissionGuard } from './application-admission.guard.js';
import { CenterEntriesService } from './center-entries/center-entries.service.js';
import { CentersService } from './centers/centers.service.js';
import { IamController } from './iam.controller.js';
import { IamService } from './iam.facade.js';
import { IdentityWebhookModule } from './identity-webhook/identity-webhook.module.js';
import { InvitationsService } from './invitations/invitations.service.js';
import { MembershipsService } from './memberships/memberships.service.js';
import { TenantContextService } from './tenant-context/tenant-context.service.js';

@Module({
  imports: [IdentityWebhookModule],
  controllers: [IamController],
  providers: [
    ClerkAuthGuard,
    {
      provide: BffServiceCredentialVerifier,
      useFactory: () => new BffServiceCredentialVerifier(process.env),
    },
    { provide: APP_GUARD, useClass: ApplicationAdmissionGuard },
    TenantContextService,
    CentersService,
    CenterEntriesService,
    MembershipsService,
    InvitationsService,
    IamService,
  ],
  exports: [IamService],
})
export class IamModule {}
