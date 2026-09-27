import { Module } from '@nestjs/common';
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
    TenantContextService,
    CentersService,
    MembershipsService,
    InvitationsService,
    IamService,
  ],
})
export class IamModule {}
