import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CenterApplicationScope,
  HttpAdmission,
  type ResolvedCenterApplicationScope,
} from '../common/auth/http-admission.js';
import { ActivityCatalogService } from './activities/activity-catalog.service.js';
import {
  ActivityDto,
  ActivityListDto,
  CatalogActivityInputDto,
  CatalogCommonEditDto,
  CatalogListQueryDto,
  CatalogSettingsDto,
  CatalogSettingsInputDto,
  CatalogSlotInputDto,
  CatalogTranslationEditDto,
  DashboardCapabilitiesDto,
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
import { CatalogAccessService } from './catalog-access.service.js';
import { CatalogCenterScopeGuard } from './catalog-center-origin.guard.js';
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
  CatalogCommonEditDto,
  CatalogTranslationEditDto,
  CatalogListQueryDto,
  CatalogSettingsInputDto,
  CatalogSlotInputDto,
)
@UseFilters(CatalogProblemFilter)
@HttpAdmission({ kind: 'center-data' })
@UseGuards(CatalogCenterScopeGuard)
@Controller('v1/centers/:centerId')
export class CatalogController {
  constructor(
    @Inject(CatalogAccessService)
    private readonly access: CatalogAccessService,
    @Inject(ActivityCatalogService)
    private readonly activities: ActivityCatalogService,
    @Inject(ChannelPolicyService)
    private readonly channels: ChannelPolicyService,
    @Inject(SlotCatalogService)
    private readonly slots: SlotCatalogService,
    @Inject(CatalogSettingsService)
    private readonly settings: CatalogSettingsService,
  ) {}

  @Get('dashboard-capabilities')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Read current dashboard permissions for one center',
  })
  @ApiOkResponse({ type: DashboardCapabilitiesDto })
  getDashboardCapabilities(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
  ) {
    return this.access.getDashboardCapabilities(scope);
  }

  @Get('catalog-settings')
  @ApiOperation({ summary: 'Read catalog language for one authorized center' })
  @ApiOkResponse({ type: CatalogSettingsDto })
  getCatalogSettings(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
  ) {
    return this.settings.getSettings(scope);
  }

  @Put('catalog-settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: CatalogSettingsInputDto })
  @ApiOperation({
    summary: 'Select the initial catalog language for one authorized center',
  })
  @ApiNoContentResponse()
  selectCatalogLanguage(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Body(CatalogSettingsInputPipe) input: CatalogSettingsInputDto,
  ) {
    return this.settings.selectInitialLanguage(scope, input);
  }

  @Get('activities')
  @ApiOperation({ summary: 'List activities for one authorized center' })
  @ApiOkResponse({ type: ActivityListDto })
  listActivities(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Query(CatalogListQueryPipe) query: CatalogListQueryDto,
  ) {
    return this.activities.listActivities(scope, query);
  }

  @Post('activities')
  @ApiBody({ type: CatalogActivityInputDto })
  @ApiOperation({ summary: 'Create a draft activity' })
  @ApiCreatedResponse({ type: ActivityDto })
  createActivity(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Body(CatalogActivityInputPipe) input: CatalogActivityInputDto,
  ) {
    return this.activities.createActivity(scope, input);
  }

  @Get('activities/:activityId')
  @ApiOperation({
    summary: 'Read authored activity values and current revision',
  })
  @ApiOkResponse({
    type: ActivityDto,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  async getActivity(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('activityId', CatalogUuidPipe) activityId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.activities.getActivity(scope, activityId);
    response.setHeader('ETag', result.etag);
    return result.activity;
  }

  @Put('activities/:activityId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Replace one complete activity form without changing other groups',
  })
  @ApiHeader({ name: 'If-Match', required: true })
  @ApiBody({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(CatalogTranslationEditDto) },
        { $ref: getSchemaPath(CatalogCommonEditDto) },
      ],
    },
  })
  @ApiNoContentResponse({ headers: { ETag: { schema: { type: 'string' } } } })
  async updateActivity(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('activityId', CatalogUuidPipe) activityId: string,
    @Body() input: unknown,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const etag = await this.activities.updateActivity(
      scope,
      activityId,
      input,
      ifMatch,
    );
    response.setHeader('ETag', etag);
  }

  @Patch('activities/:activityId/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish an activity' })
  @ApiNoContentResponse()
  publishActivity(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('activityId', CatalogUuidPipe) activityId: string,
  ) {
    return this.activities.setActivityStatus(scope, activityId, 'Published');
  }

  @Patch('activities/:activityId/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Disable an activity' })
  @ApiNoContentResponse()
  disableActivity(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('activityId', CatalogUuidPipe) activityId: string,
  ) {
    return this.activities.setActivityStatus(scope, activityId, 'Disabled');
  }

  @Patch('channels/:channelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: ChannelPolicyInputDto })
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Update a hosted booking channel policy' })
  updateChannelPolicy(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('channelId', CatalogUuidPipe) channelId: string,
    @Body(ChannelPolicyInputPipe) input: ChannelPolicyInput,
  ) {
    return this.channels.updatePolicy(scope, channelId, input);
  }

  @Get('activities/:activityId/slots')
  @ApiOperation({ summary: 'List slots for one authorized activity' })
  @ApiOkResponse({ type: SlotListDto })
  listSlots(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('activityId', CatalogUuidPipe) activityId: string,
    @Query(CatalogListQueryPipe) query: CatalogListQueryDto,
  ) {
    return this.slots.listSlots(scope, activityId, query);
  }

  @Post('activities/:activityId/slots')
  @ApiBody({ type: CatalogSlotInputDto })
  @ApiOperation({ summary: 'Create an available slot' })
  @ApiCreatedResponse({ type: SlotDto })
  createSlot(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('activityId', CatalogUuidPipe) activityId: string,
    @Body(CatalogSlotInputPipe) input: CatalogSlotInputDto,
  ) {
    return this.slots.createSlot(scope, activityId, input);
  }

  @Patch('slots/:slotId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close a slot' })
  @ApiNoContentResponse()
  closeSlot(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('slotId', CatalogUuidPipe) slotId: string,
  ) {
    return this.slots.setSlotStatus(scope, slotId, 'Closed');
  }

  @Patch('slots/:slotId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a slot' })
  @ApiNoContentResponse()
  cancelSlot(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('slotId', CatalogUuidPipe) slotId: string,
  ) {
    return this.slots.setSlotStatus(scope, slotId, 'Cancelled');
  }
}
