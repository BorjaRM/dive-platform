import { randomUUID } from 'node:crypto';
import {
  authenticateIdentity,
  IDENTITY_PROVIDER,
  type IdentityProviderPort,
} from '@dive-center/identity';
import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CenterDto, DisableMembershipResultDto } from './iam.dto.js';
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
@Controller('v1/tenants/:tenantId')
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
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw error;
    }
  }

  @ApiOperation({
    summary: 'Read a center',
    description: 'Returns a center scoped to the caller tenant.',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'centerId', format: 'uuid' })
  @ApiOkResponse({ type: CenterDto })
  @ApiForbiddenResponse({
    description: 'Access denied for the requested center',
  })
  @Get('centers/:centerId')
  readCenter(
    @Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('centerId') centerId: string,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.centerRead,
      (principal, correlationId) =>
        this.iam.readCenter(principal, tenantId, centerId, correlationId),
    );
  }

  @ApiOperation({
    summary: 'Disable a membership',
    description: 'Disables an active membership within the caller tenant.',
  })
  @ApiParam({ name: 'tenantId', format: 'uuid' })
  @ApiParam({ name: 'membershipId', format: 'uuid' })
  @ApiOkResponse({ type: DisableMembershipResultDto })
  @ApiForbiddenResponse({
    description:
      'Membership missing/inactive, or the caller cannot disable the last owner',
  })
  @Patch('memberships/:membershipId/disable')
  disableMembership(
    @Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
  ) {
    return this.execute(
      authorization,
      IAM_ACTIONS.membershipDisable,
      (principal, correlationId) =>
        this.iam.disableMembership(
          principal,
          tenantId,
          membershipId,
          correlationId,
        ),
    );
  }
}
