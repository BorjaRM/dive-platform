import type { AuthenticatedPrincipal } from '@dive-center/identity';
import { correlationIdForCurrentContext } from '@dive-center/observability';
import {
  BadRequestException,
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
  ApiBody,
  ApiCreatedResponse,
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
  CenterApplicationScope,
  HttpAdmission,
  type ResolvedCenterApplicationScope,
} from '../common/auth/http-admission.js';
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
  InvitationCommandResultDto,
  IssueMembershipInvitationDto,
  IssueOwnerInvitationDto,
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
  @HttpAdmission({ kind: 'center-bootstrap' })
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
  @HttpAdmission({ kind: 'exception', exception: 'operators' })
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
  @HttpAdmission({ kind: 'exception', exception: 'tenantContextIssue' })
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
  @HttpAdmission({ kind: 'exception', exception: 'tenantContextRevoke' })
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
  @HttpAdmission({ kind: 'center-data' })
  @Get('centers')
  readCenters(@CenterApplicationScope() scope: ResolvedCenterApplicationScope) {
    return this.iam.readCenters(scope, correlationIdForCurrentContext());
  }

  @ApiOperation({ summary: 'Read a center in the selected tenant context' })
  @ApiParam({ name: 'centerId', format: 'uuid' })
  @ApiOkResponse({ type: CenterDto })
  @ApiForbiddenResponse({
    description: 'Access denied for the requested center',
  })
  @AuthAction(IAM_ACTIONS.centerRead)
  @HttpAdmission({ kind: 'center-data' })
  @Get('centers/:centerId')
  readCenter(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('centerId') requestedCenterId: string,
  ) {
    return this.iam.readCenter(
      scope,
      requestedCenterId,
      correlationIdForCurrentContext(),
    );
  }

  @ApiOperation({ summary: 'Enable or disable a center entry origin' })
  @ApiParam({ name: 'centerId', format: 'uuid' })
  @ApiOkResponse({ type: CenterEntryStatusDto })
  @ApiBadRequestResponse({ description: 'Invalid lifecycle request' })
  @ApiForbiddenResponse({ description: 'Center entry management denied' })
  @AuthAction(IAM_ACTIONS.centerEntryManage)
  @HttpAdmission({ kind: 'center-data' })
  @Patch('centers/:centerId/entry-status')
  setCenterEntryStatus(
    @CenterApplicationScope() scope: ResolvedCenterApplicationScope,
    @Param('centerId') requestedCenterId: string,
    @Body() input: UpdateCenterEntryStatusDto,
  ) {
    return this.iam.setCenterEntryStatus(
      scope,
      requestedCenterId,
      input,
      correlationIdForCurrentContext(),
    );
  }

  @ApiOperation({
    summary: 'Disable a membership in the selected tenant context',
  })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOkResponse({ type: DisableMembershipResultDto })
  @ApiForbiddenResponse({
    description:
      'Membership missing/inactive, or the caller cannot disable an owner',
  })
  @AuthAction(IAM_ACTIONS.membershipDisable)
  @HttpAdmission({ kind: 'exception', exception: 'membershipDisable' })
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

  @ApiOperation({ summary: 'Invite a non-owner tenant membership' })
  @ApiBody({ type: IssueMembershipInvitationDto })
  @ApiCreatedResponse({ type: InvitationCommandResultDto })
  @ApiBadRequestResponse({
    description: 'Missing idempotency key or owner role',
  })
  @ApiForbiddenResponse({ description: 'Membership invitation denied' })
  @AuthAction(IAM_ACTIONS.membershipInvite)
  @HttpAdmission({ kind: 'exception', exception: 'membershipInvitationIssue' })
  @Post('memberships/invitations')
  issueMembershipInvitation(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: IssueMembershipInvitationDto,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('Missing idempotency key');
    return this.execute(
      IAM_ACTIONS.membershipInvite,
      principal,
      (principal, correlationId) =>
        this.iam.issueMembershipInvitation(
          principal,
          handle,
          { ...input, idempotencyKey },
          correlationId,
        ),
    );
  }

  @ApiOperation({ summary: 'Invite a tenant owner' })
  @ApiBody({ type: IssueOwnerInvitationDto })
  @ApiCreatedResponse({ type: InvitationCommandResultDto })
  @ApiBadRequestResponse({ description: 'Missing idempotency key' })
  @ApiForbiddenResponse({ description: 'Owner invitation denied' })
  @AuthAction(IAM_ACTIONS.membershipInvite)
  @HttpAdmission({ kind: 'exception', exception: 'ownershipInvitationIssue' })
  @Post('ownership/invitations')
  issueOwnerInvitation(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() input: IssueOwnerInvitationDto,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('Missing idempotency key');
    return this.execute(
      IAM_ACTIONS.membershipInvite,
      principal,
      (principal, correlationId) =>
        this.iam.issueOwnerInvitation(
          principal,
          handle,
          { ...input, idempotencyKey },
          correlationId,
        ),
    );
  }

  @ApiOperation({ summary: 'Revoke a non-owner membership invitation' })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiOkResponse({ type: InvitationCommandResultDto })
  @ApiForbiddenResponse({
    description: 'Membership invitation revocation denied',
  })
  @AuthAction(IAM_ACTIONS.membershipDisable)
  @HttpAdmission({ kind: 'exception', exception: 'membershipInvitationRevoke' })
  @Delete('memberships/invitations/:invitationId')
  revokeMembershipInvitation(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('invitationId') invitationId: string,
  ) {
    return this.execute(
      IAM_ACTIONS.membershipDisable,
      principal,
      (principal, correlationId) =>
        this.iam.revokeMembershipInvitation(
          principal,
          handle,
          invitationId,
          correlationId,
        ),
    );
  }

  @ApiOperation({ summary: 'Revoke a pending owner invitation' })
  @ApiParam({ name: 'invitationId', format: 'uuid' })
  @ApiOkResponse({ type: InvitationCommandResultDto })
  @ApiForbiddenResponse({ description: 'Owner invitation revocation denied' })
  @AuthAction(IAM_ACTIONS.membershipDisable)
  @HttpAdmission({ kind: 'exception', exception: 'ownershipInvitationRevoke' })
  @Delete('ownership/invitations/:invitationId')
  revokeOwnerInvitation(
    @Principal() principal: AuthenticatedPrincipal,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('invitationId') invitationId: string,
  ) {
    return this.execute(
      IAM_ACTIONS.membershipDisable,
      principal,
      (principal, correlationId) =>
        this.iam.revokeOwnerInvitation(
          principal,
          handle,
          invitationId,
          correlationId,
        ),
    );
  }
}
