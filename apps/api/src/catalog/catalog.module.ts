import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ActivityCatalogService } from './activities/activity-catalog.service.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogProblemFilter } from './catalog.errors.js';
import { CatalogAccessService } from './catalog-access.service.js';
import { SlotCatalogService } from './slots/slot-catalog.service.js';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogAccessService,
    ActivityCatalogService,
    SlotCatalogService,
    { provide: APP_FILTER, useClass: CatalogProblemFilter },
  ],
})
export class CatalogModule {}
