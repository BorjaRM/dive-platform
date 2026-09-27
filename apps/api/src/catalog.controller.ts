import {
  authenticateIdentity,
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
} from '@dive-center/identity';
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
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ActivityDto,
  ActivityListDto,
  type CatalogActivityInput,
  type CatalogListQueryInput,
  type CatalogSlotInput,
  SlotDto,
  SlotListDto,
} from './catalog.dto.js';
import { CatalogProblemFilter } from './catalog.errors.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('Catalog')
@ApiBearerAuth()
@UseFilters(CatalogProblemFilter)
@Controller('v1/centers/:centerId')
export class CatalogController {
  constructor(
    @Inject(IDENTITY_PROVIDER)
    private readonly identities: IdentityProviderPort,
    @Inject(CatalogService)
    private readonly catalog: CatalogService,
  ) {}

  private async principal(authorization?: string) {
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException('Unauthenticated');
    try {
      return await authenticateIdentity(this.identities, token);
    } catch {
      throw new UnauthorizedException('Unauthenticated');
    }
  }

  private async execute<T>(
    authorization: string | undefined,
    action: (
      principal: Awaited<ReturnType<CatalogController['principal']>>,
    ) => Promise<T>,
  ) {
    return action(await this.principal(authorization));
  }

  @Get('activities')
  @ApiOperation({ summary: 'List activities for one authorized center' })
  @ApiOkResponse({ type: ActivityListDto })
  listActivities(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Query() query: CatalogListQueryInput,
  ) {
    return this.execute(authorization, (principal) =>
      this.catalog.listActivities(principal, handle, centerId, query),
    );
  }

  @Post('activities')
  @ApiOperation({ summary: 'Create a draft activity' })
  @ApiCreatedResponse({ type: ActivityDto })
  createActivity(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Body() input: CatalogActivityInput,
  ) {
    return this.execute(authorization, (principal) =>
      this.catalog.createActivity(principal, handle, centerId, input),
    );
  }

  @Patch('activities/:activityId/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Publish an activity' })
  @ApiNoContentResponse()
  publishActivity(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.execute(authorization, (principal) =>
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
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
  ) {
    return this.execute(authorization, (principal) =>
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
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
    @Query() query: CatalogListQueryInput,
  ) {
    return this.execute(authorization, (principal) =>
      this.catalog.listSlots(principal, handle, centerId, activityId, query),
    );
  }

  @Post('activities/:activityId/slots')
  @ApiOperation({ summary: 'Create an available slot' })
  @ApiCreatedResponse({ type: SlotDto })
  createSlot(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('activityId') activityId: string,
    @Body() input: CatalogSlotInput,
  ) {
    return this.execute(authorization, (principal) =>
      this.catalog.createSlot(principal, handle, centerId, activityId, input),
    );
  }

  @Patch('slots/:slotId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Close a slot' })
  @ApiNoContentResponse()
  closeSlot(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('slotId') slotId: string,
  ) {
    return this.execute(authorization, (principal) =>
      this.catalog.setSlotStatus(principal, handle, centerId, slotId, 'Closed'),
    );
  }

  @Patch('slots/:slotId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a slot' })
  @ApiNoContentResponse()
  cancelSlot(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Param('slotId') slotId: string,
  ) {
    return this.execute(authorization, (principal) =>
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
