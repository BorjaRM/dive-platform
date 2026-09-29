import { Module } from '@nestjs/common';
import { BootstrapInvitationsController } from './bootstrap-invitations.controller.js';
import { BootstrapInvitationsService } from './bootstrap-invitations.service.js';
import { TenantBootstrapController } from './tenant-bootstrap.controller.js';
import { TenantBootstrapService } from './tenant-bootstrap.service.js';

@Module({
  controllers: [BootstrapInvitationsController, TenantBootstrapController],
  providers: [BootstrapInvitationsService, TenantBootstrapService],
})
export class OnboardingModule {}
