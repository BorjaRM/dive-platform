import type { AuthenticatedPrincipal } from '@dive-center/identity';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivityDto,
  ActivityListDto,
  CatalogActivityInputDto,
  CatalogListQueryDto,
  CatalogSlotInputDto,
  SlotDto,
  SlotListDto,
} from './catalog.dto.js';
import { CatalogProblemFilter } from './catalog.errors.js';
import { CatalogService } from './catalog.service.js';
import {
  CatalogActivityInputPipe,
  CatalogListQueryPipe,
  CatalogSlotInputPipe,
} from './catalog.validation.pipe.js';
import { ClerkAuthGuard, Principal } from './common/auth.guard.js';

@ApiTags('Catalog')
@ApiBearerAuth()
@ApiExtraModels(
  CatalogActivityInputDto,
  CatalogListQueryDto,
  CatalogSlotInputDto,
)
@UseFilters(CatalogProblemFilter)
@UseGuards(ClerkAuthGuard)
@Controller('v1/centers/:centerId')
export class CatalogController {
  constructor(
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  private async execute<T>(
    principal: AuthenticatedPrincipal,
    action: (principal: AuthenticatedPrincipal) => Promise<T>,
  ) {
    return action(principal);
  }

  @Get('activities')
  @ApiOperation({ summary: 'List activities for one authorized center' })
  @ApiOkResponse({ type: ActivityListDto })
  listActivities(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Query(CatalogListQueryPipe) query: CatalogListQueryDto,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.listActivities(principal, handle, centerId, query),
    );
  }

  @Post('activities')
  @ApiBody({ type: CatalogActivityInputDto })
  @ApiOperation({ summary: 'Create a draft activity' })
  @ApiCreatedResponse({ type: ActivityDto })
  createActivity(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Body(CatalogActivityInputPipe) input: CatalogActivityInputDto,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.createActivity(principal, handle, centerId, input),
    );
  }

  @Patch('activities/:activityId/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish an activity' })
  @ApiNoContentResponse()
  publishActivity(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.setActivityStatus(
        principal,
        handle,
        centerId,
        activityId,
        'Published',
      ),
    );
  }

  @Patch('activities/:activityId/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable an activity' })
  @ApiNoContentResponse()
  disableActivity(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.setActivityStatus(
        principal,
        handle,
        centerId,
        activityId,
        'Disabled',
      ),
    );
  }

  @Get('activities/:activityId/slots')
  @ApiOperation({ summary: 'List slots for one authorized activity' })
  @ApiOkResponse({ type: SlotListDto })
  listSlots(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
    @Query(CatalogListQueryPipe) query: CatalogListQueryDto,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.listSlots(principal, handle, centerId, activityId, query),
    );
  }

  @Post('activities/:activityId/slots')
  @ApiBody({ type: CatalogSlotInputDto })
  @ApiOperation({ summary: 'Create an available slot' })
  @ApiCreatedResponse({ type: SlotDto })
  createSlot(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
    @Body(CatalogSlotInputPipe) input: CatalogSlotInputDto,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.createSlot(principal, handle, centerId, activityId, input),
    );
  }

  @Patch('slots/:slotId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close a slot' })
  @ApiNoContentResponse()
  closeSlot(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('slotId') slotId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.setSlotStatus(principal, handle, centerId, slotId, 'Closed'),
    );
  }

  @Patch('slots/:slotId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a slot' })
  @ApiNoContentResponse()
  cancelSlot(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('slotId') slotId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.catalog.setSlotStatus(
        principal,
        handle,
        centerId,
        slotId,
        'Cancelled',
      ),
    );
  }
}
