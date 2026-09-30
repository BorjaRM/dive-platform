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
  Put,
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
import { ClerkAuthGuard, Principal } from '../common/auth/auth.guard.js';
import { ActivityCatalogService } from './activities/activity-catalog.service.js';
import {
  ActivityDto,
  ActivityListDto,
  CatalogActivityInputDto,
  CatalogListQueryDto,
  CatalogSettingsDto,
  CatalogSettingsInputDto,
  CatalogSlotInputDto,
  SlotDto,
  SlotListDto,
} from './catalog.dto.js';
import { CatalogProblemFilter } from './catalog.errors.js';
import {
  CatalogActivityInputPipe,
  CatalogListQueryPipe,
  CatalogSettingsInputPipe,
  CatalogSlotInputPipe,
  CatalogUuidPipe,
} from './catalog.validation.pipe.js';
import { CatalogCenterOriginGuard } from './catalog-center-origin.guard.js';
import {
  type ChannelPolicyInput,
  ChannelPolicyInputDto,
} from './channels/channel-policy.dto.js';
import { ChannelPolicyService } from './channels/channel-policy.service.js';
import { ChannelPolicyInputPipe } from './channels/channel-policy.validation.pipe.js';
import { CatalogSettingsService } from './settings/catalog-settings.service.js';
import { SlotCatalogService } from './slots/slot-catalog.service.js';

@ApiTags('Catalog')
@ApiBearerAuth()
@ApiExtraModels(
  CatalogActivityInputDto,
  CatalogListQueryDto,
  CatalogSettingsInputDto,
  CatalogSlotInputDto,
)
@UseFilters(CatalogProblemFilter)
@UseGuards(ClerkAuthGuard, CatalogCenterOriginGuard)
@Controller('v1/centers/:centerId')
export class CatalogController {
  constructor(
    @Inject(ActivityCatalogService)
    private readonly activities: ActivityCatalogService,
    @Inject(ChannelPolicyService)
    private readonly channels: ChannelPolicyService,
    @Inject(SlotCatalogService)
    private readonly slots: SlotCatalogService,
    @Inject(CatalogSettingsService)
    private readonly settings: CatalogSettingsService,
  ) {}

  private async execute<T>(
    principal: AuthenticatedPrincipal,
    action: (principal: AuthenticatedPrincipal) => Promise<T>,
  ) {
    return action(principal);
  }

  @Get('catalog-settings')
  @ApiOperation({ summary: 'Read catalog language for one authorized center' })
  @ApiOkResponse({ type: CatalogSettingsDto })
  getCatalogSettings(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
  ) {
    return this.settings.getSettings(principal, handle, centerId);
  }

  @Put('catalog-settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: CatalogSettingsInputDto })
  @ApiOperation({
    summary: 'Select the initial catalog language for one authorized center',
  })
  @ApiNoContentResponse()
  selectCatalogLanguage(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Body(CatalogSettingsInputPipe) input: CatalogSettingsInputDto,
  ) {
    return this.settings.selectInitialLanguage(
      principal,
      handle,
      centerId,
      input,
    );
  }

  @Get('activities')
  @ApiOperation({ summary: 'List activities for one authorized center' })
  @ApiOkResponse({ type: ActivityListDto })
  listActivities(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Query(CatalogListQueryPipe) query: CatalogListQueryDto,
  ) {
    return this.execute(principal, (principal) =>
      this.activities.listActivities(principal, handle, centerId, query),
    );
  }

  @Post('activities')
  @ApiBody({ type: CatalogActivityInputDto })
  @ApiOperation({ summary: 'Create a draft activity' })
  @ApiCreatedResponse({ type: ActivityDto })
  createActivity(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Body(CatalogActivityInputPipe) input: CatalogActivityInputDto,
  ) {
    return this.execute(principal, (principal) =>
      this.activities.createActivity(principal, handle, centerId, input),
    );
  }

  @Patch('activities/:activityId/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish an activity' })
  @ApiNoContentResponse()
  publishActivity(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('activityId', CatalogUuidPipe) activityId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.activities.setActivityStatus(
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
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('activityId', CatalogUuidPipe) activityId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.activities.setActivityStatus(
        principal,
        handle,
        centerId,
        activityId,
        'Disabled',
      ),
    );
  }

  @Patch('channels/:channelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: ChannelPolicyInputDto })
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Update a hosted booking channel policy' })
  updateChannelPolicy(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('channelId', CatalogUuidPipe) channelId: string,
    @Body(ChannelPolicyInputPipe) input: ChannelPolicyInput,
  ) {
    return this.execute(principal, (principal) =>
      this.channels.updatePolicy(principal, handle, centerId, channelId, input),
    );
  }

  @Get('activities/:activityId/slots')
  @ApiOperation({ summary: 'List slots for one authorized activity' })
  @ApiOkResponse({ type: SlotListDto })
  listSlots(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('activityId', CatalogUuidPipe) activityId: string,
    @Query(CatalogListQueryPipe) query: CatalogListQueryDto,
  ) {
    return this.execute(principal, (principal) =>
      this.slots.listSlots(principal, handle, centerId, activityId, query),
    );
  }

  @Post('activities/:activityId/slots')
  @ApiBody({ type: CatalogSlotInputDto })
  @ApiOperation({ summary: 'Create an available slot' })
  @ApiCreatedResponse({ type: SlotDto })
  createSlot(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('activityId', CatalogUuidPipe) activityId: string,
    @Body(CatalogSlotInputPipe) input: CatalogSlotInputDto,
  ) {
    return this.execute(principal, (principal) =>
      this.slots.createSlot(principal, handle, centerId, activityId, input),
    );
  }

  @Patch('slots/:slotId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close a slot' })
  @ApiNoContentResponse()
  closeSlot(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('slotId', CatalogUuidPipe) slotId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.slots.setSlotStatus(principal, handle, centerId, slotId, 'Closed'),
    );
  }

  @Patch('slots/:slotId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a slot' })
  @ApiNoContentResponse()
  cancelSlot(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId', CatalogUuidPipe) centerId: string,
    @Param('slotId', CatalogUuidPipe) slotId: string,
  ) {
    return this.execute(principal, (principal) =>
      this.slots.setSlotStatus(
        principal,
        handle,
        centerId,
        slotId,
        'Cancelled',
      ),
    );
  }
}
