import { randomUUID } from 'node:crypto';
import {
  authenticateIdentity,
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
} from '@dive-center/identity';
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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { IssueTenantContextDto } from './iam.dto.js';
import {
  CenterDto,
  DisableMembershipResultDto,
  OperatorListDto,
  TenantContextDto,
} from './iam.dto.js';
import { IamService } from './iam.service.js';
import {
  IAM_ACTIONS,
  type IamAction,
  SECURITY_LOGGER,
  type SecurityLoggerPort,
} from './iam.tokens.js';

@ApiTags('IAM')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing or invalid bearer token' })
@Controller('v1')
export class IamController {
  constructor(
    @Inject(IDENTITY_PROVIDER)
    private readonly identities: IdentityProviderPort,
    @Inject(SECURITY_LOGGER) private readonly logger: SecurityLoggerPort,
    @Inject(IamService) private readonly iam: IamService,
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
    actionName: IamAction,
    action: (
      principal: Awaited<ReturnType<IamController['principal']>>,
      correlationId: string,
    ) => Promise<T>,
  ) {
    const correlationId = randomUUID();
    try {
      return await action(await this.principal(authorization), correlationId);
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

  @ApiOperation({ summary: 'List active operators for the caller' })
  @ApiOkResponse({ type: OperatorListDto })
  @Get('me/operators')
  listOperators(@Headers('authorization') authorization: string | undefined) {
    return this.execute(
      authorization,
      IAM_ACTIONS.tenantContextIssue,
      (principal) => this.iam.listOperators(principal),
    );
  }

  @ApiOperation({ summary: 'Issue an opaque tenant context handle' })
  @ApiOkResponse({ type: TenantContextDto })
  @ApiForbiddenResponse({ description: 'No valid active operator selection' })
  @Post('me/tenant-contexts')
  issueTenantContext(
    @Headers('authorization') authorization: string | undefined,
    @Body() input: IssueTenantContextDto,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.tenantContextIssue,
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
  @Delete('me/tenant-contexts')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeTenantContext(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.tenantContextRevoke,
      (principal, correlationId) =>
        this.iam.revokeTenantContext(principal, handle, correlationId),
    );
  }

  @ApiOperation({ summary: 'List centers in the selected tenant context' })
  @ApiOkResponse({ type: [CenterDto] })
  @Get('centers')
  readCenters(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.centerRead,
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
  @Get('centers/:centerId')
  readCenter(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('centerId') centerId: string,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.centerRead,
      (principal, correlationId) =>
        this.iam.readCenter(principal, handle, centerId, correlationId),
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
  @Patch('memberships/:membershipId/disable')
  disableMembership(
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-tenant-context') handle: string | undefined,
    @Param('membershipId') membershipId: string,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.membershipDisable,
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
