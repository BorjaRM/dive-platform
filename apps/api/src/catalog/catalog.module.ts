import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { IamModule } from '../iam/iam.module.js';
import { ActivityCatalogService } from './activities/activity-catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogProblemFilter } from './catalog.errors.js';
import { CatalogAccessService } from './catalog-access.service.js';
import { CatalogCenterScopeGuard } from './catalog-center-origin.guard.js';
import { ChannelPolicyService } from './channels/channel-policy.service.js';
import { CatalogSettingsService } from './settings/catalog-settings.service.js';
import { SlotCatalogService } from './slots/slot-catalog.service.js';

@Module({
  imports: [IamModule],
  controllers: [CatalogController],
  providers: [
    CatalogAccessService,
    CatalogCenterScopeGuard,
    CatalogSettingsService,
    ActivityCatalogService,
    ChannelPolicyService,
    SlotCatalogService,
    { provide: APP_FILTER, useClass: CatalogProblemFilter },
  ],
})
export class CatalogModule {}
