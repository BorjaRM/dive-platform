import { Module } from '@nestjs/common';
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
