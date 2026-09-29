import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuthAction,
  ClerkAuthGuard,
  Principal,
} from '../common/auth/auth.guard.js';
import {
  IAM_ACTIONS,
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from '../common/security/security.tokens.js';
import type {
  IssueCenterEntryContextDto,
  IssueTenantContextDto,
  UpdateCenterEntryStatusDto,
} from './iam.dto.js';
import {
  CenterDto,
  CenterEntryContextDto,
  CenterEntryStatusDto,
  DisableMembershipResultDto,
  OperatorListDto,
  TenantContextDto,
} from './iam.dto.js';
import { IamService } from './iam.facade.js';

@ApiTags('IAM')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@UseGuards(ClerkAuthGuard)
@Controller('v1')
export class IamController {
  constructor(
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(IamService) private readonly iam: IamService,
  ) {}

  private async execute<T>(
    actionName: IamAction,
    principal: AuthenticatedPrincipal,
    action: (
      principal: AuthenticatedPrincipal,
      correlationId: string,
    ) => Promise<T>,
  ) {
    const correlationId = correlationIdForCurrentContext();
    try {
      return await action(principal, correlationId);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        this.logger.warn({
          event: 'iam_security_event',
          action: actionName,
          reason: 'authentication_missing_or_invalid',
          correlationId,
        });
        throw error;
      }
      if (error instanceof ForbiddenException) throw error;
      throw error;
    }
  }

  @ApiOperation({ summary: 'Issue tenant context for an exact center origin' })
  @ApiOkResponse({ type: CenterEntryContextDto })
  @ApiForbiddenResponse({ description: 'Center entry is unavailable' })
  @AuthAction(IAM_ACTIONS.tenantContextIssue)
  @Post('me/center-entry-contexts')
  issueCenterEntryContext(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('origin') origin: string | undefined,
    @Body() input: IssueCenterEntryContextDto,
  ) {
    return this.execute(
      IAM_ACTIONS.tenantContextIssue,
      principal,
      (principal, correlationId) =>
        this.iam.issueCenterEntryContext(
          principal,
          origin,
          input,
          correlationId,
        ),
    );
  }

  @ApiOperation({ summary: 'List active operators for the caller' })
  @ApiOkResponse({ type: OperatorListDto })
  @AuthAction(IAM_ACTIONS.tenantContextIssue)
  @Get('me/operators')
  listOperators(@Principal() principal: AuthenticatedPrincipal) {
    return this.execute(
      IAM_ACTIONS.tenantContextIssue,
      principal,
      (principal) => this.iam.listOperators(principal),
    );
  }

  @ApiOperation({ summary: 'Issue an opaque tenant context handle' })
  @ApiOkResponse({ type: TenantContextDto })
  @ApiForbiddenResponse({ description: 'No valid active operator selection' })
  @AuthAction(IAM_ACTIONS.tenantContextIssue)
  @Post('me/tenant-contexts')
  issueTenantContext(
    @Principal() principal: AuthenticatedPrincipal,
    @Body() input: IssueTenantContextDto,
  ) {
    return this.execute(
      IAM_ACTIONS.tenantContextIssue,
      principal,
      (principal, correlationId) =>
        this.iam.issueTenantContext(
          principal,
          input?.operatorRef,
          correlationId,
        ),
    );
  }

  @ApiOperation({ summary: 'Revoke the presented tenant context handle' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({
    description: 'Context missing or not owned by caller',
  })
  @AuthAction(IAM_ACTIONS.tenantContextRevoke)
  @Delete('me/tenant-contexts')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeTenantContext(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
  ) {
    return this.execute(
      IAM_ACTIONS.tenantContextRevoke,
      principal,
      (principal, correlationId) =>
        this.iam.revokeTenantContext(principal, handle, correlationId),
    );
  }

  @ApiOperation({ summary: 'List centers in the selected tenant context' })
  @ApiOkResponse({ type: [CenterDto] })
  @AuthAction(IAM_ACTIONS.centerRead)
  @Get('centers')
  readCenters(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
  ) {
    return this.execute(
      IAM_ACTIONS.centerRead,
      principal,
      (principal, correlationId) =>
        this.iam.readCenters(principal, handle, correlationId),
    );
  }

  @ApiOperation({ summary: 'Read a center in the selected tenant context' })
  @ApiParam({ name: 'centerId', format: 'uuid' })
  @ApiOkResponse({ type: CenterDto })
  @ApiForbiddenResponse({
    description: 'Access denied for the requested center',
  })
  @AuthAction(IAM_ACTIONS.centerRead)
  @Get('centers/:centerId')
  readCenter(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
  ) {
    return this.execute(
      IAM_ACTIONS.centerRead,
      principal,
      (principal, correlationId) =>
        this.iam.readCenter(principal, handle, centerId, correlationId),
    );
  }

  @ApiOperation({ summary: 'Enable or disable a center entry origin' })
  @ApiParam({ name: 'centerId', format: 'uuid' })
  @ApiOkResponse({ type: CenterEntryStatusDto })
  @ApiBadRequestResponse({ description: 'Invalid lifecycle request' })
  @ApiForbiddenResponse({ description: 'Center entry management denied' })
  @AuthAction(IAM_ACTIONS.centerEntryManage)
  @Patch('centers/:centerId/entry-status')
  setCenterEntryStatus(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
    @Body() input: UpdateCenterEntryStatusDto,
  ) {
    return this.execute(
      IAM_ACTIONS.centerEntryManage,
      principal,
      (principal, correlationId) =>
        this.iam.setCenterEntryStatus(
          principal,
          handle,
          centerId,
          input,
          correlationId,
        ),
    );
  }

  @ApiOperation({
    summary: 'Disable a membership in the selected tenant context',
  })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOkResponse({ type: DisableMembershipResultDto })
  @ApiForbiddenResponse({
    description:
      'Membership missing/inactive, or the caller cannot disable the last owner',
  })
  @AuthAction(IAM_ACTIONS.membershipDisable)
  @Patch('memberships/:membershipId/disable')
  disableMembership(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('membershipId') membershipId: string,
  ) {
    return this.execute(
      IAM_ACTIONS.membershipDisable,
      principal,
      (principal, correlationId) =>
        this.iam.disableMembership(
          principal,
          handle,
          membershipId,
          correlationId,
        ),
    );
  }
}
